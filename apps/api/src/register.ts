import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { createWalletClient, createPublicClient, formatEther, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { identityAbi } from "@pulse/shared";
import { toDataUri } from "@pulse/agent-card";
import { config } from "./config.js";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv({ path: resolve(process.cwd(), ".env") });

function compactCard(payTo: string) {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" as const,
    name: "Pulse",
    description: "Monad x402 prediction-market watch agent",
    services: [
      { name: "web", endpoint: config.publicWebUrl },
      { name: "HTTP", endpoint: `${config.publicApiUrl.replace(/\/$/, "")}/scan` },
      { name: "wallet", endpoint: payTo },
    ],
    x402Support: true,
    active: true,
    supportedTrust: ["reputation"],
  };
}

async function main() {
  if (!config.privateKey) {
    throw new Error("Set PRIVATE_KEY in .env to register the agent");
  }

  const account = privateKeyToAccount(config.privateKey);
  if (config.payTo && config.payTo.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `PAY_TO_ADDRESS ${config.payTo} does not match PRIVATE_KEY account ${account.address}`,
    );
  }

  const chain = {
    id: config.network.chainId,
    name: config.network.displayName,
    nativeCurrency: config.network.nativeCurrency,
    rpcUrls: { default: { http: [config.rpcUrl] } },
  } as const;

  const wallet = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

  const payTo = (config.payTo || account.address) as `0x${string}`;
  const useHttps = config.agentUri.startsWith("https://");
  const uri = useHttps ? config.agentUri : toDataUri(compactCard(payTo));

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Network     ", config.network.displayName, config.network.chainId);
  console.log("Registry    ", config.identityRegistry);
  console.log("Owner       ", account.address);
  console.log("Balance     ", formatEther(balance), "MON");
  console.log("agentURI    ", uri.slice(0, 120) + (uri.length > 120 ? "…" : ""));

  if (balance === 0n) {
    throw new Error("This account has 0 MON on Monad Testnet. Switch MetaMask to testnet and claim from faucet.monad.xyz");
  }

  const hash = await wallet.writeContract({
    address: config.identityRegistry,
    abi: identityAbi,
    functionName: "register",
    args: [uri],
    gas: 800_000n,
  });
  console.log("tx          ", hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const registered = parseEventLogs({
    abi: identityAbi,
    logs: receipt.logs,
    eventName: "Registered",
  });
  const agentId = registered[0]?.args.agentId.toString();

  console.log("status      ", receipt.status);
  console.log("agentId     ", agentId ?? "(check explorer / 8004scan)");
  console.log("8004scan    ", config.network.scan8004(agentId));
  console.log("explorer    ", config.network.explorerTx(hash));
  console.log("\nPut AGENT_ID and NEXT_PUBLIC_AGENT_ID in .env, then restart.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
