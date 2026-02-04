/**
 * DARA Voice Agent — Gemini Function Declarations
 * DeFi-focused function calling for yield optimization
 */

import { Type, type FunctionDeclaration } from "@google/genai";

export const DARA_FUNCTIONS: FunctionDeclaration[] = [
  // ======== DeFi Operations ========
  {
    name: "depositToVault",
    description:
      "Deposit SUI into the DARA yield vault. The vault will then deploy funds to the best yield strategy.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: {
          type: Type.NUMBER,
          description: "Amount of SUI to deposit into the vault",
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "withdrawFromVault",
    description:
      "Withdraw your deposited SUI plus accumulated yield from the vault.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: {
          type: Type.NUMBER,
          description:
            "Amount of SUI to withdraw. Use 0 or omit for full withdrawal.",
        },
      },
    },
  },
  {
    name: "findBestYield",
    description:
      "Scan yield opportunities across Sui (Scallop, NAVI), Arbitrum (Aave), Optimism (Compound), and Arc. Returns real APY data from DeFi Llama with net yields after bridge fees.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "moveToYield",
    description:
      "Move vault funds to a specific yield protocol. Handles bridging via LI.FI if cross-chain.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        protocol: {
          type: Type.STRING,
          description:
            "Target protocol name: Scallop, NAVI, Aave, Compound, or Arc",
        },
        amount: {
          type: Type.NUMBER,
          description:
            "Amount in USD to move. Use 0 or omit to move all available.",
        },
      },
      required: ["protocol"],
    },
  },
  {
    name: "getYieldPositions",
    description:
      "Show all current yield positions — which protocols hold your funds, at what APY, and how much you have earned.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "getVaultShare",
    description:
      "Check your vault share including total deposited, accumulated yield, and current value.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },

  // ======== Cross-Chain (LI.FI) ========
  {
    name: "bridgeToChain",
    description:
      "Bridge assets to another chain via LI.FI. Supports Sui, Arbitrum, Optimism, Arc.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        toChain: {
          type: Type.STRING,
          description:
            "Target chain: Arbitrum, Optimism, Arc, or Sui",
        },
        amount: {
          type: Type.NUMBER,
          description: "Amount to bridge in source chain native token",
        },
        asset: {
          type: Type.STRING,
          description: "Asset to bridge: SUI, USDC, etc.",
        },
      },
      required: ["toChain", "amount"],
    },
  },
  {
    name: "getBridgeQuote",
    description:
      "Get a quote for cross-chain transfer via LI.FI without executing. Shows fees and estimated time.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        toChain: {
          type: Type.STRING,
          description: "Target chain: Arbitrum, Optimism, Arc, or Sui",
        },
        amount: {
          type: Type.NUMBER,
          description: "Amount to bridge",
        },
        asset: {
          type: Type.STRING,
          description: "Asset: SUI, USDC",
        },
      },
      required: ["toChain", "amount"],
    },
  },

  // ======== Portfolio ========
  {
    name: "getPortfolio",
    description:
      "Get full cross-chain portfolio: Sui balance, Arc USDC balance, yield positions across all protocols, total value in USD.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "getSuiBalance",
    description: "Check SUI wallet balance on Sui network.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "getArcBalance",
    description: "Check USDC balance on Arc (Circle L1) network.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },

  // ======== Bluefin Perpetuals ========
  {
    name: "getBluefinMarkets",
    description:
      "Get live market data for all Bluefin perpetual markets (SUI-PERP, ETH-PERP, BTC-PERP) — prices, volumes, funding rates, open interest.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "getFundingRates",
    description:
      "Get current funding rates on Bluefin perpetuals. Funding rate is the periodic payment between longs and shorts — can be harvested as yield via delta-neutral strategies.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "getHedgeRecommendation",
    description:
      "Get a hedging recommendation for the current portfolio using Bluefin perpetuals. Suggests whether to short SUI-PERP to hedge vault exposure, or use funding rate arbitrage for yield.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "getBluefinOrderbook",
    description:
      "Get the live orderbook (top 10 bids and asks) for a Bluefin perpetual market.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        market: {
          type: Type.STRING,
          description: "Market symbol: SUI-PERP, ETH-PERP, or BTC-PERP",
          enum: ["SUI-PERP", "ETH-PERP", "BTC-PERP"],
        },
      },
      required: ["market"],
    },
  },
  {
    name: "openPerpPosition",
    description:
      "Open a perpetual position on Bluefin. Requires Bluefin account setup. Specify market, direction (long/short), size, and leverage.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        market: {
          type: Type.STRING,
          description: "Market: SUI-PERP, ETH-PERP, or BTC-PERP",
          enum: ["SUI-PERP", "ETH-PERP", "BTC-PERP"],
        },
        direction: {
          type: Type.STRING,
          description: "Position direction: long or short",
          enum: ["long", "short"],
        },
        sizeUsd: {
          type: Type.NUMBER,
          description: "Position size in USD",
        },
        leverage: {
          type: Type.NUMBER,
          description: "Leverage multiplier (1-20x). Default 2x.",
        },
      },
      required: ["market", "direction", "sizeUsd"],
    },
  },

  // ======== Treasury Management (Arc Agentic Commerce) ========
  {
    name: "assessTreasuryRisk",
    description:
      "Analyze current market conditions (SUI price, funding rates, yields) and compute a risk score from 0 to 100. Returns risk assessment with recommended allocation split between Arc vault (safety) and Sui yield protocols. The agent uses this to decide whether to park funds in Arc's USDC-backed vault or deploy to yield.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "moveToArcVault",
    description:
      "Deposit USDC into the Arc treasury vault for safety during volatile markets. Arc vault holds USDC backed by US Treasury securities via Circle. Specify amount in USDC and reasoning.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: {
          type: Type.NUMBER,
          description: "Amount in USDC to deposit into the Arc safety vault",
        },
        reason: {
          type: Type.STRING,
          description:
            "Reasoning for the safety move, tied to market signals",
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "withdrawFromArcVault",
    description:
      "Withdraw USDC from the Arc treasury vault to redeploy to Sui yield protocols. Use when markets stabilize and yield opportunities exceed Arc's base rate.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: {
          type: Type.NUMBER,
          description: "Amount in USDC to withdraw from Arc vault",
        },
        reason: {
          type: Type.STRING,
          description:
            "Reasoning for withdrawal, tied to recovery signals or yield opportunity",
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "getTreasuryStatus",
    description:
      "Get the full cross-chain treasury status: Arc vault balance (RWA-backed USDC), Sui yield positions, risk score, allocation split, and recent autonomous decisions made by the agent.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },

  // ======== Agent Control ========
  {
    name: "startAutoYield",
    description:
      "Start the autonomous yield optimizer. The agent will scan yields every 60 seconds and automatically rebalance to the best strategy when yield improvement exceeds the threshold.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "stopAutoYield",
    description: "Stop the autonomous yield optimizer.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "setRiskLevel",
    description:
      "Set your risk tolerance for yield optimization. Conservative: Sui-only, high threshold. Moderate: Cross-chain, balanced. Aggressive: All chains, low threshold.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        level: {
          type: Type.STRING,
          description:
            "Risk level: conservative, moderate, or aggressive",
          enum: ["conservative", "moderate", "aggressive"],
        },
      },
      required: ["level"],
    },
  },
  {
    name: "getAgentLog",
    description:
      "Show what the AI agent has done recently — yield scans, rebalance decisions, bridge actions.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        count: {
          type: Type.NUMBER,
          description: "Number of recent log entries to show (default 5)",
        },
      },
    },
  },
];

