import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RowDataPacket } from "mysql2";
import type { AlertRecord, ScanReport, Subscription, WatchPool } from "@pulse/shared";
import { quoteJoin, WATCH_COST_USDC, type PoolQuote } from "@pulse/shared";
import { dbReady, pool } from "./db.js";

const LIST_LIMIT = 50;
const IN_LIMIT = 100;
const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../.data");
const eventsDir = join(dataDir, "events");

type EventRow = RowDataPacket & {
  event_id: string;
  event_title: string;
  last_yes_price: number | null;
  last_volume: number | null;
  last_fired_at: string | null;
  last_checked_at: string | null;
  last_story: string | null;
  create_time: Date | string;
  update_time: Date | string;
};

type SubRow = RowDataPacket & {
  id: string;
  event_id: string;
  wallet: string;
  event_title: string;
  chat_id: string;
  email: string;
  paid: number;
  paid_usdc: number;
  payment_tx: string | null;
  active: number;
  last_yes_price: number | null;
  last_volume: number | null;
  last_fired_at: string | null;
  create_time: Date | string;
  update_time: Date | string;
};

type AlertRow = RowDataPacket & {
  id: string;
  subscription_id: string;
  event_id: string;
  event_title: string;
  reason: string;
  snapshot_json: unknown;
  telegram_ok: number;
  email_ok: number;
  payment_tx: string | null;
  create_time: Date | string;
  update_time: Date | string;
};

type ScanRow = RowDataPacket & {
  id: string;
  event_id: string;
  payload_json: unknown;
  create_time: Date | string;
  update_time: Date | string;
};

function isoTime(v: Date | string | null | undefined): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v) {
    const parsed = new Date(v);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function asSub(row: SubRow): Subscription {
  return {
    id: row.id,
    wallet: row.wallet,
    eventId: row.event_id,
    eventTitle: row.event_title,
    chatId: row.chat_id,
    email: row.email,
    paid: Boolean(row.paid),
    paidUsdc: Number(row.paid_usdc),
    paymentTx: row.payment_tx ?? undefined,
    active: Boolean(row.active),
    lastYesPrice: row.last_yes_price ?? undefined,
    lastVolume: row.last_volume ?? undefined,
    lastFiredAt: row.last_fired_at ?? undefined,
    createdAt: isoTime(row.create_time),
  };
}

function asPool(row: EventRow): WatchPool {
  return {
    eventId: row.event_id,
    eventTitle: row.event_title,
    lastYesPrice: row.last_yes_price ?? undefined,
    lastVolume: row.last_volume ?? undefined,
    lastFiredAt: row.last_fired_at ?? undefined,
    lastCheckedAt: row.last_checked_at ?? undefined,
    lastStory: row.last_story ?? undefined,
    updatedAt: isoTime(row.update_time),
  };
}

function asAlert(row: AlertRow): AlertRecord {
  const snapshot =
    typeof row.snapshot_json === "string" ? JSON.parse(row.snapshot_json) : row.snapshot_json;
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    reason: row.reason,
    snapshot: snapshot as AlertRecord["snapshot"],
    telegramOk: Boolean(row.telegram_ok),
    emailOk: Boolean(row.email_ok),
    paymentTx: row.payment_tx ?? undefined,
    createdAt: isoTime(row.create_time),
  };
}

function asScan(row: ScanRow): ScanReport {
  const payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json;
  return payload as ScanReport;
}

function boundedIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))].slice(0, IN_LIMIT);
}

export type TickPatch = {
  eventId: string;
  eventTitle: string;
  lastYesPrice: number;
  lastVolume: number;
  lastFiredAt: string;
  lastStory?: string;
  alerts: AlertRecord[];
  memberIds: string[];
};

export type QuoteRow = {
  eventId: string;
  yes: number;
  volume: number;
  at: Date;
};

