import { formatEther, type Address } from "viem";
import { API_BASE, getChain, httpClient } from "./shared.js";

// Step 1: no account, no key. Read Robinhood Chain Testnet through the public endpoint.
const SLUG = "robinhood_testnet";
// Any address works; override with the first CLI argument.
const address = (process.argv[2] ?? "0x0000000000000000000000000000000000000000") as Address;

const chain = await getChain(SLUG);

if (!Number.isSafeInteger(chain.chain_id) || chain.chain_id <= 0) {
  throw new Error(
    `invalid catalog chain_id for ${SLUG}: expected a positive safe integer, got ${String(chain.chain_id)}`,
  );
}

const client = httpClient(chain, `${API_BASE}/${SLUG}/public`);

// Confirm the network before any other read.
const chainId = await client.getChainId();
if (chainId !== chain.chain_id) {
  throw new Error(
    `chain ID mismatch for ${SLUG}: expected ${chain.chain_id} (catalog), actual ${chainId} (eth_chainId)`,
  );
}

const [blockNumber, balance] = await Promise.all([
  client.getBlockNumber(),
  client.getBalance({ address }),
]);

console.log(`chain       : ${chain.name} (${SLUG})`);
console.log(`eth_chainId : ${chainId} (0x${chainId.toString(16)})`);
console.log(`block       : ${blockNumber}`);
console.log(`balance     : ${formatEther(balance)} ETH  (${address})`);
