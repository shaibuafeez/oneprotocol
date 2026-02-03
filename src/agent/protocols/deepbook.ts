/**
 * DeepBook V3 Integration — On-chain SUI↔USDC swaps
 *
 * DeepBook is Sui's native CLOB DEX with 0% taker fees on whitelisted pools.
 * Used by DARA to swap SUI → USDC before bridging cross-chain,
 * or USDC → SUI when rebalancing back.
 *
 * Uses the @mysten/deepbook-v3 SDK (v1.0.4) which is already installed.
 */

import { Transaction } from "@mysten/sui/transactions";
import { DEEPBOOK, COIN_TYPES, COIN_DECIMALS, SUI_NETWORK } from "@/lib/constants";

const CLOCK_ID = "0x6";

/**
 * Build a SUI → USDC swap transaction using DeepBook V3 directly via PTBs.
 *
 * For the hackathon we build the PTB manually to avoid DeepBookClient
 * initialization complexity. This uses the same Move calls under the hood.
 */
export function buildSwapSuiToUsdcTx(
  amountMist: bigint,
  minUsdcOut: bigint
): Transaction {
  const tx = new Transaction();

  // Split SUI for the swap
  const [swapCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

  // Create zero DEEP coin for fee payment (0% fee on whitelisted pools)
  const [zeroCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(0)]);

  // DeepBook V3 swap: base (SUI) → quote (USDC)
  const [baseCoinOut, quoteCoinOut, deepCoinOut] = tx.moveCall({
    target: `${DEEPBOOK.PACKAGE}::pool::swap_exact_base_for_quote`,
    typeArguments: [COIN_TYPES.SUI, COIN_TYPES.USDC],
    arguments: [
      tx.object(DEEPBOOK.SUI_USDC_POOL),
      swapCoin,
      zeroCoin,
      tx.pure.u64(minUsdcOut),
      tx.object(CLOCK_ID),
    ],
  });

  // Transfer USDC output to sender, merge leftover base and deep back
  tx.transferObjects([quoteCoinOut], tx.gas);
  tx.mergeCoins(tx.gas, [baseCoinOut, deepCoinOut]);

  return tx;
}

/**
 * Build a USDC → SUI swap transaction using DeepBook V3.
 */
export function buildSwapUsdcToSuiTx(
  usdcCoinId: string,
  amountUsdc: bigint,
  minSuiOut: bigint
): Transaction {
  const tx = new Transaction();

  // Create zero DEEP coin for fee payment
  const [zeroCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(0)]);

  // DeepBook V3 swap: quote (USDC) → base (SUI)
  const [baseCoinOut, quoteCoinOut, deepCoinOut] = tx.moveCall({
    target: `${DEEPBOOK.PACKAGE}::pool::swap_exact_quote_for_base`,
    typeArguments: [COIN_TYPES.SUI, COIN_TYPES.USDC],
    arguments: [
      tx.object(DEEPBOOK.SUI_USDC_POOL),
      tx.object(usdcCoinId),
      zeroCoin,
      tx.pure.u64(minSuiOut),
      tx.object(CLOCK_ID),
    ],
  });

  // Transfer SUI output to sender, merge leftover USDC and DEEP back
  tx.transferObjects([baseCoinOut], tx.gas);
  tx.transferObjects([quoteCoinOut, deepCoinOut], tx.gas);

  return tx;
}

/**
 * Get estimated USDC output for a given SUI amount.
 * Uses a simple price estimate — in production would query the orderbook.
 */
export function estimateSwapOutput(
  amountMist: bigint,
  suiPriceUsd: number
): { estimatedUsdc: bigint; minUsdc: bigint } {
  const suiAmount = Number(amountMist) / 10 ** COIN_DECIMALS.SUI;
  const usdcAmount = suiAmount * suiPriceUsd;
  const estimatedUsdc = BigInt(Math.floor(usdcAmount * 10 ** COIN_DECIMALS.USDC));
  // 3% slippage protection
  const minUsdc = BigInt(Math.floor(usdcAmount * 0.97 * 10 ** COIN_DECIMALS.USDC));
  return { estimatedUsdc, minUsdc };
}

/**
 * Check if DeepBook is available on current network
 */
export function isDeepBookAvailable(): boolean {
  // DeepBook V3 is on both mainnet and testnet
  return ["mainnet", "testnet"].includes(SUI_NETWORK);
}

/**
 * Protocol metadata
 */
export const DEEPBOOK_PROTOCOL = {
  name: "DeepBook V3",
  chain: "Sui",
  type: "dex" as const,
  pools: {
    SUI_USDC: {
      address: DEEPBOOK.SUI_USDC_POOL,
      baseCoin: "SUI",
      quoteCoin: "USDC",
      takerFee: 0, // 0% on whitelisted pools
    },
  },
};
