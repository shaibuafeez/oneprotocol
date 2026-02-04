import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  type Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ARC_RPC_URL,
  ARC_CHAIN_ID,
  ARC_EXPLORER,
  ARC_VAULT_ADDRESS,
} from "@/lib/constants";

// Define Arc chain for viem
export const arcChain = {
  id: ARC_CHAIN_ID,
  name: "Arc",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 6,
  },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: ARC_EXPLORER },
  },
} as const;

// Public client for reading
export const arcPublicClient = createPublicClient({
  chain: arcChain,
  transport: http(ARC_RPC_URL),
});

// ======== DaraVault ABI (minimal) ========
const VAULT_ABI: Abi = [
  {
    type: "function",
    name: "deposit",
    inputs: [{ name: "reason", type: "string" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "logDecision",
    inputs: [
      { name: "action", type: "string" },
      { name: "riskScore", type: "uint256" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "treasuryHealth",
    inputs: [],
    outputs: [
      { name: "balance", type: "uint256" },
      { name: "deposited", type: "uint256" },
      { name: "withdrawn", type: "uint256" },
      { name: "actions", type: "uint256" },
      { name: "lastAction", type: "uint256" },
      { name: "decisionCount", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRecentDecisions",
    inputs: [{ name: "count", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "timestamp", type: "uint256" },
          { name: "action", type: "string" },
          { name: "riskScore", type: "uint256" },
          { name: "reason", type: "string" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "reason", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "reason", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TreasuryDecision",
    inputs: [
      { name: "action", type: "string", indexed: false },
      { name: "riskScore", type: "uint256", indexed: false },
      { name: "reason", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
];

// ======== Wallet Client (agent signer) ========

function getAgentWalletClient() {
  const pk = process.env.ARC_AGENT_PRIVATE_KEY;
  if (!pk) return null;
  const account = privateKeyToAccount(pk as `0x${string}`);
  return createWalletClient({
    account,
    chain: arcChain,
    transport: http(ARC_RPC_URL),
  });
}

/**
 * Get USDC balance on Arc (native gas token = USDC)
 */
export async function getArcBalance(address: `0x${string}`): Promise<bigint> {
  try {
    const balance = await arcPublicClient.getBalance({ address });
    return balance;
  } catch (e) {
    console.error("Failed to get Arc balance:", e);
    return 0n;
  }
}

/**
 * Format USDC balance (6 decimals)
 */
export function formatUsdc(amount: bigint): string {
  return formatUnits(amount, 6);
}

/**
 * Get Arc block number (health check)
 */
export async function getArcBlockNumber(): Promise<bigint> {
  try {
    return await arcPublicClient.getBlockNumber();
  } catch (e) {
    console.error("Failed to get Arc block number:", e);
    return 0n;
  }
}

// ======== Vault Contract Interactions ========

/**
 * Deposit USDC into the DaraVault on Arc
 */
export async function depositToVault(
  amountUsdc: number,
  reason: string
): Promise<{ txHash: string; success: boolean }> {
  const walletClient = getAgentWalletClient();
  if (!walletClient) {
    console.log("[Arc Vault] No agent wallet configured — simulating deposit");
    return {
      txHash: `sim_deposit_${Date.now().toString(16)}`,
      success: true,
    };
  }

  try {
    const value = parseUnits(amountUsdc.toString(), 18);
    const hash = await walletClient.writeContract({
      address: ARC_VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "deposit",
      args: [reason],
      value,
    });
    console.log(`[Arc Vault] Deposit tx: ${hash}`);
    return { txHash: hash, success: true };
  } catch (e) {
    console.error("[Arc Vault] Deposit failed:", e);
    return { txHash: "", success: false };
  }
}

/**
 * Withdraw USDC from the DaraVault on Arc
 */
export async function withdrawFromVault(
  amountUsdc: number,
  reason: string
): Promise<{ txHash: string; success: boolean }> {
  const walletClient = getAgentWalletClient();
  if (!walletClient) {
    console.log("[Arc Vault] No agent wallet configured — simulating withdraw");
    return {
      txHash: `sim_withdraw_${Date.now().toString(16)}`,
      success: true,
    };
  }

  try {
    const amount = parseUnits(amountUsdc.toString(), 18);
    const hash = await walletClient.writeContract({
      address: ARC_VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "withdraw",
      args: [amount, reason],
    });
    console.log(`[Arc Vault] Withdraw tx: ${hash}`);
    return { txHash: hash, success: true };
  } catch (e) {
    console.error("[Arc Vault] Withdraw failed:", e);
    return { txHash: "", success: false };
  }
}

/**
 * Get vault balance and health from the DaraVault contract
 */
export async function getVaultHealth(): Promise<{
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  actionCount: number;
  lastActionTimestamp: number;
  decisionCount: number;
}> {
  try {
    const result = (await arcPublicClient.readContract({
      address: ARC_VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "treasuryHealth",
    })) as [bigint, bigint, bigint, bigint, bigint, bigint];

    return {
      balance: Number(formatUnits(result[0], 18)),
      totalDeposited: Number(formatUnits(result[1], 18)),
      totalWithdrawn: Number(formatUnits(result[2], 18)),
      actionCount: Number(result[3]),
      lastActionTimestamp: Number(result[4]),
      decisionCount: Number(result[5]),
    };
  } catch (e) {
    console.error("[Arc Vault] Health check failed:", e);
    return {
      balance: 0,
      totalDeposited: 0,
      totalWithdrawn: 0,
      actionCount: 0,
      lastActionTimestamp: 0,
      decisionCount: 0,
    };
  }
}

/**
 * Log an autonomous decision on-chain
 */
export async function logVaultDecision(
  action: string,
  riskScore: number,
  reason: string
): Promise<{ txHash: string; success: boolean }> {
  const walletClient = getAgentWalletClient();
  if (!walletClient) {
    console.log(`[Arc Vault] Decision logged (sim): ${action} — ${reason}`);
    return {
      txHash: `sim_decision_${Date.now().toString(16)}`,
      success: true,
    };
  }

  try {
    const hash = await walletClient.writeContract({
      address: ARC_VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "logDecision",
      args: [action, BigInt(Math.round(riskScore)), reason],
    });
    console.log(`[Arc Vault] Decision logged tx: ${hash}`);
    return { txHash: hash, success: true };
  } catch (e) {
    console.error("[Arc Vault] Decision log failed:", e);
    return { txHash: "", success: false };
  }
}

/**
 * Build ArcScan transaction link
 */
export function arcScanTxLink(txHash: string): string {
  return `${ARC_EXPLORER}/tx/${txHash}`;
}
