import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { getWebSocketRpcClient } from "viem/utils";
import { CONSOLE_API, REF, getChain, mask, wsUrl } from "./shared.js";
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

// The WebSocket URL carries the key in its path, so error text can contain it; redact before printing.
const redact = (text: string) => text.split(apiKey).join("[REDACTED]");

// Errors may be Error, Event, an RPC error object or a string; always return non-empty, redacted text.
function describe(e: unknown): string {
  let text = "";
  if (e instanceof Error) {
    text = e.message || e.name;
  } else if (typeof e === "string") {
    text = e;
  } else if (e && typeof e === "object") {
    const o = e as Record<string, any>;
    const parts: string[] = [];
    if (o.constructor?.name && o.constructor.name !== "Object") parts.push(o.constructor.name);
    for (const k of ["type", "code", "reason", "message"]) {
      if (o[k] !== undefined && o[k] !== null && o[k] !== "") parts.push(`${k}=${String(o[k])}`);
    }
    if (o.error?.message) parts.push(`cause=${String(o.error.message)}`);
    text = parts.join(" ");
  } else if (e !== undefined && e !== null) {
    text = String(e);
  }
  return redact(text.trim() || "unknown error (no detail from the WebSocket client)");
}

// Initial setup is bounded: 3 attempts x 8s (connect + subscribe ack) + 1s and 2s pauses = at most 27s.
const SUBSCRIBE_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 8_000;
const RETRY_DELAYS_MS = [1_000, 2_000];
const UNSUBSCRIBE_TIMEOUT_MS = 5_000;
const LISTEN_MS = 30_000;

type RpcClient = Awaited<ReturnType<typeof getWebSocketRpcClient>>;
type RpcMessage = {
  error?: unknown;
  method?: string;
  params?: { subscription?: string; result?: any; error?: unknown };
  result?: any;
};
type RawLog = { address: string; blockNumber: string | null; topics: string[] };

class SubscribeError extends Error {
  constructor(
    readonly detail: string,
    readonly retriable: boolean,
  ) {
    super(detail);
  }
}

interface LogSubscription {
  unsubscribe(): Promise<void>;
  close(): void;
}

