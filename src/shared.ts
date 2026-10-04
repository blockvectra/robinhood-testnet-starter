import { createPublicClient, defineChain, http, webSocket } from "viem";

export const GATEWAY = "https://api.blockvectra.com/v1";
export const CONSOLE_API = "https://console-api.blockvectra.com/v1";
export const REF = "gh-robinhood-testnet-starter";

export interface ChainEntry {
  chain: string;
  name: string;
  chain_id: number;
  data: boolean;
  ws: boolean;
  subscriptions: string[];
  public?: { url: string };
}

/** Reads the live chain directory; nothing about limits or prices is hard-coded here. */
export async function getChain(slug: string): Promise<ChainEntry> {
  const res = await fetch(`${GATEWAY}/chains`);
  if (!res.ok) throw new Error(`GET /v1/chains failed: ${res.status}`);
  const { chains } = (await res.json()) as { chains: ChainEntry[] };
  const entry = chains.find((c) => c.chain === slug);
  if (!entry) throw new Error(`${slug} not found in /v1/chains`);
  return entry;
}

export function toViemChain(entry: ChainEntry, rpcUrl: string) {
  return defineChain({
    id: entry.chain_id,
    name: entry.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

export function httpClient(entry: ChainEntry, url: string, apiKey?: string) {
  return createPublicClient({
    chain: toViemChain(entry, url),
    transport: http(url, apiKey ? { fetchOptions: { headers: { "x-api-key": apiKey } } } : undefined),
  });
}

/** WebSocket client: the key goes in the URL path, wss://api.blockvectra.com/v1/{chain}/{api_key}. */
export function wsClient(entry: ChainEntry, apiKey: string) {
  const url = `wss://api.blockvectra.com/v1/${entry.chain}/${apiKey}`;
  return createPublicClient({ chain: toViemChain(entry, url), transport: webSocket(url) });
}

export const mask = (v: string) => (v.length > 8 ? `${v.slice(0, 8)}...` : v);
