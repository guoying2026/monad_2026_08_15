import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { buildAgentCard } from "@pulse/agent-card";
import { reputationAbi } from "@pulse/shared";
import { config, watchIntervalMs } from "./config.js";
import { formatUsdc, WATCH_COST_USDC, quoteJoin } from "@pulse/shared";
import { persistOutcomes, scanEvent } from "./agent.js";
import { pulseLog } from "./log.js";
import { analyzeEvent } from "./llm.js";
import { getEvent, listEvents, searchEvents } from "./markets.js";
import { store } from "./store.js";
import { validEmail } from "./email.js";
import { createX402Middleware, paymentTxFromRequest } from "./x402.js";

const app = express();
app.use(cors({ exposedHeaders: ["payment-required", "payment-response", "x-payment-response"] }));
app.use(express.json({ limit: "1mb" }));

function readQuery(req: { query: Record<string, unknown>; originalUrl?: string; url?: string }, key: string): string {
  const raw = req.query[key];
  const fromExpress = Array.isArray(raw) ? raw[0] : raw;
  if (typeof fromExpress === "string" && fromExpress.trim()) return fromExpress.trim();
  const href = req.originalUrl || req.url || "";
  const qs = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  return new URLSearchParams(qs).get(key)?.trim() ?? "";
}

app.use(createX402Middleware());

function card() {
  return buildAgentCard({
    apiUrl: config.publicApiUrl,
    webUrl: config.publicWebUrl,
    payTo: config.payTo || "0x0000000000000000000000000000000000000000",
    network: config.network,
    agentId: config.agentId ? Number(config.agentId) : undefined,
  });
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    agent: "Pulse",
    network: config.network.name,
    chainId: config.network.chainId,
    skipX402: config.skipX402,
    agentId: config.agentId || null,
  });
});

app.get(["/agent-card.json", "/.well-known/agent-card.json"], (_req, res) => {
  res.json(card());
});

app.get("/config", (_req, res) => {
  res.json({
    network: config.network,
    payTo: config.payTo || null,
    agentId: config.agentId || null,
    skipX402: config.skipX402,
    price: config.x402Price,
    watchCost: formatUsdc(WATCH_COST_USDC),
    identityRegistry: config.identityRegistry,
    reputationRegistry: config.reputationRegistry,
    scan8004: config.network.scan8004(config.agentId || undefined),
    feedback: {
      address: config.reputationRegistry,
      abi: reputationAbi,
    },
  });
});

app.get("/events", async (req, res) => {
  const q = readQuery(req, "q");
  const events = q ? await searchEvents(q) : await listEvents();
  const quotes = await store.quotesFor(events.map((event) => event.id));
  res.json({
    events: events.map((event) => ({
      ...event,
      pool: quotes.get(event.id) ?? quoteJoin(0, event.id),
    })),
  });
});

app.get("/pools/:eventId", async (req, res) => {
  res.json({
    pool: (await store.getPool(req.params.eventId)) ?? null,
    quote: await store.quoteFor(req.params.eventId),
  });
});

app.get("/events/:id", async (req, res) => {
  const event = await getEvent(req.params.id);
  if (!event) {
    res.status(404).json({ error: "event not found" });
    return;
  }
  res.json({ event, pool: await store.quoteFor(event.id) });
});

app.post("/scan", async (req, res) => {
  const eventId = String(req.body?.eventId ?? "");
  if (!eventId) {
    res.status(400).json({ error: "eventId required" });
    return;
  }
  const event = await getEvent(eventId);
  if (!event) {
    res.status(404).json({ error: "event not found" });
    return;
  }

  const analysis = await analyzeEvent(event);
  const report = await store.addScan({
    id: randomUUID(),
    eventId: event.id,
    event,
    ...analysis,
    paid: false,
    paymentTx: undefined,
    createdAt: new Date().toISOString(),
  });
  res.json({ report });
});

app.post("/subscribe", async (req, res) => {
  const eventId = String(req.body?.eventId ?? "");
  const wallet = String(req.body?.wallet ?? "");
  const chatId = String(req.body?.chatId ?? config.telegramDefaultChat ?? "").trim();
  const email = String(req.body?.email ?? "").trim();
  if (email && !validEmail(email)) {
    res.status(400).json({ error: "invalid email" });
    return;
  }

  if (!eventId || !wallet) {
    res.status(400).json({ error: "wallet and eventId required" });
    return;
  }

  const event = await getEvent(eventId);
  if (!event) {
    res.status(404).json({ error: "event not found" });
    return;
  }

  const joined = await store.joinWatch({
    id: randomUUID(),
    wallet,
    eventId: event.id,
    eventTitle: event.title,
    chatId,
    email,
    paid: !config.skipX402,
    paymentTx: paymentTxFromRequest(req),
    lastYesPrice: event.yesPrice,
    lastVolume: event.volume,
  });

  if ("error" in joined && joined.error === "already-joined") {
    res.status(409).json({ error: "already in this watch pool", subscription: joined.subscription });
    return;
  }

  res.json({
    subscription: joined.subscription,
    quote: "quote" in joined ? joined.quote : await store.quoteFor(event.id),
  });

  void (async () => {
    pulseLog(event.title, "订阅成功，立刻开始首次扫描");
    const outcome = await scanEvent({
      event,
      members: [joined.subscription],
      prevYes: event.yesPrice,
      prevVolume: event.volume,
      initial: true,
    });
    await persistOutcomes([outcome]);
    pulseLog(event.title, outcome.tick ? "首次扫描完成，已发通知" : "首次扫描完成");
  })().catch((err) => {
    pulseLog(event.title, `首次扫描失败：${err instanceof Error ? err.message : err}`);
  });
});

