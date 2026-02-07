"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCurrentAccount, useCurrentWallet } from "@mysten/dapp-kit";
import type { Route } from "@lifi/types";
import type { RouteExtended } from "@lifi/sdk";
import {
  initLifi,
  getSwapRoutes,
  executeBridgeRoute,
  SUI_CHAIN_ID,
  SUI_TOKENS,
} from "@/agent/lifi-client";

interface RouteQuote {
  route: Route;
  gasCostUSD?: string;
  estimatedTime?: number;
  outputAmount?: string;
  outputSymbol?: string;
  outputDecimals?: number;
  steps?: Array<{ tool: string; type: string }>;
}

type BridgeStatus =
  | "idle"
  | "quoting"
  | "quoted"
  | "executing"
  | "waiting"
  | "done"
  | "failed";

const DEST_CHAINS = [
  { id: 42161, name: "Arbitrum", icon: "ARB" },
  { id: 10, name: "Optimism", icon: "OP" },
  { id: 8453, name: "Base", icon: "BASE" },
  { id: 1, name: "Ethereum", icon: "ETH" },
];

const SOURCE_TOKENS = [
  { symbol: "SUI", address: SUI_TOKENS.SUI, decimals: 9 },
  { symbol: "USDC", address: SUI_TOKENS.USDC, decimals: 6 },
];

