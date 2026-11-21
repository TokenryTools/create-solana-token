// Command line flags, their defaults and their validation.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

export type TokenProgram = 'token' | 'token-2022';

export type Options = {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  /** Whole tokens as the user typed them, for example "1000000" or "2.5". */
  supply: string;
  /** The same supply in base units (supply x 10^decimals). */
  supplyBaseUnits: bigint;
  program: TokenProgram;
  revokeMint: boolean;
  revokeFreeze: boolean;
  mainnet: boolean;
  keypairPath: string;
  /** Optional priority fee in micro-lamports per compute unit. 0 means none. */
  priorityFee: bigint;
};

export const HELP = `Create a Solana token with metadata in one command.

Usage:
  npm run create -- --name <name> --symbol <symbol> --uri <url> --supply <amount> [options]

Required:
  --name <text>          Token name shown by wallets and explorers
  --symbol <text>        Ticker, for example DEMO
  --uri <url>            URL of the off-chain metadata JSON (image, description)
  --supply <amount>      Initial supply in whole tokens, minted to your wallet

Options:
  --decimals <0-19>      Decimal places (default 9)
  --program <name>       token (default): classic SPL Token + Metaplex metadata
                         token-2022: Token-2022 with the metadata extension
  --revoke-mint          Revoke the mint authority (supply becomes fixed forever)
  --revoke-freeze        Revoke the freeze authority (nobody can freeze holders)
  --keypair <path>       Keypair file that pays and signs
                         (default: KEYPAIR_PATH, then ~/.config/solana/id.json)
  --priority-fee <n>     Priority fee in micro-lamports per compute unit (default 0)
  --mainnet              Use mainnet instead of devnet (asks you to confirm)
  -h, --help             Show this help

Environment:
  RPC_URL                Custom RPC endpoint for the chosen cluster
  RPC_WS_URL             Custom WebSocket endpoint (default: derived from RPC_URL)
  KEYPAIR_PATH           Keypair file, used when --keypair is not given
`;

// Metaplex Token Metadata limits (bytes). Token-2022 has no fixed limit, but the
// whole transaction must still fit in 1232 bytes.
export const METAPLEX_LIMITS = { name: 32, symbol: 10, uri: 200 };

const MAX_U64 = 2n ** 64n - 1n;

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      name: { type: 'string' },
      symbol: { type: 'string' },
      uri: { type: 'string' },
      supply: { type: 'string' },
      decimals: { type: 'string', default: '9' },
      program: { type: 'string', default: 'token' },
      'revoke-mint': { type: 'boolean', default: false },
      'revoke-freeze': { type: 'boolean', default: false },
      keypair: { type: 'string' },
      'priority-fee': { type: 'string', default: '0' },
      mainnet: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
}

export function readOptions(argv: string[]): Options | 'help' {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} (see --help)`);
  }
  const { values } = parsed;

  if (values.help) return 'help';

  const name = required(values.name, '--name');
  const symbol = required(values.symbol, '--symbol');
  const uri = required(values.uri, '--uri');
  const supply = required(values.supply, '--supply');

  const program = values.program;
  if (program !== 'token' && program !== 'token-2022') {
    throw new Error(`--program must be "token" or "token-2022", got "${program}"`);
  }

  if (!/^\d+$/.test(values.decimals) || Number(values.decimals) > 19) {
    throw new Error('--decimals must be a whole number from 0 to 19');
  }
  const decimals = Number(values.decimals);

  try {
    new URL(uri);
  } catch {
    throw new Error(`--uri is not a valid URL: ${uri}`);
  }

  if (program === 'token') {
    checkLength('--name', name, METAPLEX_LIMITS.name);
    checkLength('--symbol', symbol, METAPLEX_LIMITS.symbol);
    checkLength('--uri', uri, METAPLEX_LIMITS.uri);
  }

  const supplyBaseUnits = toBaseUnits(supply, decimals);
  if (supplyBaseUnits === 0n) throw new Error('--supply must be greater than 0');
  if (supplyBaseUnits > MAX_U64) {
    throw new Error(
      `--supply ${supply} with ${decimals} decimals is ${supplyBaseUnits} base units, ` +
        `more than the u64 maximum (${MAX_U64}). Lower the supply or the decimals.`,
    );
  }

  if (!/^\d+$/.test(values['priority-fee'])) {
    throw new Error('--priority-fee must be a whole number of micro-lamports');
  }

  return {
    name,
    symbol,
    uri,
    decimals,
    supply,
    supplyBaseUnits,
    program,
    revokeMint: values['revoke-mint'],
    revokeFreeze: values['revoke-freeze'],
    mainnet: values.mainnet,
    keypairPath: values.keypair ?? process.env.KEYPAIR_PATH ?? join(homedir(), '.config', 'solana', 'id.json'),
    priorityFee: BigInt(values['priority-fee']),
  };
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value.trim() === '') throw new Error(`${flag} is required (see --help)`);
  return value.trim();
}

function checkLength(flag: string, value: string, maxBytes: number) {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > maxBytes) {
    throw new Error(`${flag} is ${bytes} bytes; Metaplex metadata allows at most ${maxBytes}`);
  }
}

/** "1000.5" with 2 decimals becomes 100050n. No floats, so no rounding errors. */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount);
  if (!match) throw new Error(`--supply must be a plain number like 1000000 or 2.5, got "${amount}"`);
  const [, whole, fraction = ''] = match;
  if (fraction.length > decimals) {
    throw new Error(`--supply has ${fraction.length} decimal places but the token has ${decimals}`);
  }
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

/** 100050n with 2 decimals becomes "1,000.5". */
export function formatAmount(baseUnits: bigint, decimals: number): string {
  const digits = baseUnits.toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Lamports to a SOL string with up to 9 decimals. */
export function formatSol(lamports: bigint): string {
  return `${formatAmount(lamports, 9)} SOL`;
}
