export type MonadNetworkName = "testnet" | "mainnet";

export type MonadNetwork = {
  name: MonadNetworkName;
  displayName: string;
  chainId: number;
  caip2: `eip155:${number}`;
  rpcUrl: string;
  explorer: string;
  explorerTx: (hash: string) => string;
  explorerAddress: (address: string) => string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  usdc: `0x${string}`;
  usdcName: string;
  usdcVersion: string;
  identityRegistry: `0x${string}`;
  reputationRegistry: `0x${string}`;
  facilitatorUrl: string;
  scan8004: (agentId?: string) => string;
};

export const FACILITATOR_URL = "https://x402-facilitator.molandak.org";

export const NETWORKS: Record<MonadNetworkName, MonadNetwork> = {
  testnet: {
    name: "testnet",
    displayName: "Monad Testnet",
    chainId: 10143,
    caip2: "eip155:10143",
    rpcUrl: "https://testnet-rpc.monad.xyz",
    explorer: "https://testnet.monadvision.com",
    explorerTx: (hash) => `https://testnet.monadvision.com/tx/${hash}`,
    explorerAddress: (address) => `https://testnet.monadvision.com/address/${address}`,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
    usdcName: "USDC",
    usdcVersion: "2",
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    facilitatorUrl: FACILITATOR_URL,
    scan8004: (agentId) =>
      agentId
        ? `https://8004scan.io/agents/monad-testnet/${agentId}`
        : "https://8004scan.io/agents?chain=monad-testnet",
  },
  mainnet: {
    name: "mainnet",
    displayName: "Monad",
    chainId: 143,
    caip2: "eip155:143",
    rpcUrl: "https://rpc.monad.xyz",
    explorer: "https://monadvision.com",
    explorerTx: (hash) => `https://monadvision.com/tx/${hash}`,
    explorerAddress: (address) => `https://monadvision.com/address/${address}`,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    usdcName: "USD Coin",
    usdcVersion: "2",
    identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    facilitatorUrl: FACILITATOR_URL,
    scan8004: (agentId) =>
      agentId
        ? `https://8004scan.io/agents/monad/${agentId}`
        : "https://8004scan.io/agents?chain=monad",
  },
};

export function resolveNetwork(name?: string): MonadNetwork {
  const key = (name ?? "testnet").toLowerCase();
  if (key === "mainnet" || key === "143") return NETWORKS.mainnet;
  return NETWORKS.testnet;
}

export const X402_PRICE_USD = "0.01";
export const X402_PRICE_LABEL = "$0.01";