export const store = {
  async ready() {
    await dbReady();
    await migrateJsonOnce();
  },

  async listSubscriptions(wallet?: string) {
    await dbReady();
    if (wallet) {
      const [rows] = await pool.query<SubRow[]>(
        `SELECT id, event_id, wallet, event_title, chat_id, email, paid, paid_usdc, payment_tx, active,
                last_yes_price, last_volume, last_fired_at, create_time, update_time
         FROM subscriptions
         WHERE wallet = ? AND active = 1
         ORDER BY create_time DESC
         LIMIT ?`,
        [wallet.toLowerCase(), LIST_LIMIT],
      );
      return rows.map(asSub);
    }
    const [rows] = await pool.query<SubRow[]>(
      `SELECT id, event_id, wallet, event_title, chat_id, email, paid, paid_usdc, payment_tx, active,
              last_yes_price, last_volume, last_fired_at, create_time, update_time
       FROM subscriptions
       WHERE active = 1
       ORDER BY create_time DESC
       LIMIT ?`,
      [LIST_LIMIT],
    );
    return rows.map(asSub);
  },

  async getSubscription(id: string) {
    await dbReady();
    const [rows] = await pool.query<SubRow[]>(
      `SELECT id, event_id, wallet, event_title, chat_id, email, paid, paid_usdc, payment_tx, active,
              last_yes_price, last_volume, last_fired_at, create_time, update_time
       FROM subscriptions
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] ? asSub(rows[0]) : undefined;
  },

  async activeForEvent(eventId: string) {
    await dbReady();
    const [rows] = await pool.query<SubRow[]>(
      `SELECT id, event_id, wallet, event_title, chat_id, email, paid, paid_usdc, payment_tx, active,
              last_yes_price, last_volume, last_fired_at, create_time, update_time
       FROM subscriptions
       WHERE event_id = ? AND active = 1
       ORDER BY create_time DESC
       LIMIT ?`,
      [eventId, LIST_LIMIT],
    );
    return rows.map(asSub);
  },

  async listWatchedEventIds() {
    await dbReady();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT event_id
       FROM subscriptions
       WHERE active = 1
       GROUP BY event_id
       ORDER BY MAX(create_time) DESC
       LIMIT ?`,
      [IN_LIMIT],
    );
    return rows.map((row) => String(row.event_id));
  },

  async loadWatchSnapshot(eventIds: string[]) {
    await dbReady();
    const ids = boundedIds(eventIds);
    const pools = new Map<string, WatchPool>();
    const members = new Map<string, Subscription[]>();
    for (const id of ids) members.set(id, []);
    if (ids.length === 0) return { pools, members };

    const [eventRows] = await pool.query<EventRow[]>(
      `SELECT event_id, event_title, last_yes_price, last_volume, last_fired_at, last_checked_at, last_story, create_time, update_time
       FROM events
       WHERE event_id IN (?)`,
      [ids],
    );
    for (const row of eventRows) pools.set(row.event_id, asPool(row));

    const [subRows] = await pool.query<SubRow[]>(
      `SELECT id, event_id, wallet, event_title, chat_id, email, paid, paid_usdc, payment_tx, active,
              last_yes_price, last_volume, last_fired_at, create_time, update_time
       FROM subscriptions
       WHERE event_id IN (?) AND active = 1
       ORDER BY create_time DESC
       LIMIT ?`,
      [ids, LIST_LIMIT * ids.length],
    );
    for (const row of subRows) {
      const list = members.get(row.event_id) ?? [];
      if (list.length < LIST_LIMIT) list.push(asSub(row));
      members.set(row.event_id, list);
    }
    return { pools, members };
  },

  async joinWatch(input: {
    id: string;
    wallet: string;
    eventId: string;
    eventTitle: string;
    chatId: string;
    email: string;
    paid: boolean;
    paymentTx?: string;
    lastYesPrice: number;
    lastVolume: number;
  }) {
    await dbReady();
    const wallet = input.wallet.toLowerCase();
    const now = new Date().toISOString();
    const [existing] = await pool.query<SubRow[]>(
      `SELECT id, event_id, wallet, event_title, chat_id, email, paid, paid_usdc, payment_tx, active,
              last_yes_price, last_volume, last_fired_at, create_time, update_time
       FROM subscriptions
       WHERE wallet = ? AND event_id = ? AND active = 1
       LIMIT 1`,
      [wallet, input.eventId],
    );
    if (existing[0]) {
      return { error: "already-joined" as const, subscription: asSub(existing[0]) };
    }

    await pool.query(
      `INSERT INTO events (event_id, event_title, last_yes_price, last_volume)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE event_title = VALUES(event_title)`,
      [input.eventId, input.eventTitle, input.lastYesPrice, input.lastVolume],
    );

    const sub: Subscription = {
      id: input.id,
      wallet: input.wallet,
      eventId: input.eventId,
      eventTitle: input.eventTitle,
      chatId: input.chatId,
      email: input.email,
      paid: input.paid,
      paidUsdc: WATCH_COST_USDC,
      paymentTx: input.paymentTx,
      active: true,
      lastYesPrice: input.lastYesPrice,
      lastVolume: input.lastVolume,
      createdAt: now,
    };

    try {
      await pool.query(
        `INSERT INTO subscriptions
          (id, event_id, wallet, event_title, chat_id, email, paid, paid_usdc, payment_tx, active,
           last_yes_price, last_volume)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          sub.id,
          sub.eventId,
          wallet,
          sub.eventTitle,
          sub.chatId,
          sub.email,
          sub.paid ? 1 : 0,
          sub.paidUsdc,
          sub.paymentTx ?? null,
          sub.lastYesPrice,
          sub.lastVolume,
        ],
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "ER_DUP_ENTRY") {
        const [again] = await pool.query<SubRow[]>(
          `SELECT id, event_id, wallet, event_title, chat_id, email, paid, paid_usdc, payment_tx, active,
                  last_yes_price, last_volume, last_fired_at, create_time, update_time
           FROM subscriptions
           WHERE wallet = ? AND event_id = ?
           LIMIT 1`,
          [wallet, input.eventId],
        );
        if (again[0]) return { error: "already-joined" as const, subscription: asSub(again[0]) };
      }
      throw err;
    }

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS members FROM subscriptions WHERE event_id = ? AND active = 1`,
      [input.eventId],
    );
    return { subscription: sub, quote: quoteJoin(Number(countRows[0]?.members ?? 1), input.eventId) };
  },

  async getPool(eventId: string) {
    await dbReady();
    const [rows] = await pool.query<EventRow[]>(
      `SELECT event_id, event_title, last_yes_price, last_volume, last_fired_at, create_time, update_time
       FROM events
       WHERE event_id = ?
       LIMIT 1`,
      [eventId],
    );
    return rows[0] ? asPool(rows[0]) : undefined;
  },

  async quotesFor(eventIds: string[]) {
    await dbReady();
    const ids = boundedIds(eventIds);
    const map = new Map<string, PoolQuote>(ids.map((id) => [id, quoteJoin(0, id)]));
    if (ids.length === 0) return map;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT event_id, COUNT(*) AS members
       FROM subscriptions
       WHERE event_id IN (?) AND active = 1
       GROUP BY event_id`,
      [ids],
    );
    for (const row of rows) {
      map.set(String(row.event_id), quoteJoin(Number(row.members), String(row.event_id)));
    }
    return map;
  },

  async quoteFor(eventId: string) {
    const map = await store.quotesFor([eventId]);
    return map.get(eventId) ?? quoteJoin(0, eventId);
  },

  async listAlerts(wallet?: string) {
    await dbReady();
    if (wallet) {
      const [rows] = await pool.query<AlertRow[]>(
        `SELECT a.id, a.subscription_id, a.event_id, a.event_title, a.reason, a.snapshot_json,
                a.telegram_ok, a.email_ok, a.payment_tx, a.create_time, a.update_time
         FROM alerts a
         INNER JOIN subscriptions s ON s.id = a.subscription_id
         WHERE s.wallet = ?
         ORDER BY a.create_time DESC
         LIMIT ?`,
        [wallet.toLowerCase(), LIST_LIMIT],
      );
      return rows.map(asAlert);
    }
    const [rows] = await pool.query<AlertRow[]>(
      `SELECT id, subscription_id, event_id, event_title, reason, snapshot_json,
              telegram_ok, email_ok, payment_tx, create_time, update_time
       FROM alerts
       ORDER BY create_time DESC
       LIMIT ?`,
      [LIST_LIMIT],
    );
    return rows.map(asAlert);
  },

  async addAlert(alert: AlertRecord) {
    await dbReady();
    await pool.query(
      `INSERT INTO alerts
        (id, subscription_id, event_id, event_title, reason, snapshot_json, telegram_ok, email_ok, payment_tx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        alert.id,
        alert.subscriptionId,
        alert.eventId,
        alert.eventTitle,
        alert.reason,
        JSON.stringify(alert.snapshot),
        alert.telegramOk ? 1 : 0,
        alert.emailOk ? 1 : 0,
        alert.paymentTx ?? null,
      ],
    );
    return alert;
  },

  async listScans() {
    await dbReady();
    const [rows] = await pool.query<ScanRow[]>(
      `SELECT id, event_id, payload_json, create_time, update_time
       FROM scans
       ORDER BY create_time DESC
       LIMIT ?`,
      [LIST_LIMIT],
    );
    return rows.map(asScan);
  },

  async addScan(report: ScanReport) {
    await dbReady();
    await pool.query(
      `INSERT INTO events (event_id, event_title)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE event_title = VALUES(event_title)`,
      [report.eventId, report.event.title || report.eventId],
    );
    await pool.query(
      `INSERT INTO scans (id, event_id, payload_json) VALUES (?, ?, ?)`,
      [report.id, report.eventId, JSON.stringify(report)],
    );
    return report;
  },

  async getScan(id: string) {
    await dbReady();
    const [rows] = await pool.query<ScanRow[]>(
      `SELECT id, event_id, payload_json, create_time, update_time FROM scans WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? asScan(rows[0]) : undefined;
  },

  async loadQuoteSeries(eventIds: string[]) {
    await dbReady();
    const ids = boundedIds(eventIds);
    const series = new Map<string, { at: number; yes: number; volume: number }[]>();
    for (const id of ids) series.set(id, []);
    if (ids.length === 0) return series;

    const since6h = new Date(Date.now() - 6 * 60 * 60_000);
    const since30d = new Date(Date.now() - 31 * 24 * 60 * 60_000);
    const recentLimit = Math.min(80 * ids.length, 800);
    const hourlyLimit = Math.min(750 * ids.length, 8000);

    const [recent] = await pool.query<RowDataPacket[]>(
      `SELECT event_id, yes_price, volume, create_time
       FROM event_quotes
       WHERE event_id IN (?) AND create_time >= ?
       ORDER BY event_id, create_time
       LIMIT ?`,
      [ids, since6h, recentLimit],
    );
    const [hourly] = await pool.query<RowDataPacket[]>(
      `SELECT event_id,
              AVG(yes_price) AS yes_price,
              AVG(volume) AS volume,
              MIN(create_time) AS create_time
       FROM event_quotes
       WHERE event_id IN (?) AND create_time >= ? AND create_time < ?
       GROUP BY event_id, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(create_time) / 3600) * 3600)
       ORDER BY event_id, create_time
       LIMIT ?`,
      [ids, since30d, since6h, hourlyLimit],
    );
    for (const row of [...hourly, ...recent]) {
      const list = series.get(String(row.event_id)) ?? [];
      list.push({
        at: new Date(row.create_time as string | Date).getTime(),
        yes: Number(row.yes_price),
        volume: Number(row.volume),
      });
      series.set(String(row.event_id), list);
    }
    return series;
  },

  async applyWatchResults(
    poolUpdates: WatchPool[],
    ticks: TickPatch[],
    checked: { eventId: string; checkedAt: string }[] = [],
    quotes: QuoteRow[] = [],
  ) {
    await dbReady();
    const eventMap = new Map<string, { title: string; yes: number; vol: number; firedAt?: string; story?: string }>();
    for (const row of poolUpdates) {
      eventMap.set(row.eventId, {
        title: row.eventTitle,
        yes: row.lastYesPrice ?? 0,
        vol: row.lastVolume ?? 0,
        firedAt: row.lastFiredAt,
        story: row.lastStory,
      });
    }
    for (const tick of ticks) {
      eventMap.set(tick.eventId, {
        title: tick.eventTitle,
        yes: tick.lastYesPrice,
        vol: tick.lastVolume,
        firedAt: tick.lastFiredAt,
        story: tick.lastStory,
      });
    }

    const eventIds = [...eventMap.keys()];
    if (eventIds.length > 0) {
      await pool.query(
        `INSERT INTO events (event_id, event_title, last_yes_price, last_volume, last_fired_at, last_story)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           event_title = VALUES(event_title),
           last_yes_price = VALUES(last_yes_price),
           last_volume = VALUES(last_volume),
           last_fired_at = VALUES(last_fired_at),
           last_story = COALESCE(VALUES(last_story), last_story)`,
        [
          eventIds.map((id) => {
            const row = eventMap.get(id)!;
            return [id, row.title, row.yes, row.vol, row.firedAt ?? null, row.story ?? null];
          }),
        ],
      );
    }

    const alerts = ticks.flatMap((tick) => tick.alerts);
    if (alerts.length > 0) {
      await pool.query(
        `INSERT INTO alerts
          (id, subscription_id, event_id, event_title, reason, snapshot_json, telegram_ok, email_ok, payment_tx)
         VALUES ?`,
        [
          alerts.map((alert) => [
            alert.id,
            alert.subscriptionId,
            alert.eventId,
            alert.eventTitle,
            alert.reason,
            JSON.stringify(alert.snapshot),
            alert.telegramOk ? 1 : 0,
            alert.emailOk ? 1 : 0,
            alert.paymentTx ?? null,
          ]),
        ],
      );
    }

    const quoteRows = quotes.slice(0, IN_LIMIT * 40);
    if (quoteRows.length > 0) {
      await pool.query(
        `INSERT INTO event_quotes (event_id, yes_price, volume, create_time)
         VALUES ?`,
        [quoteRows.map((row) => [row.eventId, row.yes, row.volume, row.at])],
      );
      const quoteEventIds = boundedIds(quoteRows.map((row) => row.eventId));
      if (quoteEventIds.length > 0) {
        await pool.query(
          `DELETE FROM event_quotes
           WHERE event_id IN (?) AND create_time < ?
           LIMIT 500`,
          [quoteEventIds, new Date(Date.now() - 32 * 24 * 60 * 60_000)],
        );
      }
    }

    const checkedIds = boundedIds(checked.map((row) => row.eventId));
    if (checkedIds.length > 0) {
      const checkedCase: string[] = [];
      const checkedParams: unknown[] = [];
      const atById = new Map(checked.map((row) => [row.eventId, row.checkedAt]));
      for (const id of checkedIds) {
        checkedCase.push("WHEN ? THEN ?");
        checkedParams.push(id, atById.get(id) ?? null);
      }
      checkedParams.push(checkedIds);
      await pool.query(
        `UPDATE events
         SET last_checked_at = CASE event_id ${checkedCase.join(" ")} END
         WHERE event_id IN (?)`,
        checkedParams,
      );
    }

    const memberIds = boundedIds(ticks.flatMap((tick) => tick.memberIds));
    if (memberIds.length > 0) {
      const yesCase: string[] = [];
      const volCase: string[] = [];
      const firedCase: string[] = [];
      const params: unknown[] = [];
      const byId = new Map<string, TickPatch>();
      for (const tick of ticks) {
        for (const id of tick.memberIds) byId.set(id, tick);
      }
      for (const id of memberIds) {
        const tick = byId.get(id)!;
        yesCase.push("WHEN ? THEN ?");
        params.push(id, tick.lastYesPrice);
      }
      for (const id of memberIds) {
        const tick = byId.get(id)!;
        volCase.push("WHEN ? THEN ?");
        params.push(id, tick.lastVolume);
      }
      for (const id of memberIds) {
        const tick = byId.get(id)!;
        firedCase.push("WHEN ? THEN ?");
        params.push(id, tick.lastFiredAt);
      }
      params.push(memberIds);
      await pool.query(
        `UPDATE subscriptions
         SET last_yes_price = CASE id ${yesCase.join(" ")} END,
             last_volume = CASE id ${volCase.join(" ")} END,
             last_fired_at = CASE id ${firedCase.join(" ")} END
         WHERE id IN (?)`,
        params,
      );
    }
  },
};

let migratedJson = false;

async function migrateJsonOnce() {
  if (migratedJson) return;
  migratedJson = true;
  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM subscriptions LIMIT 1`,
  );
  if (Number(countRows[0]?.n ?? 0) > 0) return;
  if (!existsSync(eventsDir)) return;

  type EventDoc = {
    eventId: string;
    eventTitle: string;
    lastYesPrice?: number;
    lastVolume?: number;
    lastFiredAt?: string;
    updatedAt: string;
    subscriptions: Subscription[];
    alerts: AlertRecord[];
    scans: ScanReport[];
  };

  const docs: EventDoc[] = readdirSync(eventsDir)
    .filter((name) => name.endsWith(".json"))
    .slice(0, IN_LIMIT)
    .map((name) => {
      try {
        return JSON.parse(readFileSync(join(eventsDir, name), "utf8")) as EventDoc;
      } catch {
        return null;
      }
    })
    .filter((doc): doc is EventDoc => Boolean(doc?.eventId));

  if (docs.length === 0) return;

  const eventValues = docs.map((doc) => [
    doc.eventId,
    doc.eventTitle || doc.eventId,
    doc.lastYesPrice ?? null,
    doc.lastVolume ?? null,
    doc.lastFiredAt ?? null,
  ]);
  await pool.query(
    `INSERT IGNORE INTO events
      (event_id, event_title, last_yes_price, last_volume, last_fired_at)
     VALUES ?`,
    [eventValues],
  );

  const subs = docs.flatMap((doc) => doc.subscriptions ?? []).slice(0, 500);
  if (subs.length > 0) {
    await pool.query(
      `INSERT IGNORE INTO subscriptions
        (id, event_id, wallet, event_title, chat_id, email, paid, paid_usdc, payment_tx, active,
         last_yes_price, last_volume, last_fired_at)
       VALUES ?`,
      [
        subs.map((sub) => [
          sub.id,
          sub.eventId,
          sub.wallet.toLowerCase(),
          sub.eventTitle,
          sub.chatId ?? "",
          sub.email ?? "",
          sub.paid ? 1 : 0,
          sub.paidUsdc ?? WATCH_COST_USDC,
          sub.paymentTx ?? null,
          sub.active ? 1 : 0,
          sub.lastYesPrice ?? null,
          sub.lastVolume ?? null,
          sub.lastFiredAt ?? null,
        ]),
      ],
    );
  }

  const alerts = docs.flatMap((doc) => doc.alerts ?? []).slice(0, 500);
  if (alerts.length > 0) {
    await pool.query(
      `INSERT IGNORE INTO alerts
        (id, subscription_id, event_id, event_title, reason, snapshot_json, telegram_ok, email_ok, payment_tx)
       VALUES ?`,
      [
        alerts.map((alert) => [
          alert.id,
          alert.subscriptionId,
          alert.eventId,
          alert.eventTitle,
          alert.reason,
          JSON.stringify(alert.snapshot),
          alert.telegramOk ? 1 : 0,
          alert.emailOk ? 1 : 0,
          alert.paymentTx ?? null,
        ]),
      ],
    );
  }

  const scans = docs.flatMap((doc) => doc.scans ?? []).slice(0, 500);
  if (scans.length > 0) {
    await pool.query(
      `INSERT IGNORE INTO scans (id, event_id, payload_json) VALUES ?`,
      [scans.map((scan) => [scan.id, scan.eventId, JSON.stringify(scan)])],
    );
  }
  console.log(`[db] migrated ${docs.length} JSON event files into mysql`);
}
