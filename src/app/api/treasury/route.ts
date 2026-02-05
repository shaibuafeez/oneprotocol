import { NextResponse } from "next/server";
import { getTreasuryState, getTreasuryDecisions } from "@/agent/executor";
import { getArcBlockNumber } from "@/agent/arc-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const [state, decisions, blockNumber] = await Promise.all([
    Promise.resolve(getTreasuryState()),
    Promise.resolve(getTreasuryDecisions()),
    getArcBlockNumber(),
  ]);

  return NextResponse.json({
    state,
    decisions,
    blockNumber: blockNumber.toString(),
  });
}
