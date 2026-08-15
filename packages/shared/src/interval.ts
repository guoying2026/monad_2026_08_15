/** 每个事件检测一次的间隔。优先读 WATCH_INTERVAL_MINUTES，否则 POLL_INTERVAL_MS，默认 5 分钟。 */
export function watchIntervalMs(env: NodeJS.ProcessEnv = process.env) {
  const minutes = Number(env.WATCH_INTERVAL_MINUTES?.trim());
  if (Number.isFinite(minutes) && minutes > 0) return Math.round(minutes * 60_000);
  const ms = Number(env.POLL_INTERVAL_MS?.trim());
  if (Number.isFinite(ms) && ms > 0) return ms;
  return 5 * 60_000;
}
