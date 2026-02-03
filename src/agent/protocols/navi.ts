/**
 * NAVI Protocol Integration — Real PTB builders for Sui lending
 *
 * NAVI is a major lending protocol on Sui with incentive rewards.
 * Deposit SUI → earn lending yield + NAVX incentives.
 * Uses real mainnet addresses from the NAVI SDK.
 *
 * Key pattern: Oracle prices MUST be updated before deposit/withdraw.
 */

import { Transaction } from "@mysten/sui/transactions";
import { NAVI, COIN_TYPES, SUI_NETWORK } from "@/lib/constants";

const CLOCK_ID = "0x6";

/**
 * Build a NAVI deposit PTB — deposits SUI into lending pool.
 *
 * PTB atomically:
 * 1. Updates oracle prices (required by NAVI before any operation)
 * 2. Splits deposit amount from gas coin
 * 3. Calls entry_deposit on incentive_v3 module
 */
export function buildNaviDepositTx(amountMist: bigint): Transaction {
  const tx = new Transaction();

  // Split the deposit coin from gas
  const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

  // Deposit SUI into NAVI lending pool
  // Uses incentive_v3::entry_deposit which handles oracle updates internally
  tx.moveCall({
    target: `${NAVI.PACKAGE}::incentive_v3::entry_deposit`,
    typeArguments: [COIN_TYPES.SUI],
    arguments: [
      tx.object(CLOCK_ID),
      tx.object(NAVI.STORAGE),
      tx.object(NAVI.SUI_POOL),
      tx.pure.u8(NAVI.SUI_ASSET_ID),
      depositCoin,
      tx.pure.u64(amountMist),
      tx.object(NAVI.INCENTIVE_V3),
      tx.object(NAVI.RESERVE_PARENT_ID),
    ],
  });

  return tx;
}

/**
 * Build a NAVI withdraw PTB — withdraws SUI from lending pool.
 *
 * PTB atomically:
 * 1. Calls withdraw on incentive_v3 module
 * 2. Transfers withdrawn SUI to recipient
 */
export function buildNaviWithdrawTx(
  amountMist: bigint,
  recipientAddress: string
): Transaction {
  const tx = new Transaction();

  // Withdraw SUI from NAVI lending pool
  const [withdrawnCoin] = tx.moveCall({
    target: `${NAVI.PACKAGE}::incentive_v3::withdraw`,
    typeArguments: [COIN_TYPES.SUI],
    arguments: [
      tx.object(CLOCK_ID),
      tx.object(NAVI.ORACLE),
      tx.object(NAVI.STORAGE),
      tx.object(NAVI.SUI_POOL),
      tx.pure.u8(NAVI.SUI_ASSET_ID),
      tx.pure.u64(amountMist),
      tx.object(NAVI.INCENTIVE_V3),
      tx.object(NAVI.RESERVE_PARENT_ID),
    ],
  });

  // Transfer to recipient
  tx.transferObjects([withdrawnCoin], tx.pure.address(recipientAddress));

  return tx;
}

/**
 * Build a NAVI USDC deposit PTB
 */
export function buildNaviUsdcDepositTx(
  usdcCoinId: string,
  amountUsdc: bigint
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${NAVI.PACKAGE}::incentive_v3::entry_deposit`,
    typeArguments: [COIN_TYPES.USDC],
    arguments: [
      tx.object(CLOCK_ID),
      tx.object(NAVI.STORAGE),
      tx.object(NAVI.USDC_POOL),
      tx.pure.u8(NAVI.USDC_ASSET_ID),
      tx.object(usdcCoinId),
      tx.pure.u64(amountUsdc),
      tx.object(NAVI.INCENTIVE_V3),
      tx.object(NAVI.RESERVE_PARENT_ID),
    ],
  });

  return tx;
}

/**
 * Check if we're on mainnet (where NAVI is deployed)
 */
export function isNaviAvailable(): boolean {
  return (SUI_NETWORK as string) === "mainnet";
}

/**
 * Protocol metadata for yield scanner
 */
export const NAVI_PROTOCOL = {
  name: "NAVI",
  chain: "Sui",
  type: "lending" as const,
  supportedAssets: ["SUI", "USDC"],
  defiLlamaProject: "navi-lending",
};
