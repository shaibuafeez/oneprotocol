import {
  AgentDecision,
  AgentAction,
  PortfolioState,
  PriceData,
  YieldOpportunity,
} from "@/lib/types";
import { AGENT_CONFIG } from "@/lib/constants";

let decisionCounter = 0;

function makeDecision(
  action: AgentAction,
  reason: string,
  amountIn: bigint = 0n,
  chain: string = "sui"
): AgentDecision {
  decisionCounter++;
  return {
    id: `decision-${decisionCounter}-${Date.now()}`,
    timestamp: Date.now(),
    action,
    reason,
    amountIn,
    amountOut: 0n,
    chain,
    status: "pending",
  };
}

/**
 * Core strategy engine — evaluates portfolio state, prices, and yield data
 */
export function evaluateStrategy(
  portfolio: PortfolioState,
  prices: PriceData[],
  previousDecisions: AgentDecision[],
  yieldOpportunities?: YieldOpportunity[]
): AgentDecision {
  const suiPrice = prices.find((p) => p.asset === "SUI");

  // Safety check: if SUI price crashed, move to stables
  if (suiPrice && suiPrice.price < 0.5) {
    const safetyAmount = portfolio.sui.balance / 2n;
    return makeDecision(
      "SAFETY_MOVE",
      `SUI price at $${suiPrice.price.toFixed(4)} — moving 50% to USDC on Arc for safety`,
      safetyAmount,
      "sui→arc"
    );
  }

  // Yield-based rebalancing (DARA core feature)
  if (yieldOpportunities && yieldOpportunities.length > 0) {
    const bestYield = yieldOpportunities[0];
    const currentYield = previousDecisions
      .filter((d) => d.action === "YIELD_REBALANCE")
      .slice(-1)[0];

    // Check if yield improvement is significant
    if (bestYield.netApy > AGENT_CONFIG.YIELD_REBALANCE_THRESHOLD) {
      // Only rebalance if this is a new/better opportunity
      if (
        !currentYield ||
        Date.now() - currentYield.timestamp > AGENT_CONFIG.LOOP_INTERVAL * 5
      ) {
        return makeDecision(
          "YIELD_REBALANCE",
          `Best yield: ${bestYield.protocol} on ${bestYield.chain} at ${bestYield.netApy.toFixed(1)}% net APY on ${bestYield.asset}. ${bestYield.isNative ? "Native Sui — no bridge needed." : `Cross-chain via LI.FI (${bestYield.bridgeCostPct.toFixed(1)}% bridge fee).`}`,
          0n,
          bestYield.isNative ? "sui" : `sui→${bestYield.chain.toLowerCase()}`
        );
      }
    }
  }

  // Portfolio drift check
  const currentSuiPct = portfolio.sui.percentage;
  const targetSuiPct = AGENT_CONFIG.TARGET_SUI_PCT;
  const drift = Math.abs(currentSuiPct - targetSuiPct);

  if (drift > AGENT_CONFIG.REBALANCE_THRESHOLD) {
    if (currentSuiPct > targetSuiPct) {
      const excessPct = currentSuiPct - targetSuiPct;
      const excessValue = (portfolio.sui.valueUsd * excessPct) / 100;
      const suiPriceUsd = suiPrice?.price || 1;
      const amountSui = BigInt(
        Math.floor((excessValue / suiPriceUsd) * 1_000_000_000)
      );

      if (amountSui > BigInt(AGENT_CONFIG.MIN_REBALANCE_AMOUNT)) {
        return makeDecision(
          "CROSS_CHAIN_BRIDGE",
          `Portfolio drifted ${drift.toFixed(1)}% — SUI overweight at ${currentSuiPct.toFixed(1)}%. Bridging ${(Number(amountSui) / 1e9).toFixed(2)} SUI to Arc via LI.FI`,
          amountSui,
          "sui→arc"
        );
      }
    } else {
      const deficitPct = targetSuiPct - currentSuiPct;
      const deficitValue = (portfolio.totalValueUsd * deficitPct) / 100;

      return makeDecision(
        "CROSS_CHAIN_BRIDGE",
        `Portfolio drifted ${drift.toFixed(1)}% — SUI underweight at ${currentSuiPct.toFixed(1)}%. Bridging $${deficitValue.toFixed(2)} from Arc to Sui via LI.FI`,
        BigInt(Math.floor(deficitValue * 1e6)),
        "arc→sui"
      );
    }
  }

  // No action needed
  return makeDecision(
    "NO_ACTION",
    `Portfolio balanced — SUI at ${currentSuiPct.toFixed(1)}% (target: ${targetSuiPct}%). ${yieldOpportunities?.length ? `Best yield: ${yieldOpportunities[0].protocol} at ${yieldOpportunities[0].netApy.toFixed(1)}%` : "Yield data pending."}`,
    0n,
    "monitor"
  );
}

// ======== Real Price Feeds ========

// CoinGecko free API — no API key needed
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=sui,ethereum,bitcoin&vs_currencies=usd";

let cachedPrices: PriceData[] = [];
let lastPriceFetch = 0;
const PRICE_CACHE_TTL = 30_000; // 30s

/**
 * Fetch real prices from CoinGecko (free, no key).
 * Falls back to cached data if rate-limited.
 */
export async function fetchPrices(): Promise<PriceData[]> {
  const now = Date.now();
  if (cachedPrices.length > 0 && now - lastPriceFetch < PRICE_CACHE_TTL) {
    return cachedPrices;
  }

  try {
    const res = await fetch(COINGECKO_URL, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();

    cachedPrices = [
      {
        asset: "SUI",
        price: data.sui?.usd ?? 0,
        timestamp: now,
        source: "coingecko",
      },
      {
        asset: "ETH",
        price: data.ethereum?.usd ?? 0,
        timestamp: now,
        source: "coingecko",
      },
      {
        asset: "BTC",
        price: data.bitcoin?.usd ?? 0,
        timestamp: now,
        source: "coingecko",
      },
    ];
    lastPriceFetch = now;
    console.log(
      `[Prices] SUI=$${cachedPrices[0].price} ETH=$${cachedPrices[1].price} BTC=$${cachedPrices[2].price}`
    );
    return cachedPrices;
  } catch (error) {
    console.error("[Prices] CoinGecko fetch failed:", error);
    // Return cached or zeroed
    if (cachedPrices.length > 0) return cachedPrices;
    return [
      { asset: "SUI", price: 0, timestamp: now, source: "unavailable" },
      { asset: "ETH", price: 0, timestamp: now, source: "unavailable" },
      { asset: "BTC", price: 0, timestamp: now, source: "unavailable" },
    ];
  }
}

/**
 * Build portfolio state from on-chain data
 */
export function buildPortfolioState(
  suiBalanceMist: bigint,
  arcBalanceUsdc: bigint,
  suiPriceUsd: number
): PortfolioState {
  const suiValueUsd = (Number(suiBalanceMist) / 1e9) * suiPriceUsd;
  const arcValueUsd = Number(arcBalanceUsdc) / 1e6;
  const totalValueUsd = suiValueUsd + arcValueUsd;

  return {
    sui: {
      balance: suiBalanceMist,
      valueUsd: suiValueUsd,
      percentage:
        totalValueUsd > 0 ? (suiValueUsd / totalValueUsd) * 100 : 50,
    },
    arc: {
      balance: arcBalanceUsdc,
      valueUsd: arcValueUsd,
      percentage:
        totalValueUsd > 0 ? (arcValueUsd / totalValueUsd) * 100 : 50,
    },
    totalValueUsd,
  };
}
