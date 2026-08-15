import { telegramCreds } from "./config.js";

export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const { token, defaultChat } = telegramCreds();
  const to = chatId.trim() || defaultChat.trim();
  if (!token) {
    console.log("[telegram] skip：.env 里没有 TELEGRAM_BOT_TOKEN，改完请重启 API");
    return false;
  }
  if (!to) {
    console.log("[telegram] skip：没有 chatId");
    return false;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: to,
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

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    `<b>Pulse 盯盘</b>`,
    esc(opts.title),
    "",
    esc(opts.reason),
    "",
    `YES ${yes} · vol ${opts.volume.toLocaleString()}`,
    opts.url ? opts.url : "",
  ]
    .filter(Boolean)
    .join("\n");
}
