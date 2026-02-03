/**
 * Protocol Router — routes deposit/withdraw/swap to the correct DeFi protocol.
 *
 * This is DARA's core DeFi execution layer. When the AI agent decides to
 * move funds to a protocol, this router builds the correct PTB and executes it.
 */

import { Transaction } from "@mysten/sui/transactions";
import {
  buildScallopDepositTx,
  buildScallopWithdrawTx,
  isScallopAvailable,
  SCALLOP_PROTOCOL,
} from "./scallop";
import {
  buildNaviDepositTx,
  buildNaviWithdrawTx,
  isNaviAvailable,
  NAVI_PROTOCOL,
} from "./navi";
import {
  buildSwapSuiToUsdcTx,
  buildSwapUsdcToSuiTx,
  estimateSwapOutput,
  isDeepBookAvailable,
  DEEPBOOK_PROTOCOL,
} from "./deepbook";
import { BLUEFIN_PROTOCOL, isBluefinAvailable } from "./bluefin";
import { SUI_NETWORK } from "@/lib/constants";

export type ProtocolName = "Scallop" | "NAVI" | "Aave V3" | "Compound V3" | "Arc" | "Bluefin";

interface ProtocolAction {
  tx: Transaction;
  protocol: string;
  action: string;
  description: string;
  isSimulated: boolean;
}

/**
 * Build a deposit transaction for the specified protocol.
 * Returns a Transaction ready to be signed and executed.
 */
export function buildProtocolDeposit(
  protocol: ProtocolName,
  amountMist: bigint,
  context: { walletAddress?: string; suiPriceUsd?: number }
): ProtocolAction {
  const isMainnet = (SUI_NETWORK as string) === "mainnet";

  switch (protocol) {
    case "Scallop": {
      if (isMainnet && isScallopAvailable()) {
        return {
          tx: buildScallopDepositTx(amountMist),
          protocol: "Scallop",
          action: "deposit",
          description: `Depositing ${formatSui(amountMist)} SUI into Scallop lending pool`,
          isSimulated: false,
        };
      }
      // Testnet: build the same PTB structure for demo
      return {
        tx: buildScallopDepositTx(amountMist),
        protocol: "Scallop",
        action: "deposit",
        description: `[Demo] Scallop deposit of ${formatSui(amountMist)} SUI (mainnet PTB built, testnet simulation)`,
        isSimulated: true,
      };
    }

    case "NAVI": {
      if (isMainnet && isNaviAvailable()) {
        return {
          tx: buildNaviDepositTx(amountMist),
          protocol: "NAVI",
          action: "deposit",
          description: `Depositing ${formatSui(amountMist)} SUI into NAVI lending pool`,
          isSimulated: false,
        };
      }
      return {
        tx: buildNaviDepositTx(amountMist),
        protocol: "NAVI",
        action: "deposit",
        description: `[Demo] NAVI deposit of ${formatSui(amountMist)} SUI (mainnet PTB built, testnet simulation)`,
        isSimulated: true,
      };
    }

    case "Aave V3":
    case "Compound V3": {
      // Cross-chain protocols: need to swap SUI→USDC first, then bridge
      const suiPrice = context.suiPriceUsd || 1.5;
      const { minUsdc } = estimateSwapOutput(amountMist, suiPrice);
      const tx = buildSwapSuiToUsdcTx(amountMist, minUsdc);
      return {
        tx,
        protocol,
        action: "swap_and_bridge",
        description: `Swapping ${formatSui(amountMist)} SUI → USDC on DeepBook, then bridge to ${protocol} via LI.FI`,
        isSimulated: !isDeepBookAvailable(),
      };
    }

    case "Arc": {
      // Arc = USDC settlement. Swap SUI→USDC, bridge to Arc
      const suiPrice = context.suiPriceUsd || 1.5;
      const { minUsdc } = estimateSwapOutput(amountMist, suiPrice);
      const tx = buildSwapSuiToUsdcTx(amountMist, minUsdc);
      return {
        tx,
        protocol: "Arc",
        action: "swap_and_bridge",
        description: `Swapping ${formatSui(amountMist)} SUI → USDC, bridging to Arc via LI.FI`,
        isSimulated: !isDeepBookAvailable(),
      };
    }

    case "Bluefin": {
      // Bluefin is a perp DEX, not a lending protocol.
      // "Deposit" to Bluefin = deposit to margin bank for trading.
      // For now, build a swap tx as the first step (SUI → USDC margin).
      const suiPrice = context.suiPriceUsd || 1.5;
      const { minUsdc } = estimateSwapOutput(amountMist, suiPrice);
      const tx = buildSwapSuiToUsdcTx(amountMist, minUsdc);
      return {
        tx,
        protocol: "Bluefin",
        action: "swap_for_margin",
        description: `Swapping ${formatSui(amountMist)} SUI → USDC for Bluefin margin deposit`,
        isSimulated: true, // Full margin deposit requires Bluefin SDK auth
      };
    }

    default:
      throw new Error(`Unsupported protocol: ${protocol}`);
  }
}

