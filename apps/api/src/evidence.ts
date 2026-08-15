import type { MarketEvent } from "@pulse/shared";

export type EvidenceKind = "news" | "social" | "flow";

export type EvidenceItem = {
  kind: EvidenceKind;
  title: string;
  source: string;
  url?: string;
  at?: string;
};

const UA = "PulseWatch/0.1 (+https://github.com/guoying2026/monad_2026_08_15)";

async function pull(url: string, ms = 4000): Promise<string> {
  const res = await fetch(url, {
    headers: { accept: "application/rss+xml, application/json, text/xml, */*", "user-agent": UA },
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

function decode(raw: string) {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRss(xml: string, kind: EvidenceKind, fallbackSource: string): EvidenceItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .slice(0, 6)
    .map((match) => {
      const block = match[1];
      const title = decode(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
      const url = decode(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
      const at = decode(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
      const source =
        decode(block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? "") ||
        title.split(" - ").at(-1) ||
        fallbackSource;
      return { kind, title, source, url: url || undefined, at: at || undefined };
    })
    .filter((row) => row.title.length > 8);
}

function queryFor(event: MarketEvent) {
  return event.title.replace(/[?？]/g, "").slice(0, 80).trim() || event.question.slice(0, 80);
}

async function googleNews(q: string, kind: EvidenceKind): Promise<EvidenceItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  return parseRss(await pull(url), kind, "Google News");
}

async function reddit(q: string): Promise<EvidenceItem[]> {
  const url = `https://www.reddit.com/search.rss?q=${encodeURIComponent(q)}&sort=new&limit=8`;
  return parseRss(await pull(url, 3500), "social", "Reddit");
}

async function nitter(q: string): Promise<EvidenceItem[]> {
  const url = `https://nitter.poast.org/search/rss?f=tweets&q=${encodeURIComponent(q)}`;
  return parseRss(await pull(url, 3000), "social", "X");
}

type RawTrade = {
  side?: string;
  size?: number | string;
  price?: number | string;
  outcome?: string;
  title?: string;
  timestamp?: number | string;
  transactionHash?: string;
};

function n(v: unknown) {
  const x = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(x) ? x : 0;
}

function summarizeTrades(trades: RawTrade[]): EvidenceItem[] {
  if (trades.length === 0) return [];
  let yesBuy = 0;
  let yesSell = 0;
  let biggest: { notional: number; side: string; outcome: string; hash?: string } | null = null;
  for (const trade of trades) {
    const size = n(trade.size);
    const price = n(trade.price);
    const notional = size * (price || 1);
    const outcome = (trade.outcome || "Yes").toLowerCase();
    const side = (trade.side || "").toUpperCase();
    const isYes = outcome.includes("yes") || outcome === "0";
    if (isYes && side === "BUY") yesBuy += notional;
    if (isYes && side === "SELL") yesSell += notional;
    if (!biggest || notional > biggest.notional) {
      biggest = { notional, side, outcome: trade.outcome || "Yes", hash: trade.transactionHash };
    }
  }
  const net = yesBuy - yesSell;
  const dir = net >= 0 ? "净买入 YES" : "净卖出 YES";
  const items: EvidenceItem[] = [
    {
      kind: "flow",
      title: `近 ${trades.length} 笔成交：${dir} $${Math.abs(net).toFixed(0)}（买 $${yesBuy.toFixed(0)} / 卖 $${yesSell.toFixed(0)}）`,
      source: "Polymarket trades",
    },
  ];
  if (biggest && biggest.notional >= 50) {
    items.push({
      kind: "flow",
      title: `最大一笔 ${biggest.side} ${biggest.outcome} $${biggest.notional.toFixed(0)}`,
      source: "Polymarket",
      url: biggest.hash ? `https://polygonscan.com/tx/${biggest.hash}` : undefined,
    });
  }
  return items;
}

async function polymarketFlow(event: MarketEvent): Promise<EvidenceItem[]> {
  const tries = [
    `https://data-api.polymarket.com/trades?eventId=${encodeURIComponent(event.id)}&limit=40`,
    ...(event.marketIds ?? []).slice(0, 2).map(
      (id) => `https://data-api.polymarket.com/trades?market=${encodeURIComponent(id)}&limit=40`,
    ),
  ];
  for (const url of tries) {
    try {
      const raw = await pull(url, 4000);
      const rows = JSON.parse(raw) as RawTrade[] | { trades?: RawTrade[] };
      const trades = Array.isArray(rows) ? rows : (rows.trades ?? []);
      const items = summarizeTrades(trades.slice(0, 40));
      if (items.length) return items;
    } catch {
      // try next endpoint
    }
  }
  return [];
}

export async function gatherEvidence(event: MarketEvent): Promise<EvidenceItem[]> {
  const q = queryFor(event);
  const socialQ = `${q} (Twitter OR tweet OR site:x.com)`;
  const settled = await Promise.allSettled([
    googleNews(q, "news"),
    googleNews(socialQ, "social"),
    reddit(q),
    nitter(q),
    polymarketFlow(event),
  ]);
  const seen = new Set<string>();
  const out: EvidenceItem[] = [];
  for (const row of settled) {
    if (row.status !== "fulfilled") continue;
    for (const item of row.value) {
      const key = item.title.toLowerCase().slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out.slice(0, 12);
}
