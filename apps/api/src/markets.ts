import type { MarketEvent } from "@pulse/shared";

const GAMMA = "https://gamma-api.polymarket.com";

const DEMO: MarketEvent[] = [
  {
    id: "demo-fed-cut",
    title: "Fed cuts rates before October",
    question: "Will the FOMC cut the federal funds rate at or before the October meeting?",
    yesPrice: 0.62,
    noPrice: 0.38,
    volume: 4_820_000,
    liquidity: 910_000,
    endDate: "2026-10-28T00:00:00Z",
    url: "https://polymarket.com",
    source: "demo",
  },
  {
    id: "demo-btc-150k",
    title: "BTC above $150k this year",
    question: "Will Bitcoin trade at or above $150,000 before 2027?",
    yesPrice: 0.41,
    noPrice: 0.59,
    volume: 12_400_000,
    liquidity: 2_100_000,
    endDate: "2026-12-31T00:00:00Z",
    url: "https://polymarket.com",
    source: "demo",
  },
  {
    id: "demo-monad-tvl",
    title: "Monad DeFi TVL > $2B by Q4",
    question: "Will public DeFi TVL on Monad exceed $2 billion before 2026-12-01?",
    yesPrice: 0.28,
    noPrice: 0.72,
    volume: 640_000,
    liquidity: 180_000,
    endDate: "2026-12-01T00:00:00Z",
    url: "https://polymarket.com",
    source: "demo",
  },
];

type GammaEvent = {
  id?: string | number;
  title?: string;
  slug?: string;
  endDate?: string;
  volume?: number | string;
  liquidity?: number | string;
  markets?: GammaMarket[];
};

type GammaMarket = {
  id?: string | number;
  question?: string;
  groupItemTitle?: string;
  outcomePrices?: string;
  volume?: number | string;
  liquidity?: number | string;
  slug?: string;
  clobTokenIds?: string;
};

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

function tokenIds(raw?: string): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown[];
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function prices(raw?: string): [number, number] {
  try {
    const parsed = JSON.parse(raw ?? "[]") as number[];
    const yes = num(parsed[0]);
    const no = num(parsed[1] ?? 1 - yes);
    return [yes, no];
  } catch {
    return [0.5, 0.5];
  }
}

function fromGamma(event: GammaEvent): MarketEvent | null {
  const markets = event.markets ?? [];
  if (!event.id && markets.length === 0) return null;

  const outcomes = markets
    .map((market) => {
      const [yes, no] = prices(market.outcomePrices);
      return {
        id: String(market.id ?? ""),
        label: market.groupItemTitle || market.question || `Market ${market.id}`,
        question: market.question || event.title || "",
        yesPrice: yes,
        noPrice: no,
        volume: num(market.volume),
      };
    })
    .filter((row) => row.id);

  const lead = [...outcomes].sort((a, b) => b.yesPrice - a.yesPrice)[0];
  const slug = event.slug || String(event.id ?? "");
  const id = String(event.id ?? slug);

  return {
    id,
    title: event.title || lead?.question || `Event ${id}`,
    question: lead
      ? outcomes.length > 1
        ? outcomes.map((o) => `${o.label} ${(o.yesPrice * 100).toFixed(1)}%`).join(" · ")
        : lead.question
      : event.title || `Event ${id}`,
    yesPrice: lead?.yesPrice ?? 0.5,
    noPrice: lead?.noPrice ?? 0.5,
    volume: num(event.volume) || outcomes.reduce((sum, o) => sum + o.volume, 0),
    liquidity: num(event.liquidity),
    endDate: event.endDate ?? null,
    url: `https://polymarket.com/event/${slug}`,
    source: "polymarket",
    outcomes: outcomes.length > 0 ? outcomes : undefined,
    marketIds: outcomes.map((row) => row.id),
    yesTokenId: tokenIds((markets.find((m) => String(m.id) === lead?.id) ?? markets[0])?.clobTokenIds)[0],
  };
}

export async function listEvents(limit = 12): Promise<MarketEvent[]> {
  try {
    const url = `${GAMMA}/events?limit=${limit}&active=true&closed=false&order=volume24hr&ascending=false`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`gamma ${res.status}`);
    const rows = (await res.json()) as GammaEvent[];
    const mapped = rows.map(fromGamma).filter((x): x is MarketEvent => Boolean(x));
    if (mapped.length > 0) return mapped;
  } catch (err) {
    console.warn("[markets] gamma fallback:", err instanceof Error ? err.message : err);
  }
  return DEMO;
}

function parseQuery(raw: string): { slugs: string[]; text: string } {
  const text = raw.trim();
  try {
    const url = new URL(text);
    if (url.hostname.includes("polymarket.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "event" || p === "market");
      if (idx >= 0 && parts[idx + 1]) {
        const slug = decodeURIComponent(parts[idx + 1]);
        const slugs = [slug];
        const stripped = slug.replace(/-\d+$/, "");
        if (stripped && stripped !== slug) slugs.push(stripped);
        return { slugs, text: slug };
      }
    }
  } catch {
    // not a URL
  }
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(text)) {
    const slugs = [text];
    const stripped = text.replace(/-\d+$/, "");
    if (stripped && stripped !== text) slugs.push(stripped);
    return { slugs, text };
  }
  return { slugs: [], text };
}

