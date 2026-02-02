/**
 * GeckoTerminal API Client for Sui Network
 * Free API - https://www.geckoterminal.com/dex-api
 */

const GECKOTERMINAL_API_BASE = "https://api.geckoterminal.com/api/v2";

export interface OHLCVData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Map DeepBook pool keys to the most liquid GeckoTerminal Sui pool addresses
const GECKO_POOL_MAP: Record<string, string> = {
  SUI_USDC:
    "0x15dbcac854b1fc68fc9467dbd9ab34270447aabd8cc0e04a5864d95ccb86b74a",
  DEEP_SUI:
    "0xe01243f37f712ef87e556afb9b1d03d0fae13f96d324ec912daffc339dfdcbd2",
  DEEP_USDC:
    "0xd5e3a3c7396702d8f358a63ef921cc7c1951f52c6dfc2051cc8772cf7cb9900c",
  WAL_USDC:
    "0xa8479545ff8a71659a7a3b5a2149cab68c5468a67aab8b18f62e4b42623e341e",
  WAL_SUI:
    "0x919a34b9df1d7a56fa078ae6ddc6bd203e284974704d85721062d38ee3a6701a",
};

export function getGeckoPoolAddress(poolKey: string): string | null {
  return GECKO_POOL_MAP[poolKey] || null;
}

/**
 * Get real-time pool price and 24h change from GeckoTerminal
 */
export async function getPoolInfo(
  poolAddress: string
): Promise<{
  success: boolean;
  price?: number;
  priceChange24h?: number;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${GECKOTERMINAL_API_BASE}/networks/sui-network/pools/${poolAddress}`
    );

    if (!response.ok) {
      throw new Error(`GeckoTerminal API error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.data || !result.data.attributes) {
      throw new Error("Invalid pool data format");
    }

    const attrs = result.data.attributes;
    const price = parseFloat(attrs.base_token_price_usd || "0");
    const priceChange24h = parseFloat(
      attrs.price_change_percentage?.h24 || "0"
    );

    return { success: true, price, priceChange24h };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch pool info",
    };
  }
}

/**
 * Get OHLCV candlestick data for a pool
 */
export async function getPoolOHLCV(
  poolAddress: string,
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" = "1h"
): Promise<{ success: boolean; data?: OHLCVData[]; error?: string }> {
  try {
    const timeframeMap: Record<string, string> = {
      "1m": "minute",
      "5m": "minute",
      "15m": "minute",
      "1h": "hour",
      "4h": "hour",
      "1d": "day",
    };

    const aggregateMap: Record<string, string> = {
      "1m": "1",
      "5m": "5",
      "15m": "15",
      "1h": "1",
      "4h": "4",
      "1d": "1",
    };

    const tf = timeframeMap[timeframe];
    const agg = aggregateMap[timeframe];

    const response = await fetch(
      `${GECKOTERMINAL_API_BASE}/networks/sui-network/pools/${poolAddress}/ohlcv/${tf}?aggregate=${agg}&limit=100`
    );

    if (!response.ok) {
      throw new Error(`GeckoTerminal API error: ${response.status}`);
    }

    const result = await response.json();

    if (
      !result.data ||
      !result.data.attributes ||
      !result.data.attributes.ohlcv_list
    ) {
      throw new Error("Invalid OHLCV data format");
    }

    const ohlcvData: OHLCVData[] = result.data.attributes.ohlcv_list.map(
      (item: number[]) => ({
        timestamp: item[0] * 1000,
        open: parseFloat(String(item[1])),
        high: parseFloat(String(item[2])),
        low: parseFloat(String(item[3])),
        close: parseFloat(String(item[4])),
        volume: parseFloat(String(item[5])),
      })
    );

    return { success: true, data: ohlcvData };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch OHLCV data",
    };
  }
}
