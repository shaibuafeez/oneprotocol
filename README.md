# DARA — Autonomous AI Treasury Agent

DARA is a voice-controlled AI agent that autonomously manages a cross-chain DeFi treasury across **Sui** and **Arc**. It monitors real-time market signals, computes risk scores, and rebalances capital between high-yield DeFi protocols and RWA-backed safety — all through natural voice conversation.

## What It Does

- **Voice-first interface** — Talk to DARA using natural language. "Assess treasury risk", "Move funds to Arc vault", "What's the best yield right now?"
- **Autonomous rebalancing** — A 60-second optimization loop monitors SUI price, Bluefin funding rates, and lending yields. When markets turn volatile, DARA moves USDC to the Arc vault (backed by US Treasuries). When conditions recover, it redeploys to Sui yield protocols.
- **On-chain decision logging** — Every autonomous decision is recorded on-chain on Arc with the exact reasoning, risk score, and trigger signal. Fully transparent and auditable.
- **Cross-chain treasury** — Arc for safety (RWA-backed USDC), Sui for growth (Scallop, NAVI, DeepBook, Bluefin).

## Architecture

```
Voice / Auto-Optimizer (60s loop)
       |
       v
 Risk Assessment Engine
 (SUI price + Bluefin funding + DeFi yields)
       |
       v  risk score 0-100
 Decision Engine:
   HIGH risk  --> deposit USDC to Arc vault (US Treasury backed)
   LOW risk   --> withdraw from Arc --> deploy to Sui yield
       |
       v
 On-chain execution + decision logging
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Recharts, Framer Motion |
| Voice AI | Google Gemini Live API (`@google/genai` SDK) via WebSocket |
| Sui | `@mysten/sui` v2, `@mysten/dapp-kit` |
| Arc | Viem (wallet + public client), custom Solidity vault |
| Protocols | Scallop, NAVI Protocol, DeepBook V3, Bluefin Perpetuals |
| Bridge | LI.FI SDK |
| Data | DeFi Llama, CoinGecko, Bluefin REST API |

## Smart Contracts

### DaraVault (Arc Testnet)
- **Address**: `0xC3DA739E2Ae2F037Ed60d387Df5d23148a72cB1B`
- **Explorer**: [View on ArcScan](https://testnet.arcscan.app/address/0xC3DA739E2Ae2F037Ed60d387Df5d23148a72cB1B)
- Functions: `deposit`, `withdraw`, `logDecision`, `treasuryHealth`, `getRecentDecisions`
- Built with Foundry, deployed via `cast send --create`

### Vault (Sui Move)
- Move module at `contracts/sources/vault.move`

## Getting Started

### Prerequisites
- Node.js 18+
- A Sui wallet (for connecting to the frontend)
- Google Gemini API key (for voice agent)

### Environment Variables

Create `.env.local`:

```env
GOOGLE_GEMINI_API_KEY=your_gemini_key
DARA_WS_PORT=3001

# Arc Agentic Commerce (Testnet)
ARC_AGENT_PRIVATE_KEY=0x_your_private_key
NEXT_PUBLIC_ARC_VAULT_ADDRESS=0xC3DA739E2Ae2F037Ed60d387Df5d23148a72cB1B
```

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — connect your Sui wallet, then navigate to the **Agent** tab to start a voice session.

The WebSocket server starts automatically on port 3001 (handles Gemini Live API sessions server-side so the API key never reaches the browser).

## Project Structure

```
src/
  agent/
    executor.ts          # Maps voice commands to on-chain actions
    functions.ts         # Gemini function declarations + system prompt
    arc-client.ts        # Arc vault interactions (viem)
    sui-client.ts        # Sui RPC client
    lifi-client.ts       # LI.FI bridge routing
    yield-scanner.ts     # DeFi Llama yield aggregation
    strategy.ts          # Portfolio strategy engine
    protocols/           # Scallop, NAVI, DeepBook, Bluefin
  app/
    page.tsx             # Dashboard with yield opportunities
    agent/page.tsx       # Voice agent interface
    vault/page.tsx       # Portfolio allocation view
    treasury/page.tsx    # Arc treasury + decision timeline
    api/treasury/        # Server-side treasury state API
  components/
    VoiceAgent.tsx       # Real-time voice UI
    ArcVaultStatus.tsx   # Arc vault balance + risk gauge
    TreasuryDecisionTimeline.tsx  # Agent decision log
    YieldDashboard.tsx   # Cross-chain yield scanner
  server/
    ws-server.ts         # Gemini Live API WebSocket proxy
contracts/
  DaraVault.sol          # Solidity vault for Arc
  foundry/               # Foundry project for Arc deployment
  sources/vault.move     # Sui Move vault module
```

## Key Pages

| Route | Description |
|-------|-------------|
| `/` | Portfolio dashboard — yield opportunities, oracle prices, agent status |
| `/agent` | Voice agent — talk to DARA, execute DeFi operations by voice |
| `/vault` | Vault — asset allocation, live earnings ticker, positions |
| `/treasury` | Treasury — Arc vault status, risk score, decision timeline |
| `/bridge` | Cross-chain bridge monitor |
| `/swap` | Token swap interface |
| `/perps` | Perpetual futures (Bluefin) |

## Hackathon Prizes Targeted

- **Sui** — AI yield optimizer across Scallop, NAVI, DeepBook
- **Arc** — Agentic commerce with RWA-backed USDC vault, on-chain decision logging
- **LI.FI** — Cross-chain bridge integration for multi-chain treasury

## Demo Flow

1. Open Treasury page — see live Arc vault balance and risk gauge
2. "DARA, assess treasury risk" — agent analyzes prices, funding rates, yields
3. "Move 40% to Arc vault for safety" — executes deposit, timeline updates
4. Auto-optimizer detects recovery — rebalances back to Sui yield
5. "What's our treasury status?" — full cross-chain report with reasoning

## License

MIT
