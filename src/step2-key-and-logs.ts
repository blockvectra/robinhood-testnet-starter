import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { CONSOLE_API, REF, getChain, mask, wsClient } from "./shared.js";
import { readMainnet } from "./mainnet-read.js";

// Step 2: get an API key (programmatically, via a wallet signature) and stream logs over WebSocket.
// Pass --then-mainnet to reuse the same in-memory key for the mainnet read after the 30s window.
const SLUG = "robinhood_testnet";

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${CONSOLE_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function provisionKey(): Promise<string> {
  const pk = (process.env.WALLET_PRIVATE_KEY as Hex | undefined) ?? generatePrivateKey();
  const account = privateKeyToAccount(pk);
  console.log(`wallet: ${account.address}`);

  // SIWE: ask for a challenge, sign it verbatim (EIP-191), log in. A first sign-in creates the account.
  const { message } = await post<{ message: string }>("/auth/siwe/challenge", {
    address: account.address,
    purpose: "login",
  });
  const signature = await account.signMessage({ message });
  // `ref` is an optional attribution field, saved only when a new account is created.
  const login = await post<{ session: { token: string }; account_created: boolean }>("/auth/siwe/login", {
    message,
    signature,
    ref: REF,
  });
  console.log(`account_created: ${login.account_created}`);

  const created = await post<{ api_key: string }>("/keys", { label: "robinhood-testnet-starter" }, login.session.token);
  return created.api_key;
}

const apiKey = process.env.BLOCKVECTRA_API_KEY?.trim() || (await provisionKey());
console.log(`api key: ${mask(apiKey)}`);

const chain = await getChain(SLUG);
if (!chain.ws || !chain.subscriptions.includes("logs")) {
  throw new Error(`${SLUG} does not offer a logs subscription in /v1/chains`);
}
console.log(`subscriptions (from /v1/chains): ${chain.subscriptions.join(", ")}`);

// Every logs subscription requires an address or topic0. Replace this example with the contract you want to watch.
const client = wsClient(chain, apiKey);
// The WebSocket URL carries the key in its path, so error text can contain it; redact before printing.
const redact = (text: string) => text.split(apiKey).join("[REDACTED]");

let subscriptionFailed = false;
const stop = client.watchEvent({
  address: "0x1234567890123456789012345678901234567890",
  onLogs: (logs) => {
    for (const l of logs) console.log(`block ${l.blockNumber} ${l.address} topic0=${l.topics[0]}`);
  },
  onError: (e) => {
    subscriptionFailed = true;
    console.error("subscription error:", redact(e.message));
  },
});

console.log("listening for logs for 30s...");
await new Promise((resolve) => setTimeout(resolve, 30_000));
stop();

if (subscriptionFailed) {
  console.error("logs subscription reported an error; exiting with failure.");
  process.exit(1);
}

if (process.argv.includes("--then-mainnet")) {
  // The key stays in this process's memory; it is never printed in full or written anywhere.
  try {
    await readMainnet(apiKey);
  } catch (e) {
    console.error("mainnet read failed:", redact(e instanceof Error ? e.message : String(e)));
    process.exit(1);
  }
}
process.exit(0);
