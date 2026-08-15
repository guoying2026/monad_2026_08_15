"use client";

import { http, createConfig, createStorage } from "wagmi";
import { injected } from "@wagmi/connectors";
import { monadChain } from "./chain";

export const wagmiConfig = createConfig({
  chains: [monadChain],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [monadChain.id]: http(monadChain.rpcUrls.default.http[0]),
  },
  storage: createStorage({ storage: typeof window === "undefined" ? undefined : window.localStorage }),
  ssr: true,
});
