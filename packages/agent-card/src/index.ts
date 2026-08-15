import type { MonadNetwork } from "@pulse/shared";

export type AgentService = {
  name: string;
  endpoint: string;
  version?: string;
};

export type AgentCard = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  name: string;
  description: string;
  image: string;
  services: AgentService[];
  x402Support: boolean;
  active: boolean;
  registrations: { agentId: number; agentRegistry: string }[];
  supportedTrust: string[];
};

export const AGENT_NAME = "Pulse";

export function buildAgentCard(opts: {
  apiUrl: string;
  webUrl: string;
  payTo: string;
  network: MonadNetwork;
  agentId?: number;
}): AgentCard {
  const api = opts.apiUrl.replace(/\/$/, "");
  const web = opts.webUrl.replace(/\/$/, "");

  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: AGENT_NAME,
    description:
      `Monad prediction-market watch agent. Pays and settles in USDC via x402. ` +
      `Scan or watch any Polymarket event for $0.01 USDC. One compute per event, then fan-out. ` +
      `Receiver: ${opts.payTo} on ${opts.network.displayName}.`,
    image: `${web}/pulse.svg`,
    services: [
      { name: "web", endpoint: web },
      { name: "HTTP", endpoint: `${api}/scan`, version: "1.0.0" },
      { name: "A2A", endpoint: `${api}/.well-known/agent-card.json`, version: "0.3.0" },
      { name: "wallet", endpoint: opts.payTo },
    ],
    x402Support: true,
    active: true,
    registrations:
      opts.agentId != null
        ? [
            {
              agentId: opts.agentId,
              agentRegistry: `eip155:${opts.network.chainId}:${opts.network.identityRegistry}`,
            },
          ]
        : [],
    supportedTrust: ["reputation"],
  };
}

export function toDataUri(card: object): string {
  const json = JSON.stringify(card);
  return `data:application/json;base64,${Buffer.from(json).toString("base64")}`;
}
