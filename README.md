# Robinhood Chain Testnet Starter (TypeScript + viem)

A three-step template for building on Robinhood Chain Testnet (chain ID 46630) with [BlockVectra](https://blockvectra.com/?ref=gh-robinhood-testnet-starter), then moving to mainnet.

Guide: [Robinhood Chain on BlockVectra](https://docs.blockvectra.com/en/guides/robinhood-chain/?ref=gh-robinhood-testnet-starter)

## Setup

```bash
npm install
npm run typecheck
```

Node.js 18 or newer. Copy `.env.example` to `.env` only if you want to set variables there (export them in your shell; nothing loads `.env` automatically).

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

Running this step creates a real account for the wallet. Wallet private key: if you set `WALLET_PRIVATE_KEY`, read it from your local environment only and never commit it. Without it, a throwaway wallet is generated in memory and discarded when the run ends, so set `WALLET_PRIVATE_KEY` if you want to sign in to the same account again. `.env` and wallet files are in `.gitignore`.

## Step 3: switch to mainnet

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
