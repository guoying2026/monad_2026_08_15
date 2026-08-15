import type { AlertRecord, MarketEvent, PoolQuote, ScanReport, Subscription } from "@pulse/shared";
import { apiUrl } from "./chain";

export type EventWithPool = MarketEvent & { pool: PoolQuote };

export type AgentConfig = {
  network: {
    name: string;
    displayName: string;
    chainId: number;
    caip2: string;
    usdc: string;
    identityRegistry: string;
    reputationRegistry: string;
    explorer: string;
  };
  payTo: string | null;
  agentId: string | null;
  skipX402: boolean;
  price: string;
  watchCost?: string;
  identityRegistry: string;
  reputationRegistry: string;
  scan8004: string;
  feedback: {
    address: `0x${string}`;
    abi: readonly unknown[];
  };
};

export async function fetchConfig(): Promise<AgentConfig> {
  const res = await fetch(`${apiUrl}/config`);
  if (!res.ok) throw new Error("config unavailable — is the API running?");
  return res.json() as Promise<AgentConfig>;
}

export async function fetchEvents(query?: string): Promise<EventWithPool[]> {
  const raw = query?.trim() ?? "";
  const needle = polymarketSlug(raw) || raw;
  const q = needle ? `?q=${encodeURIComponent(needle)}` : "";
  const res = await fetch(`${apiUrl}/events${q}`);
  const data = (await res.json()) as { events: EventWithPool[] };
  return data.events ?? [];
}

export function polymarketSlug(raw: string): string | undefined {
  const text = raw.trim();
  try {
    const url = new URL(text);
    if (!url.hostname.includes("polymarket.com")) return undefined;
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "event" || p === "market");
    if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  } catch {
    // not a URL
  }
  return undefined;
}

export async function fetchHistory(wallet?: string) {
  const q = wallet ? `?wallet=${wallet}` : "";
  const res = await fetch(`${apiUrl}/alerts${q}`);
  return res.json() as Promise<{ alerts: AlertRecord[]; scans: ScanReport[] }>;
}

export async function fetchSubscriptions(wallet?: string) {
  const q = wallet ? `?wallet=${wallet}` : "";
  const res = await fetch(`${apiUrl}/subscriptions${q}`);
  return res.json() as Promise<{ subscriptions: Subscription[] }>;
}

export async function fetchPayments(wallet?: string) {
  const q = wallet ? `?wallet=${wallet}` : "";
  const res = await fetch(`${apiUrl}/payments${q}`);
  return res.json() as Promise<{ payments: Subscription[] }>;
}

export async function confirmPayment(input: { wallet: string; eventId: string; paymentTx: string }) {
  const res = await fetch(`${apiUrl}/payments/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ subscription: Subscription }>;
}

export async function postTick() {
  const res = await fetch(`${apiUrl}/internal/tick?force=1`, { method: "POST" });
  if (!res.ok) throw new Error("tick failed");
  return res.json() as Promise<{ fired: number; ids: string[]; events: number }>;
}

export { apiUrl };