app.get("/subscriptions", async (req, res) => {
  const wallet = readQuery(req, "wallet");
  res.json({ subscriptions: await store.listSubscriptions(wallet || undefined) });
});

app.get("/alerts", async (req, res) => {
  const wallet = readQuery(req, "wallet");
  const [alerts, scans] = await Promise.all([
    store.listAlerts(wallet || undefined),
    store.listScans(),
  ]);
  res.json({ alerts, scans });
});

app.get("/scans", async (_req, res) => {
  res.json({ scans: await store.listScans() });
});

app.get("/scans/:id", async (req, res) => {
  const report = await store.getScan(req.params.id);
  if (!report) {
    res.status(404).json({ error: "scan not found" });
    return;
  }
  res.json({ report });
});

app.post("/internal/tick", async (req, res) => {
  const force = readQuery(req, "force") === "1";
  const interval = watchIntervalMs();
  const eventIds = await store.listWatchedEventIds();
  const snap = await store.loadWatchSnapshot(eventIds);
  pulseLog("worker", `本轮盯盘 ${eventIds.length} 个事件，间隔 ${Math.round(interval / 60000)} 分钟${force ? "，强制" : ""}`);

  const outcomes = [];
  for (const eventId of eventIds) {
    const pool = snap.pools.get(eventId);
    const neverNotified = !pool?.lastFiredAt;
    if (!force && !neverNotified && pool?.lastCheckedAt && Date.now() - Date.parse(pool.lastCheckedAt) < interval) {
      const ago = Math.round((Date.now() - Date.parse(pool.lastCheckedAt)) / 1000);
      pulseLog(pool.eventTitle, `间隔未到，跳过（距上次 ${ago}s / 需 ${Math.round(interval / 1000)}s）`);
      continue;
    }

    const event = await getEvent(eventId);
    if (!event) {
      pulseLog(eventId, "拉不到盘口，跳过");
      continue;
    }

    const members = snap.members.get(eventId) ?? [];
    if (members.length === 0) {
      pulseLog(event.title, "没有订阅者，跳过");
      continue;
    }

    outcomes.push(
      await scanEvent({
        event,
        members,
        prevYes: pool?.lastYesPrice ?? members[0]?.lastYesPrice,
        prevVolume: pool?.lastVolume ?? members[0]?.lastVolume,
        initial: neverNotified,
      }),
    );
  }

  await persistOutcomes(outcomes);
  const fired = outcomes.flatMap((row) => row.tick?.memberIds ?? []);
  pulseLog("worker", `本轮结束：扫描 ${outcomes.length} 个，通知 ${fired.length} 人`);
  res.json({ fired: fired.length, ids: fired, events: eventIds.length, intervalMs: interval });
});

async function scanNeverNotified() {
  const eventIds = await store.listWatchedEventIds();
  const snap = await store.loadWatchSnapshot(eventIds);
  const pending = eventIds.filter((id) => !snap.pools.get(id)?.lastFiredAt);
  if (pending.length === 0) return;
  pulseLog("boot", `有 ${pending.length} 个已订阅但还没扫过的盘，立刻开扫`);
  const outcomes = [];
  for (const eventId of pending) {
    const event = await getEvent(eventId);
    const members = snap.members.get(eventId) ?? [];
    if (!event || members.length === 0) continue;
    const pool = snap.pools.get(eventId);
    outcomes.push(
      await scanEvent({
        event,
        members,
        prevYes: pool?.lastYesPrice ?? members[0]?.lastYesPrice,
        prevVolume: pool?.lastVolume ?? members[0]?.lastVolume,
        initial: true,
      }),
    );
  }
  await persistOutcomes(outcomes);
}

void store.ready().then(() => {
  const server = app.listen(config.port, () => {
    console.log(`Pulse API  http://localhost:${config.port}`);
    console.log(`network    ${config.network.displayName} (${config.network.caip2})`);
    console.log(`x402       ${config.skipX402 ? "SKIPPED" : config.x402Price + " → " + config.payTo}`);
    console.log(`card       http://localhost:${config.port}/.well-known/agent-card.json`);
    void scanNeverNotified().catch((err) => {
      pulseLog("boot", `补扫失败：${err instanceof Error ? err.message : err}`);
    });
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[api] port ${config.port} already in use — stop the old Pulse API first`);
      process.exit(1);
    }
    throw err;
  });
});
