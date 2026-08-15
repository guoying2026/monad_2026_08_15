"use client";

import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { x402Client } from "@x402/core/client";
import type { WalletClient } from "viem";
import { network } from "./chain";

export async function paidFetch(
  walletClient: WalletClient,
  address: `0x${string}`,
  input: string,
  init?: RequestInit,
) {
  const evmSigner = {
    address,
    signTypedData: async (message: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }) => {
      return walletClient.signTypedData({
        account: address,
        domain: message.domain as Parameters<typeof walletClient.signTypedData>[0]["domain"],
        types: message.types as Parameters<typeof walletClient.signTypedData>[0]["types"],
        primaryType: message.primaryType,
        message: message.message,
      });
    },
  };

  const client = new x402Client().register(network.caip2, new ExactEvmScheme(evmSigner));
  const paymentFetch = wrapFetchWithPayment(fetch, client);
  return paymentFetch(input, init);
}

export function paymentTxFromResponse(res: Response): string | undefined {
  const raw =
    res.headers.get("payment-response") ||
    res.headers.get("PAYMENT-RESPONSE") ||
    res.headers.get("x-payment-response");
  if (!raw) return undefined;
  const tryJson = (value: string) => {
    try {
      const decoded = JSON.parse(value) as { transaction?: string; txHash?: string; hash?: string };
      const hash = decoded.transaction || decoded.txHash || decoded.hash;
      return hash && /^0x[0-9a-fA-F]{64}$/.test(hash) ? hash : undefined;
    } catch {
      return undefined;
    }
  };
  if (/^0x[0-9a-fA-F]{64}$/.test(raw.trim())) return raw.trim();
  const direct = tryJson(raw);
  if (direct) return direct;
  try {
    return tryJson(atob(raw));
  } catch {
    return undefined;
  }
}
