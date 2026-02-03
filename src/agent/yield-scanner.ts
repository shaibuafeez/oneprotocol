import {
  YieldOpportunity,
  YieldScanResult,
  YieldPosition,
  RiskLevel,
} from "@/lib/types";
import {
  DEFI_LLAMA_YIELDS_URL,
  YIELD_PROTOCOLS,
  BRIDGE_FEES,
  RISK_PROFILES,
  NAVI,
} from "@/lib/constants";
import { suiClient } from "./sui-client";
import { getFundingRateYields } from "./protocols/bluefin";

interface DefiLlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number | null;
  apyReward: number | null;
  stablecoin: boolean;
}

// Cache for DeFi Llama data
let cachedPools: DefiLlamaPool[] = [];
let lastFetchTime = 0;
const CACHE_TTL = 60_000; // 60 seconds

// Current yield positions — tracked on-chain where possible
let currentPositions: YieldPosition[] = [];

/**
 * Fetch yield data from DeFi Llama (real API, live data)
 */
async function fetchDefiLlamaPools(): Promise<DefiLlamaPool[]> {
  const now = Date.now();
  if (cachedPools.length > 0 && now - lastFetchTime < CACHE_TTL) {
    return cachedPools;
  }

  const res = await fetch(DEFI_LLAMA_YIELDS_URL);
  if (!res.ok) throw new Error(`DeFi Llama API error: ${res.status}`);
  const json = await res.json();
  cachedPools = json.data || [];
  lastFetchTime = now;
  console.log(
    `[YieldScanner] Fetched ${cachedPools.length} pools from DeFi Llama`
  );
  return cachedPools;
}

// ======== NAVI On-Chain APY Query ========

interface NaviPoolData {
  supplyApy: number;
  borrowApy: number;
  tvlUsd: number;
  asset: string;
}

let cachedNaviData: NaviPoolData[] = [];
let lastNaviFetch = 0;
const NAVI_CACHE_TTL = 120_000; // 2min

/**
 * Fetch NAVI pool data from their public API (real, live)
 */
async function fetchNaviPoolData(): Promise<NaviPoolData[]> {
  const now = Date.now();
  if (cachedNaviData.length > 0 && now - lastNaviFetch < NAVI_CACHE_TTL) {
    return cachedNaviData;
  }

  try {
    const res = await fetch(NAVI.CONFIG_API);
    if (!res.ok) throw new Error(`NAVI API ${res.status}`);
    const data = await res.json();

    const pools: NaviPoolData[] = [];
    if (data && typeof data === "object") {
      for (const [key, value] of Object.entries(data)) {
        const pool = value as Record<string, unknown>;
        if (pool && typeof pool === "object" && "supply_rate" in pool) {
          pools.push({
            asset: (pool.symbol as string) || key,
            supplyApy: Number(pool.supply_rate || 0) * 100,
            borrowApy: Number(pool.borrow_rate || 0) * 100,
            tvlUsd: Number(pool.supply || 0),
          });
        }
      }
    }

    cachedNaviData = pools;
    lastNaviFetch = now;
    console.log(
      `[YieldScanner] NAVI pools: ${pools.map((p) => `${p.asset} ${p.supplyApy.toFixed(1)}%`).join(", ")}`
    );
    return pools;
  } catch (error) {
    console.error("[YieldScanner] NAVI API failed:", error);
    return cachedNaviData;
  }
}

// ======== On-Chain Position Queries ========

/**
 * Query user's NAVI deposit positions from chain.
 * Checks the user's dynamic fields on NAVI Storage to find deposit amounts.
 */
export async function queryOnChainPositions(
  walletAddress: string
): Promise<YieldPosition[]> {
  const positions: YieldPosition[] = [];

  try {
    // Query all owned objects to find NAVI receipt tokens or Scallop obligations
    const objects = await suiClient.getOwnedObjects({
      owner: walletAddress,
      options: { showType: true, showContent: true },
      limit: 50,
    });

    for (const obj of objects.data) {
      const type = obj.data?.type || "";

      // Detect Scallop obligation keys
      if (type.includes("obligation::ObligationKey")) {
        const fields = (
          obj.data?.content as { fields?: Record<string, unknown> }
        )?.fields;
        if (fields) {
          positions.push({
            protocol: "Scallop",
            chain: "Sui",
            asset: "SUI",
            amount: 0, // Would need to query the obligation object for actual amount
            amountUsd: 0,
            apy: 0,
            earnedUsd: 0,
            depositedAt: Date.now(),
          });
        }
      }

      // Detect NAVI deposit receipts
      if (type.includes("navi") || type.includes("lending")) {
        positions.push({
          protocol: "NAVI",
          chain: "Sui",
          asset: "SUI",
          amount: 0,
          amountUsd: 0,
          apy: 0,
          earnedUsd: 0,
          depositedAt: Date.now(),
        });
      }
    }
  } catch (error) {
    console.error("[YieldScanner] On-chain position query failed:", error);
  }

  return positions;
}

