// Builds every instruction for one token, for either token program. They all go
// into a single transaction, so the token is created completely or not at all.
import type { Address, Instruction, TransactionSigner } from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import * as token from '@solana-program/token';
import * as token2022 from '@solana-program/token-2022';
import { findMetadataPda, getCreateFungibleMetadataInstruction } from './metaplex.ts';
import type { Options } from './options.ts';

export type TokenPlan = {
  instructions: Instruction[];
  tokenAccount: Address;
  /** Metaplex metadata account (classic Token only; Token-2022 keeps metadata on the mint). */
  metadataAccount: Address | null;
  /** Bytes of each account this transaction creates, for the cost estimate. */
  sizes: { mint: number; tokenAccount: number };
};

type Input = {
  options: Options;
  payer: TransactionSigner;
  mint: TransactionSigner;
  getRent: (bytes: number) => Promise<bigint>;
};

export function buildTokenPlan(input: Input): Promise<TokenPlan> {
  return input.options.program === 'token-2022' ? buildToken2022Plan(input) : buildClassicPlan(input);
}

// Classic SPL Token: mint account, Metaplex metadata account, token account, supply.
async function buildClassicPlan({ options, payer, mint, getRent }: Input): Promise<TokenPlan> {
  const mintSize = token.getMintSize();
  const tokenAccountSize = token.getTokenSize();
  const [tokenAccount] = await token.findAssociatedTokenPda({
    owner: payer.address,
    mint: mint.address,
    tokenProgram: token.TOKEN_PROGRAM_ADDRESS,
  });
  const metadataAccount = await findMetadataPda(mint.address);

  const instructions: Instruction[] = [
    getCreateAccountInstruction({
      payer,
      newAccount: mint,
      lamports: await getRent(mintSize),
      space: mintSize,
      programAddress: token.TOKEN_PROGRAM_ADDRESS,
    }),
    token.getInitializeMint2Instruction({
      mint: mint.address,
      decimals: options.decimals,
      mintAuthority: payer.address,
      freezeAuthority: payer.address,
    }),
    // Must run while the payer is still the mint authority.
    getCreateFungibleMetadataInstruction({
      metadata: metadataAccount,
      mint: mint.address,
      authority: payer,
      payer,
      name: options.name,
      symbol: options.symbol,
      uri: options.uri,
      decimals: options.decimals,
    }),
    token.getCreateAssociatedTokenIdempotentInstruction({
      payer,
      ata: tokenAccount,
      owner: payer.address,
      mint: mint.address,
    }),
    token.getMintToCheckedInstruction({
      mint: mint.address,
      token: tokenAccount,
      mintAuthority: payer,
      amount: options.supplyBaseUnits,
      decimals: options.decimals,
    }),
  ];

  if (options.revokeMint) {
    instructions.push(
      token.getSetAuthorityInstruction({
        owned: mint.address,
        owner: payer,
        authorityType: token.AuthorityType.MintTokens,
        newAuthority: null,
      }),
    );
  }
  if (options.revokeFreeze) {
    instructions.push(
      token.getSetAuthorityInstruction({
        owned: mint.address,
        owner: payer,
        authorityType: token.AuthorityType.FreezeAccount,
        newAuthority: null,
      }),
    );
  }

  return { instructions, tokenAccount, metadataAccount, sizes: { mint: mintSize, tokenAccount: tokenAccountSize } };
}

// Token-2022: the mint carries a metadata pointer to itself and the metadata
// (name, symbol, uri) inside its own account. No second program, no extra account.
async function buildToken2022Plan({ options, payer, mint, getRent }: Input): Promise<TokenPlan> {
  const pointer = token2022.extension('MetadataPointer', {
    authority: payer.address,
    metadataAddress: mint.address,
  });
  const metadata = token2022.extension('TokenMetadata', {
    updateAuthority: payer.address,
    mint: mint.address,
    name: options.name,
    symbol: options.symbol,
    uri: options.uri,
    additionalMetadata: new Map(),
  });
  // The account is created with room for the pointer only, because InitializeMint
  // rejects unknown trailing bytes. InitializeTokenMetadata then grows it, so the
  // rent for the final size is paid up front.
  const initialSize = token2022.getMintSize([pointer]);
  const finalSize = token2022.getMintSize([pointer, metadata]);
  // Associated token accounts on Token-2022 always carry the ImmutableOwner extension.
  const tokenAccountSize = token2022.getTokenSize([token2022.extension('ImmutableOwner', {})]);
  const [tokenAccount] = await token2022.findAssociatedTokenPda({
    owner: payer.address,
    mint: mint.address,
    tokenProgram: token2022.TOKEN_2022_PROGRAM_ADDRESS,
  });

  const instructions: Instruction[] = [
    getCreateAccountInstruction({
      payer,
      newAccount: mint,
      lamports: await getRent(finalSize),
      space: initialSize,
      programAddress: token2022.TOKEN_2022_PROGRAM_ADDRESS,
    }),
    token2022.getInitializeMetadataPointerInstruction({
      mint: mint.address,
      authority: payer.address,
      metadataAddress: mint.address,
    }),
    token2022.getInitializeMint2Instruction({
      mint: mint.address,
      decimals: options.decimals,
      mintAuthority: payer.address,
      freezeAuthority: payer.address,
    }),
    // Must run while the payer is still the mint authority.
    token2022.getInitializeTokenMetadataInstruction({
      metadata: mint.address,
      updateAuthority: payer.address,
      mint: mint.address,
      mintAuthority: payer,
      name: options.name,
      symbol: options.symbol,
      uri: options.uri,
    }),
    token2022.getCreateAssociatedTokenIdempotentInstruction({
      payer,
      ata: tokenAccount,
      owner: payer.address,
      mint: mint.address,
      tokenProgram: token2022.TOKEN_2022_PROGRAM_ADDRESS,
    }),
    token2022.getMintToCheckedInstruction({
      mint: mint.address,
      token: tokenAccount,
      mintAuthority: payer,
      amount: options.supplyBaseUnits,
      decimals: options.decimals,
    }),
  ];

  if (options.revokeMint) {
    instructions.push(
      token2022.getSetAuthorityInstruction({
        owned: mint.address,
        owner: payer,
        authorityType: token2022.AuthorityType.MintTokens,
        newAuthority: null,
      }),
    );
  }
  if (options.revokeFreeze) {
    instructions.push(
      token2022.getSetAuthorityInstruction({
        owned: mint.address,
        owner: payer,
        authorityType: token2022.AuthorityType.FreezeAccount,
        newAuthority: null,
      }),
    );
  }

  return { instructions, tokenAccount, metadataAccount: null, sizes: { mint: finalSize, tokenAccount: tokenAccountSize } };
}
