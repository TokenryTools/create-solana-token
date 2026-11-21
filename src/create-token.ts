// Entry point: npm run create -- --name ... --symbol ... --uri ... --supply ...
import {
  appendTransactionMessageInstructions,
  assertIsTransactionMessageWithinSizeLimit,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  estimateAndSetResourceLimitsFactory,
  estimateResourceLimitsFactory,
  fetchEncodedAccounts,
  fillTransactionMessageProvisoryResourceLimits,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  getTransactionMessageSize,
  getTransactionMessageSizeLimit,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageComputeUnitPrice,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
} from '@solana/kit';
import * as token from '@solana-program/token';
import * as token2022 from '@solana-program/token-2022';
import { assertInteractive, confirmMainnet } from './confirm.ts';
import { assertCluster, connect, explorerAddress, explorerTx, solscanToken, type Cluster } from './cluster.ts';
import { buildTokenPlan } from './instructions.ts';
import { loadKeypairSigner } from './keypair.ts';
import { HELP, formatAmount, formatSol, readOptions, type Options } from './options.ts';

// Classic Token only: the Metaplex metadata account (bytes) and the Token Metadata
// protocol fee charged on create. Both measured on devnet, see the README.
const METAPLEX_METADATA_SIZE = 607;
const METAPLEX_CREATE_FEE = 10_000_000n; // 0.01 SOL
const SIGNATURE_FEE = 5_000n; // lamports per signature; this transaction has two

async function main() {
  loadDotEnv();
  const options = readOptions(process.argv.slice(2));
  if (options === 'help') {
    console.log(HELP);
    return;
  }

  const cluster: Cluster = options.mainnet ? 'mainnet' : 'devnet';
  if (cluster === 'mainnet') assertInteractive();
  const { rpc, rpcSubscriptions, rpcUrl } = connect(cluster);
  await assertCluster(rpc, cluster);

  const payer = await loadKeypairSigner(options.keypairPath);
  // The mint account needs a fresh address that signs once, when it is created.
  // Its secret stays in memory and is dropped when the process exits; after
  // creation it controls nothing.
  const mint = await generateKeyPairSigner();

  const getRent = async (bytes: number) => rpc.getMinimumBalanceForRentExemption(BigInt(bytes)).send();
  const plan = await buildTokenPlan({ options, payer, mint, getRent });

  // Cost estimate, shown before anything is sent.
  const mintRent = await getRent(plan.sizes.mint);
  const tokenAccountRent = await getRent(plan.sizes.tokenAccount);
  const metadataCost = plan.metadataAccount ? (await getRent(METAPLEX_METADATA_SIZE)) + METAPLEX_CREATE_FEE : 0n;
  const estimate = mintRent + tokenAccountRent + metadataCost + 2n * SIGNATURE_FEE;
  const balanceBefore = (await rpc.getBalance(payer.address, { commitment: 'confirmed' }).send()).value;

  printPlan(options, cluster, rpcUrl, payer.address, estimate, balanceBefore);

  if (balanceBefore < estimate + priorityFeeAllowance(options)) {
    const faucet = cluster === 'devnet' ? ' Get devnet SOL at https://faucet.solana.com.' : '';
    throw new Error(`Not enough SOL: need about ${formatSol(estimate)}, wallet has ${formatSol(balanceBefore)}.${faucet}`);
  }

  if (cluster === 'mainnet' && !(await confirmMainnet())) {
    console.log('Cancelled. Nothing was sent.');
    return;
  }

  // One transaction: if any step fails, nothing is created.
  const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const baseMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(plan.instructions, m),
    (m) => fillTransactionMessageProvisoryResourceLimits(m),
  );
  const pricedMessage =
    options.priorityFee > 0n ? setTransactionMessageComputeUnitPrice(options.priorityFee, baseMessage) : baseMessage;

  const size = getTransactionMessageSize(pricedMessage);
  const sizeLimit = getTransactionMessageSizeLimit(pricedMessage);
  if (size > sizeLimit) {
    throw new Error(`The transaction is ${size} bytes, over the ${sizeLimit} byte limit. Use a shorter name, symbol or URI.`);
  }
  assertIsTransactionMessageWithinSizeLimit(pricedMessage);

  // Simulates the transaction (any program error stops here, before sending)
  // and sets the compute unit limit to what it really uses.
  const estimateAndSetLimits = estimateAndSetResourceLimitsFactory(estimateResourceLimitsFactory({ rpc }));
  const message = await estimateAndSetLimits(pricedMessage);

  const signed = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(signed);
  const signature = getSignatureFromTransaction(signed);
  console.log(`\nSending ${signature} ...`);
  await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signed, { commitment: 'confirmed' });

  await printSummary({ options, cluster, rpc, mint: mint.address, plan, signature, balanceBefore, payer: payer.address });
}

