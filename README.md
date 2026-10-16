# Robinhood Chain Testnet Starter (TypeScript + viem)

A three-step template for building on Robinhood Chain Testnet (chain ID 46630) with [BlockVectra](https://blockvectra.com/?ref=gh-robinhood-testnet-starter), then moving to mainnet.

Guide: [Robinhood Chain Testnet starter](https://docs.blockvectra.com/en/guides/robinhood-testnet-starter/?ref=gh-robinhood-testnet-starter)

## Setup

```bash
npm install
npm run typecheck
```

Node.js 18 or newer. Copy `.env.example` to `.env` only if you want to set variables there (export them in your shell; nothing loads `.env` automatically).

## One command: keyless read, get a key, filtered logs, mainnet read

```bash
npm run walkthrough
```

Runs step 1 (keyless testnet read); only if it succeeds does it run step 2 with `--then-mainnet`. Step 2 provisions a key, subscribes to a filtered `logs` stream for 30 seconds, then uses the same key, held only in that process's memory, for the mainnet read from step 3. You never copy a key: the output shows it masked, and it is not written to disk, argv or `.env`. If any stage fails the command exits non-zero: if the logs subscription reports an error during the 30-second window, step 2 exits 1 and the mainnet read is not attempted; a mainnet read failure also exits 1. Error text is printed with the key replaced by `[REDACTED]`. A quiet 30-second log window with no matching events and no error is not a failure, and a successful run does not show live production traffic.

Already have a key? If `BLOCKVECTRA_API_KEY` is set in your environment, the walkthrough reuses it, skips sign-up (no account is created) and runs the same logs and mainnet stages with that key.

Side effects when no key is set: without `WALLET_PRIVATE_KEY` this signs in with a freshly generated throwaway wallet, which creates a real account and a real API key on every run; the wallet and key are discarded when the process ends, so repeated runs create more accounts. Do not set `WALLET_PRIVATE_KEY` to a wallet that holds funds or that you use elsewhere; use a throwaway wallet only. Replace the example `address` in `src/step2-key-and-logs.ts` first if you want to watch a real contract.

The separate steps below keep working on their own.

## Step 1: read the testnet without a key

```bash
npm run step1            # or: npm run step1 -- 0xYourAddress
```

Uses viem against the public endpoint `https://api.blockvectra.com/v1/robinhood_testnet/public` and reads `eth_chainId` (`0xb626`), the latest block number and an address balance. No account needed.

## Step 2: get a key programmatically, stream logs over WebSocket

```bash
npm run step2
```

- Signs in with a wallet (SIWE, EIP-191) at `console-api.blockvectra.com`; a first sign-in creates the account, then an API key is created. The sign-up request carries the optional attribution field `ref: "gh-robinhood-testnet-starter"`.
- Subscribes to `logs` at `wss://api.blockvectra.com/v1/robinhood_testnet/{api_key}`. Supported subscriptions and the `ws` flag are read from `GET https://api.blockvectra.com/v1/chains`.
- Already have a key? `export BLOCKVECTRA_API_KEY=...` and sign-up is skipped.
- `npm run step2 -- --then-mainnet` continues into the mainnet read with the same in-memory key after the 30-second window (this is what `npm run walkthrough` uses). Plain `npm run step2` exits after the window and the generated key is gone with the process.

Every `logs` subscription needs an `address` or `topic0`; an empty filter is rejected with `-32602 logs_filter_required`. Before running step 2, replace the example `address` in `src/step2-key-and-logs.ts` with the contract you want to watch. No matching events during the 30-second listening window does not establish a failed connection. See the [WebSocket subscription guide](https://docs.blockvectra.com/en/guides/websocket-subscriptions/).

Running this step creates a real account for the wallet. Wallet private key: if you set `WALLET_PRIVATE_KEY`, read it from your local environment only and never commit it. Without it, a throwaway wallet is generated in memory and discarded when the run ends, so set `WALLET_PRIVATE_KEY` if you want to sign in to the same account again. `.env` and wallet files are in `.gitignore`.

## Step 3: switch to mainnet

Step 3 is a separate process that only reads `BLOCKVECTRA_API_KEY`. Step 2 masks the key it creates and does not save it, so use an existing key (for example one created in the console), or use `npm run walkthrough` to hand the key over inside one process.

```bash
export BLOCKVECTRA_API_KEY=...
npm run step3
```

Replace the chain name `robinhood_testnet` with `robinhood_mainnet`; the same key works. On mainnet you can also call the Data API for Robinhood stock tokens:

```bash
curl -H "x-api-key: $BLOCKVECTRA_API_KEY" https://api.blockvectra.com/v1/data/robinhood_mainnet/stocks
```

The testnet has no Data API (`data` is `false` for `robinhood_testnet` in `/v1/chains`). Limits, supported methods and prices change over time; read them from `/v1/chains`, `/v1/plans` and the [docs](https://docs.blockvectra.com/en/guides/robinhood-chain/?ref=gh-robinhood-testnet-starter).

## License

MIT
