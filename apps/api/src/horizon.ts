export type HorizonKey = "5m" | "1h" | "6h" | "1d" | "7d" | "30d";
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
  { key: "5m", ms: 5 * 60_000, label: "过去 5 分钟", minPts: 0 },
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
    const start = nearest(series, opts.now - h.ms, h.key === "5m" ? 12 * 60_000 : h.ms * 0.35);
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

  const five = others.find((row) => row.key === "5m");
  const fiveFrom = five?.from ?? opts.lastFiredYes ?? series.at(-2)?.yes;
  const sinceLast =
    fiveFrom != null
      ? { from: fiveFrom, to: opts.yes, delta: opts.yes - fiveFrom }
      : opts.lastFiredYes != null
        ? { from: opts.lastFiredYes, to: opts.yes, delta: opts.yes - opts.lastFiredYes }
        : undefined;

  const longer = others.filter((row) => row.key !== "5m");
  const context = longer.map((row) => ({ label: row.label, delta: row.delta }));

  if (sinceLast) {
    const fiveTrend = five?.trend ?? {
      kind: Math.abs(sinceLast.delta) >= 0.02 ? "sudden" : "choppy",
      label: Math.abs(sinceLast.delta) >= 0.02 ? TREND_LABEL.sudden : TREND_LABEL.choppy,
    };
    return {
      window: "5m",
      label: "过去 5 分钟",
      from: sinceLast.from,
      to: sinceLast.to,
      delta: sinceLast.delta,
      trend: fiveTrend.kind,
      trendLabel: fiveTrend.label,
      sinceLast,
      others: context,
      key: `5m:${sinceLast.delta >= 0 ? "up" : "down"}:${fiveTrend.kind}`,
    };
  }

  return null;
}

export function shouldNotify(opts: { initial?: boolean; story: MoveStory | null }) {
  return Boolean(opts.initial || opts.story);
}

export function storyLine(story: MoveStory) {
  const pts = `${story.delta >= 0 ? "+" : ""}${(story.delta * 100).toFixed(1)}pt`;
  const from = `${(story.from * 100).toFixed(1)}%`;
  const to = `${(story.to * 100).toFixed(1)}%`;
  return `${story.label} YES ${from} → ${to}（${pts}），形态是${story.trendLabel}`;
}