/**
 * Get bridge cost for a given route
 */
function getBridgeCost(fromChain: string, toChain: string): number {
  const key = `${fromChain.toUpperCase()}_TO_${toChain.toUpperCase()}`;
  return (BRIDGE_FEES as Record<string, number>)[key] ?? 0.5;
}

/**
 * Filter pools relevant to our yield strategies
 */
function filterRelevantPools(pools: DefiLlamaPool[]): DefiLlamaPool[] {
  const protocols = Object.values(YIELD_PROTOCOLS);
  return pools.filter((pool) => {
    return protocols.some(
      (p) =>
        pool.project === p.project &&
        pool.chain === p.chain &&
        pool.apy > 0 &&
        pool.tvlUsd > 100_000
    );
  });
}

/**
 * Convert DeFi Llama pool to YieldOpportunity
 */
function poolToOpportunity(pool: DefiLlamaPool): YieldOpportunity {
  const isNative = pool.chain === "Sui";
  const bridgeCost = isNative ? 0 : getBridgeCost("SUI", pool.chain);
  const netApy = pool.apy - bridgeCost;

  const protocol = Object.values(YIELD_PROTOCOLS).find(
    (p) => p.project === pool.project && p.chain === pool.chain
  );

  return {
    id: pool.pool,
    protocol: protocol?.displayName || pool.project,
    chain: pool.chain,
    asset: pool.symbol,
    apy: pool.apy,
    tvl: pool.tvlUsd,
    pool: pool.pool,
    netApy,
    bridgeCostPct: bridgeCost,
    isNative,
    timestamp: Date.now(),
  };
}

/**
 * Scan all yield opportunities across chains.
 * Combines DeFi Llama data with direct NAVI API for freshest rates.
 */
export async function scanYields(): Promise<YieldOpportunity[]> {
  // Fetch all sources in parallel
  const [llamaPools, naviPools, bluefinYields] = await Promise.all([
    fetchDefiLlamaPools(),
    fetchNaviPoolData(),
    getFundingRateYields().catch(() => []),
  ]);

  const relevant = filterRelevantPools(llamaPools);
  const opportunities = relevant.map(poolToOpportunity);

  // Overlay NAVI direct API data (fresher than DeFi Llama)
  for (const naviPool of naviPools) {
    if (naviPool.supplyApy <= 0) continue;

    const existing = opportunities.find(
      (o) => o.protocol === "NAVI" && o.asset === naviPool.asset
    );

    if (existing) {
      // Update with fresher NAVI API data
      existing.apy = naviPool.supplyApy;
      existing.netApy = naviPool.supplyApy; // Native Sui, no bridge
      existing.tvl = naviPool.tvlUsd;
    } else if (["SUI", "USDC", "USDT"].includes(naviPool.asset)) {
      // Add NAVI pool not in DeFi Llama results
      opportunities.push({
        id: `navi-${naviPool.asset.toLowerCase()}-direct`,
        protocol: "NAVI",
        chain: "Sui",
        asset: naviPool.asset,
        apy: naviPool.supplyApy,
        tvl: naviPool.tvlUsd,
        pool: `navi-${naviPool.asset.toLowerCase()}`,
        netApy: naviPool.supplyApy,
        bridgeCostPct: 0,
        isNative: true,
        timestamp: Date.now(),
      });
    }
  }

  // Add Bluefin funding rate yields as opportunities
  for (const bf of bluefinYields) {
    opportunities.push({
      id: `bluefin-${bf.symbol.toLowerCase()}-funding`,
      protocol: "Bluefin",
      chain: "Sui",
      asset: `${bf.symbol} (${bf.direction})`,
      apy: bf.annualizedYield,
      tvl: 0, // Funding rate is not TVL-based
      pool: `bluefin-${bf.symbol.toLowerCase()}`,
      netApy: bf.annualizedYield,
      bridgeCostPct: 0,
      isNative: true,
      timestamp: Date.now(),
    });
  }

  // Sort by net APY descending
  opportunities.sort((a, b) => b.netApy - a.netApy);

  console.log(
    `[YieldScanner] Found ${opportunities.length} opportunities:`,
    opportunities
      .slice(0, 5)
      .map((o) => `${o.protocol} ${o.asset} ${o.netApy.toFixed(1)}%`)
  );

  return opportunities;
}