interface Handlers {
  onLog(log: RawLog): void;
  onFailure(error: unknown): void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One connect + eth_subscribe attempt. Resolves only after the server acknowledges the subscription.
// Every failure path closes this attempt's socket; a socket that opens after the attempt timed out is closed on arrival.
function attemptSubscribe(url: string, address: string, attempt: number, handlers: Handlers): Promise<LogSubscription> {
  return new Promise((resolve, reject) => {
    let phase: "connecting" | "subscribing" | "active" | "unsubscribing" | "closed" = "connecting";
    let client: RpcClient | undefined;
    let subscriptionId = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const closeClient = () => {
      try {
        client?.close();
      } catch {
        // The socket is already being torn down; nothing else to release.
      }
    };

    const failAttempt = (error: unknown, retriable: boolean) => {
      if (phase !== "connecting" && phase !== "subscribing") return;
      const detail = describe(error);
      phase = "closed";
      clearTimeout(timer);
      closeClient();
      reject(new SubscribeError(detail, retriable));
    };

    const failActive = (error: unknown) => {
      if (phase !== "active") return;
      phase = "closed";
      closeClient();
      handlers.onFailure(error);
    };

    const onError = (error?: Error | Event) => {
      if (phase === "active") failActive(error);
      else failAttempt(error ?? new Error("WebSocket error without detail"), true);
    };

    const onResponse = (msg: RpcMessage) => {
      if (phase === "subscribing") {
        if (msg.method === "eth_subscription") return;
        // An RPC error (auth, policy, bad params) is deterministic: do not retry it.
        if (msg.error) return failAttempt(msg.error, false);
        if (typeof msg.result !== "string" || msg.result === "") {
          return failAttempt(new Error("eth_subscribe response carried no subscription id"), false);
        }
        subscriptionId = msg.result;
        phase = "active";
        clearTimeout(timer);
        resolve({
          async unsubscribe() {
            if (phase !== "active") throw new Error("subscription is no longer active");
            phase = "unsubscribing";
            const res = (await client!.requestAsync({
              body: { method: "eth_unsubscribe", params: [subscriptionId] },
              timeout: UNSUBSCRIBE_TIMEOUT_MS,
            })) as RpcMessage;
            if (res.error) throw new Error(`eth_unsubscribe failed: ${describe(res.error)}`);
            if (res.result !== true) {
              throw new Error(
                `eth_unsubscribe returned unexpected result: ${describe(String(JSON.stringify(res.result) ?? "undefined"))}`,
              );
            }
          },
          close() {
            phase = "closed";
            closeClient();
          },
        });
      } else if (phase === "active") {
        if (msg.method === "eth_subscription") {
          if (msg.params?.error) failActive(msg.params.error);
          else if (msg.params?.subscription !== subscriptionId) return;
          else if (msg.params.result === undefined || msg.params.result === null) {
            failActive(new Error("eth_subscription notification carried neither a log nor an error"));
          } else handlers.onLog(msg.params.result);
        } else if (msg.error) {
          failActive(msg.error);
        }
      }
    };

    timer = setTimeout(() => {
      if (phase === "connecting") {
        // No client handle exists yet, so the pending handshake cannot be cancelled. Retrying would leave
        // overlapping unsettled sockets, so this is terminal; a late-opening socket is closed on arrival.
        failAttempt(
          new Error(`WebSocket handshake did not complete within ${ATTEMPT_TIMEOUT_MS}ms; not retrying a pending connection`),
          false,
        );
      } else {
        failAttempt(new Error(`no subscription ack within ${ATTEMPT_TIMEOUT_MS}ms after the connection opened`), true);
      }
    }, ATTEMPT_TIMEOUT_MS);

    // reconnect.attempts = 0 disables viem's background reconnect; the differing `delay` gives each attempt its own
    // viem socket-cache entry, so a socket that opens late can never be handed to a later attempt.
    getWebSocketRpcClient(url, { keepAlive: false, reconnect: { attempts: 0, delay: attempt } }).then(
      (c) => {
        if (phase !== "connecting") {
          try {
            c.close();
          } catch {
            // Late socket from an abandoned attempt; best-effort close.
          }
          return;
        }
        client = c;
        phase = "subscribing";
        c.request({
          body: { method: "eth_subscribe", params: ["logs", { address }] },
          onError,
          onResponse,
        });
      },
      // Only an identifiable HTTP 4xx handshake status (the `ws` package text) is permanent; a status-less Event
      // (e.g. Node's native WebSocket) is treated as a transient handshake failure within the bounded attempts.
      (e) => failAttempt(e, !/Unexpected server response: 4\d\d/.test(describe(e))),
    );
  });
}

async function subscribeLogs(url: string, address: string, handlers: Handlers): Promise<LogSubscription> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptSubscribe(url, address, attempt, handlers);
    } catch (e) {
      if (!(e instanceof SubscribeError)) throw e;
      if (!e.retriable) throw new Error(`logs subscription rejected, not retried: ${e.detail}`);
      if (attempt >= SUBSCRIBE_ATTEMPTS) {
        throw new Error(`logs subscription not acknowledged after ${attempt} attempts; last error: ${e.detail}`);
      }
      const delay = RETRY_DELAYS_MS[attempt - 1];
      console.error(`subscribe attempt ${attempt}/${SUBSCRIBE_ATTEMPTS} failed: ${e.detail}; retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}

// Every logs subscription requires an address or topic0. Replace this example with the contract you want to watch.
const WATCH_ADDRESS = "0x1234567890123456789012345678901234567890";

let failure: string | undefined;
let wake!: () => void;
const woken = new Promise<void>((resolve) => (wake = resolve));

let subscription: LogSubscription;
try {
  subscription = await subscribeLogs(wsUrl(chain, apiKey), WATCH_ADDRESS, {
    onLog: (l) => {
      const block = typeof l.blockNumber === "string" ? BigInt(l.blockNumber) : l.blockNumber;
      console.log(`block ${block} ${l.address} topic0=${l.topics?.[0]}`);
    },
    onFailure: (e) => {
      failure ??= describe(e);
      wake();
    },
  });
} catch (e) {
  console.error("logs subscription could not be established:", describe(e));
  process.exit(1);
}
console.log("subscription acknowledged by the server");

// The 30s window starts only now, after the eth_subscribe ack.
console.log("listening for logs for 30s...");
const windowTimer = setTimeout(wake, LISTEN_MS);
await woken;
clearTimeout(windowTimer);

if (failure === undefined) {
  try {
    await subscription.unsubscribe();
  } catch (e) {
    failure = `unsubscribe did not complete: ${describe(e)}`;
  }
}
subscription.close();

if (failure !== undefined) {
  console.error("subscription error:", failure);
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
