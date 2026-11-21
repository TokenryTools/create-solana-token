# create-solana-token

A small TypeScript CLI that creates a Solana token in one command with [`@solana/kit`](https://github.com/anza-xyz/kit). It creates the mint, attaches on-chain metadata (name, symbol and the URI of your metadata JSON) so wallets and explorers show the token, mints the initial supply to your wallet, and can revoke the mint and freeze authorities in the same transaction. At the end it prints the mint, the token account, the transaction signature and explorer links.

Devnet by default. Mainnet only with `--mainnet` plus a typed confirmation.

## What it does

- **One atomic transaction.** Create the mint, add metadata, create your token account, mint the supply and (optionally) revoke authorities. If any step fails, nothing is created.
- **Two token programs** (`--program`):
  - `token` (default): the classic SPL Token program with a Metaplex Token Metadata account.
  - `token-2022`: Token-2022 with the metadata pointer and metadata extensions, so the metadata lives inside the mint account.
- **Revoke flags.** `--revoke-mint` fixes the supply forever; `--revoke-freeze` means nobody can ever freeze a holder's tokens. The summary reads the mint back from the chain and prints the resulting authorities.
- **Checks before it sends:** flag validation (Metaplex length limits, decimals, a supply that fits in u64), a check that the RPC endpoint really is the cluster you asked for (by genesis hash), a balance check against the cost estimate, the transaction size, and a simulation. A program error stops it before anything is signed and sent.
- **Exact amounts.** Supplies are converted to base units with `bigint`, never floats.
- **One copy of Kit.** The Metaplex instruction is built in [`src/metaplex.ts`](src/metaplex.ts) with Kit codecs, because the Metaplex Kit client depends on an older Kit major and would install a second copy of `@solana/kit`.

## What it does not do

- Upload your image or metadata JSON. You host the JSON yourself and pass its URL with `--uri` (see [Metadata JSON](#metadata-json)).
- Change or lock metadata later. Your wallet stays the metadata update authority and the metadata stays editable.
- Add other Token-2022 extensions (transfer fees, interest, non-transferable and so on).
- Mint more supply later, create a liquidity pool or list the token anywhere.
- Sign with a hardware wallet or multisig. It reads a keypair file.

## Which token program?

The default is the classic SPL Token program with Metaplex metadata, because it is the most compatible choice today: every major Solana wallet, explorer, DEX and exchange supports it. Use `--program token-2022` when you want the metadata stored on the mint itself and a lower creation cost (about 0.0043 SOL instead of 0.0163 SOL, see [Costs](#costs)). Major wallets and explorers read Token-2022 metadata, but some DEX pool types, bridges and exchanges still do not accept Token-2022 tokens, so check where your token needs to go first.

## Requirements

- Node.js 22 or newer (tested on Node 24.13.1)
- npm
- A Solana keypair file. Create one with the [Solana CLI](https://solana.com/docs/intro/installation): `solana-keygen new` (saved to `~/.config/solana/id.json`).
- Devnet SOL for testing: `solana airdrop 1 --url devnet` or [faucet.solana.com](https://faucet.solana.com).

## Install

```bash
npm install
```

## Run

```bash
npm run create -- --name "Demo Token" --symbol DEMO \
  --uri https://example.com/demo-token.json --supply 1000000
```

The `--` passes the flags through npm. All flags:

| Flag | Meaning |
|---|---|
| `--name <text>` | Token name (required; at most 32 bytes with `--program token`) |
| `--symbol <text>` | Ticker (required; at most 10 bytes with `--program token`) |
| `--uri <url>` | URL of your metadata JSON (required; at most 200 bytes with `--program token`) |
| `--supply <amount>` | Initial supply in whole tokens, minted to your wallet (required), for example `1000000` or `2.5` |
| `--decimals <0-19>` | Decimal places, default `9` |
| `--program <name>` | `token` (default) or `token-2022` |
| `--revoke-mint` | Revoke the mint authority. Permanent. |
| `--revoke-freeze` | Revoke the freeze authority. Permanent. |
| `--keypair <path>` | Keypair that pays and signs. Default: `KEYPAIR_PATH`, then `~/.config/solana/id.json` |
| `--priority-fee <n>` | Priority fee in micro-lamports per compute unit, default `0` |
| `--mainnet` | Use mainnet. Asks you to type `yes` first. |
| `-h`, `--help` | Show help |

More examples:

```bash
# Fixed supply, nobody can freeze holders
npm run create -- --name "Demo Token" --symbol DEMO --uri https://example.com/demo-token.json \
  --supply 1000000 --decimals 6 --revoke-mint --revoke-freeze

# Token-2022 with the metadata extension
npm run create -- --program token-2022 --name "Demo Token" --symbol DEMO \
  --uri https://example.com/demo-token.json --supply 1000000

# A different keypair file
npm run create -- --keypair ./my-devnet-keypair.json --name "Demo Token" --symbol DEMO \
  --uri https://example.com/demo-token.json --supply 1000000

# Mainnet, with a priority fee so it lands when the network is busy
npm run create -- --mainnet --priority-fee 50000 --name "Demo Token" --symbol DEMO \
  --uri https://example.com/demo-token.json --supply 1000000 --revoke-mint --revoke-freeze
```

`npm run typecheck` checks the types.

Output on devnet with both revoke flags (21 November 2026):

```text
Creating a token on devnet

  Cluster         devnet (api.devnet.solana.com)
  Program         Token (classic SPL) with Metaplex metadata
  Name            Demo Token
  Symbol          DEMO
  URI             https://raw.githubusercontent.com/TokenryTools/create-solana-token/main/examples/metadata.json
  Decimals        6
  Supply          1,000,000 to D3LLZwP3ZbD4pyFAYy7VeKX9CNVN3ougTuxAktiJpFDh
  Revoke mint     yes (permanent)
  Revoke freeze   yes (permanent)
  Wallet balance  4.98370096 SOL
  Estimated cost  0.01629904 SOL

Sending 3zLjJLwaBSmUHAi5VHV6EBg4CyMR1UqgEP5qVf9EoScmXj25rCBQZZFG5hDUCyDyVrzYVEg94KMT2pabFeBt6TgG ...

Token created on devnet

  Program                    Token (classic SPL) with Metaplex metadata
  Mint                       FGoxdiLWnMnYUeVr7JEhpuqwdgNWLDkZdTRtTadPkLEi
  Token account              9ziVpLogAQjevA8iQuzkpmrkdQYLjaxJ7VXzb8CBpc8v
  Metadata account           Gm8eWjtdPKv5aVrPtdLza2YXFEofnPGQpmzzBAe4dZtA
  Supply                     1,000,000 DEMO
  Decimals                   6
  Mint authority             none (revoked)
  Freeze authority           none (revoked)
  Metadata update authority  D3LLZwP3ZbD4pyFAYy7VeKX9CNVN3ougTuxAktiJpFDh (metadata can still be edited)

Cost
  Mint account rent   0.0010668 SOL
  Token account rent  0.00148844 SOL
  Metadata account    0.0137338 SOL
  Transaction fee     0.00001 SOL
  Total spent         0.01629904 SOL

Transactions
  1. 3zLjJLwaBSmUHAi5VHV6EBg4CyMR1UqgEP5qVf9EoScmXj25rCBQZZFG5hDUCyDyVrzYVEg94KMT2pabFeBt6TgG
     https://explorer.solana.com/tx/3zLjJLwaBSmUHAi5VHV6EBg4CyMR1UqgEP5qVf9EoScmXj25rCBQZZFG5hDUCyDyVrzYVEg94KMT2pabFeBt6TgG?cluster=devnet

Explorer
  https://explorer.solana.com/address/FGoxdiLWnMnYUeVr7JEhpuqwdgNWLDkZdTRtTadPkLEi?cluster=devnet
  https://solscan.io/token/FGoxdiLWnMnYUeVr7JEhpuqwdgNWLDkZdTRtTadPkLEi?cluster=devnet
```

## Metadata JSON

`--uri` points to a JSON file that wallets and explorers download for the image and description. The on-chain name and symbol come from your flags; the JSON should repeat them. A minimal file, like [`examples/metadata.json`](examples/metadata.json):

```json
{
  "name": "Demo Token",
  "symbol": "DEMO",
  "description": "A test token created on devnet with create-solana-token.",
  "image": "https://example.com/demo-token.png"
}
```

Host the JSON and the image anywhere that serves them publicly and stays online: IPFS (through a pinning service), Arweave, or your own site. For a devnet test, a raw GitHub file URL works. The URI is stored on chain, so a link that later breaks leaves your token without an image until the update authority changes it.

## Costs

Measured on devnet on 21 November 2026 with `--name "Demo Token" --symbol DEMO` and a 95-byte URI. Rent per byte is the same on mainnet today (checked with `getMinimumBalanceForRentExemption` on both clusters). These are network costs only; nothing else is charged.

| | `--program token` | `--program token-2022` |
|---|---|---|
| Mint account rent | 0.0010668 SOL (82 bytes) | 0.00281432 SOL (426 bytes: mint, metadata pointer and metadata) |
| Token account rent | 0.00148844 SOL (165 bytes) | 0.00151384 SOL (170 bytes) |
| Metadata account | 0.0137338 SOL: 0.0037338 SOL rent (607 bytes) plus the 0.01 SOL Metaplex Token Metadata protocol fee | none (metadata is in the mint) |
| Transaction fee | 0.00001 SOL (2 signatures x 5,000 lamports) | 0.00001 SOL |
| **Total** | **0.01629904 SOL** | **0.00433816 SOL** |
| Compute units used | about 60,000 | about 29,000 to 33,000 |

- Rent is a deposit held by the account, not a fee. A mint account cannot be closed in this setup, so its rent stays locked. Your token account's rent comes back if you empty and close it.
- With `--program token-2022` the mint rent grows with the name, symbol and URI length, at 0.00000508 SOL per byte.
- The revoke flags add no cost: they run in the same transaction.
- A priority fee adds `compute units x micro-lamports / 1,000,000` lamports. The compute unit limit is set from the simulation, so you pay for what the transaction uses. Example from a devnet run: `--priority-fee 1000` with about 60,000 compute units added 60 lamports.

## RPC

The defaults are the public endpoints `https://api.devnet.solana.com` and `https://api.mainnet.solana.com`. They are rate limited and not meant for production; on mainnet a dedicated RPC lands transactions more reliably. To use your own endpoint, set `RPC_URL` (and `RPC_WS_URL` if its WebSocket address is not the same URL with `wss://`):

```bash
RPC_URL=https://your-rpc.example.com npm run create -- --name ...
```

You can also put these in a `.env` file (copy `.env.example`); variables set in your shell win. The tool prints only the host of `RPC_URL`. If `RPC_URL` points at a different cluster than your flags (for example a mainnet URL without `--mainnet`), it stops before doing anything. Never commit a real RPC URL that contains an API key.

## Safety

- **Devnet first.** Run the exact command on devnet, check the token in a wallet and on the explorer, then add `--mainnet`.
- **Your keypair stays on your machine.** The tool reads the keypair file to sign and never prints, logs, copies or uploads it. Keep keypair files out of git (`.gitignore` here ignores `id.json`, `*keypair*.json` and `*wallet*.json`) and never paste a secret key anywhere. The mint account address is a fresh keypair generated in memory for that one transaction; its secret is never written or printed, and it controls nothing after the token is created.
- **Revoking is permanent.** After `--revoke-mint` nobody can ever mint more of the token. After `--revoke-freeze` nobody can ever freeze an account. There is no undo.
- **Mainnet asks first.** `--mainnet` shows the plan and the cost estimate, then waits for you to type `yes` in a terminal. It refuses to run when the input is not a terminal, so a script cannot confirm for you.
- **Metadata stays editable.** Your wallet remains the metadata update authority, so keep that keypair safe.

## Prefer no code?

[Tokenry's Solana Token Creator](https://tokenry.tools/solana-token-creator) creates a classic SPL token in the browser with your own wallet: it stores the logo, description and links for you and offers the mint, freeze and update authority revokes in the same approval, with nothing to install.

## Versions

Pinned exactly in `package.json`: `@solana/kit` 8.6.0, `@solana-program/system` 0.16.0, `@solana-program/token` 0.18.0, `@solana-program/token-2022` 0.20.1, `@solana/sysvars` 8.6.0, `typescript` 7.0.2, `tsx` 4.23.15, `@types/node` 24.19.2. Only one copy of `@solana/kit` is installed (`npm ls @solana/kit`).

## About

Maintained by [Tokenry](https://tokenry.tools), no-code tools to create, launch and manage tokens on Solana and EVM chains.

## License

MIT
