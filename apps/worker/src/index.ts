import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

function reloadEnv() {
  loadEnv({ path: resolve(process.cwd(), "../../.env"), override: true });
  loadEnv({ path: resolve(process.cwd(), ".env"), override: true });
}

function intervalMs() {
  reloadEnv();
  const minutes = Number(process.env.WATCH_INTERVAL_MINUTES?.trim());
  if (Number.isFinite(minutes) && minutes > 0) return Math.round(minutes * 60_000);
  const ms = Number(process.env.POLL_INTERVAL_MS?.trim());
  if (Number.isFinite(ms) && ms > 0) return ms;
  return 5 * 60_000;
}

reloadEnv();
const api = (process.env.API_INTERNAL_URL || "http://localhost:4000").replace(/\/$/, "");

async function tick() {
  try {
    const res = await fetch(`${api}/internal/tick`, { method: "POST" });
    const body = (await res.json()) as { fired?: number; error?: string };
    const stamp = new Date().toISOString();
    if (!res.ok) {
      console.warn(`[worker] ${stamp} tick failed`, res.status, body);
      return;
    }
    const wait = intervalMs();
    console.log(`[worker ${stamp.slice(11, 19)}] API 回了 fired=${body.fired ?? 0}，${Math.round(wait / 60000)} 分钟后再扫`);
  } catch (err) {
    console.warn("[worker] api unreachable", err instanceof Error ? err.message : err);
  }
}

async function loop() {
  await tick();
  setTimeout(() => {
    void loop();
  }, intervalMs());
}

console.log(`[worker] 盯盘 Worker 已启动 → ${api}/internal/tick ，间隔 ${Math.round(intervalMs() / 60000)} 分钟`);
void loop();
