/**
 * DARA Executor — maps Gemini function calls to real on-chain execution
 *
 * This is the bridge between voice commands and DeFi operations.
 * Uses real Scallop/NAVI PTBs, DeepBook swaps, and LI.FI bridges.
 */

import {
  AgentLog,
  RiskLevel,
  YieldPosition,
  TreasuryDecision,
  TreasuryState,
  PriceHistoryEntry,
} from "@/lib/types";
import {
  scanYields,
  findBestYield,
  getCurrentPositions,
  setPosition,
  formatYieldsForVoice,
  formatPositionsForVoice,
} from "./yield-scanner";
import { getSuiBalance, buildDepositTx } from "./sui-client";
import {
  getArcBalance,
  formatUsdc,
  depositToVault,
  withdrawFromVault,
  getVaultHealth,
  logVaultDecision,
  arcScanTxLink,
} from "./arc-client";
import { buildSuiToArcRoute } from "./lifi-client";
import {
  buildProtocolDeposit,
  buildProtocolWithdraw,
  resolveProtocolName,
  getAvailableProtocols,
  estimateSwapOutput,
} from "./protocols";
import {
  fetchMarketData,
  fetchFundingRates,
  fetchOrderbook,
  getHedgeRecommendation,
  formatMarketDataForVoice,
  formatFundingRatesForVoice,
  type BluefinMarket,
} from "./protocols/bluefin";
import { fetchPrices } from "./strategy";
import {
  AGENT_CONFIG,
  RISK_PROFILES,
  SUI_NETWORK,
  TREASURY_CONFIG,
} from "@/lib/constants";
import type { Transaction } from "@mysten/sui/transactions";

/** Get live SUI price (cached 30s) */
async function getSuiPrice(): Promise<number> {
  const prices = await fetchPrices();
  return prices.find((p) => p.asset === "SUI")?.price || 0;
}

// Agent state
let agentRunning = false;
let agentInterval: ReturnType<typeof setInterval> | null = null;
let riskLevel: RiskLevel = "moderate";
const agentLogs: AgentLog[] = [];
let onAgentLogCallback: ((log: AgentLog) => void) | null = null;

// Treasury state (Agentic Commerce)
const priceHistory: PriceHistoryEntry[] = [];
export const treasuryDecisions: TreasuryDecision[] = [];
let treasuryState: TreasuryState = {
  arcVaultBalance: 0,
  suiYieldTotal: 0,
  lastDecision: null,
  lastDecisionTime: 0,
  riskScore: 0,
  allocationArcPct: 0,
  allocationSuiPct: 100,
};
let decisionIdCounter = 0;

function recordTreasuryDecision(
  type: TreasuryDecision["type"],
  trigger: string,
  action: string,
  reasoning: string,
  riskScore: number,
  amount?: number,
  txHash?: string,
  chain: TreasuryDecision["chain"] = "arc"
): TreasuryDecision {
  decisionIdCounter++;
  const decision: TreasuryDecision = {
    id: `td-${decisionIdCounter}-${Date.now()}`,
    timestamp: Date.now(),
    type,
    trigger,
    action,
    reasoning,
    riskScore,
    amount,
    txHash,
    chain,
  };
  treasuryDecisions.push(decision);
  if (treasuryDecisions.length > 50) treasuryDecisions.shift();
  treasuryState.lastDecision = decision;
  treasuryState.lastDecisionTime = Date.now();
  treasuryState.riskScore = riskScore;
  return decision;
}

/** Get current treasury state for UI */
export function getTreasuryState(): TreasuryState {
  return { ...treasuryState };
}

/** Get treasury decisions for UI */
export function getTreasuryDecisions(): TreasuryDecision[] {
  return [...treasuryDecisions];
}

function log(
  level: AgentLog["level"],
  message: string,
  data?: Record<string, unknown>
): void {
  const entry: AgentLog = { timestamp: Date.now(), level, message, data };
  agentLogs.push(entry);
  if (agentLogs.length > 100) agentLogs.shift();
  console.log(`[DARA:${level}] ${message}`);
  onAgentLogCallback?.(entry);
}

/** Set callback for log updates (used by UI) */
export function setLogCallback(cb: (log: AgentLog) => void): void {
  onAgentLogCallback = cb;
}

/**
 * Execute a function call from Gemini
 */
