import { API_BASE, getChain, httpClient } from "./shared.js";

// Step 3: same key, same code, different chain name. Testnet -> mainnet is a one-word change.
const apiKey = process.env.BLOCKVECTRA_API_KEY?.trim();
if (!apiKey) throw new Error("Set BLOCKVECTRA_API_KEY (run step 2 first, or create a key in the console).");

const testnet = await getChain("robinhood_testnet");
const mainnet = await getChain("robinhood_mainnet");
console.log(`data API on testnet : ${testnet.data}`); // false: the Data API is mainnet only
console.log(`data API on mainnet : ${mainnet.data}`);

// JSON-RPC with the key: only the chain slug changes.
const client = httpClient(mainnet, `${API_BASE}/${mainnet.chain}`, apiKey);
console.log(`mainnet block: ${await client.getBlockNumber()}`);

// Data API: Robinhood stock-token leaderboard (see the Robinhood Chain guide).
const res = await fetch(`${API_BASE}/data/${mainnet.chain}/stocks`, { headers: { "x-api-key": apiKey } });
if (!res.ok) throw new Error(`Data API failed: ${res.status} ${await res.text()}`);
console.log(JSON.stringify(await res.json(), null, 2).slice(0, 2000));
// Single token: GET /v1/data/robinhood_mainnet/stocks/{token}
