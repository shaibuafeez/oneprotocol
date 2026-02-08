import { NextResponse } from "next/server";
import { getTreasuryState, getTreasuryDecisions, getRiskLevel, isAgentRunning } from "@/agent/executor";
import { getArcBlockNumber, getVaultHealth } from "@/agent/arc-client";
import { getCurrentPositions } from "@/agent/yield-scanner";

export const dynamic = "force-dynamic";

export async function GET() {
  const [state, decisions, blockNumber, vaultHealth, positions] = await Promise.all([
    Promise.resolve(getTreasuryState()),
    Promise.resolve(getTreasuryDecisions()),
    getArcBlockNumber(),
    getVaultHealth().catch(() => null),
    Promise.resolve(getCurrentPositions()),
  ]);

  return NextResponse.json({
    state,
    decisions,
    blockNumber: blockNumber.toString(),
    vaultHealth,
    positions,
    riskLevel: getRiskLevel(),
    agentRunning: isAgentRunning(),
  });
}
