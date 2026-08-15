import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import type { RequestHandler } from "express";
import { config } from "./config.js";

export function paymentTxFromRequest(req: { headers: Record<string, unknown> }): string | undefined {
  const raw =
    (req.headers["payment-response"] as string | undefined) ||
    (req.headers["x-payment-response"] as string | undefined);
  if (!raw) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as {
      transaction?: string;
      txHash?: string;
    };
    return decoded.transaction || decoded.txHash;
  } catch {
    return undefined;
  }
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
      "POST /scan": {
        accepts: {
          scheme: "exact",
          price: config.x402Price,
          network: config.network.caip2,
          payTo: config.payTo,
        },
        description: "Pulse market scan report",
        mimeType: "application/json",
      },
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
