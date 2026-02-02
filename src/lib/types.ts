export interface VaultState {
  id: string;
  suiBalance: bigint;
  agent: string;
  isActive: boolean;
  targetSuiPct: number;
  rebalanceThreshold: number;
  totalDeposits: bigint;
  rebalanceCount: number;
}

export interface AgentDecision {
  id: string;
  timestamp: number;
  action: AgentAction;
  reason: string;
  amountIn: bigint;
  amountOut: bigint;
  chain: string;
  txHash?: string;
  status: "pending" | "executing" | "completed" | "failed";
}

export type AgentAction =
  | "REBALANCE_SWAP"
  | "CROSS_CHAIN_BRIDGE"
  | "SAFETY_MOVE"
  | "DEPOSIT_BACK"
  | "MONITOR"
  | "NO_ACTION"
  | "YIELD_REBALANCE";

export interface PortfolioState {
  sui: {
    balance: bigint;
    valueUsd: number;
    percentage: number;
  };
  arc: {
    balance: bigint;
    valueUsd: number;
    percentage: number;
  };
  totalValueUsd: number;
}

export interface PriceData {
  asset: string;
  price: number;
  timestamp: number;
  source: string;
}

export interface AgentLog {
  timestamp: number;
  level: "info" | "warn" | "action" | "error";
  message: string;
  data?: Record<string, unknown>;
}

// ======== DARA Yield Types ========

export interface YieldOpportunity {
  id: string;
  protocol: string;
  chain: string;
  asset: string;
  apy: number;
  tvl: number;
  pool: string;
  /** Net APY after bridge fees + gas */
  netApy: number;
  /** Estimated bridge cost as APY drag */
  bridgeCostPct: number;
  /** Is this on the same chain as vault? */
  isNative: boolean;
  timestamp: number;
}

export interface YieldPosition {
  protocol: string;
  chain: string;
  asset: string;
  amount: number;
  amountUsd: number;
  apy: number;
  earnedUsd: number;
  depositedAt: number;
}

export interface YieldScanResult {
  opportunities: YieldOpportunity[];
  bestOpportunity: YieldOpportunity | null;
  currentAllocation: YieldPosition[];
  recommendation: string;
  timestamp: number;
}

export type RiskLevel = "conservative" | "moderate" | "aggressive";

export interface AgentConfig {
  riskLevel: RiskLevel;
  autoRebalance: boolean;
  rebalanceThresholdApy: number;
  maxAllocationPct: number;
  safetyThresholdPriceDrop: number;
}

export interface OfflineIntent {
  id: string;
  timestamp: number;
  functionName: string;
  args: Record<string, unknown>;
  status: "queued" | "processing" | "completed" | "failed";
  result?: string;
  error?: string;
}

// ======== Treasury Decision Types (Agentic Commerce) ========

export type TreasuryDecisionType =
  | "safety_deposit"
  | "yield_withdraw"
  | "rebalance"
  | "risk_assessment"
  | "auto_safety"
  | "auto_redeploy";

export interface TreasuryDecision {
  id: string;
  timestamp: number;
  type: TreasuryDecisionType;
  trigger: string;
  action: string;
  reasoning: string;
  riskScore: number;
  amount?: number;
  txHash?: string;
  chain: "arc" | "sui" | "cross-chain";
}

export interface TreasuryState {
  arcVaultBalance: number;
  suiYieldTotal: number;
  lastDecision: TreasuryDecision | null;
  lastDecisionTime: number;
  riskScore: number;
  allocationArcPct: number;
  allocationSuiPct: number;
}

export interface PriceHistoryEntry {
  price: number;
  timestamp: number;
}

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error";

export interface VoiceMessage {
  sender: "user" | "ai";
  text: string;
  isFinal: boolean;
  timestamp?: number;
  type?: "text" | "function_call" | "function_result";
  functionName?: string;
  functionArgs?: Record<string, unknown>;
}