// Destination token addresses per chain
const DEST_TOKENS: Record<string, Record<number, string>> = {
  USDC: {
    42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  ETH: {
    42161: "0x0000000000000000000000000000000000000000",
    10: "0x0000000000000000000000000000000000000000",
    8453: "0x0000000000000000000000000000000000000000",
    1: "0x0000000000000000000000000000000000000000",
  },
  USDT: {
    42161: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    10: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    8453: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
};

const DEST_TOKEN_OPTIONS = ["USDC", "ETH", "USDT"];

export function CrossChainPanel() {
  const account = useCurrentAccount();
  const { currentWallet, connectionStatus } = useCurrentWallet();

  const [amount, setAmount] = useState("");
  const [sourceToken, setSourceToken] = useState(SOURCE_TOKENS[0]);
  const [destChain, setDestChain] = useState(DEST_CHAINS[0]);
  const [destToken, setDestToken] = useState("USDC");
  const [destAddress, setDestAddress] = useState("");
  const [quote, setQuote] = useState<RouteQuote | null>(null);
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [executionSteps, setExecutionSteps] = useState<string[]>([]);

  const lifiInitialized = useRef(false);

  // Initialize LI.FI with Sui wallet provider
  useEffect(() => {
    if (connectionStatus === "connected" && currentWallet && !lifiInitialized.current) {
      // Cast needed: dapp-kit and @lifi/sdk bundle different @mysten/wallet-standard copies
      initLifi(async () => currentWallet as any);
      lifiInitialized.current = true;
    }
  }, [connectionStatus, currentWallet]);

  // Validate EVM address (0x + 40 hex chars)
  const isValidEvmAddress = (addr: string) =>
    /^0x[0-9a-fA-F]{40}$/.test(addr);

  // Get quote
  const fetchQuote = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0 || !account?.address) return;

    // Require valid EVM destination address
    if (!destAddress || !isValidEvmAddress(destAddress)) {
      setError("Enter a valid EVM address (0x... 42 characters)");
      return;
    }

    setStatus("quoting");
    setError(null);
    setQuote(null);
    setTxHash(null);
    setExecutionSteps([]);

    try {
      const decimals = sourceToken.decimals;
      const amountRaw = (parseFloat(amount) * 10 ** decimals).toFixed(0);

      const destTokenAddress =
        DEST_TOKENS[destToken]?.[destChain.id] ||
        DEST_TOKENS.USDC[destChain.id] ||
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

      const routes = await getSwapRoutes({
        fromChainId: SUI_CHAIN_ID,
        toChainId: destChain.id,
        fromTokenAddress: sourceToken.address,
        toTokenAddress: destTokenAddress,
        fromAmount: amountRaw,
        fromAddress: account.address,
        toAddress: destAddress,
      });

      if (routes.length > 0) {
        const best = routes[0];
        setQuote({
          route: best,
          gasCostUSD: best.gasCostUSD,
          estimatedTime: best.steps?.reduce(
            (sum: number, s: { estimate?: { executionDuration?: number } }) =>
              sum + (s.estimate?.executionDuration || 0),
            0
          ),
          outputAmount: best.toAmountMin,
          outputSymbol: best.toToken?.symbol,
          outputDecimals: best.toToken?.decimals,
          steps: best.steps?.map(
            (s: { toolDetails?: { name?: string }; type?: string }) => ({
              tool: s.toolDetails?.name || "Unknown",
              type: s.type || "unknown",
            })
          ),
        });
        setStatus("quoted");
      } else {
        setError("No routes available for this pair. Try USDC → USDC or a larger amount.");
        setStatus("idle");
      }
    } catch (e) {
      const msg = (e as Error).message || String(e);
      // Extract useful info from LI.FI SDK errors
      if (msg.includes("Invalid address")) {
        setError("Invalid destination address. Use a valid EVM address (0x...).");
      } else if (msg.includes("400")) {
        setError("Route not available. Try a different token pair or chain.");
      } else {
        setError(msg);
      }
      setStatus("idle");
    }
  }, [amount, sourceToken, destChain, destToken, destAddress, account?.address]);

  // Execute bridge
  const executeBridge = async () => {
    if (!quote?.route || !account?.address) return;

    setStatus("executing");
    setError(null);
    setExecutionSteps(["Preparing transaction..."]);

    try {
      const result = await executeBridgeRoute(
        quote.route,
        (updatedRoute: RouteExtended) => {
          const steps: string[] = [];
          for (const step of updatedRoute.steps) {
            if (step.execution) {
              for (const process of step.execution.process) {
                let msg: string = process.type || "Processing";
                if (process.status === "DONE") msg += " - Done";
                else if (process.status === "FAILED") msg += " - Failed";
                else if (process.status === "ACTION_REQUIRED")
                  msg = "Sign in your wallet...";
                else if (process.status === "PENDING") msg += " - Pending...";
                if (process.txHash) {
                  setTxHash(process.txHash);
                }
                steps.push(msg);
              }
              if (step.execution.status === "DONE") {
                setStatus("done");
              } else if (step.execution.status === "FAILED") {
                setStatus("failed");
              } else if (step.execution.status === "PENDING") {
                setStatus("waiting");
              }
            }
          }
          setExecutionSteps(steps.length > 0 ? steps : ["Processing..."]);
        }
      );

      // Final status
      const lastStep = result.steps[result.steps.length - 1];
      if (lastStep?.execution?.status === "DONE") {
        setStatus("done");
        if (lastStep.execution.toAmount) {
          setExecutionSteps((prev) => [
            ...prev,
            `Received ${formatTokenAmount(lastStep.execution!.toAmount!, lastStep.action?.toToken?.decimals || 6)} ${lastStep.action?.toToken?.symbol || "tokens"}`,
          ]);
        }
      } else {
        setStatus("done");
      }
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("rejected") ? "Transaction rejected" : msg);
      setStatus("failed");
    }
  };

  const formatTokenAmount = (raw: string, decimals: number) => {
    const num = Number(raw) / 10 ** decimals;
    return num < 0.01 ? num.toFixed(6) : num.toFixed(2);
  };

  const statusColor = {
    idle: "text-slate-500",
    quoting: "text-yellow-400",
    quoted: "text-cyan-400",
    executing: "text-yellow-400",
    waiting: "text-yellow-400",
    done: "text-emerald-400",
    failed: "text-red-400",
  };

  return (
    <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-white">Bridge</h3>
        <span className={`text-[10px] font-mono ${statusColor[status]}`}>
          {status === "idle"
            ? "Ready"
            : status === "quoting"
              ? "Finding routes..."
              : status === "quoted"
                ? "Route found"
                : status === "executing"
                  ? "Signing..."
                  : status === "waiting"
                    ? "Bridging..."
                    : status === "done"
                      ? "Complete"
                      : "Failed"}
        </span>
      </div>

      {/* Source: Sui */}
      <div className="mx-6 p-5 bg-black/30 rounded-xl border border-white/5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            From Sui
          </span>
          <div className="flex gap-1">
            {SOURCE_TOKENS.map((t) => (
              <button
                key={t.symbol}
                onClick={() => {
                  setSourceToken(t);
                  setQuote(null);
                  setStatus("idle");
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                  sourceToken.symbol === t.symbol
                    ? "bg-white/10 text-white border border-white/10"
                    : "text-slate-500 hover:text-white/50"
                }`}
              >
                {t.symbol}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, "");
              if (v.split(".").length <= 2) {
                setAmount(v);
                setQuote(null);
                setStatus("idle");
              }
            }}
            placeholder="0.0"
            className="flex-1 bg-transparent text-3xl font-bold text-white placeholder-slate-600 focus:outline-none min-w-0"
          />
          <div className="flex items-center gap-2 px-3 py-2 bg-white/10 border border-white/10 rounded-full shrink-0">
            <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400">
              S
            </div>
            <span className="text-sm font-medium text-white">
              {sourceToken.symbol}
            </span>
          </div>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center -my-3.5 relative z-10">
        <div className="w-10 h-10 rounded-full bg-black/80 border border-white/10 flex items-center justify-center text-slate-400 shadow-lg">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </div>
      </div>

      {/* Destination */}
      <div className="mx-6 p-5 bg-black/30 rounded-xl border border-white/5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            To
          </span>
        </div>

        {/* Chain selector */}
        <div className="flex gap-2 mb-3">
          {DEST_CHAINS.map((chain) => (
            <button
              key={chain.id}
              onClick={() => {
                setDestChain(chain);
                setQuote(null);
                setStatus("idle");
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                destChain.id === chain.id
                  ? "bg-white/10 text-white border border-white/10"
                  : "bg-white/5 text-slate-500 hover:text-white/50 border border-transparent"
              }`}
            >
              {chain.icon}
            </button>
          ))}
        </div>

        {/* Token selector */}
        <div className="flex gap-1 mb-4">
          {DEST_TOKEN_OPTIONS.map((token) => (
            <button
              key={token}
              onClick={() => {
                setDestToken(token);
                setQuote(null);
                setStatus("idle");
              }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                destToken === token
                  ? "bg-white/10 text-white border border-white/10"
                  : "text-slate-500 hover:text-white/50"
              }`}
            >
              {token}
            </button>
          ))}
        </div>

        {/* Dest address */}
        <input
          type="text"
          value={destAddress}
          onChange={(e) => setDestAddress(e.target.value)}
          placeholder="Destination address (0x...)"
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-white/20 font-mono"
        />

        {/* Quote output */}
        {quote && (
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {quote.outputAmount
                ? formatTokenAmount(
                    quote.outputAmount,
                    quote.outputDecimals || 6
                  )
                : "—"}
            </span>
            <span className="text-sm text-slate-400">
              {quote.outputSymbol || "USDC"}
            </span>
            <span className="text-[10px] text-slate-600 ml-auto">
              on {destChain.name}
            </span>
          </div>
        )}
      </div>

      {/* Route details */}
      {quote && (
        <div className="mx-6 mt-4 p-4 bg-black/20 rounded-xl border border-white/5 space-y-2">
          {quote.gasCostUSD && (
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Gas Cost</span>
              <span className="text-slate-300 font-mono">
                ${parseFloat(quote.gasCostUSD).toFixed(4)}
              </span>
            </div>
          )}
          {quote.estimatedTime && (
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Est. Time</span>
              <span className="text-slate-300 font-mono">
                ~{Math.ceil(quote.estimatedTime / 60)} min
              </span>
            </div>
          )}
          {quote.steps && quote.steps.length > 0 && (
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Route</span>
              <span className="text-cyan-400 font-mono truncate max-w-[60%] text-right">
                {quote.steps.map((s) => s.tool).join(" → ")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Execution progress */}
      {executionSteps.length > 0 &&
        (status === "executing" ||
          status === "waiting" ||
          status === "done" ||
          status === "failed") && (
          <div className="mx-6 mt-4 p-4 bg-black/20 rounded-xl border border-white/5">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
              Progress
            </p>
            <div className="space-y-1.5">
              {executionSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  {status === "done" && i === executionSteps.length - 1 ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  ) : status === "failed" && i === executionSteps.length - 1 ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  )}
                  <span className="text-slate-300">{step}</span>
                </div>
              ))}
            </div>
            {txHash && (
              <a
                href={`https://suiscan.xyz/mainnet/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-cyan-400 hover:text-cyan-300 mt-2 inline-block font-mono"
              >
                View tx: {txHash.slice(0, 10)}...
              </a>
            )}
          </div>
        )}

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 bg-red-900/20 border border-red-500/20 rounded-xl">
          <p className="text-[11px] text-red-400">{error}</p>
        </div>
      )}

      {/* Action button */}
      <div className="p-6">
        {!account ? (
          <div className="w-full py-4 bg-white/5 text-slate-500 rounded-xl text-base font-medium text-center border border-white/5">
            Connect wallet to bridge
          </div>
        ) : status === "done" ? (
          <button
            onClick={() => {
              setStatus("idle");
              setAmount("");
              setQuote(null);
              setTxHash(null);
              setExecutionSteps([]);
            }}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-base font-bold transition-all"
          >
            Bridge Complete — New Transfer
          </button>
        ) : status === "executing" || status === "waiting" ? (
          <div className="w-full py-4 bg-white/5 text-yellow-400 rounded-xl text-base font-medium text-center border border-white/5 flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
            {status === "executing" ? "Sign in wallet..." : "Bridging..."}
          </div>
        ) : quote ? (
          <button
            onClick={executeBridge}
            disabled={!destAddress}
            className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 text-white disabled:text-slate-500 rounded-xl text-base font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.2)]"
          >
            {destAddress ? "Execute Bridge" : "Enter destination address"}
          </button>
        ) : (
          <button
            onClick={fetchQuote}
            disabled={!amount || parseFloat(amount) <= 0 || !destAddress || status === "quoting"}
            className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 text-white disabled:text-slate-500 rounded-xl text-base font-bold transition-all shadow-[0_0_20px_rgba(6,182,212,0.2)]"
          >
            {status === "quoting" ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Finding routes...
              </span>
            ) : !destAddress ? (
              "Enter destination address"
            ) : (
              "Get Quote"
            )}
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 pb-5 flex items-center justify-center gap-1.5">
        <span className="text-[9px] text-slate-600">Powered by</span>
        <span className="text-[9px] text-slate-400 font-medium">
          LI.FI Protocol
        </span>
      </div>
    </div>
  );
}
