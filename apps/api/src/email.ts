import { config } from "./config.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const address = to.trim();
  if (!validEmail(address)) return false;

  if (!config.resendKey) {
    console.log("[email] skip (no RESEND_API_KEY). would send to", address, "\n", text);
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.resendKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [address],
      subject,
      text,
    }),
  });

  if (!res.ok) {
    console.warn("[email] failed", res.status, await res.text());
    return false;
  }
  return true;
}