/** Reads an optional .env file (see .env.example). Variables set in the shell win. */
function loadDotEnv() {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function priorityFeeAllowance(options: Options) {
  // At most 1.4M compute units; the real limit is set from the simulation and is much lower.
  return (options.priorityFee * 1_400_000n) / 1_000_000n;
}

function printPlan(
  options: Options,
  cluster: Cluster,
  rpcUrl: string,
  payer: Address,
  estimate: bigint,
  balance: bigint,
) {
  const rows: [string, string][] = [
    ['Cluster', `${cluster} (${new URL(rpcUrl).host})`],
    ['Program', programLabel(options)],
    ['Name', options.name],
    ['Symbol', options.symbol],
    ['URI', options.uri],
    ['Decimals', String(options.decimals)],
    ['Supply', `${formatAmount(options.supplyBaseUnits, options.decimals)} to ${payer}`],
    ['Revoke mint', options.revokeMint ? 'yes (permanent)' : 'no'],
    ['Revoke freeze', options.revokeFreeze ? 'yes (permanent)' : 'no'],
    ['Wallet balance', formatSol(balance)],
    ['Estimated cost', formatSol(estimate) + (options.priorityFee > 0n ? ' + priority fee' : '')],
  ];
  console.log(`Creating a token on ${cluster}\n`);
  printRows(rows);
}

type SummaryInput = {
  options: Options;
  cluster: Cluster;
  rpc: ReturnType<typeof connect>['rpc'];
  mint: Address;
  payer: Address;
  plan: Awaited<ReturnType<typeof buildTokenPlan>>;
  signature: string;
  balanceBefore: bigint;
};

async function printSummary({ options, cluster, rpc, mint, payer, plan, signature, balanceBefore }: SummaryInput) {
  // Read everything back from the chain, so the summary shows what is really there.
  const mintAccount =
    options.program === 'token-2022'
      ? await token2022.fetchMint(rpc, mint, { commitment: 'confirmed' })
      : await token.fetchMint(rpc, mint, { commitment: 'confirmed' });
  const addresses = [mint, plan.tokenAccount, ...(plan.metadataAccount ? [plan.metadataAccount] : [])];
  const accounts = await fetchEncodedAccounts(rpc, addresses, { commitment: 'confirmed' });
  const lamportsOf = (i: number) => {
    const account = accounts[i];
    return account?.exists ? account.lamports : 0n;
  };
  const tx = await rpc
    .getTransaction(signature as Parameters<typeof rpc.getTransaction>[0], {
      commitment: 'confirmed',
      encoding: 'json',
      maxSupportedTransactionVersion: 0,
    })
    .send();
  const balanceAfter = (await rpc.getBalance(payer, { commitment: 'confirmed' }).send()).value;
  const fee = tx?.meta?.fee;

  const authority = (value: { __option: 'Some'; value: Address } | { __option: 'None' }) =>
    value.__option === 'Some' ? value.value : 'none (revoked)';

  const rows: [string, string][] = [
    ['Program', programLabel(options)],
    ['Mint', mint],
    ['Token account', plan.tokenAccount],
    ...(plan.metadataAccount ? [['Metadata account', plan.metadataAccount] as [string, string]] : []),
    ['Supply', `${formatAmount(mintAccount.data.supply, mintAccount.data.decimals)} ${options.symbol}`],
    ['Decimals', String(mintAccount.data.decimals)],
    ['Mint authority', authority(mintAccount.data.mintAuthority)],
    ['Freeze authority', authority(mintAccount.data.freezeAuthority)],
    ['Metadata update authority', `${payer} (metadata can still be edited)`],
  ];

  const costRows: [string, string][] = [
    ['Mint account rent', formatSol(lamportsOf(0))],
    ['Token account rent', formatSol(lamportsOf(1))],
    ...(plan.metadataAccount ? [['Metadata account', formatSol(lamportsOf(2))] as [string, string]] : []),
    ['Transaction fee', fee === undefined ? 'unknown' : formatSol(fee)],
    ['Total spent', formatSol(balanceBefore - balanceAfter)],
  ];

  console.log(`\nToken created on ${cluster}\n`);
  printRows(rows);
  console.log('\nCost');
  printRows(costRows);
  console.log('\nTransactions');
  console.log(`  1. ${signature}`);
  console.log(`     ${explorerTx(signature, cluster)}`);
  console.log('\nExplorer');
  console.log(`  ${explorerAddress(mint, cluster)}`);
  console.log(`  ${solscanToken(mint, cluster)}`);
}

function programLabel(options: Options) {
  return options.program === 'token-2022'
    ? 'Token-2022 with the metadata extension'
    : 'Token (classic SPL) with Metaplex metadata';
}

function printRows(rows: [string, string][]) {
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) console.log(`  ${label.padEnd(width)}  ${value}`);
}

main().catch((error: unknown) => {
  console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
