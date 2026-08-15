import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import type { RequestHandler } from "express";
import { config } from "./config.js";

function decodePaymentPayload(raw: string): string | undefined {
  const text = raw.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(text)) return text;
  const tryJson = (value: string) => {
    try {
      const decoded = JSON.parse(value) as { transaction?: string; txHash?: string; hash?: string };
      const hash = decoded.transaction || decoded.txHash || decoded.hash;
      return hash && /^0x[0-9a-fA-F]{64}$/.test(hash) ? hash : undefined;
    } catch {
      return undefined;
    }
  };
  const direct = tryJson(text);
  if (direct) return direct;
  try {
    return tryJson(Buffer.from(text, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

export function paymentTxFromRequest(req: { headers: Record<string, unknown> }): string | undefined {
  const keys = [
    "payment-response",
    "x-payment-response",
    "payment-signature",
    "x-payment",
  ];
  for (const key of keys) {
    const raw = req.headers[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string" || !value.trim()) continue;
    const hash = decodePaymentPayload(value);
    if (hash) return hash;
  }
  return undefined;
}

export function createX402Middleware(): RequestHandler {
  if (config.skipX402) {
    console.log("[x402] SKIP_X402=true — paid routes are open");
    return (_req, _res, next) => next();
  }

  if (!config.payTo || !config.payTo.startsWith("0x")) {
    throw new Error("PAY_TO_ADDRESS is required when SKIP_X402=false");
  }

  const facilitator = new HTTPFacilitatorClient({ url: config.facilitatorUrl });
  const scheme = new ExactEvmScheme();

  // Testnet USDC is not in the default asset table; mainnet eip155:143 is built-in since 2.22.0
  scheme.registerMoneyParser(async (amount: number, networkId: string) => {
    if (networkId === config.network.caip2) {
      return {
        amount: Math.floor(amount * 1_000_000).toString(),
        asset: config.network.usdc,
        extra: {
          name: config.network.usdcName,
          version: config.network.usdcVersion,
        },
      };
    }
    return null;
  });

  const server = new x402ResourceServer(facilitator).register(config.network.caip2, scheme);

  return paymentMiddleware(
    {
      "POST /subscribe": {
        accepts: {
          scheme: "exact",
          price: config.x402Price,
          network: config.network.caip2,
          payTo: config.payTo,
        },
        description: "Watch one Polymarket event — $0.01 USDC",
        mimeType: "application/json",
      },
    },
    server,
  );
}
