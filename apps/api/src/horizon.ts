export type HorizonKey = "1h" | "6h" | "1d" | "7d" | "30d";
export type TrendKind = "steady_up" | "steady_down" | "sudden" | "accelerating" | "choppy";

export type PriceQuote = {
  at: number;
  yes: number;
  volume: number;
};

export type MoveStory = {
  window: HorizonKey | "since_last";
  label: string;
  from: number;
  to: number;
  delta: number;
  trend: TrendKind;
  trendLabel: string;
  sinceLast?: { from: number; to: number; delta: number };
  others: { label: string; delta: number }[];
  key: string;
};

const HORIZONS: { key: HorizonKey; ms: number; label: string; minPts: number }[] = [
  { key: "1h", ms: 60 * 60_000, label: "过去 1 小时", minPts: 0.05 },
  { key: "6h", ms: 6 * 60 * 60_000, label: "过去 6 小时", minPts: 0.06 },
  { key: "1d", ms: 24 * 60 * 60_000, label: "过去 1 天", minPts: 0.08 },
  { key: "7d", ms: 7 * 24 * 60 * 60_000, label: "过去 7 天", minPts: 0.12 },
  { key: "30d", ms: 30 * 24 * 60 * 60_000, label: "过去 30 天", minPts: 0.15 },
];

const TREND_LABEL: Record<TrendKind, string> = {
  steady_up: "匀速上升",
  steady_down: "匀速下降",
  sudden: "突然跳变",
  accelerating: "近期加速",
  choppy: "来回震荡",
};

function nearest(quotes: PriceQuote[], target: number, slack: number) {
  let best: PriceQuote | undefined;
  let bestDist = Infinity;
  for (const q of quotes) {
    const dist = Math.abs(q.at - target);
    if (dist < bestDist) {
      best = q;
      bestDist = dist;
    }
  }
  return best && bestDist <= slack ? best : undefined;
}

function inWindow(quotes: PriceQuote[], from: number, to: number) {
  return quotes.filter((q) => q.at >= from && q.at <= to);
}

function trendOf(points: PriceQuote[]): { kind: TrendKind; label: string } {
  if (points.length < 4) {
    const delta = (points.at(-1)?.yes ?? 0) - (points[0]?.yes ?? 0);
    if (Math.abs(delta) < 0.025) return { kind: "choppy", label: TREND_LABEL.choppy };
    return { kind: "sudden", label: TREND_LABEL.sudden };
  }
  const ys = points.map((p) => p.yes);
  const n = ys.length;
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (ys[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = yMean + slope * (i - xMean);
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  let same = 0;
  for (let i = 1; i < n; i++) {
    const step = ys[i] - ys[i - 1];
    if (step === 0 || Math.sign(step) === Math.sign(slope)) same += 1;
  }
  const sameRatio = same / (n - 1);
  const total = ys[n - 1] - ys[0];
  const tail = ys[n - 1] - ys[Math.floor(n * 0.75)];
  if (Math.abs(total) >= 0.04 && Math.abs(tail) > 0.55 * Math.abs(total)) {
    return { kind: "accelerating", label: TREND_LABEL.accelerating };
  }
  if (r2 >= 0.62 && sameRatio >= 0.58 && Math.abs(total) >= 0.03) {
    const kind = slope < 0 ? "steady_down" : "steady_up";
    return { kind, label: TREND_LABEL[kind] };
  }
  if (r2 < 0.28) return { kind: "choppy", label: TREND_LABEL.choppy };
  return { kind: "sudden", label: TREND_LABEL.sudden };
}

export function buildStory(opts: {
  now: number;
  yes: number;
  quotes: PriceQuote[];
  lastFiredYes?: number;
}): MoveStory | null {
  const series = [...opts.quotes].sort((a, b) => a.at - b.at);
  if (series.length === 0 || !Number.isFinite(opts.yes)) return null;

  const others: { label: string; delta: number; key: HorizonKey; from: number; crossed: boolean; trend: ReturnType<typeof trendOf> }[] = [];
  for (const h of HORIZONS) {
    const start = nearest(series, opts.now - h.ms, h.ms * 0.35);
    if (!start) continue;
    const delta = opts.yes - start.yes;
    const points = [...inWindow(series, opts.now - h.ms, opts.now), { at: opts.now, yes: opts.yes, volume: 0 }];
    others.push({
      label: h.label,
      delta,
      key: h.key,
      from: start.yes,
      crossed: Math.abs(delta) >= h.minPts,
      trend: trendOf(points),
    });
  }

  const sinceLast =
    opts.lastFiredYes != null
      ? { from: opts.lastFiredYes, to: opts.yes, delta: opts.yes - opts.lastFiredYes }
      : undefined;

  const crossed = others.filter((row) => row.crossed);
  const suddenShort = crossed.find((row) => (row.key === "1h" || row.key === "6h") && row.trend.kind === "sudden");
  const longest = [...crossed].sort((a, b) => HORIZONS.findIndex((h) => h.key === b.key) - HORIZONS.findIndex((h) => h.key === a.key))[0];
  const pick = suddenShort && Math.abs(suddenShort.delta) >= 0.05 ? suddenShort : longest;

  if (pick) {
    return {
      window: pick.key,
      label: pick.label,
      from: pick.from,
      to: opts.yes,
      delta: pick.delta,
      trend: pick.trend.kind,
      trendLabel: pick.trend.label,
      sinceLast,
      others: others.map((row) => ({ label: row.label, delta: row.delta })),
      key: `${pick.key}:${pick.delta >= 0 ? "up" : "down"}:${pick.trend.kind}`,
    };
  }

  if (sinceLast && Math.abs(sinceLast.delta) >= 0.035) {
    return {
      window: "since_last",
      label: "距上次通知",
      from: sinceLast.from,
      to: sinceLast.to,
      delta: sinceLast.delta,
      trend: Math.abs(sinceLast.delta) >= 0.05 ? "sudden" : "choppy",
      trendLabel: Math.abs(sinceLast.delta) >= 0.05 ? TREND_LABEL.sudden : TREND_LABEL.choppy,
      sinceLast,
      others: others.map((row) => ({ label: row.label, delta: row.delta })),
      key: `since_last:${sinceLast.delta >= 0 ? "up" : "down"}`,
    };
  }

  return null;
}

export function shouldNotify(opts: {
  initial?: boolean;
  force?: boolean;
  story: MoveStory | null;
  lastStory?: string;
  lastFiredYes?: number;
  yes: number;
}) {
  if (opts.initial) return true;
  if (!opts.story) return false;
  if (opts.force) return true;
  const since = opts.lastFiredYes != null ? Math.abs(opts.yes - opts.lastFiredYes) : 1;
  if (since >= 0.035) return true;
  if (opts.story.key !== opts.lastStory && Math.abs(opts.story.delta) >= 0.05) return true;
  return false;
}

export function storyLine(story: MoveStory) {
  const pts = `${story.delta >= 0 ? "+" : ""}${(story.delta * 100).toFixed(1)}pt`;
  const from = `${(story.from * 100).toFixed(1)}%`;
  const to = `${(story.to * 100).toFixed(1)}%`;
  return `${story.label} YES ${from} → ${to}（${pts}），形态是${story.trendLabel}`;
}
