import { formatEther, type Address } from "viem";
import { GATEWAY, getChain, httpClient } from "./shared.js";

// Step 1: no account, no key. Read Robinhood Chain Testnet through the public endpoint.
const SLUG = "robinhood_testnet";
// Any address works; override with the first CLI argument.
const address = (process.argv[2] ?? "0x0000000000000000000000000000000000000000") as Address;

const chain = await getChain(SLUG);
const client = httpClient(chain, `${GATEWAY}/${SLUG}/public`);

const [chainId, blockNumber, balance] = await Promise.all([
  client.getChainId(),
  client.getBlockNumber(),
  client.getBalance({ address }),
]);

console.log(`chain       : ${chain.name} (${SLUG})`);
console.log(`eth_chainId : ${chainId} (0x${chainId.toString(16)})`);
console.log(`block       : ${blockNumber}`);
console.log(`balance     : ${formatEther(balance)} ETH  (${address})`);
