import type { MarketEvent } from "@pulse/shared";
import type { PriceQuote } from "./horizon.js";
import { pulseLog } from "./log.js";

type HistPoint = { t?: number; p?: number };

export async function fetchPriceHistory(event: MarketEvent): Promise<PriceQuote[]> {
  if (event.source === "demo") return demoHistory(event);
  const token = event.yesTokenId;
  if (!token) return [];
  try {
    const url = `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(token)}&interval=max&fidelity=60`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { history?: HistPoint[] };
    const rows = (body.history ?? [])
      .map((row) => ({ at: Number(row.t) * (Number(row.t) > 2e10 ? 1 : 1000), yes: Number(row.p), volume: 0 }))
      .filter((row) => Number.isFinite(row.at) && Number.isFinite(row.yes));
    pulseLog(event.title, `盘口历史拉到 ${rows.length} 个点`);
    return rows;
  } catch (err) {
    pulseLog(event.title, `盘口历史失败：${err instanceof Error ? err.message : err}`);
    return [];
  }
}

function demoHistory(event: MarketEvent): PriceQuote[] {
  const now = Date.now();
  const out: PriceQuote[] = [];
  for (let i = 30 * 24; i >= 1; i--) {
    const at = now - i * 60 * 60_000;
    const drift = (30 * 24 - i) / (30 * 24);
    const wave = Math.sin(i / 18) * 0.03;
    const yes = Math.min(0.9, Math.max(0.1, event.yesPrice + 0.12 - drift * 0.14 + wave));
    out.push({ at, yes, volume: event.volume * (0.7 + drift * 0.3) });
  }
  return out;
}