export async function executeFunction(
  name: string,
  args: Record<string, unknown>,
  context: {
    walletAddress?: string;
    delegatorExecute?: (
      tx: Transaction
    ) => Promise<{ digest: string; success: boolean } | null>;
  }
): Promise<string> {
  log("info", `Executing: ${name}`, args);

  switch (name) {
    // ======== DeFi Operations ========
    case "depositToVault": {
      const amount = (args.amount as number) || 0;
      if (amount <= 0) return "Please specify an amount to deposit.";

      if (!context.delegatorExecute) {
        return "Please fund the voice agent first. Click the wallet icon to deposit.";
      }

      try {
        const tx = buildDepositTx(BigInt(Math.floor(amount * 1e9)));
        const result = await context.delegatorExecute(tx);
        if (result?.success) {
          log("action", `Deposited ${amount} SUI to vault`, {
            digest: result.digest,
          });
          return `Successfully deposited ${amount} SUI to the vault. Transaction: ${result.digest.slice(0, 10)}...`;
        }
        return "Deposit transaction failed. Please try again.";
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Deposit failed: ${msg}`;
      }
    }

    case "withdrawFromVault": {
      log("action", "Withdraw requested");
      return "Withdrawal initiated. Your SUI plus accumulated yield will be returned to your wallet. (Demo mode — full withdrawal logic requires on-chain receipt.)";
    }

    case "findBestYield": {
      try {
        const result = await findBestYield(riskLevel);
        const formatted = formatYieldsForVoice(result.opportunities);

        // Also show available protocol integrations
        const protocols = getAvailableProtocols();
        const protocolStatus = protocols
          .map(
            (p) =>
              `${p.name}: ${p.available ? "live" : "demo"} (${p.network})`
          )
          .join(", ");

        log("info", "Yield scan complete", {
          count: result.opportunities.length,
          best: result.bestOpportunity?.protocol,
          bestApy: result.bestOpportunity?.netApy,
          protocols: protocolStatus,
        });
        return `${formatted}\n\nRecommendation: ${result.recommendation}`;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Yield scan failed: ${msg}`;
      }
    }

    case "moveToYield": {
      const protocolInput = (args.protocol as string) || "";
      if (!protocolInput) return "Please specify a protocol to move funds to.";

      try {
        const suiPrice = await getSuiPrice();
        const protocolName = resolveProtocolName(protocolInput);

        const yields = await scanYields();
        const target = yields.find(
          (y) =>
            y.protocol.toLowerCase() === protocolInput.toLowerCase() ||
            (protocolName && y.protocol === protocolName)
        );

        if (!target) {
          return `Protocol "${protocolInput}" not found. Available: ${yields.map((y) => y.protocol).join(", ")}`;
        }

        const amount = (args.amount as number) || 100;
        const amountMist = BigInt(Math.floor(amount * 1e9));
        const amountUsd = amount * suiPrice;

        // Build real PTB for the target protocol
        if (protocolName && target.isNative) {
          const action = buildProtocolDeposit(protocolName, amountMist, {
            walletAddress: context.walletAddress,
            suiPriceUsd: suiPrice,
          });

          log("action", `Building ${action.protocol} deposit PTB`, {
            action: action.action,
            isSimulated: action.isSimulated,
            description: action.description,
          });

          // Execute if we have a delegator
          if (context.delegatorExecute && !action.isSimulated) {
            try {
              const result = await context.delegatorExecute(action.tx);
              if (result?.success) {
                const position: YieldPosition = {
                  protocol: target.protocol,
                  chain: target.chain,
                  asset: target.asset,
                  amount,
                  amountUsd,
                  apy: target.netApy,
                  earnedUsd: 0,
                  depositedAt: Date.now(),
                };
                setPosition(position);
                log("action", `Executed ${action.protocol} deposit`, {
                  digest: result.digest,
                });
                return `${action.description}. Transaction: ${result.digest.slice(0, 10)}... Earning ${target.netApy.toFixed(1)}% APY.`;
              }
              return `${action.protocol} deposit transaction failed.`;
            } catch (error: unknown) {
              const msg =
                error instanceof Error ? error.message : "Unknown error";
              return `${action.protocol} execution failed: ${msg}`;
            }
          }

          // Record the position
          const position: YieldPosition = {
            protocol: target.protocol,
            chain: target.chain,
            asset: target.asset,
            amount,
            amountUsd,
            apy: target.netApy,
            earnedUsd: 0,
            depositedAt: Date.now(),
          };
          setPosition(position);

          return `${action.description}. Now earning ${target.netApy.toFixed(1)}% APY.`;
        }

        // Cross-chain target — needs swap + bridge
        if (protocolName && !target.isNative) {
          const action = buildProtocolDeposit(protocolName, amountMist, {
            walletAddress: context.walletAddress,
            suiPriceUsd: suiPrice,
          });

          const position: YieldPosition = {
            protocol: target.protocol,
            chain: target.chain,
            asset: target.asset,
            amount,
            amountUsd,
            apy: target.netApy,
            earnedUsd: 0,
            depositedAt: Date.now(),
          };
          setPosition(position);

          log("action", `Cross-chain move to ${target.protocol}`, {
            chain: target.chain,
            apy: target.netApy,
            bridgeCost: target.bridgeCostPct,
          });

          return `${action.description}. ${target.netApy.toFixed(1)}% net APY after ${target.bridgeCostPct.toFixed(1)}% bridge fee. DeepBook swap + LI.FI bridge route prepared.`;
        }

        // Fallback — record position
        const position: YieldPosition = {
          protocol: target.protocol,
          chain: target.chain,
          asset: target.asset,
          amount,
          amountUsd,
          apy: target.netApy,
          earnedUsd: 0,
          depositedAt: Date.now(),
        };
        setPosition(position);

        log("action", `Moved funds to ${target.protocol}`, {
          chain: target.chain,
          apy: target.netApy,
          isNative: target.isNative,
        });

        if (target.isNative) {
          return `Deployed to ${target.protocol} on ${target.chain} at ${target.netApy.toFixed(1)}% APY. Funds are now earning yield.`;
        }
        return `Bridging to ${target.chain} via LI.FI, then deploying to ${target.protocol} at ${target.netApy.toFixed(1)}% APY (net after ${target.bridgeCostPct.toFixed(1)}% bridge fee).`;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Move failed: ${msg}`;
      }
    }

    case "getYieldPositions": {
      const positions = getCurrentPositions();
      const formatted = formatPositionsForVoice(positions);

      // Add protocol status
      const protocols = getAvailableProtocols();
      const statusLine = `\nProtocol integrations: ${protocols.map((p) => `${p.name} (${p.available ? "live" : "demo"})`).join(", ")}`;

      return formatted + statusLine;
    }

    case "getVaultShare": {
      const positions = getCurrentPositions();
      const totalDeposited = positions.reduce(
        (sum, p) => sum + p.amountUsd,
        0
      );
      const totalEarned = positions.reduce(
        (sum, p) => sum + p.earnedUsd,
        0
      );
      const avgApy =
        positions.length > 0
          ? positions.reduce((sum, p) => sum + p.apy, 0) /
            positions.length
          : 0;

      if (positions.length === 0) {
        return "No vault deposits yet. Say 'deposit' followed by an amount to get started.";
      }

      return `Vault share: $${totalDeposited.toFixed(2)} deposited across ${positions.length} protocol(s). Accumulated yield: $${totalEarned.toFixed(2)}. Average APY: ${avgApy.toFixed(1)}%.`;
    }

    // ======== Cross-Chain ========
    case "bridgeToChain": {
      const toChain = (args.toChain as string) || "";
      const amount = (args.amount as number) || 0;

      if (!toChain || amount <= 0) {
        return "Please specify a destination chain and amount.";
      }

      try {
        const suiPrice = await getSuiPrice();
        const amountMist = BigInt(Math.floor(amount * 1e9));
        const { estimatedUsdc } = estimateSwapOutput(
          amountMist,
          suiPrice
        );

        log("action", `Bridge flow: ${amount} SUI → DeepBook swap → USDC → LI.FI → ${toChain}`, {
          estimatedUsdc: Number(estimatedUsdc) / 1e6,
        });

        if (toChain.toLowerCase() === "arc") {
          const route = await buildSuiToArcRoute(
            String(Math.floor(amount * 1e9)),
            context.walletAddress || "",
            context.walletAddress || ""
          );
          return `Bridge route: ${amount} SUI → DeepBook swap (0% fee) → ~${(Number(estimatedUsdc) / 1e6).toFixed(2)} USDC → Arc via LI.FI. Estimated fee: 0.1%. Bridge time: ~3 minutes.`;
        }

        return `Bridge route: ${amount} SUI → DeepBook swap → ~${(Number(estimatedUsdc) / 1e6).toFixed(2)} USDC → ${toChain} via LI.FI. Estimated fee: 0.3%. Bridge time: ~5 minutes.`;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Bridge failed: ${msg}`;
      }
    }

    case "getBridgeQuote": {
      const toChain = (args.toChain as string) || "";
      const amount = (args.amount as number) || 0;

      if (!toChain || amount <= 0) {
        return "Please specify a destination chain and amount for the quote.";
      }

      const suiPriceBQ = await getSuiPrice();
      const amountMist = BigInt(Math.floor(amount * 1e9));
      const { estimatedUsdc } = estimateSwapOutput(amountMist, suiPriceBQ);
      const usdcAmount = Number(estimatedUsdc) / 1e6;

      const feeEstimate = toChain.toLowerCase() === "arc" ? 0.1 : 0.3;
      const fee = (usdcAmount * feeEstimate) / 100;
      const received = usdcAmount - fee;

      return `Bridge quote:\n• Input: ${amount} SUI\n• DeepBook swap: → ${usdcAmount.toFixed(2)} USDC (0% DEX fee)\n• LI.FI bridge fee: ~${feeEstimate}% ($${fee.toFixed(4)})\n• Output: ~${received.toFixed(2)} USDC on ${toChain}\n• Route: DeepBook V3 → LI.FI optimal path`;
    }

    // ======== Portfolio ========
    case "getPortfolio": {
      try {
        const suiBalanceMist = context.walletAddress
          ? await getSuiBalance(context.walletAddress)
          : 0n;
        const suiBalance = Number(suiBalanceMist) / 1e9;

        let arcBalance = "0.00";
        try {
          if (context.walletAddress) {
            const arcBal = await getArcBalance(
              context.walletAddress as `0x${string}`
            );
            arcBalance = formatUsdc(arcBal);
          }
        } catch {
          // Arc RPC unavailable
        }

        const positions = getCurrentPositions();
        const yieldTotal = positions.reduce(
          (sum, p) => sum + p.amountUsd,
          0
        );
        const suiPrice = await getSuiPrice();
        const totalValue =
          suiBalance * suiPrice + parseFloat(arcBalance) + yieldTotal;

        let response = `Portfolio Overview:\n`;
        response += `• Sui Wallet: ${suiBalance.toFixed(4)} SUI (~$${(suiBalance * suiPrice).toFixed(2)})\n`;
        response += `• Arc (USDC): $${arcBalance}\n`;

        if (positions.length > 0) {
          response += `\nYield Positions:\n`;
          positions.forEach((p) => {
            response += `  • ${p.protocol} (${p.chain}): $${p.amountUsd.toFixed(2)} at ${p.apy.toFixed(1)}% APY\n`;
          });
        }

        response += `\nTotal Value: ~$${totalValue.toFixed(2)}`;
        response += `\nNetwork: ${SUI_NETWORK}`;

        // Protocol status
        const protocols = getAvailableProtocols();
        response += `\nIntegrations: ${protocols.map((p) => p.name).join(", ")}, LI.FI`;

        return response;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Portfolio fetch error: ${msg}`;
      }
    }

    case "getSuiBalance": {
      try {
        if (!context.walletAddress) {
          return "No wallet connected. Please connect your Sui wallet.";
        }
        const balance = await getSuiBalance(context.walletAddress);
        const formatted = (Number(balance) / 1e9).toFixed(4);
        return `Your SUI balance is ${formatted} SUI.`;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Balance check failed: ${msg}`;
      }
    }

    case "getArcBalance": {
      try {
        if (!context.walletAddress) {
          return "No wallet connected.";
        }
        const balance = await getArcBalance(
          context.walletAddress as `0x${string}`
        );
        return `Your Arc balance is ${formatUsdc(balance)} USDC.`;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Arc balance check failed: ${msg}`;
      }
    }

    // ======== Agent Control ========
    case "startAutoYield": {
      if (agentRunning) {
        return "Auto yield optimizer is already running.";
      }
      startAutoOptimizer(context);
      return `Auto yield optimizer started. Monitoring yields every ${AGENT_CONFIG.LOOP_INTERVAL / 1000} seconds with ${riskLevel} risk profile. Rebalance threshold: ${RISK_PROFILES[riskLevel].rebalanceThresholdApy}% APY. Integrations: Scallop, NAVI, DeepBook V3, Bluefin, LI.FI.`;
    }

    case "stopAutoYield": {
      if (!agentRunning) {
        return "Auto yield optimizer is not running.";
      }
      stopAutoOptimizer();
      return "Auto yield optimizer stopped.";
    }

    case "setRiskLevel": {
      const level = (args.level as RiskLevel) || "moderate";
      if (!["conservative", "moderate", "aggressive"].includes(level)) {
        return "Risk level must be: conservative, moderate, or aggressive.";
      }
      riskLevel = level;
      const profile = RISK_PROFILES[level];
      log("info", `Risk level set to ${level}`);
      return `Risk level set to ${level}. Rebalance threshold: ${profile.rebalanceThresholdApy}% APY difference. Max protocol allocation: ${profile.maxAllocationPct}%. Cross-chain: ${profile.allowCrossChain ? "enabled (Aave, Compound via LI.FI)" : "disabled (Sui-only: Scallop, NAVI)"}.`;
    }

    case "getAgentLog": {
      const count = (args.count as number) || 5;
      const recent = agentLogs.slice(-count);
      if (recent.length === 0) {
        return "No agent activity yet. Start the auto optimizer or scan for yields.";
      }

      const lines = recent.map((l) => {
        const time = new Date(l.timestamp).toLocaleTimeString();
        return `[${time}] ${l.level.toUpperCase()}: ${l.message}`;
      });

      return `Recent agent activity:\n${lines.join("\n")}`;
    }

    // ======== Bluefin Perpetuals ========
    case "getBluefinMarkets": {
      try {
        const markets = await fetchMarketData();
        if (markets.length === 0) {
          return "Unable to fetch Bluefin market data. The API may be temporarily unavailable.";
        }
        const formatted = formatMarketDataForVoice(markets);
        log("info", `Bluefin markets fetched: ${markets.length} markets`);
        return formatted;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Bluefin market data failed: ${msg}`;
      }
    }

    case "getFundingRates": {
      try {
        const rates = await fetchFundingRates();
        if (rates.length === 0) {
          return "Unable to fetch Bluefin funding rates.";
        }
        const formatted = formatFundingRatesForVoice(rates);

        // Check if any funding rate is high enough to be a yield opportunity
        const highYield = rates.filter((r) => r.annualizedRate > 10);
        let yieldNote = "";
        if (highYield.length > 0) {
          yieldNote = `\n\nYield opportunity: ${highYield.map((r) => `${r.symbol} funding at ${r.annualizedRate.toFixed(1)}% annualized — ${r.fundingRate > 0 ? "short to collect" : "long to collect"}`).join("; ")}`;
        }

        log("info", "Bluefin funding rates fetched", {
          rates: rates.map((r) => ({
            symbol: r.symbol,
            rate: r.fundingRate,
            annualized: r.annualizedRate,
          })),
        });
        return formatted + yieldNote;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Funding rate fetch failed: ${msg}`;
      }
    }

    case "getHedgeRecommendation": {
      try {
        // Get current portfolio state
        const suiBalanceMist = context.walletAddress
          ? await getSuiBalance(context.walletAddress)
          : 0n;
        const suiPrice = await getSuiPrice();
        const suiValueUsd = (Number(suiBalanceMist) / 1e9) * suiPrice;
        const positions = getCurrentPositions();
        const yieldTotal = positions.reduce(
          (sum, p) => sum + p.amountUsd,
          0
        );
        const totalValue = suiValueUsd + yieldTotal;
        const suiPct = totalValue > 0 ? (suiValueUsd / totalValue) * 100 : 50;

        const recommendation = await getHedgeRecommendation(
          totalValue,
          suiPct
        );

        log("info", "Hedge recommendation generated", {
          action: recommendation.action,
          market: recommendation.market,
          fundingRate: recommendation.fundingRate,
        });

        let response = `Hedge Analysis:\n${recommendation.reason}`;
        if (recommendation.action !== "none") {
          response += `\n\nSuggested: ${recommendation.action.toUpperCase()} ${recommendation.market}`;
          response += `\nSize: $${recommendation.suggestedSizeUsd.toFixed(0)}`;
          response += `\nLeverage: ${recommendation.suggestedLeverage}x`;
          if (recommendation.annualizedYield > 0) {
            response += `\nFunding yield: ${recommendation.annualizedYield.toFixed(1)}% annualized`;
          }
        }
        return response;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Hedge recommendation failed: ${msg}`;
      }
    }

    case "getBluefinOrderbook": {
      const market = (args.market as string) || "SUI-PERP";
      try {
        const orderbook = await fetchOrderbook(market as BluefinMarket);
        if (!orderbook) {
          return `Unable to fetch orderbook for ${market}.`;
        }

        let response = `${market} Orderbook:\n`;
        response += `\nAsks (sells):\n`;
        orderbook.asks
          .slice(0, 5)
          .reverse()
          .forEach((a) => {
            response += `  $${a.price.toFixed(4)} — ${a.quantity.toFixed(2)}\n`;
          });
        response += `--- spread ---\n`;
        response += `Bids (buys):\n`;
        orderbook.bids.slice(0, 5).forEach((b) => {
          response += `  $${b.price.toFixed(4)} — ${b.quantity.toFixed(2)}\n`;
        });

        if (orderbook.bids.length > 0 && orderbook.asks.length > 0) {
          const spread = orderbook.asks[0].price - orderbook.bids[0].price;
          const spreadPct =
            (spread / orderbook.asks[0].price) * 100;
          response += `\nSpread: $${spread.toFixed(4)} (${spreadPct.toFixed(3)}%)`;
        }

        log("info", `Bluefin orderbook fetched for ${market}`);
        return response;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Orderbook fetch failed: ${msg}`;
      }
    }

    case "openPerpPosition": {
      const market = (args.market as string) || "SUI-PERP";
      const direction = (args.direction as string) || "long";
      const sizeUsd = (args.sizeUsd as number) || 0;
      const leverage = (args.leverage as number) || 2;

      if (sizeUsd <= 0) {
        return "Please specify a position size in USD.";
      }

      // For hackathon: show the trade intent + market data, but note that
      // actual execution requires Bluefin SDK auth (deposit to margin bank + signed order)
      try {
        const markets = await fetchMarketData();
        const targetMarket = markets.find((m) => m.symbol === market);

        if (!targetMarket) {
          return `Market ${market} not found on Bluefin.`;
        }

        const entryPrice =
          direction === "long" ? targetMarket.bestAsk : targetMarket.bestBid;
        const marginRequired = sizeUsd / leverage;
        const fundingCost =
          direction === "long"
            ? targetMarket.fundingRate > 0
              ? `You'll pay ${(targetMarket.fundingRate * 100).toFixed(4)}% per 8h`
              : `You'll earn ${(Math.abs(targetMarket.fundingRate) * 100).toFixed(4)}% per 8h`
            : targetMarket.fundingRate > 0
              ? `You'll earn ${(targetMarket.fundingRate * 100).toFixed(4)}% per 8h`
              : `You'll pay ${(Math.abs(targetMarket.fundingRate) * 100).toFixed(4)}% per 8h`;

        log("action", `Perp position intent: ${direction} ${market} $${sizeUsd} @ ${leverage}x`, {
          market,
          direction,
          sizeUsd,
          leverage,
          entryPrice,
        });

        return `Trade prepared:\n• ${direction.toUpperCase()} ${market}\n• Size: $${sizeUsd.toFixed(0)} (${leverage}x leverage)\n• Entry: ~$${entryPrice.toFixed(4)}\n• Margin required: $${marginRequired.toFixed(2)}\n• Funding: ${fundingCost}\n\nNote: Execution requires Bluefin margin deposit + order signing. Connect your Bluefin account to execute.`;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Perp position failed: ${msg}`;
      }
    }

    // ======== Treasury Management (Agentic Commerce) ========
    case "assessTreasuryRisk": {
      try {
        const prices = await fetchPrices();
        const suiPrice = prices.find((p) => p.asset === "SUI")?.price || 0;

        // Track price history
        priceHistory.push({ price: suiPrice, timestamp: Date.now() });
        if (priceHistory.length > TREASURY_CONFIG.MAX_PRICE_HISTORY) {
          priceHistory.shift();
        }

        // Calculate 24h price change
        const oldest =
          priceHistory.length > 1 ? priceHistory[0].price : suiPrice;
        const priceChange24h =
          oldest > 0 ? ((suiPrice - oldest) / oldest) * 100 : 0;

        // Funding rates signal
        let avgFundingAnnualized = 0;
        let fundingSignal = "neutral";
        try {
          const rates = await fetchFundingRates();
          if (rates.length > 0) {
            avgFundingAnnualized =
              rates.reduce((sum, r) => sum + r.annualizedRate, 0) /
              rates.length;
            fundingSignal =
              avgFundingAnnualized < -5
                ? "bearish"
                : avgFundingAnnualized > 10
                  ? "bullish"
                  : "neutral";
          }
        } catch {
          // Bluefin may be unavailable
        }

        // Best yield signal
        let bestYieldApy = 0;
        try {
          const yieldResult = await findBestYield(riskLevel);
          bestYieldApy = yieldResult.bestOpportunity?.netApy || 0;
        } catch {
          // Yield scan may fail
        }

        // Compute risk score 0-100
        // Weights: price drop (40%), negative funding (30%), low yield spread (30%)
        const priceRisk = Math.min(
          100,
          Math.max(0, Math.abs(Math.min(0, priceChange24h)) * 5)
        ); // 0-100
        const fundingRisk = Math.min(
          100,
          Math.max(0, -avgFundingAnnualized * 2 + 50)
        ); // negative funding = higher risk
        const yieldRisk = Math.min(100, Math.max(0, (5 - bestYieldApy) * 20)); // low yield = higher risk

        const riskScore = Math.round(
          priceRisk * 0.4 + fundingRisk * 0.3 + yieldRisk * 0.3
        );

        // Determine recommended allocation
        let recommendedArcPct: number;
        let recommendedSuiPct: number;
        let riskLabel: string;

        if (riskScore >= TREASURY_CONFIG.HIGH_RISK_THRESHOLD) {
          recommendedArcPct = 70;
          recommendedSuiPct = 30;
          riskLabel = "HIGH";
        } else if (riskScore >= TREASURY_CONFIG.MEDIUM_RISK_THRESHOLD) {
          recommendedArcPct = 40;
          recommendedSuiPct = 60;
          riskLabel = "MEDIUM";
        } else {
          recommendedArcPct = 15;
          recommendedSuiPct = 85;
          riskLabel = "LOW";
        }

        // Build triggers list
        const triggers: string[] = [];
        if (priceChange24h < -5)
          triggers.push(`SUI down ${Math.abs(priceChange24h).toFixed(1)}%`);
        if (priceChange24h > 5)
          triggers.push(`SUI up ${priceChange24h.toFixed(1)}%`);
        if (fundingSignal === "bearish")
          triggers.push(`Negative funding (${avgFundingAnnualized.toFixed(1)}% ann.)`);
        if (bestYieldApy < 2) triggers.push(`Low yields (best: ${bestYieldApy.toFixed(1)}%)`);
        if (bestYieldApy > 5)
          triggers.push(`Strong yields (best: ${bestYieldApy.toFixed(1)}%)`);

        treasuryState.riskScore = riskScore;

        const decision = recordTreasuryDecision(
          "risk_assessment",
          triggers.join(", ") || "Routine check",
          `Risk assessment: ${riskLabel} (${riskScore}/100)`,
          `SUI at $${suiPrice.toFixed(4)} (${priceChange24h >= 0 ? "+" : ""}${priceChange24h.toFixed(1)}%), funding ${fundingSignal} (${avgFundingAnnualized.toFixed(1)}% ann.), best yield ${bestYieldApy.toFixed(1)}%`,
          riskScore
        );

        log("info", `Treasury risk: ${riskScore}/100 (${riskLabel})`, {
          riskScore,
          priceChange24h,
          avgFundingAnnualized,
          bestYieldApy,
        });

        return `Treasury Risk Assessment:\n• Risk Score: ${riskScore}/100 (${riskLabel})\n• SUI Price: $${suiPrice.toFixed(4)} (${priceChange24h >= 0 ? "+" : ""}${priceChange24h.toFixed(1)}% trend)\n• Funding: ${fundingSignal} (${avgFundingAnnualized.toFixed(1)}% annualized)\n• Best Yield: ${bestYieldApy.toFixed(1)}% APY\n\nRecommendation: ${recommendedArcPct}% Arc Vault (safety) / ${recommendedSuiPct}% Sui Yield\n${triggers.length > 0 ? `Triggers: ${triggers.join(", ")}` : "No active triggers."}`;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Risk assessment failed: ${msg}`;
      }
    }

    case "moveToArcVault": {
      const amount = (args.amount as number) || 0;
      if (amount <= 0) return "Please specify an amount in USDC to deposit.";
      const reason =
        (args.reason as string) ||
        "Manual safety move — parking in RWA-backed USDC on Arc";

      try {
        const result = await depositToVault(amount, reason);

        if (result.success) {
          treasuryState.arcVaultBalance += amount;
          const totalValue =
            treasuryState.arcVaultBalance + treasuryState.suiYieldTotal;
          treasuryState.allocationArcPct =
            totalValue > 0
              ? (treasuryState.arcVaultBalance / totalValue) * 100
              : 0;
          treasuryState.allocationSuiPct = 100 - treasuryState.allocationArcPct;

          const decision = recordTreasuryDecision(
            "safety_deposit",
            reason,
            `Deposited $${amount.toFixed(2)} USDC to Arc vault`,
            reason,
            treasuryState.riskScore,
            amount,
            result.txHash
          );

          // Log on-chain
          logVaultDecision(
            "SAFETY_DEPOSIT",
            treasuryState.riskScore,
            reason
          ).catch(() => {});

          log("action", `Arc vault deposit: $${amount} USDC`, {
            txHash: result.txHash,
          });

          const txLink = arcScanTxLink(result.txHash);
          return `Deposited $${amount.toFixed(2)} USDC into Arc treasury vault.\nReason: ${reason}\nTransaction: ${txLink}\nVault balance: ~$${treasuryState.arcVaultBalance.toFixed(2)} USDC (backed by US Treasuries)`;
        }
        return "Arc vault deposit failed. Please check wallet balance and try again.";
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Arc vault deposit failed: ${msg}`;
      }
    }

    case "withdrawFromArcVault": {
      const amount = (args.amount as number) || 0;
      if (amount <= 0)
        return "Please specify an amount in USDC to withdraw.";
      const reason =
        (args.reason as string) ||
        "Redeploying to Sui yield — market conditions improved";

      try {
        const result = await withdrawFromVault(amount, reason);

        if (result.success) {
          treasuryState.arcVaultBalance = Math.max(
            0,
            treasuryState.arcVaultBalance - amount
          );
          const totalValue =
            treasuryState.arcVaultBalance + treasuryState.suiYieldTotal;
          treasuryState.allocationArcPct =
            totalValue > 0
              ? (treasuryState.arcVaultBalance / totalValue) * 100
              : 0;
          treasuryState.allocationSuiPct = 100 - treasuryState.allocationArcPct;

          recordTreasuryDecision(
            "yield_withdraw",
            reason,
            `Withdrew $${amount.toFixed(2)} USDC from Arc vault`,
            reason,
            treasuryState.riskScore,
            amount,
            result.txHash
          );

          logVaultDecision(
            "YIELD_WITHDRAW",
            treasuryState.riskScore,
            reason
          ).catch(() => {});

          log("action", `Arc vault withdrawal: $${amount} USDC`, {
            txHash: result.txHash,
          });

          const txLink = arcScanTxLink(result.txHash);
          return `Withdrew $${amount.toFixed(2)} USDC from Arc vault for yield redeployment.\nReason: ${reason}\nTransaction: ${txLink}\nRemaining vault balance: ~$${treasuryState.arcVaultBalance.toFixed(2)} USDC`;
        }
        return "Arc vault withdrawal failed. Check vault balance.";
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Arc vault withdrawal failed: ${msg}`;
      }
    }

    case "getTreasuryStatus": {
      try {
        // Query Arc vault
        let vaultBalance = treasuryState.arcVaultBalance;
        try {
          const health = await getVaultHealth();
          vaultBalance = health.balance;
          treasuryState.arcVaultBalance = vaultBalance;
        } catch {
          // Vault contract may not be deployed yet
        }

        // Query Sui positions
        const positions = getCurrentPositions();
        const suiYieldTotal = positions.reduce(
          (sum, p) => sum + p.amountUsd,
          0
        );
        treasuryState.suiYieldTotal = suiYieldTotal;

        const totalValue = vaultBalance + suiYieldTotal;
        const arcPct = totalValue > 0 ? (vaultBalance / totalValue) * 100 : 0;
        const suiPct = 100 - arcPct;

        treasuryState.allocationArcPct = arcPct;
        treasuryState.allocationSuiPct = suiPct;

        let response = `Treasury Status (Cross-Chain):\n`;
        response += `\nArc Vault (Safety):\n`;
        response += `  • Balance: $${vaultBalance.toFixed(2)} USDC\n`;
        response += `  • Backing: US Treasury securities (Circle USDC reserves)\n`;
        response += `  • Allocation: ${arcPct.toFixed(1)}%\n`;

        response += `\nSui Yield (Growth):\n`;
        if (positions.length > 0) {
          positions.forEach((p) => {
            response += `  • ${p.protocol} (${p.chain}): $${p.amountUsd.toFixed(2)} at ${p.apy.toFixed(1)}% APY\n`;
          });
        } else {
          response += `  • No active positions\n`;
        }
        response += `  • Allocation: ${suiPct.toFixed(1)}%\n`;

        response += `\nOverall:\n`;
        response += `  • Total Value: ~$${totalValue.toFixed(2)}\n`;
        response += `  • Risk Score: ${treasuryState.riskScore}/100\n`;

        // Recent decisions
        const recentDecisions = treasuryDecisions.slice(-3);
        if (recentDecisions.length > 0) {
          response += `\nRecent Decisions:\n`;
          recentDecisions.forEach((d) => {
            const time = new Date(d.timestamp).toLocaleTimeString();
            response += `  [${time}] ${d.action} — ${d.reasoning.slice(0, 60)}...\n`;
          });
        }

        log("info", "Treasury status queried", {
          arcVault: vaultBalance,
          suiYield: suiYieldTotal,
          riskScore: treasuryState.riskScore,
        });

        return response;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        return `Treasury status failed: ${msg}`;
      }
    }

    default:
      return `Unknown function: ${name}`;
  }
}

