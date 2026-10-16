# Robinhood Chain Testnet Starter (TypeScript + viem)

A three-step template for building on Robinhood Chain Testnet (chain ID 46630) with [BlockVectra](https://blockvectra.com/?ref=gh-robinhood-testnet-starter), then moving to mainnet.

Guide: [Robinhood Chain Testnet starter](https://docs.blockvectra.com/en/guides/robinhood-testnet-starter/?ref=gh-robinhood-testnet-starter)

## Choose a task

[Task map for agents (JSON)](agent-tasks.json) · [Dated internal QA example](verified-walkthrough.example.json)

| Task | Start here | Credentials and effects |
|---|---|---|
| Public testnet RPC | `npm run step1` | No account or key; checks the network before reading block and balance. |
| Testnet to mainnet walkthrough | `npm run walkthrough` | Reuses an existing key, or signs in and creates a real key that is not automatically revoked. A first wallet sign-in creates an account. |
| Mainnet RPC and indexed activity | `npm run step3` | Requires `BLOCKVECTRA_API_KEY`; reads on-chain activity, not stock-market quotes. |
| Test ETH | [Faucet guide](https://docs.blockvectra.com/en/guides/robinhood-testnet-faucet/?ref=gh-robinhood-testnet-starter) | Guide only: this repository does not submit a faucet request. |

## Setup

```bash
npm install
npm run typecheck
```

Node.js 18 or newer. Export variables in your shell; `.env` is not loaded automatically.

## One command: keyless read, get a key, filtered logs, mainnet read

```bash
npm run walkthrough
```

Runs step 1 (keyless testnet read); only if it succeeds does it run step 2 with `--then-mainnet`. Step 2 provisions a key, subscribes to a filtered `logs` stream for 30 seconds, then uses the same key, held only in that process's memory, for the mainnet read from step 3. You never copy a key: the output shows it masked, and it is not written to disk, argv or `.env`. If any stage fails the command exits non-zero: if the logs subscription cannot be established (a permanent or RPC error, or no acknowledgement after the bounded initial attempts) or reports an error during the 30-second window, step 2 exits 1 and the mainnet read is not attempted; a mainnet read failure also exits 1. Error text is printed with the key replaced by `[REDACTED]`. A quiet 30-second log window with no matching events and no error is not a failure, and a successful run does not show live production traffic.

Already have a key? If `BLOCKVECTRA_API_KEY` is set in your environment, the walkthrough reuses it, skips sign-up (no account is created) and runs the same logs and mainnet stages with that key.

Side effects when no key is set: without `WALLET_PRIVATE_KEY` this signs in with a freshly generated throwaway wallet, which creates a real account and a real API key on every run; the generated wallet and key secrets are discarded from memory when the process ends, so repeated runs create more accounts. Discarding the secret is not server-side revocation: this starter does not automatically revoke the API key it creates. Do not set `WALLET_PRIVATE_KEY` to a wallet that holds funds or that you use elsewhere; use a throwaway wallet only. Replace the example `address` in `src/step2-key-and-logs.ts` first if you want to watch a real contract.

The separate steps below keep working on their own.

## Step 1: read the testnet without a key

```bash
npm run step1            # or: npm run step1 -- 0xYourAddress
```

Uses viem against the public endpoint `https://api.blockvectra.com/v1/robinhood_testnet/public` and reads `eth_chainId` (`0xb626`), the latest block number and an address balance. No account needed.

Step 1 first checks the chain ID against the live catalog (`GET /v1/chains`) and only then reads the block and balance. If the catalog `chain_id` is invalid or does not match `eth_chainId`, step 1 exits non-zero, and `npm run walkthrough` does not continue to the sign-up and key stage. This guard applies only to this starter's step 1 and its walkthrough entry point, not to every RPC or MCP request.

## Step 2: get a key programmatically, stream logs over WebSocket

```bash
npm run step2
```

- Signs in with a wallet (SIWE, EIP-191) at `console-api.blockvectra.com`; a first sign-in creates the account, then an API key is created. The sign-up request carries the optional attribution field `ref: "gh-robinhood-testnet-starter"`.
- Subscribes to `logs` at `wss://api.blockvectra.com/v1/robinhood_testnet/{api_key}`. Supported subscriptions and the `ws` flag are read from `GET https://api.blockvectra.com/v1/chains`.
- Setting up the subscription is bounded: up to 3 attempts, each limited to 8 seconds for the WebSocket connection plus the server's `eth_subscribe` acknowledgement, with 1 s and 2 s pauses (at most about 27 seconds). A connection that reports a handshake error or is closed, or that opens but gets no acknowledgement, is retried with the same in-memory key (no new account or key); the connection of each such failed attempt is closed and viem's own background reconnect is disabled. An RPC error reply (authentication, policy, bad parameters) is not retried. An HTTP 4xx handshake rejection is not retried only when the client exposes the status; some runtimes (for example Node's native WebSocket) report a status-less error event, which is handled like any other initial failure within the same bounded attempts. If the 8 seconds expire while the handshake is still unfinished, step 2 stops immediately with exit 1 instead of retrying, because that pending connection cannot be cancelled through viem's public API (a socket that opens later is closed on arrival); some failures therefore end sooner than 27 seconds. A connection without an acknowledgement does not count as success.
- The 30-second listening window starts only after the server acknowledges the subscription. Any subscription or connection error after the acknowledgement makes step 2 exit 1 immediately (it is not retried or treated as success), so the mainnet read is skipped. At the end of the window step 2 waits for the `eth_unsubscribe` reply (up to 5 seconds); only a reply whose result is exactly `true` counts as success, and a missing, error, `false`, `null` or otherwise malformed reply exits 1.
- This recovers only transient failures before the subscription is established. Recovery was exercised in isolated failure fixtures; the dated real-service QA example below had a successful first connection.
- Already have a key? `export BLOCKVECTRA_API_KEY=...` and sign-up is skipped.
- `npm run step2 -- --then-mainnet` continues into the mainnet read with the same in-memory key after the 30-second window (this is what `npm run walkthrough` uses). Plain `npm run step2` exits after the window; its generated key secret is no longer available from that process, but the server-side key is not automatically revoked.

Every `logs` subscription needs an `address` or `topic0`; an empty filter is rejected with `-32602 logs_filter_required`. Before running step 2, replace the example `address` in `src/step2-key-and-logs.ts` with the contract you want to watch. No matching events during the 30-second listening window does not establish a failed connection. See the [WebSocket subscription guide](https://docs.blockvectra.com/en/guides/websocket-subscriptions/).

Without `BLOCKVECTRA_API_KEY`, this step signs in with the wallet and creates an API key; only the first sign-in creates an account. Wallet private key: if you set `WALLET_PRIVATE_KEY`, read it from your local environment only and never commit it. Without it, a throwaway wallet is generated in memory and discarded when the run ends, so set `WALLET_PRIVATE_KEY` if you want to sign in to the same account again. `.env` and wallet files are in `.gitignore`.

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

## Dated internal QA example

A real-service run on 2026-10-16 with a new dedicated QA wallet completed `npm run walkthrough` at [revision `f350d8b1`](https://github.com/blockvectra/robinhood-testnet-starter/commit/f350d8b120c7fa52dc7fa46a95fc5318d5b948b5). It received subscription and unsubscribe acknowledgements, then read mainnet using the same in-memory key, and exited 0. The [sanitized receipt](verified-walkthrough.example.json) records the tested scope and limits.

The QA harness separately revoked its own created key after the command and verified the expected 401 response. That cleanup is not performed automatically by the starter. No matching contract logs arrived; this example is not an event-delivery, real-time quote, external-adoption or uptime guarantee.

## License

MIT
