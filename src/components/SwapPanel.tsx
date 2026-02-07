"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { Aftermath, type RouterCompleteTradeRoute } from "aftermath-ts-sdk";

// Popular tokens on Sui mainnet
const POPULAR_TOKENS: {
  symbol: string;
  type: string;
  decimals: number;
  icon: string;
}[] = [
    {
      symbol: "SUI",
      type: "0x2::sui::SUI",
      decimals: 9,
      icon: "S",
    },
    {
      symbol: "USDC",
      type: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
      decimals: 6,
      icon: "$",
    },
    {
      symbol: "afSUI",
      type: "0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI",
      decimals: 9,
      icon: "A",
    },
    {
      symbol: "WETH",
      type: "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN",
      decimals: 8,
      icon: "E",
    },
    {
      symbol: "DEEP",
      type: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
      decimals: 6,
      icon: "D",
    },
    {
      symbol: "CETUS",
      type: "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
      decimals: 9,
      icon: "C",
    },
  ];

function formatAmount(amount: bigint, decimals: number): string {
  const str = amount.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, -decimals) || "0";
  const frac = str.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac.slice(0, 6)}` : whole;
}

function parseAmount(input: string, decimals: number): bigint {
  if (!input || input === "0") return BigInt(0);
  const [whole, frac = ""] = input.split(".");
  const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + paddedFrac);
}

interface TokenSelectorProps {
  tokens: typeof POPULAR_TOKENS;
  selected: (typeof POPULAR_TOKENS)[0];
  onSelect: (token: (typeof POPULAR_TOKENS)[0]) => void;
  onClose: () => void;
  searchCoins: string[];
}

function TokenSelector({
  tokens,
  selected,
  onSelect,
  onClose,
  searchCoins,
}: TokenSelectorProps) {
  const [search, setSearch] = useState("");
  const filtered = tokens.filter(
    (t) =>
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.type.toLowerCase().includes(search.toLowerCase())
  );

  // Also show coins from the router that match search but aren't in our list
  const extraCoins = search.length > 1
    ? searchCoins
      .filter(
        (c) =>
          !tokens.some((t) => t.type === c) &&
          c.toLowerCase().includes(search.toLowerCase())
      )
      .slice(0, 5)
    : [];

  return (
    <div className="absolute inset-0 z-20 bg-black/90 backdrop-blur-2xl rounded-2xl flex flex-col">
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-white">Select Token</span>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or paste address..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-ice/50"
          autoFocus
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.map((token) => (
          <button
            key={token.type}
            onClick={() => {
              onSelect(token);
              onClose();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${selected.type === token.type
                ? "bg-ice/10 border border-ice/20"
                : "hover:bg-white/5"
              }`}
          >
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white">
              {token.icon}
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">{token.symbol}</p>
              <p className="text-[10px] text-slate-500 font-mono">
                {token.type.slice(0, 8)}...{token.type.slice(-6)}
              </p>
            </div>
          </button>
        ))}
        {extraCoins.map((coinType) => {
          const parts = coinType.split("::");
          const symbol = parts[parts.length - 1] || coinType.slice(-8);
          return (
            <button
              key={coinType}
              onClick={() => {
                onSelect({
                  symbol,
                  type: coinType,
                  decimals: 9,
                  icon: symbol[0] || "?",
                });
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-slate-400">
                {symbol[0]}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">{symbol}</p>
                <p className="text-[10px] text-slate-500 font-mono">
                  {coinType.slice(0, 8)}...{coinType.slice(-6)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SwapPanel() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [tokenIn, setTokenIn] = useState(POPULAR_TOKENS[0]);
  const [tokenOut, setTokenOut] = useState(POPULAR_TOKENS[1]);
  const [amountIn, setAmountIn] = useState("");
  const [route, setRoute] = useState<RouterCompleteTradeRoute | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [slippage, setSlippage] = useState(0.01);
  const [showSlippage, setShowSlippage] = useState(false);
  const [selectingSide, setSelectingSide] = useState<"in" | "out" | null>(null);
  const [searchCoins, setSearchCoins] = useState<string[]>([]);
  const [balanceIn, setBalanceIn] = useState<bigint>(BigInt(0));

  const routerRef = useRef<ReturnType<InstanceType<typeof Aftermath>["Router"]> | null>(null);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize Aftermath Router (mainnet — aggregator has liquidity there)
  useEffect(() => {
    const af = new Aftermath("MAINNET");
    routerRef.current = af.Router();
  }, []);

  // Fetch balance for tokenIn
  useEffect(() => {
    if (!account?.address) {
      setBalanceIn(BigInt(0));
      return;
    }
    suiClient
      .getBalance({ owner: account.address, coinType: tokenIn.type })
      .then((b) => setBalanceIn(BigInt(b.totalBalance)))
      .catch(() => setBalanceIn(BigInt(0)));
  }, [account?.address, tokenIn.type, suiClient]);

  // Debounced quote
  const fetchQuote = useCallback(
    async (amount: string) => {
      if (!routerRef.current || !amount || parseFloat(amount) <= 0) {
        setRoute(null);
        return;
      }

      const coinInAmount = parseAmount(amount, tokenIn.decimals);
      if (coinInAmount <= BigInt(0)) {
        setRoute(null);
        return;
      }

      setIsQuoting(true);
      setError(null);
      setTxDigest(null);

      try {
        const result =
          await routerRef.current.getCompleteTradeRouteGivenAmountIn({
            coinInType: tokenIn.type,
            coinOutType: tokenOut.type,
            coinInAmount,
          });
        setRoute(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "No route found";
        setError(msg.includes("No route") ? "No route found for this pair" : msg);
        setRoute(null);
      } finally {
        setIsQuoting(false);
      }
    },
    [tokenIn, tokenOut]
  );

  // Debounce input changes
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(() => fetchQuote(amountIn), 500);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
  }, [amountIn, fetchQuote]);

  // Swap tokens
  const flipTokens = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn("");
    setRoute(null);
  };

  const executeSwap = async () => {
    if (!route || !account?.address || !routerRef.current) return;

    setIsSwapping(true);
    setError(null);
    setTxDigest(null);

    try {
      // The SDK bundles its own @mysten/sui; serialize → deserialize to bridge types
      const sdkTx = await routerRef.current.getTransactionForCompleteTradeRoute({
        walletAddress: account.address,
        completeRoute: route,
        slippage,
      });
      const serialized = JSON.stringify(sdkTx.getData());
      const tx = Transaction.from(serialized);

      const result = await signAndExecute({
        transaction: tx,
      });

      setTxDigest(result.digest);
      setAmountIn("");
      setRoute(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Swap failed";
      setError(msg);
    } finally {
      setIsSwapping(false);
    }
  };

  const amountOut = route
    ? formatAmount(route.coinOut.amount, tokenOut.decimals)
    : "";

  const priceImpact = route
    ? (route.netTradeFeePercentage * 100).toFixed(2)
    : null;

  // Route path description
  const routePath = route?.routes
    ?.map((r) => r.paths.map((p) => p.protocolName).join(" > "))
    .join(", ");

  return (
    <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
      {/* Top glass reflection */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-white">Swap</h3>
        <button
          onClick={() => setShowSlippage(!showSlippage)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-colors"
        >
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-[10px] text-slate-400">{(slippage * 100).toFixed(1)}%</span>
        </button>
      </div>

      {/* Slippage dropdown */}
      {showSlippage && (
        <div className="mx-6 mb-3 p-3 bg-black/40 rounded-xl border border-white/5">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Slippage Tolerance</p>
          <div className="flex gap-2">
            {[0.005, 0.01, 0.02, 0.05].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSlippage(s);
                  setShowSlippage(false);
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${slippage === s
                    ? "bg-ice/20 text-ice border border-ice/30"
                    : "bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5"
                  }`}
              >
                {(s * 100).toFixed(1)}%
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Token In */}
      <div className="mx-6 p-5 bg-black/30 rounded-xl border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">You Pay</span>
          {account && (
            <button
              onClick={() =>
                setAmountIn(formatAmount(balanceIn, tokenIn.decimals))
              }
              className="text-[10px] text-slate-500 hover:text-ice transition-colors"
            >
              Balance: {formatAmount(balanceIn, tokenIn.decimals).slice(0, 10)}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={amountIn}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, "");
              if (v.split(".").length <= 2) setAmountIn(v);
            }}
            placeholder="0.0"
            className="flex-1 bg-transparent text-3xl font-bold text-white placeholder-slate-600 focus:outline-none min-w-0"
          />
          <button
            onClick={() => setSelectingSide("in")}
            className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-full transition-colors shrink-0"
          >
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white">
              {tokenIn.icon}
            </div>
            <span className="text-sm font-medium text-white">{tokenIn.symbol}</span>
            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Flip button */}
      <div className="flex justify-center -my-3.5 relative z-10">
        <button
          onClick={flipTokens}
          className="w-10 h-10 rounded-full bg-black/80 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 hover:border-ice/30 transition-all shadow-lg"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* Token Out */}
      <div className="mx-6 p-5 bg-black/30 rounded-xl border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">You Receive</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {isQuoting ? (
              <div className="h-8 flex items-center">
                <div className="w-24 h-5 bg-white/5 rounded animate-pulse" />
              </div>
            ) : (
              <p
                className={`text-3xl font-bold truncate ${amountOut ? "text-white" : "text-slate-600"
                  }`}
              >
                {amountOut || "0.0"}
              </p>
            )}
          </div>
          <button
            onClick={() => setSelectingSide("out")}
            className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-full transition-colors shrink-0"
          >
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white">
              {tokenOut.icon}
            </div>
            <span className="text-sm font-medium text-white">{tokenOut.symbol}</span>
            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Route info */}
      {route && (
        <div className="mx-6 mt-4 p-4 bg-black/20 rounded-xl border border-white/5 space-y-2">
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Rate</span>
            <span className="text-slate-300">
              1 {tokenIn.symbol} = {route.spotPrice.toFixed(6)} {tokenOut.symbol}
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Fee</span>
            <span className="text-slate-300">{priceImpact}%</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Slippage</span>
            <span className="text-slate-300">{(slippage * 100).toFixed(1)}%</span>
          </div>
          {routePath && (
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-500">Route</span>
              <span className="text-ice truncate max-w-[60%] text-right">{routePath}</span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 bg-red-900/20 border border-red-500/20 rounded-xl">
          <p className="text-[10px] text-red-400">{error}</p>
        </div>
      )}

      {/* Success */}
      {txDigest && (
        <div className="mx-6 mt-4 px-4 py-3 bg-emerald-900/20 border border-emerald-500/20 rounded-xl">
          <p className="text-[10px] text-emerald-400">
            Swap successful!{" "}
            <a
              href={`https://suiscan.xyz/mainnet/tx/${txDigest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-emerald-300"
            >
              View tx
            </a>
          </p>
        </div>
      )}

      {/* Swap button */}
      <div className="p-6">
        {!account ? (
          <div className="w-full py-4 bg-white/5 text-slate-500 rounded-xl text-base font-medium text-center border border-white/5">
            Connect wallet to swap
          </div>
        ) : !route ? (
          <div className="w-full py-4 bg-white/5 text-slate-500 rounded-xl text-base font-medium text-center border border-white/5">
            {isQuoting ? "Finding best route..." : amountIn ? "No route available" : "Enter an amount"}
          </div>
        ) : (
          <button
            onClick={executeSwap}
            disabled={isSwapping}
            className="w-full py-4 bg-gradient-to-r from-ice to-blue-600 hover:from-ice/90 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 text-black disabled:text-slate-400 rounded-xl text-base font-bold transition-all shadow-[0_0_20px_rgba(136,189,242,0.2)] hover:shadow-[0_0_30px_rgba(136,189,242,0.3)]"
          >
            {isSwapping ? "Swapping..." : `Swap ${tokenIn.symbol} for ${tokenOut.symbol}`}
          </button>
        )}
      </div>

      {/* Powered by */}
      <div className="px-6 pb-5 flex items-center justify-center gap-1.5">
        <span className="text-[9px] text-slate-600">Powered by</span>
        <span className="text-[9px] text-slate-400 font-medium">Aftermath Aggregator</span>
      </div>

      {/* Token selector overlay */}
      {selectingSide && (
        <TokenSelector
          tokens={POPULAR_TOKENS}
          selected={selectingSide === "in" ? tokenIn : tokenOut}
          onSelect={(token) => {
            if (selectingSide === "in") {
              if (token.type === tokenOut.type) flipTokens();
              else setTokenIn(token);
            } else {
              if (token.type === tokenIn.type) flipTokens();
              else setTokenOut(token);
            }
            setRoute(null);
          }}
          onClose={() => setSelectingSide(null)}
          searchCoins={searchCoins}
        />
      )}
    </div>
  );
}
