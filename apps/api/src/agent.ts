import { randomUUID } from "node:crypto";
import type { AlertRecord, MarketEvent, Subscription, WatchPool } from "@pulse/shared";
import { gatherEvidence } from "./evidence.js";
import { explainSwing } from "./llm.js";
import { pulseLog } from "./log.js";
import { detectSwing, type PriceSwing } from "./markets.js";
import { store, type TickPatch } from "./store.js";
import { sendEmail } from "./email.js";
import { formatAlertMessage, sendTelegram } from "./telegram.js";

export type ScanOutcome = {
  eventId: string;
  checkedAt: string;
  poolUpdate?: WatchPool;
  tick?: TickPatch;
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
}): Promise<ScanOutcome> {
  const { event, members, initial } = opts;
  const checkedAt = new Date().toISOString();
  pulseLog(
    event.title,
    `开始扫描  YES ${(event.yesPrice * 100).toFixed(1)}%  量 ${event.volume.toFixed(0)}  订阅 ${members.length} 人${initial ? "  · 首次" : ""}`,
  );

  if (opts.prevYes == null || opts.prevVolume == null) {
    pulseLog(event.title, "还没有上次价格，先记下基准，本轮只建档");
    return {
      eventId: event.id,
      checkedAt,
      poolUpdate: {
        eventId: event.id,
        eventTitle: event.title,
        lastYesPrice: event.yesPrice,
        lastVolume: event.volume,
        updatedAt: checkedAt,
      },
    };
  }

  const swing = detectSwing(event, opts.prevYes, opts.prevVolume);
  if (swing) {
    pulseLog(
      event.title,
      `检测到波动  ${(swing.prevYes * 100).toFixed(1)}% → ${(event.yesPrice * 100).toFixed(1)}%（${swing.deltaYes >= 0 ? "+" : ""}${(swing.deltaYes * 100).toFixed(1)}pt）量变 ${(swing.volumeRatio * 100).toFixed(0)}%`,
    );
  } else if (initial) {
    pulseLog(event.title, "首次盯盘，盘口还没大波动，仍然出开盘说明并通知");
  } else {
    pulseLog(event.title, "未达波动阈值，本轮不通知");
    return { eventId: event.id, checkedAt };
  }

  const used = swing ?? asSwing(event, opts.prevYes, opts.prevVolume);
  const evidence = await gatherEvidence(event);
  const reason = await explainSwing(event, used, evidence, initial ? "initial" : "swing");
  const now = checkedAt;
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
    const telegramOk = sub.chatId ? await sendTelegram(sub.chatId, body) : false;
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
        prevYesPrice: used.prevYes,
        deltaYes: used.deltaYes,
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
      createdAt: now,
    });
  }

  pulseLog(event.title, `扫描完成，写入 ${alerts.length} 条通知`);
  return {
    eventId: event.id,
    checkedAt,
    tick: {
      eventId: event.id,
      eventTitle: event.title,
      lastYesPrice: event.yesPrice,
      lastVolume: event.volume,
      lastFiredAt: now,
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
  );
}
