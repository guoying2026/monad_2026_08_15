export function pulseLog(title: string, msg: string) {
  const t = title.length > 40 ? `${title.slice(0, 38)}…` : title;
  const clock = new Date().toISOString().slice(11, 19);
  console.log(`[pulse ${clock}] 「${t}」 ${msg}`);
}