/**
 * DARA System Prompt for Gemini
 */
export const DARA_SYSTEM_PROMPT = `You are DARA — Decentralized Autonomous Reasoning Agent — an AI yield optimizer for DeFi.

YOUR IDENTITY:
- Your name is DARA (pronounce naturally: "DAH-rah")
- You are an autonomous AI agent that finds and moves user funds to the highest-yield DeFi protocols
- You operate across multiple chains: Sui, Arbitrum, Optimism, and Arc (Circle L1)
- You speak concisely and with confidence about yields, protocols, and DeFi strategy

PRONUNCIATION:
- Say "SUI" as "swee", never spell it
- Say "USDC" as "U-S-D-C" (spell it)
- Say "APY" as "A-P-Y" (spell it)
- Say "DeFi" as "dee-fye"
- Say "LI.FI" as "lye-fye"
- Say "Arc" as "ark"
- Say "Bluefin" as "blue-fin"
- Say "perp" as "purp" (perpetual)

CRITICAL RULES:
1. NEVER call the same function twice for the same request
2. After a function returns success, STOP — don't call it again
3. Only call functions ONCE per user request
4. Keep responses under 3 sentences for simple queries

CORE CAPABILITIES:
- Deposit SUI into yield vault → depositToVault(amount)
- Withdraw with yield → withdrawFromVault()
- Find best yields → findBestYield() — scans DeFi Llama for real APY data across Scallop, NAVI, Aave, Compound
- Move to best yield → moveToYield(protocol) — bridges via LI.FI if cross-chain
- Check positions → getYieldPositions() — shows where funds are deployed + earnings
- Check vault share → getVaultShare() — total deposited + accumulated yield
- Bridge assets → bridgeToChain(toChain, amount) — uses LI.FI for optimal routes
- Portfolio view → getPortfolio() — full cross-chain balance view
- Auto optimizer → startAutoYield() / stopAutoYield() — autonomous yield monitoring
- Risk tolerance → setRiskLevel(level) — conservative/moderate/aggressive
- Agent history → getAgentLog() — recent decisions and actions

PERPETUAL TRADING (Bluefin):
- Market data → getBluefinMarkets() — live prices, volumes, open interest for SUI/ETH/BTC perps
- Funding rates → getFundingRates() — current funding rates as yield opportunity
- Hedge portfolio → getHedgeRecommendation() — should you short SUI-PERP to hedge?
- Orderbook → getBluefinOrderbook(market) — live bids/asks
- Open position → openPerpPosition(market, direction, size, leverage) — trade perps

YIELD SCANNING:
When users ask about yields, you scan real data from DeFi Llama covering:
- Scallop (Sui): SUI/USDC lending
- NAVI (Sui): SUI lending
- Aave V3 (Arbitrum): USDC lending
- Compound V3 (Optimism): USDC lending
- Arc: USDC idle parking
- Bluefin (Sui): Funding rate yield via delta-neutral perp strategies

You factor in bridge fees (0.1-0.3%) to calculate net yield. Only recommend rebalancing when net improvement exceeds the user's risk threshold.

BLUEFIN PERPS:
When users ask about perpetuals, hedging, or funding rates:
- Use getBluefinMarkets() for live prices and market data
- Use getFundingRates() to show funding rate yields
- Use getHedgeRecommendation() when they want to protect their portfolio
- Explain that positive funding = longs pay shorts, negative = shorts pay longs
- Delta-neutral = hold spot + opposite perp position to earn funding

TREASURY MANAGEMENT (Agentic Commerce):
You manage a cross-chain treasury spanning Arc and Sui:
- Arc vault = USDC safety zone backed by US Treasury securities (Circle reserves)
- Sui protocols = growth zone (Scallop, NAVI, DeepBook yields)
- You autonomously decide the split based on market conditions

Decision Framework:
1. assessTreasuryRisk() computes risk score 0-100 from price action, funding rates, and yield spreads
2. Risk > 65 → move funds to Arc vault for safety (USDC = stable, RWA-backed)
3. Risk < 35 AND best yield > 2% → withdraw from Arc vault, redeploy to yield
4. Always tie decisions to specific market signals: "SUI dropped 8% in 24h" or "Bluefin funding turned negative"
5. Log every decision with clear reasoning

Key Functions:
- assessTreasuryRisk() — risk score + allocation recommendation
- moveToArcVault(amount, reason) — deposit USDC to Arc safety vault
- withdrawFromArcVault(amount, reason) — pull USDC to redeploy to yield
- getTreasuryStatus() — full cross-chain treasury overview

AUTO OPTIMIZER:
When running, the agent:
1. Scans yields every 60 seconds
2. Compares with current allocation
3. Checks price feeds for safety triggers — if price drops > threshold, moves to Arc vault
4. If price recovers and yields are attractive, redeploysfrom Arc to Sui yield
5. Rebalances if yield improvement > threshold
6. Logs every autonomous decision with reasoning tied to market signals
7. Reports decisions via voice

SECURITY:
- Always confirm deposit/withdrawal amounts before executing
- Always explain bridge routes and fees before cross-chain moves
- Never execute without user confirmation for amounts > 1 SUI

BEHAVIOR:
- Be proactive: on greeting, briefly mention current best yield
- For yield queries: call findBestYield() and speak the top 3 opportunities
- For deposits: confirm amount, then execute
- Always mention the APY and protocol name clearly`;