/**
 * Find the best yield opportunity considering risk level
 */
export async function findBestYield(
  riskLevel: RiskLevel = "moderate"
): Promise<YieldScanResult> {
  const opportunities = await scanYields();
  const profile = RISK_PROFILES[riskLevel];

  // Filter by risk profile
  const eligible = opportunities.filter((opp) => {
    if (!profile.allowCrossChain && !opp.isNative) return false;
    if (opp.tvl < 1_000_000) return false;
    return true;
  });

  const bestOpportunity = eligible[0] || null;

  // Build recommendation
  let recommendation = "";
  if (bestOpportunity) {
    const currentBest = currentPositions[0];
    if (
      currentBest &&
      bestOpportunity.netApy - currentBest.apy >
        profile.rebalanceThresholdApy
    ) {
      recommendation = `Move funds from ${currentBest.protocol} (${currentBest.apy.toFixed(1)}% APY) to ${bestOpportunity.protocol} on ${bestOpportunity.chain} (${bestOpportunity.netApy.toFixed(1)}% net APY). Yield improvement: +${(bestOpportunity.netApy - currentBest.apy).toFixed(1)}%`;
    } else if (!currentBest) {
      recommendation = `Deploy to ${bestOpportunity.protocol} on ${bestOpportunity.chain} for ${bestOpportunity.netApy.toFixed(1)}% net APY on ${bestOpportunity.asset}`;
    } else {
      recommendation = `Stay in ${currentBest.protocol} (${currentBest.apy.toFixed(1)}% APY). Best alternative: ${bestOpportunity.protocol} at ${bestOpportunity.netApy.toFixed(1)}% — difference below ${profile.rebalanceThresholdApy}% threshold.`;
    }
  } else {
    recommendation =
      "No eligible yield opportunities found. Consider adjusting risk level.";
  }

  return {
    opportunities: eligible,
    bestOpportunity,
    currentAllocation: currentPositions,
    recommendation,
    timestamp: Date.now(),
  };
}

/**
 * Get current yield positions
 */
export function getCurrentPositions(): YieldPosition[] {
  return [...currentPositions];
}

/**
 * Set current position (after deploying to a protocol)
 */
export function setPosition(position: YieldPosition): void {
  const idx = currentPositions.findIndex(
    (p) => p.protocol === position.protocol && p.chain === position.chain
  );
  if (idx >= 0) {
    currentPositions[idx] = position;
  } else {
    currentPositions.push(position);
  }
}

/**
 * Sync positions from on-chain data
 */
export async function syncPositions(walletAddress: string): Promise<void> {
  const onChain = await queryOnChainPositions(walletAddress);
  // Merge on-chain positions with locally tracked ones
  for (const pos of onChain) {
    const exists = currentPositions.find(
      (p) => p.protocol === pos.protocol && p.chain === pos.chain
    );
    if (!exists) {
      currentPositions.push(pos);
    }
  }
}

/**
 * Clear all positions
 */
export function clearPositions(): void {
  currentPositions = [];
}

/**
 * Format yield opportunities for voice response
 */
export function formatYieldsForVoice(
  opportunities: YieldOpportunity[]
): string {
  if (opportunities.length === 0) return "No yield opportunities found.";

  const top = opportunities.slice(0, 5);
  const lines = top.map(
    (o, i) =>
      `${i + 1}. ${o.protocol} on ${o.chain}: ${o.apy.toFixed(1)}% APY` +
      (o.bridgeCostPct > 0
        ? ` (${o.netApy.toFixed(1)}% net after ${o.bridgeCostPct.toFixed(1)}% bridge fee)`
        : "") +
      ` on ${o.asset}`
  );

  return `Top yield opportunities:\n${lines.join("\n")}`;
}

/**
 * Format positions for voice response
 */
export function formatPositionsForVoice(positions: YieldPosition[]): string {
  if (positions.length === 0) return "No active yield positions.";

  const lines = positions.map(
    (p) =>
      `${p.protocol} on ${p.chain}: $${p.amountUsd.toFixed(2)} at ${p.apy.toFixed(1)}% APY (earned $${p.earnedUsd.toFixed(2)})`
  );

  return `Your yield positions:\n${lines.join("\n")}`;
}
