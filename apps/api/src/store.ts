import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AlertRecord, ScanReport, Subscription, WatchPool } from "@pulse/shared";
import { quoteJoin, WATCH_COST_USDC } from "@pulse/shared";

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

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../.data");
const eventsDir = join(dataDir, "events");
const legacyFile = join(dataDir, "store.json");

function safeName(eventId: string) {
  const cleaned = eventId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return cleaned || "event";
}

function eventPath(eventId: string) {
  return join(eventsDir, `${safeName(eventId)}.json`);
}

function emptyDoc(eventId: string, eventTitle = eventId): EventDoc {
  return {
    eventId,
    eventTitle,
    updatedAt: new Date().toISOString(),
    subscriptions: [],
    alerts: [],
    scans: [],
  };
}

function readDoc(eventId: string): EventDoc {
  try {
    const raw = JSON.parse(readFileSync(eventPath(eventId), "utf8")) as Partial<EventDoc>;
    return {
      ...emptyDoc(eventId, raw.eventTitle || eventId),
      ...raw,
      eventId: raw.eventId || eventId,
      subscriptions: raw.subscriptions ?? [],
      alerts: raw.alerts ?? [],
      scans: raw.scans ?? [],
    };
  } catch {
    return emptyDoc(eventId);
  }
}

function writeDoc(doc: EventDoc) {
  mkdirSync(eventsDir, { recursive: true });
  doc.updatedAt = new Date().toISOString();
  const dest = eventPath(doc.eventId);
  const tmp = `${dest}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2));
  renameSync(tmp, dest);
}

function listDocs(): EventDoc[] {
  migrateLegacy();
  if (!existsSync(eventsDir)) return [];
  return readdirSync(eventsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return JSON.parse(readFileSync(join(eventsDir, name), "utf8")) as EventDoc;
      } catch {
        return null;
      }
    })
    .filter((doc): doc is EventDoc => Boolean(doc?.eventId));
}

let migrated = false;

function migrateLegacy() {
  if (migrated) return;
  migrated = true;
  if (!existsSync(legacyFile)) return;
  try {
    const raw = JSON.parse(readFileSync(legacyFile, "utf8")) as {
      subscriptions?: Subscription[];
      alerts?: AlertRecord[];
      scans?: ScanReport[];
      pools?: WatchPool[];
    };
    const ids = new Set<string>();
    for (const row of raw.subscriptions ?? []) ids.add(row.eventId);
    for (const row of raw.alerts ?? []) ids.add(row.eventId);
    for (const row of raw.scans ?? []) ids.add(row.eventId);
    for (const row of raw.pools ?? []) ids.add(row.eventId);

    for (const eventId of ids) {
      if (existsSync(eventPath(eventId))) continue;
      const pool = raw.pools?.find((p) => p.eventId === eventId);
      writeDoc({
        eventId,
        eventTitle: pool?.eventTitle || raw.subscriptions?.find((s) => s.eventId === eventId)?.eventTitle || eventId,
        lastYesPrice: pool?.lastYesPrice,
        lastVolume: pool?.lastVolume,
        lastFiredAt: pool?.lastFiredAt,
        updatedAt: pool?.updatedAt || new Date().toISOString(),
        subscriptions: (raw.subscriptions ?? []).filter((s) => s.eventId === eventId),
        alerts: (raw.alerts ?? []).filter((a) => a.eventId === eventId),
        scans: (raw.scans ?? []).filter((s) => s.eventId === eventId),
      });
    }
    renameSync(legacyFile, join(dataDir, "store.json.bak"));
  } catch {
    // keep going with empty per-event files
  }
}

export const store = {
  listSubscriptions() {
    return listDocs().flatMap((doc) => doc.subscriptions ?? []);
  },
  getSubscription(id: string) {
    for (const doc of listDocs()) {
      const hit = doc.subscriptions?.find((s) => s.id === id);
      if (hit) return hit;
    }
    return undefined;
  },
  activeForEvent(eventId: string) {
    migrateLegacy();
    return readDoc(eventId).subscriptions.filter((s) => s.active);
  },
  listWatchedEventIds() {
    return listDocs()
      .filter((doc) => (doc.subscriptions ?? []).some((s) => s.active))
      .map((doc) => doc.eventId);
  },
  updateSubscription(eventId: string, id: string, patch: Partial<Subscription>) {
    migrateLegacy();
    const doc = readDoc(eventId);
    const idx = doc.subscriptions.findIndex((s) => s.id === id);
    if (idx < 0) return undefined;
    doc.subscriptions[idx] = { ...doc.subscriptions[idx], ...patch };
    writeDoc(doc);
    return doc.subscriptions[idx];
  },
  joinWatch(input: {
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
    migrateLegacy();
    const doc = readDoc(input.eventId);
    const wallet = input.wallet.toLowerCase();
    const already = doc.subscriptions.find((s) => s.active && s.wallet.toLowerCase() === wallet);
    if (already) {
      return { error: "already-joined" as const, subscription: already };
    }

    const quote = quoteJoin(doc.subscriptions.filter((s) => s.active).length, input.eventId);
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
      createdAt: new Date().toISOString(),
    };
    doc.eventTitle = input.eventTitle;
    if (doc.lastYesPrice == null) {
      doc.lastYesPrice = input.lastYesPrice;
      doc.lastVolume = input.lastVolume;
    }
    doc.subscriptions.unshift(sub);
    writeDoc(doc);
    return { subscription: sub, quote };
  },
  getPool(eventId: string): WatchPool | undefined {
    migrateLegacy();
    if (!existsSync(eventPath(eventId))) return undefined;
    const doc = readDoc(eventId);
    return {
      eventId: doc.eventId,
      eventTitle: doc.eventTitle,
      lastYesPrice: doc.lastYesPrice,
      lastVolume: doc.lastVolume,
      lastFiredAt: doc.lastFiredAt,
      updatedAt: doc.updatedAt,
    };
  },
  updatePool(eventId: string, patch: Partial<WatchPool>) {
    migrateLegacy();
    const doc = readDoc(eventId);
    if (patch.eventTitle) doc.eventTitle = patch.eventTitle;
    if (patch.lastYesPrice != null) doc.lastYesPrice = patch.lastYesPrice;
    if (patch.lastVolume != null) doc.lastVolume = patch.lastVolume;
    if (patch.lastFiredAt) doc.lastFiredAt = patch.lastFiredAt;
    writeDoc(doc);
    return store.getPool(eventId);
  },
  quoteFor(eventId: string) {
    migrateLegacy();
    const n = existsSync(eventPath(eventId))
      ? readDoc(eventId).subscriptions.filter((s) => s.active).length
      : 0;
    return quoteJoin(n, eventId);
  },
  listAlerts() {
    return listDocs()
      .flatMap((doc) => doc.alerts ?? [])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  addAlert(alert: AlertRecord) {
    migrateLegacy();
    const doc = readDoc(alert.eventId);
    doc.alerts.unshift(alert);
    writeDoc(doc);
    return alert;
  },
  listScans() {
    return listDocs()
      .flatMap((doc) => doc.scans ?? [])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  addScan(report: ScanReport) {
    migrateLegacy();
    const doc = readDoc(report.eventId);
    doc.eventTitle = report.event.title || doc.eventTitle;
    doc.scans.unshift(report);
    writeDoc(doc);
    return report;
  },
  getScan(id: string) {
    for (const doc of listDocs()) {
      const hit = doc.scans?.find((s) => s.id === id);
      if (hit) return hit;
    }
    return undefined;
  },
  commitTick(
    eventId: string,
    patch: {
      eventTitle: string;
      lastYesPrice: number;
      lastVolume: number;
      lastFiredAt: string;
      alerts: AlertRecord[];
      memberIds: string[];
    },
  ) {
    migrateLegacy();
    const doc = readDoc(eventId);
    doc.eventTitle = patch.eventTitle;
    doc.lastYesPrice = patch.lastYesPrice;
    doc.lastVolume = patch.lastVolume;
    doc.lastFiredAt = patch.lastFiredAt;
    for (const alert of patch.alerts) doc.alerts.unshift(alert);
    for (const id of patch.memberIds) {
      const row = doc.subscriptions.find((s) => s.id === id);
      if (!row) continue;
      row.lastFiredAt = patch.lastFiredAt;
      row.lastYesPrice = patch.lastYesPrice;
      row.lastVolume = patch.lastVolume;
    }
    writeDoc(doc);
  },
};