/**
 * Build a withdraw transaction for the specified protocol.
 */
export function buildProtocolWithdraw(
  protocol: ProtocolName,
  amountMist: bigint,
  context: {
    walletAddress: string;
    obligationId?: string;
    obligationKeyId?: string;
  }
): ProtocolAction {
  switch (protocol) {
    case "Scallop": {
      if (context.obligationId && context.obligationKeyId) {
        return {
          tx: buildScallopWithdrawTx(
            context.obligationId,
            context.obligationKeyId,
            amountMist,
            context.walletAddress
          ),
          protocol: "Scallop",
          action: "withdraw",
          description: `Withdrawing ${formatSui(amountMist)} SUI from Scallop`,
          isSimulated: (SUI_NETWORK as string) !== "mainnet",
        };
      }
      // No obligation — can't withdraw
      const tx = new Transaction();
      return {
        tx,
        protocol: "Scallop",
        action: "withdraw",
        description: "No Scallop position found to withdraw",
        isSimulated: true,
      };
    }

    case "NAVI": {
      return {
        tx: buildNaviWithdrawTx(amountMist, context.walletAddress),
        protocol: "NAVI",
        action: "withdraw",
        description: `Withdrawing ${formatSui(amountMist)} SUI from NAVI`,
        isSimulated: (SUI_NETWORK as string) !== "mainnet",
      };
    }

    default: {
      const tx = new Transaction();
      return {
        tx,
        protocol,
        action: "withdraw",
        description: `Cross-chain withdraw from ${protocol} — requires bridge back to Sui`,
        isSimulated: true,
      };
    }
  }
}

/**
 * Get all available protocols and their status
 */
export function getAvailableProtocols() {
  return [
    {
      ...SCALLOP_PROTOCOL,
      available: isScallopAvailable(),
      network: SUI_NETWORK,
    },
    {
      ...NAVI_PROTOCOL,
      available: isNaviAvailable(),
      network: SUI_NETWORK,
    },
    {
      ...DEEPBOOK_PROTOCOL,
      available: isDeepBookAvailable(),
      network: SUI_NETWORK,
    },
    {
      ...BLUEFIN_PROTOCOL,
      available: isBluefinAvailable(),
      network: SUI_NETWORK,
    },
  ];
}

/**
 * Resolve a protocol name from a user string (fuzzy match)
 */
export function resolveProtocolName(input: string): ProtocolName | null {
  const lower = input.toLowerCase().trim();
  const map: Record<string, ProtocolName> = {
    scallop: "Scallop",
    "scallop-lend": "Scallop",
    navi: "NAVI",
    "navi-lending": "NAVI",
    "navi protocol": "NAVI",
    aave: "Aave V3",
    "aave v3": "Aave V3",
    "aave-v3": "Aave V3",
    compound: "Compound V3",
    "compound v3": "Compound V3",
    "compound-v3": "Compound V3",
    arc: "Arc",
    circle: "Arc",
    bluefin: "Bluefin",
    "bluefin-perp": "Bluefin",
  };
  return map[lower] || null;
}

function formatSui(mist: bigint): string {
  return (Number(mist) / 1e9).toFixed(4);
}

// Re-export protocol builders for direct use
export {
  buildScallopDepositTx,
  buildScallopWithdrawTx,
  buildNaviDepositTx,
  buildNaviWithdrawTx,
  buildSwapSuiToUsdcTx,
  buildSwapUsdcToSuiTx,
  estimateSwapOutput,
};
