import { emailCreds } from "./config.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const address = to.trim();
  if (!validEmail(address)) return false;

  const { key, from } = emailCreds();
  if (!key) {
    console.log("[email] skip：.env 里没有 RESEND_API_KEY，改完请重启 API");
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
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
