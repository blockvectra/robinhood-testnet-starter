import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { CONSOLE_API, REF, getChain, mask, wsClient } from "./shared.js";

// Step 2: get an API key (programmatically, via a wallet signature) and stream logs over WebSocket.
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

// eth_subscribe "logs" with no filter = every log on the chain. Add `address` / `event` to narrow it.
const client = wsClient(chain, apiKey);
const stop = client.watchEvent({
  onLogs: (logs) => {
    for (const l of logs) console.log(`block ${l.blockNumber} ${l.address} topic0=${l.topics[0]}`);
  },
  onError: (e) => console.error("subscription error:", e.message),
});

setTimeout(() => {
  stop();
  process.exit(0);
}, 30_000);
console.log("listening for logs for 30s...");
