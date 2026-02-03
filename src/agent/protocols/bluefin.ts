/**
 * Bluefin Perpetual DEX — REST API client for DARA
 *
 * Bluefin is a perpetual DEX on Sui with SUI-PERP, ETH-PERP, BTC-PERP markets.
 * This module uses the public REST API for market data, funding rates, and orderbook.
 *
 * Mainnet API: https://dapi.api.sui-prod.bluefin.io
 * Testnet API: https://dapi.api.sui-staging.bluefin.io
 */

import { SUI_NETWORK } from "@/lib/constants";

// ======== API Config ========

const BLUEFIN_API =
  (SUI_NETWORK as string) === "mainnet"
    ? "https://dapi.api.sui-prod.bluefin.io"
    : "https://dapi.api.sui-staging.bluefin.io";

export const BLUEFIN_MARKETS = [
  "SUI-PERP",
  "ETH-PERP",
  "BTC-PERP",
] as const;

export type BluefinMarket = (typeof BLUEFIN_MARKETS)[number];

// ======== Types ========

export interface BluefinMarketData {
  symbol: string;
  lastPrice: number;
  indexPrice: number;
  markPrice: number;
  bestBid: number;
  bestAsk: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
  nextFundingTime: number;
  priceChange24h: number;
  priceChangePercent24h: number;
}

export interface BluefinFundingRate {
  symbol: string;
  fundingRate: number;
  annualizedRate: number;
  nextFundingTime: number;
  timestamp: number;
}

export interface BluefinOrderbookEntry {
  price: number;
  quantity: number;
}

export interface BluefinOrderbook {
  symbol: string;
  bids: BluefinOrderbookEntry[];
  asks: BluefinOrderbookEntry[];
  timestamp: number;
}

export interface BluefinHedgeRecommendation {
  action: "long" | "short" | "none";
  market: string;
  reason: string;
  fundingRate: number;
  annualizedYield: number;
  suggestedLeverage: number;
  suggestedSizeUsd: number;
}

// ======== Cache ========

let cachedMarketData: BluefinMarketData[] = [];
let lastMarketFetch = 0;
const MARKET_CACHE_TTL = 15_000; // 15s

let cachedFundingRates: BluefinFundingRate[] = [];
let lastFundingFetch = 0;
const FUNDING_CACHE_TTL = 60_000; // 60s

// ======== Public API Calls ========

/**
 * Fetch market data for all Bluefin perpetual markets.
 * Returns prices, volumes, funding rates, open interest.
 */