async function bySlug(slug: string): Promise<MarketEvent[]> {
  const res = await fetch(`${GAMMA}/events?slug=${encodeURIComponent(slug)}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as GammaEvent[];
  return rows
    .filter((row) => row.slug === slug)
    .map(fromGamma)
    .filter((x): x is MarketEvent => Boolean(x));
}

export async function searchEvents(query: string, limit = 12): Promise<MarketEvent[]> {
  const q = query.trim();
  if (!q) return listEvents(limit);

  const { slugs, text } = parseQuery(q);
  const found: MarketEvent[] = [];
  const seen = new Set<string>();
  const push = (rows: MarketEvent[]) => {
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      found.push(row);
    }
  };

  try {
    for (const slug of slugs) {
      push(await bySlug(slug));
      if (found.length > 0) return found;
    }
    if (found.length === 0) {
      const res = await fetch(
        `${GAMMA}/public-search?q=${encodeURIComponent(text)}&limit=${limit}`,
        { headers: { accept: "application/json" } },
      );
      if (res.ok) {
        const body = (await res.json()) as { events?: GammaEvent[] } | GammaEvent[];
        const rows = Array.isArray(body) ? body : (body.events ?? []);
        push(rows.map(fromGamma).filter((x): x is MarketEvent => Boolean(x)));
      }
    }
    if (found.length === 0) {
      const res = await fetch(
        `${GAMMA}/events?limit=${limit}&closed=false&title=${encodeURIComponent(text)}`,
        { headers: { accept: "application/json" } },
      );
      if (res.ok) {
        const rows = (await res.json()) as GammaEvent[];
        push(rows.map(fromGamma).filter((x): x is MarketEvent => Boolean(x)));
      }
    }
  } catch (err) {
    console.warn("[markets] search:", err instanceof Error ? err.message : err);
  }

  const needle = text.toLowerCase();
  push(DEMO.filter((e) => e.title.toLowerCase().includes(needle) || e.question.toLowerCase().includes(needle) || e.id === q));
  return found.slice(0, limit);
}

export async function getEvent(id: string): Promise<MarketEvent | undefined> {
  const demo = DEMO.find((e) => e.id === id);
  if (demo) {
    const drift = (Math.sin(Date.now() / 12_000) + 1) / 2;
    const yes = Math.min(0.95, Math.max(0.05, demo.yesPrice + (drift - 0.5) * 0.16));
    return { ...demo, yesPrice: yes, noPrice: 1 - yes, volume: demo.volume * (1 + drift * 0.18) };
  }

  try {
    const byId = await fetch(`${GAMMA}/events/${encodeURIComponent(id)}`, {
      headers: { accept: "application/json" },
    });
    if (byId.ok) {
      const row = (await byId.json()) as GammaEvent;
      const mapped = fromGamma(row);
      if (mapped) return mapped;
    }
  } catch (err) {
    console.warn("[markets] getEvent event:", err instanceof Error ? err.message : err);
  }

  const fromSlug = await bySlug(id);
  if (fromSlug[0]) return fromSlug[0];

  try {
    const res = await fetch(`${GAMMA}/markets/${id}`, { headers: { accept: "application/json" } });
    if (res.ok) {
      const market = (await res.json()) as GammaMarket & { events?: GammaEvent[] };
      const parent = market.events?.[0];
      if (parent) {
        const mapped = fromGamma({ ...parent, markets: parent.markets?.length ? parent.markets : [market] });
        if (mapped) return mapped;
      }
      const [yes, no] = prices(market.outcomePrices);
      return {
        id: String(market.id ?? id),
        title: market.question || `Market ${id}`,
        question: market.question || `Market ${id}`,
        yesPrice: yes,
        noPrice: no,
        volume: num(market.volume),
        liquidity: num(market.liquidity),
        endDate: market.events?.[0]?.endDate ?? null,
        url: `https://polymarket.com/event/${parent?.slug ?? market.slug ?? id}`,
        source: "polymarket",
        marketIds: market.id ? [String(market.id)] : undefined,
      };
    }
  } catch (err) {
    console.warn("[markets] getEvent market:", err instanceof Error ? err.message : err);
  }

  const listed = await searchEvents(id, 20);
  return listed.find((e) => e.id === id || e.url.includes(id));
}

export type PriceSwing = {
  kind: "price" | "volume" | "both";
  prevYes: number;
  yes: number;
  deltaYes: number;
  prevVolume: number;
  volume: number;
  volumeRatio: number;
};

/** Agent-owned: a move is interesting if YES jumps ~3.5pp, or a smaller move rides a volume spike. */
export function detectSwing(event: MarketEvent, prevYes: number, prevVolume: number): PriceSwing | null {
  const deltaYes = event.yesPrice - prevYes;
  const volumeRatio = prevVolume > 0 ? event.volume / prevVolume - 1 : 0;
  const priceHit = Math.abs(deltaYes) >= 0.035;
  const volHit = Math.abs(deltaYes) >= 0.02 && volumeRatio >= 0.12;
  const flowHit = volumeRatio >= 0.25 && Math.abs(deltaYes) >= 0.01;
  if (!priceHit && !volHit && !flowHit) return null;
  const kind: PriceSwing["kind"] =
    priceHit && volumeRatio >= 0.12 ? "both" : priceHit || volHit ? "price" : "volume";
  return {
    kind,
    prevYes,
    yes: event.yesPrice,
    deltaYes,
    prevVolume,
    volume: event.volume,
    volumeRatio,
  };
}
