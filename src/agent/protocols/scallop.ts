/**
 * Scallop Protocol Integration — Real PTB builders for Sui lending
 *
 * Scallop is the largest lending protocol on Sui.
 * Deposit SUI → get sSUI (market coin) → earn yield.
 * Uses real mainnet addresses from the Scallop SDK.
 */

import { Transaction } from "@mysten/sui/transactions";
import { SCALLOP, COIN_TYPES, SUI_NETWORK } from "@/lib/constants";

const CLOCK_ID = "0x6";

/**
 * Build a Scallop deposit PTB — deposits SUI as collateral to earn lending yield.
 *
 * PTB atomically:
 * 1. Opens a new obligation (or references existing)
 * 2. Splits deposit amount from gas coin
 * 3. Deposits SUI collateral into Scallop Market
 * 4. Returns obligation to protocol
 */
export function buildScallopDepositTx(
  amountMist: bigint,
  existingObligationId?: string
): Transaction {
  const tx = new Transaction();

  // Split the deposit coin from gas
  const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

  if (existingObligationId) {
    // Use existing obligation — borrow hot potato pattern
    const [hotPotato] = tx.moveCall({
      target: `${SCALLOP.PACKAGE}::open_obligation::open_obligation_entry`,
      arguments: [
        tx.object(SCALLOP.VERSION),
        tx.object(existingObligationId),
      ],
    });

    // Deposit collateral
    tx.moveCall({
      target: `${SCALLOP.PACKAGE}::deposit_collateral::deposit_collateral`,
      typeArguments: [COIN_TYPES.SUI],
      arguments: [
        tx.object(SCALLOP.VERSION),
        tx.object(existingObligationId),
        tx.object(SCALLOP.MARKET),
        depositCoin,
      ],
    });

    // Return obligation hot potato
    tx.moveCall({
      target: `${SCALLOP.PACKAGE}::open_obligation::return_obligation`,
      arguments: [
        tx.object(SCALLOP.VERSION),
        tx.object(existingObligationId),
        hotPotato,
      ],
    });
  } else {
    // Create new obligation + deposit in one PTB
    const [obligation, obligationKey, hotPotato] = tx.moveCall({
      target: `${SCALLOP.PACKAGE}::open_obligation::open_obligation`,
      arguments: [tx.object(SCALLOP.VERSION)],
    });

    // Deposit SUI collateral
    tx.moveCall({
      target: `${SCALLOP.PACKAGE}::deposit_collateral::deposit_collateral`,
      typeArguments: [COIN_TYPES.SUI],
      arguments: [
        tx.object(SCALLOP.VERSION),
        obligation,
        tx.object(SCALLOP.MARKET),
        depositCoin,
      ],
    });

    // Return obligation
    tx.moveCall({
      target: `${SCALLOP.PACKAGE}::open_obligation::return_obligation`,
      arguments: [tx.object(SCALLOP.VERSION), obligation, hotPotato],
    });

    // Transfer obligation key to sender (proves ownership)
    tx.transferObjects([obligationKey], tx.gas);
  }

  return tx;
}

/**
 * Build a Scallop withdraw PTB — withdraws SUI collateral from lending.
 *
 * PTB atomically:
 * 1. Borrows obligation hot potato
 * 2. Withdraws collateral
 * 3. Returns obligation
 * 4. Transfers withdrawn SUI to sender
 */
export function buildScallopWithdrawTx(
  obligationId: string,
  obligationKeyId: string,
  amountMist: bigint,
  recipientAddress: string
): Transaction {
  const tx = new Transaction();

  // Open obligation for modification
  const [hotPotato] = tx.moveCall({
    target: `${SCALLOP.PACKAGE}::open_obligation::open_obligation_entry`,
    arguments: [
      tx.object(SCALLOP.VERSION),
      tx.object(obligationId),
    ],
  });

  // Withdraw collateral
  const [withdrawnCoin] = tx.moveCall({
    target: `${SCALLOP.PACKAGE}::withdraw_collateral::withdraw_collateral`,
    typeArguments: [COIN_TYPES.SUI],
    arguments: [
      tx.object(SCALLOP.VERSION),
      tx.object(obligationId),
      tx.object(obligationKeyId),
      tx.object(SCALLOP.MARKET),
      tx.pure.u64(amountMist),
      tx.object(CLOCK_ID),
    ],
  });

  // Return obligation
  tx.moveCall({
    target: `${SCALLOP.PACKAGE}::open_obligation::return_obligation`,
    arguments: [
      tx.object(SCALLOP.VERSION),
      tx.object(obligationId),
      hotPotato,
    ],
  });

  // Transfer withdrawn SUI to recipient
  tx.transferObjects([withdrawnCoin], tx.pure.address(recipientAddress));

  return tx;
}

/**
 * Check if we're on mainnet (where Scallop is deployed)
 */
export function isScallopAvailable(): boolean {
  return (SUI_NETWORK as string) === "mainnet";
}

/**
 * Protocol metadata for yield scanner
 */
export const SCALLOP_PROTOCOL = {
  name: "Scallop",
  chain: "Sui",
  type: "lending" as const,
  supportedAssets: ["SUI", "USDC"],
  defiLlamaProject: "scallop-lend",
};