export async function fetchMarketData(): Promise<BluefinMarketData[]> {
  const now = Date.now();
  if (cachedMarketData.length > 0 && now - lastMarketFetch < MARKET_CACHE_TTL) {
    return cachedMarketData;
  }

  try {
    const res = await fetch(`${BLUEFIN_API}/marketData`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Bluefin API ${res.status}`);
    const data = await res.json();

    // API returns array of market objects
    const markets: BluefinMarketData[] = [];

    if (Array.isArray(data)) {
      for (const m of data) {
        if (BLUEFIN_MARKETS.includes(m.symbol as BluefinMarket)) {
          markets.push({
            symbol: m.symbol,
            lastPrice: Number(m.lastPrice || m.lastQty || 0),
            indexPrice: Number(m.indexPrice || 0),
            markPrice: Number(m.markPrice || 0),
            bestBid: Number(m.bestBidPrice || 0),
            bestAsk: Number(m.bestAskPrice || 0),
            volume24h: Number(m.volume || m.baseVolume || 0),
            openInterest: Number(m.openInterest || 0),
            fundingRate: Number(m.lastFundingRate || 0),
            nextFundingTime: Number(m.nextFundingTime || 0),
            priceChange24h: Number(m.priceChange || 0),
            priceChangePercent24h: Number(m.priceChangePercent || 0),
          });
        }
      }
    }

    cachedMarketData = markets;
    lastMarketFetch = now;

    console.log(
      `[Bluefin] Markets: ${markets.map((m) => `${m.symbol} $${m.lastPrice.toFixed(2)} FR:${(m.fundingRate * 100).toFixed(4)}%`).join(", ")}`
    );

    return markets;
  } catch (error) {
    console.error("[Bluefin] Market data fetch failed:", error);
    return cachedMarketData;
  }
}

/**
 * Fetch funding rates for all markets.
 * Funding rate = the periodic payment between longs and shorts.
 * Positive = longs pay shorts (bullish market)
 * Negative = shorts pay longs (bearish market)
 */
export async function fetchFundingRates(): Promise<BluefinFundingRate[]> {
  const now = Date.now();
  if (
    cachedFundingRates.length > 0 &&
    now - lastFundingFetch < FUNDING_CACHE_TTL
  ) {
    return cachedFundingRates;
  }

  try {
    // Fetch market data which includes funding rates
    const markets = await fetchMarketData();

    const rates: BluefinFundingRate[] = markets.map((m) => ({
      symbol: m.symbol,
      fundingRate: m.fundingRate,
      // Annualized: funding rate * 3 payments/day * 365 days
      annualizedRate: Math.abs(m.fundingRate) * 3 * 365 * 100,
      nextFundingTime: m.nextFundingTime,
      timestamp: now,
    }));

    cachedFundingRates = rates;
    lastFundingFetch = now;

    console.log(
      `[Bluefin] Funding rates: ${rates.map((r) => `${r.symbol} ${r.fundingRate >= 0 ? "+" : ""}${(r.fundingRate * 100).toFixed(4)}% (${r.annualizedRate.toFixed(1)}% APY)`).join(", ")}`
    );

    return rates;
  } catch (error) {
    console.error("[Bluefin] Funding rate fetch failed:", error);
    return cachedFundingRates;
  }
}

/**
 * Fetch orderbook for a specific market.
 */
export async function fetchOrderbook(
  symbol: BluefinMarket
): Promise<BluefinOrderbook | null> {
  try {
    const res = await fetch(`${BLUEFIN_API}/orderbook?symbol=${symbol}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Bluefin orderbook API ${res.status}`);
    const data = await res.json();

    return {
      symbol,
      bids: (data.bids || []).slice(0, 10).map((b: [string, string]) => ({
        price: Number(b[0]),
        quantity: Number(b[1]),
      })),
      asks: (data.asks || []).slice(0, 10).map((a: [string, string]) => ({
        price: Number(a[0]),
        quantity: Number(a[1]),
      })),
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error(`[Bluefin] Orderbook fetch failed for ${symbol}:`, error);
    return null;
  }
}

// ======== Yield Integration ========

/**
 * Get funding rate as a yield opportunity.
 * When funding is positive, you can earn by going short (shorts collect from longs).
 * When funding is negative, you can earn by going long (longs collect from shorts).
 * This is "delta-neutral funding rate arbitrage" — hold spot + opposite perp.
 */
export async function getFundingRateYields(): Promise<
  Array<{
    symbol: string;
    direction: "long" | "short";
    annualizedYield: number;
    fundingRate: number;
    description: string;
  }>
> {
  const rates = await fetchFundingRates();

  return rates
    .filter((r) => r.annualizedRate > 5) // Only show if > 5% APY
    .map((r) => ({
      symbol: r.symbol,
      direction: (r.fundingRate > 0 ? "short" : "long") as "long" | "short",
      annualizedYield: r.annualizedRate,
      fundingRate: r.fundingRate,
      description:
        r.fundingRate > 0
          ? `Short ${r.symbol} to collect ${r.annualizedRate.toFixed(1)}% annualized funding (longs pay shorts)`
          : `Long ${r.symbol} to collect ${r.annualizedRate.toFixed(1)}% annualized funding (shorts pay longs)`,
    }))
    .sort((a, b) => b.annualizedYield - a.annualizedYield);
}

// ======== Hedging Logic ========

/**
 * Generate a hedge recommendation based on current portfolio.
 * If you're long SUI in the vault, hedge by shorting SUI-PERP on Bluefin.
 */
export async function getHedgeRecommendation(
  portfolioValueUsd: number,
  suiExposurePct: number
): Promise<BluefinHedgeRecommendation> {
  const markets = await fetchMarketData();
  const suiPerp = markets.find((m) => m.symbol === "SUI-PERP");

  if (!suiPerp) {
    return {
      action: "none",
      market: "SUI-PERP",
      reason: "Bluefin market data unavailable",
      fundingRate: 0,
      annualizedYield: 0,
      suggestedLeverage: 1,
      suggestedSizeUsd: 0,
    };
  }

  const suiExposureUsd = (portfolioValueUsd * suiExposurePct) / 100;
  const fundingAnnualized =
    Math.abs(suiPerp.fundingRate) * 3 * 365 * 100;

  // If heavily long SUI (>60%), recommend hedging with short
  if (suiExposurePct > 60) {
    const hedgeSize = suiExposureUsd * 0.3; // Hedge 30% of SUI exposure
    return {
      action: "short",
      market: "SUI-PERP",
      reason: `Portfolio is ${suiExposurePct.toFixed(0)}% SUI. Short ${hedgeSize.toFixed(0)} USD of SUI-PERP to reduce downside risk.${suiPerp.fundingRate > 0 ? ` Bonus: collect ${fundingAnnualized.toFixed(1)}% funding as a short.` : ""}`,
      fundingRate: suiPerp.fundingRate,
      annualizedYield: suiPerp.fundingRate > 0 ? fundingAnnualized : 0,
      suggestedLeverage: 2,
      suggestedSizeUsd: hedgeSize,
    };
  }

  // If funding rate is very high, recommend delta-neutral arb
  if (fundingAnnualized > 20) {
    const direction = suiPerp.fundingRate > 0 ? "short" : "long";
    return {
      action: direction as "long" | "short",
      market: "SUI-PERP",
      reason: `High funding rate on SUI-PERP: ${(suiPerp.fundingRate * 100).toFixed(4)}% per 8h (${fundingAnnualized.toFixed(1)}% annualized). ${direction === "short" ? "Short perp + hold spot SUI" : "Long perp + short spot"} for delta-neutral yield.`,
      fundingRate: suiPerp.fundingRate,
      annualizedYield: fundingAnnualized,
      suggestedLeverage: 2,
      suggestedSizeUsd: Math.min(portfolioValueUsd * 0.2, 1000),
    };
  }

  return {
    action: "none",
    market: "SUI-PERP",
    reason: `No hedge needed. SUI exposure: ${suiExposurePct.toFixed(0)}%. Funding rate: ${(suiPerp.fundingRate * 100).toFixed(4)}% (${fundingAnnualized.toFixed(1)}% annualized) — below threshold.`,
    fundingRate: suiPerp.fundingRate,
    annualizedYield: 0,
    suggestedLeverage: 1,
    suggestedSizeUsd: 0,
  };
}

// ======== Voice Formatting ========

/**
 * Format market data for voice response
 */
export function formatMarketDataForVoice(
  markets: BluefinMarketData[]
): string {
  if (markets.length === 0) return "No Bluefin market data available.";

  const lines = markets.map(
    (m) =>
      `${m.symbol}: $${m.lastPrice.toFixed(2)} (${m.priceChangePercent24h >= 0 ? "+" : ""}${m.priceChangePercent24h.toFixed(1)}%) | Funding: ${(m.fundingRate * 100).toFixed(4)}% | Vol: $${(m.volume24h / 1e6).toFixed(1)}M`
  );

  return `Bluefin Perpetuals:\n${lines.join("\n")}`;
}

/**
 * Format funding rates for voice response
 */
export function formatFundingRatesForVoice(
  rates: BluefinFundingRate[]
): string {
  if (rates.length === 0) return "No funding rate data available.";

  const lines = rates.map(
    (r) =>
      `${r.symbol}: ${r.fundingRate >= 0 ? "+" : ""}${(r.fundingRate * 100).toFixed(4)}% per 8h (${r.annualizedRate.toFixed(1)}% annualized) — ${r.fundingRate > 0 ? "longs pay shorts" : "shorts pay longs"}`
  );

  return `Bluefin Funding Rates:\n${lines.join("\n")}`;
}

/**
 * Protocol info for the router
 */
export const BLUEFIN_PROTOCOL = {
  name: "Bluefin",
  type: "perp-dex" as const,
  chain: "Sui",
  description: "Perpetual DEX on Sui — SUI/ETH/BTC perps with funding rate yield",
};

export function isBluefinAvailable(): boolean {
  return true; // Public API always available
}
