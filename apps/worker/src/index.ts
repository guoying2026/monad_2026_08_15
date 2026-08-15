import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const api = (process.env.API_INTERNAL_URL || "http://localhost:4000").replace(/\/$/, "");
const interval = Number(process.env.POLL_INTERVAL_MS || 20_000);

async function tick() {
  try {
    const res = await fetch(`${api}/internal/tick`, { method: "POST" });
    const body = (await res.json()) as { fired?: number; error?: string };
    const stamp = new Date().toISOString();
    if (!res.ok) {
      console.warn(`[worker] ${stamp} tick failed`, res.status, body);
      return;
    }
    console.log(`[worker] ${stamp} fired=${body.fired ?? 0}`);
  } catch (err) {
    console.warn("[worker] api unreachable", err instanceof Error ? err.message : err);
  }
}

console.log(`Pulse worker → ${api}/internal/tick every ${interval}ms`);
void tick();
setInterval(() => {
  void tick();
}, interval);
