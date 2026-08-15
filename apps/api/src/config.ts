import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { resolveNetwork, watchIntervalMs as readWatchInterval, X402_PRICE_LABEL } from "@pulse/shared";

function reloadEnv() {
  loadEnv({ path: resolve(process.cwd(), "../../.env"), override: true });
  loadEnv({ path: resolve(process.cwd(), ".env"), override: true });
}

reloadEnv();

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const network = resolveNetwork(env("MONAD_NETWORK", "testnet"));

export const config = {
  port: Number(env("PORT", "4000")),
  network,
  rpcUrl: env("MONAD_RPC_URL", network.rpcUrl),
  payTo: env("PAY_TO_ADDRESS") as `0x${string}`,
  privateKey: env("PRIVATE_KEY") as `0x${string}` | "",
  identityRegistry: (env("IDENTITY_REGISTRY") || network.identityRegistry) as `0x${string}`,
  reputationRegistry: (env("REPUTATION_REGISTRY") || network.reputationRegistry) as `0x${string}`,
  agentId: env("AGENT_ID"),
  agentUri: env("AGENT_URI", "http://localhost:4000/.well-known/agent-card.json"),
  publicApiUrl: env("PUBLIC_API_URL", "http://localhost:4000"),
  publicWebUrl: env("PUBLIC_WEB_URL", "http://localhost:3000"),
  skipX402: env("SKIP_X402", "true") === "true",
  x402Price: env("X402_PRICE", X402_PRICE_LABEL),
  facilitatorUrl: env("FACILITATOR_URL", network.facilitatorUrl),
  openaiKey: env("OPENAI_API_KEY"),
  openaiModel: env("OPENAI_MODEL", "deepseek-ai/DeepSeek-V3"),
  openaiBaseUrl: env("OPENAI_BASE_URL", "https://api.siliconflow.cn/v1").replace(/\/$/, ""),
  telegramToken: env("TELEGRAM_BOT_TOKEN"),
  telegramDefaultChat: env("TELEGRAM_DEFAULT_CHAT_ID"),
  resendKey: env("RESEND_API_KEY"),
  emailFrom: env("EMAIL_FROM", "Pulse <onboarding@resend.dev>"),
  databaseUrl: env("DATABASE_URL", "mysql://root@127.0.0.1:3306/pulse"),
};

export function watchIntervalMs() {
  reloadEnv();
  return readWatchInterval(process.env);
}

export function telegramCreds() {
  reloadEnv();
  return {
    token: env("TELEGRAM_BOT_TOKEN"),
    defaultChat: env("TELEGRAM_DEFAULT_CHAT_ID"),
  };
}

export function emailCreds() {
  reloadEnv();
  return {
    key: env("RESEND_API_KEY"),
    from: env("EMAIL_FROM", "Pulse <onboarding@resend.dev>"),
  };
}
