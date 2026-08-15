import { defineChain } from "viem";
import { NETWORKS, resolveNetwork, type MonadNetworkName } from "@pulse/shared";

export const networkName = (process.env.NEXT_PUBLIC_MONAD_NETWORK || "testnet") as MonadNetworkName;
export const network = resolveNetwork(networkName);

export const monadChain = defineChain({
  id: network.chainId,
  name: network.displayName,
  nativeCurrency: network.nativeCurrency,
  rpcUrls: {
    default: { http: [network.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: network.explorer },
  },
});

export const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
export const publicAgentId = process.env.NEXT_PUBLIC_AGENT_ID || "";
export { NETWORKS };
