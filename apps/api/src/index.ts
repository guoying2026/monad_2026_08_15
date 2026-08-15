import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { buildAgentCard } from "@pulse/agent-card";
import { reputationAbi } from "@pulse/shared";
import { config, watchIntervalMs } from "./config.js";
import { formatUsdc, WATCH_COST_USDC, quoteJoin, type AlertRecord } from "@pulse/shared";
import { analyzeEvent, explainSwing } from "./llm.js";
import { gatherEvidence } from "./evidence.js";
import { detectSwing, getEvent, listEvents, searchEvents } from "./markets.js";
import { store } from "./store.js";
import { sendEmail, validEmail } from "./email.js";
import { formatAlertMessage, sendTelegram } from "./telegram.js";
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
  const fired: string[] = [];
  const eventIds = await store.listWatchedEventIds();
  const snap = await store.loadWatchSnapshot(eventIds);
  const poolUpdates: { eventId: string; eventTitle: string; lastYesPrice: number; lastVolume: number; lastFiredAt?: string; updatedAt: string }[] = [];
  const ticks: { eventId: string; eventTitle: string; lastYesPrice: number; lastVolume: number; lastFiredAt: string; alerts: AlertRecord[]; memberIds: string[] }[] = [];
  const checked: { eventId: string; checkedAt: string }[] = [];

  for (const eventId of eventIds) {
    const pool = snap.pools.get(eventId);
    if (!force && pool?.lastCheckedAt && Date.now() - Date.parse(pool.lastCheckedAt) < interval) {
      continue;
    }

    const event = await getEvent(eventId);
    if (!event) continue;

    const members = snap.members.get(eventId) ?? [];
    if (members.length === 0) continue;

    const checkedAt = new Date().toISOString();
    checked.push({ eventId, checkedAt });

    const prevYes = pool?.lastYesPrice ?? members[0]?.lastYesPrice;
    const prevVolume = pool?.lastVolume ?? members[0]?.lastVolume;
    if (prevYes == null || prevVolume == null) {
      poolUpdates.push({
        eventId,
        eventTitle: event.title,
        lastYesPrice: event.yesPrice,
        lastVolume: event.volume,
        updatedAt: checkedAt,
      });
      continue;
    }

    const swing = detectSwing(event, prevYes, prevVolume);
    if (!swing) continue;
    if (!force && pool?.lastFiredAt && Date.now() - Date.parse(pool.lastFiredAt) < interval) continue;

    const evidence = await gatherEvidence(event);
    const reason = await explainSwing(event, swing, evidence);
    const now = new Date().toISOString();
    const body = formatAlertMessage({
      title: event.title,
      reason,
      yesPrice: event.yesPrice,
      volume: event.volume,
      url: event.url,
    });

    const alerts: AlertRecord[] = [];
    for (const sub of members) {
      const telegramOk = sub.chatId ? await sendTelegram(sub.chatId, body) : false;
      const emailOk = sub.email ? await sendEmail(sub.email, `Pulse · ${event.title}`, body.replace(/<[^>]+>/g, "")) : false;
      alerts.push({
        id: randomUUID(),
        subscriptionId: sub.id,
        eventId: event.id,
        eventTitle: event.title,
        reason,
        snapshot: {
          yesPrice: event.yesPrice,
          volume: event.volume,
          prevYesPrice: swing.prevYes,
          deltaYes: swing.deltaYes,
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
      fired.push(sub.id);
    }

    ticks.push({
      eventId: event.id,
      eventTitle: event.title,
      lastYesPrice: event.yesPrice,
      lastVolume: event.volume,
      lastFiredAt: now,
      alerts,
      memberIds: members.map((s) => s.id),
    });
  }

  await store.applyWatchResults(poolUpdates, ticks, checked);
  res.json({ fired: fired.length, ids: fired, events: eventIds.length, intervalMs: interval });
});

void store.ready().then(() => {
  const server = app.listen(config.port, () => {
    console.log(`Pulse API  http://localhost:${config.port}`);
    console.log(`network    ${config.network.displayName} (${config.network.caip2})`);
    console.log(`x402       ${config.skipX402 ? "SKIPPED" : config.x402Price + " → " + config.payTo}`);
    console.log(`card       http://localhost:${config.port}/.well-known/agent-card.json`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[api] port ${config.port} already in use — stop the old Pulse API first`);
      process.exit(1);
    }
    throw err;
  });
});
