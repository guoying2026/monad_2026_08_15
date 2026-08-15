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