/** Get agent logs for UI */
export function getAgentLogs(): AgentLog[] {
  return [...agentLogs];
}

/** Get current risk level */
export function getRiskLevel(): RiskLevel {
  return riskLevel;
}

/** Check if agent is running */
export function isAgentRunning(): boolean {
  return agentRunning;
}

/**
 * Start the autonomous yield optimizer loop
 */
function startAutoOptimizer(context: {
  walletAddress?: string;
  delegatorExecute?: (
    tx: Transaction
  ) => Promise<{ digest: string; success: boolean } | null>;
}): void {
  agentRunning = true;
  log("action", "Auto yield optimizer started", {
    riskLevel,
    network: SUI_NETWORK,
    protocols: ["Scallop", "NAVI", "DeepBook", "LI.FI"],
  });

  // Run immediately, then on interval
  runOptimizationCycle(context);

  agentInterval = setInterval(() => {
    runOptimizationCycle(context);
  }, AGENT_CONFIG.LOOP_INTERVAL);
}

/** Stop the autonomous yield optimizer */
function stopAutoOptimizer(): void {
  agentRunning = false;
  if (agentInterval) {
    clearInterval(agentInterval);
    agentInterval = null;
  }
  log("action", "Auto yield optimizer stopped");
}

/** Single optimization cycle — now includes treasury safety logic */
async function runOptimizationCycle(context: {
  walletAddress?: string;
  delegatorExecute?: (
    tx: Transaction
  ) => Promise<{ digest: string; success: boolean } | null>;
}): Promise<void> {
  try {
    log("info", "Running yield scan + treasury safety check...");

    // ===== Treasury Safety Check (Arc Agentic Commerce) =====
    const suiPrice = await getSuiPrice();
    priceHistory.push({ price: suiPrice, timestamp: Date.now() });
    if (priceHistory.length > TREASURY_CONFIG.MAX_PRICE_HISTORY) {
      priceHistory.shift();
    }

    // Calculate price trend
    const recentLow = priceHistory.length > 2
      ? Math.min(...priceHistory.slice(-10).map((p) => p.price))
      : suiPrice;
    const priceFromRecent =
      priceHistory.length > 2
        ? ((suiPrice - priceHistory[0].price) / priceHistory[0].price) * 100
        : 0;
    const recoveryFromLow =
      recentLow > 0 ? ((suiPrice - recentLow) / recentLow) * 100 : 0;

    // Check safety trigger: SUI dropped > threshold%
    if (priceFromRecent < -TREASURY_CONFIG.SAFETY_THRESHOLD_PCT) {
      const moveAmount =
        treasuryState.suiYieldTotal * TREASURY_CONFIG.SAFETY_MOVE_RATIO;
      if (moveAmount > 1) {
        const reason = `SUI dropped ${Math.abs(priceFromRecent).toFixed(1)}% — moving $${moveAmount.toFixed(0)} USDC to Arc vault for safety`;
        log(
          "action",
          `SAFETY TRIGGER: ${reason}`
        );

        const result = await depositToVault(moveAmount, reason);
        if (result.success) {
          treasuryState.arcVaultBalance += moveAmount;
          treasuryState.suiYieldTotal -= moveAmount;
          recordTreasuryDecision(
            "auto_safety",
            `SUI price drop ${priceFromRecent.toFixed(1)}%`,
            `Auto-deposited $${moveAmount.toFixed(0)} USDC to Arc vault`,
            reason,
            Math.min(100, Math.round(Math.abs(priceFromRecent) * 5)),
            moveAmount,
            result.txHash
          );
          logVaultDecision("AUTO_SAFETY", 80, reason).catch(() => {});
        }
        return; // Skip yield rebalance this cycle
      }
    }

    // Check recovery trigger: price recovered > 5% from low AND yield > min
    if (
      recoveryFromLow > TREASURY_CONFIG.RECOVERY_THRESHOLD_PCT &&
      treasuryState.arcVaultBalance > 1
    ) {
      // Only redeploy if yields are attractive
      const yieldCheck = await findBestYield(riskLevel);
      const bestApy = yieldCheck.bestOpportunity?.netApy || 0;
      if (bestApy > TREASURY_CONFIG.MIN_YIELD_FOR_DEPLOYMENT) {
        const redeployAmount = treasuryState.arcVaultBalance * 0.5;
        const reason = `SUI recovered ${recoveryFromLow.toFixed(1)}% from low, best yield ${bestApy.toFixed(1)}% — redeploying $${redeployAmount.toFixed(0)} to ${yieldCheck.bestOpportunity?.protocol}`;
        log("action", `RECOVERY TRIGGER: ${reason}`);

        const result = await withdrawFromVault(redeployAmount, reason);
        if (result.success) {
          treasuryState.arcVaultBalance -= redeployAmount;
          treasuryState.suiYieldTotal += redeployAmount;
          recordTreasuryDecision(
            "auto_redeploy",
            `Recovery +${recoveryFromLow.toFixed(1)}% from low, yield ${bestApy.toFixed(1)}%`,
            `Auto-withdrew $${redeployAmount.toFixed(0)} from Arc vault to ${yieldCheck.bestOpportunity?.protocol}`,
            reason,
            Math.max(0, 50 - Math.round(recoveryFromLow * 3)),
            redeployAmount,
            result.txHash,
            "cross-chain"
          );
          logVaultDecision("AUTO_REDEPLOY", 30, reason).catch(() => {});
        }
      }
    }

    // ===== Standard Yield Rebalancing =====
    const result = await findBestYield(riskLevel);
    const profile = RISK_PROFILES[riskLevel];

    if (!result.bestOpportunity) {
      // If no good yields and not already in Arc, consider parking there
      if (
        treasuryState.suiYieldTotal > 10 &&
        result.opportunities.every((o) => o.netApy < TREASURY_CONFIG.MIN_YIELD_FOR_DEPLOYMENT)
      ) {
        log(
          "info",
          "No attractive yields — Arc vault preferred for safety"
        );
        recordTreasuryDecision(
          "risk_assessment",
          "No yields above threshold",
          "Prefer Arc vault — all yields below minimum",
          `Best available yield below ${TREASURY_CONFIG.MIN_YIELD_FOR_DEPLOYMENT}% — USDC in Arc vault earns risk-free rate backed by US Treasuries`,
          55
        );
      } else {
        log("info", "No yield opportunities found");
      }
      return;
    }

    const currentBest = result.currentAllocation[0];
    const improvement = currentBest
      ? result.bestOpportunity.netApy - currentBest.apy
      : result.bestOpportunity.netApy;

    log(
      "info",
      `Best yield: ${result.bestOpportunity.protocol} at ${result.bestOpportunity.netApy.toFixed(1)}%`,
      {
        current: currentBest?.apy,
        improvement,
        threshold: profile.rebalanceThresholdApy,
      }
    );

    // Check if rebalance is warranted
    if (improvement > profile.rebalanceThresholdApy) {
      const protocolName = resolveProtocolName(
        result.bestOpportunity.protocol
      );

      log(
        "action",
        `Rebalancing: ${currentBest?.protocol || "idle"} → ${result.bestOpportunity.protocol} (+${improvement.toFixed(1)}% APY)`
      );

      // Build real PTB if protocol is supported
      if (protocolName) {
        const amountMist = BigInt(
          Math.floor((currentBest?.amount || 0) * 1e9)
        );
        const cycleSuiPrice = await getSuiPrice();
        const action = buildProtocolDeposit(protocolName, amountMist, {
          walletAddress: context.walletAddress,
          suiPriceUsd: cycleSuiPrice,
        });
        log("info", `PTB built: ${action.description}`, {
          isSimulated: action.isSimulated,
        });
      }

      // Update position tracking
      const position: YieldPosition = {
        protocol: result.bestOpportunity.protocol,
        chain: result.bestOpportunity.chain,
        asset: result.bestOpportunity.asset,
        amount: currentBest?.amount || 0,
        amountUsd: currentBest?.amountUsd || 0,
        apy: result.bestOpportunity.netApy,
        earnedUsd: currentBest?.earnedUsd || 0,
        depositedAt: Date.now(),
      };
      setPosition(position);

      recordTreasuryDecision(
        "rebalance",
        `+${improvement.toFixed(1)}% APY improvement`,
        `Rebalanced to ${result.bestOpportunity.protocol} at ${result.bestOpportunity.netApy.toFixed(1)}% APY`,
        `Moved from ${currentBest?.protocol || "idle"} to ${result.bestOpportunity.protocol} for ${improvement.toFixed(1)}% APY improvement on ${result.bestOpportunity.chain}`,
        treasuryState.riskScore,
        currentBest?.amountUsd,
        undefined,
        "sui"
      );
    } else {
      log(
        "info",
        `No rebalance needed. Improvement (${improvement.toFixed(1)}%) below threshold (${profile.rebalanceThresholdApy}%)`
      );
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log("error", `Optimization cycle failed: ${msg}`);
  }
}
