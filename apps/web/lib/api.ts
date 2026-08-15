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
  const q = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const res = await fetch(`${apiUrl}/events${q}`);
  const data = (await res.json()) as { events: EventWithPool[] };
  return data.events;
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

export async function postTick() {
  const res = await fetch(`${apiUrl}/internal/tick`, { method: "POST" });
  if (!res.ok) throw new Error("tick failed");
  return res.json() as Promise<{ fired: number; ids: string[]; events: number }>;
}

export { apiUrl };
