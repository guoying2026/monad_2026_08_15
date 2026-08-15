import { config } from "./config.js";

export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  if (!config.telegramToken || !chatId) {
    console.log("[telegram] skip (no token/chat). would send:\n", text);
    return false;
  }

  const res = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn("[telegram] failed", res.status, body);
    return false;
  }
  return true;
}

export function formatAlertMessage(opts: {
  title: string;
  reason: string;
  yesPrice: number;
  volume: number;
  url?: string;
}) {
  const yes = `${(opts.yesPrice * 100).toFixed(1)}%`;
  return [
    `<b>Pulse alert</b>`,
    opts.title,
    "",
    opts.reason,
    "",
    `YES ${yes} · vol ${opts.volume.toLocaleString()}`,
    opts.url ? opts.url : "",
  ]
    .filter(Boolean)
    .join("\n");
}
