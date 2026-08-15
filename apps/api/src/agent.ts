import { randomUUID } from "node:crypto";
import type { AlertRecord, MarketEvent, Subscription, WatchPool } from "@pulse/shared";
import { gatherEvidence } from "./evidence.js";
import { fetchPriceHistory } from "./history.js";
import { buildStory, shouldNotify, storyLine, type PriceQuote } from "./horizon.js";
import { explainSwing } from "./llm.js";
import { pulseLog } from "./log.js";
import { detectSwing, type PriceSwing } from "./markets.js";
import { store, type QuoteRow, type TickPatch } from "./store.js";
import { sendEmail } from "./email.js";
import { formatAlertMessage, sendTelegram } from "./telegram.js";

export type ScanOutcome = {
  eventId: string;
  checkedAt: string;
  poolUpdate?: WatchPool;
  tick?: TickPatch;
  quotes: QuoteRow[];
};

function asSwing(event: MarketEvent, prevYes: number, prevVolume: number): PriceSwing {
  const deltaYes = event.yesPrice - prevYes;
  const volumeRatio = prevVolume > 0 ? event.volume / prevVolume - 1 : 0;
  return {
    kind: Math.abs(deltaYes) >= 0.02 ? "price" : "volume",
    prevYes,
    yes: event.yesPrice,
    deltaYes,
    prevVolume,
    volume: event.volume,
    volumeRatio,
  };
}

export async function scanEvent(opts: {
  event: MarketEvent;
  members: Subscription[];
  prevYes?: number;
  prevVolume?: number;
  initial?: boolean;
  force?: boolean;
  lastStory?: string;
  lastFiredYes?: number;
  quotes?: PriceQuote[];
}): Promise<ScanOutcome> {
  const { event, members, initial, force } = opts;
  const checkedAt = new Date().toISOString();
  const now = Date.now();
  let quotes = [...(opts.quotes ?? [])];
  const needHist = quotes.length < 10;
  if (needHist) {
    const hist = await fetchPriceHistory(event);
    quotes = [...hist, ...quotes];
  }
  quotes.push({ at: now, yes: event.yesPrice, volume: event.volume });
  const currentQuote: QuoteRow = { eventId: event.id, yes: event.yesPrice, volume: event.volume, at: new Date(now) };
  const quoteRows: QuoteRow[] = needHist
    ? [
        currentQuote,
        ...quotes
          .filter((q) => q.at < now - 60_000)
          .filter((_, i, all) => i % Math.max(1, Math.floor(all.length / 80)) === 0)
          .slice(-80)
          .map((q) => ({ eventId: event.id, yes: q.yes, volume: q.volume, at: new Date(q.at) })),
      ]
    : [currentQuote];

  pulseLog(
    event.title,
    `开始扫描  YES ${(event.yesPrice * 100).toFixed(1)}%  量 ${event.volume.toFixed(0)}  订阅 ${members.length} 人  历史点 ${quotes.length}${initial ? "  · 首次" : ""}`,
  );

  if (opts.prevYes == null || opts.prevVolume == null) {
    pulseLog(event.title, "还没有上次价格，先记下基准，本轮只建档");
    return {
      eventId: event.id,
      checkedAt,
      quotes: quoteRows,
      poolUpdate: {
        eventId: event.id,
        eventTitle: event.title,
        lastYesPrice: event.yesPrice,
        lastVolume: event.volume,
        updatedAt: checkedAt,
      },
    };
  }

  const story = buildStory({
    now,
    yes: event.yesPrice,
    quotes,
    lastFiredYes: opts.lastFiredYes ?? opts.prevYes,
  });
  if (story) {
    pulseLog(event.title, `主窗口 ${storyLine(story)}${story.others.length ? `；对照 ${story.others.map((o) => `${o.label} ${(o.delta * 100).toFixed(1)}pt`).join(" / ")}` : ""}`);
  } else {
    pulseLog(event.title, "各时间窗口都没有超过阈值的变动");
  }

  const notify = shouldNotify({ initial, story });
  if (!notify) {
    pulseLog(event.title, "没有可对比的 5 分钟价格，本轮不通知");
    return { eventId: event.id, checkedAt, quotes: [currentQuote] };
  }

  const swing = detectSwing(event, story?.from ?? opts.prevYes, opts.prevVolume) ?? asSwing(event, story?.from ?? opts.prevYes, opts.prevVolume);
  const evidence = await gatherEvidence(event);
  const reason = await explainSwing(event, swing, evidence, initial ? "initial" : "swing", story);
  const body = formatAlertMessage({
    title: event.title,
    reason,
    yesPrice: event.yesPrice,
    volume: event.volume,
    url: event.url,
  });

  const alerts: AlertRecord[] = [];
  for (const sub of members) {
    pulseLog(event.title, `发通知  邮箱=${sub.email || "无"}  Telegram=${sub.chatId || "无"}`);
    const telegramOk = await sendTelegram(sub.chatId, body);
    const emailOk = sub.email ? await sendEmail(sub.email, `Pulse · ${event.title}`, body.replace(/<[^>]+>/g, "")) : false;
    pulseLog(event.title, `通知结果  邮件=${emailOk ? "已发" : "未发"}  Telegram=${telegramOk ? "已发" : "未发"}`);
    alerts.push({
      id: randomUUID(),
      subscriptionId: sub.id,
      eventId: event.id,
      eventTitle: event.title,
      reason,
      snapshot: {
        yesPrice: event.yesPrice,
        volume: event.volume,
        prevYesPrice: story?.from ?? swing.prevYes,
        deltaYes: story?.delta ?? swing.deltaYes,
        window: story?.label,
        trend: story?.trendLabel,
        sources: evidence.slice(0, 6).map((item) => ({
          kind: item.kind,
          title: item.title,
          source: item.source,
          url: item.url,
        })),
      },
      telegramOk,
      emailOk,
      paymentTx: sub.paymentTx,
      createdAt: checkedAt,
    });
  }

  pulseLog(event.title, `扫描完成，写入 ${alerts.length} 条通知`);
  return {
    eventId: event.id,
    checkedAt,
    quotes: [currentQuote],
    tick: {
      eventId: event.id,
      eventTitle: event.title,
      lastYesPrice: event.yesPrice,
      lastVolume: event.volume,
      lastFiredAt: checkedAt,
      lastStory: story?.key,
      alerts,
      memberIds: members.map((s) => s.id),
    },
  };
}

export async function persistOutcomes(outcomes: ScanOutcome[]) {
  await store.applyWatchResults(
    outcomes.flatMap((row) => (row.poolUpdate ? [row.poolUpdate] : [])),
    outcomes.flatMap((row) => (row.tick ? [row.tick] : [])),
    outcomes.map((row) => ({ eventId: row.eventId, checkedAt: row.checkedAt })),
    outcomes.flatMap((row) => row.quotes),
  );
}
