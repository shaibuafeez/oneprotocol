"use client";

import { useState, useEffect } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { SpotChart } from "@/components/SpotChart";
import {
  useDeepBook,
  TRADE_POOLS,
  type PlaceOrderParams,
} from "@/lib/hooks/useDeepBook";

// ── Helpers ──────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCompact(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

// ── Component ────────────────────────────────────────────

export function PerpsView() {
  const account = useCurrentAccount();
  const {
    midPrice,
    orderbook,
    openOrders,
    balanceManagerId,
    suiBalance,
    usdcBalance,
    poolParams,
    tradeParams,
    selectedPool,
    isLoading,
    error: dbError,
    setSelectedPool,
    createBalanceManager,
    deposit,
    withdraw,
    placeOrder,
    cancelOrder,
    refreshMarketData,
    refreshBalances,
    setError,
  } = useDeepBook();

  // Trade form
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("limit");
  const [size, setSize] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Deposit modal
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositCoin, setDepositCoin] = useState<"SUI" | "USDC">("SUI");
  const [depositAmount, setDepositAmount] = useState("");

  // Bottom panel tab
  const [bottomTab, setBottomTab] = useState<"orders" | "info">("orders");

  // ── Derived ──

  const activePool = TRADE_POOLS.find((p) => p.key === selectedPool)!;

  const asks =
    orderbook && orderbook.ask_prices.length
      ? orderbook.ask_prices.map((p, i) => ({
          price: p,
          quantity: orderbook.ask_quantities[i],
        }))
      : [];

  const bids =
    orderbook && orderbook.bid_prices.length
      ? orderbook.bid_prices.map((p, i) => ({
          price: p,
          quantity: orderbook.bid_quantities[i],
        }))
      : [];

  // Sort asks ascending (lowest first), bids descending (highest first)
  const sortedAsks = [...asks].sort((a, b) => a.price - b.price).slice(0, 10);
  const sortedBids = [...bids].sort((a, b) => b.price - a.price).slice(0, 10);

  const maxDepth = Math.max(
    ...sortedAsks.map((a) => a.quantity),
    ...sortedBids.map((b) => b.quantity),
    1
  );
  const spread =
    sortedAsks.length && sortedBids.length
      ? (sortedAsks[0].price - sortedBids[0].price).toFixed(4)
      : "—";

  const sizeNum = parseFloat(size) || 0;
  const notional = sizeNum * midPrice;
  const priceDec = selectedPool.includes("BTC") ? 1 : selectedPool === "SUI_USDC" ? 4 : 4;

  // ── Trade submission ──

  const handlePlaceOrder = async () => {
    if (!balanceManagerId || sizeNum <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    setOrderFeedback(null);

    try {
      const params: PlaceOrderParams = {
        poolKey: selectedPool,
        side,
        orderType,
        quantity: sizeNum,
      };

      if (orderType === "limit") {
        const lp = parseFloat(limitPrice);
        if (!lp || lp <= 0) {
          setOrderFeedback({ type: "error", message: "Enter a limit price" });
          setIsSubmitting(false);
          return;
        }
        params.price = lp;
      }

      await placeOrder(params);
      setOrderFeedback({
        type: "success",
        message: `${orderType === "market" ? "Market" : "Limit"} ${side} order placed!`,
      });
      setSize("");
      setLimitPrice("");
    } catch (err: any) {
      console.error("[Trade] Order failed:", err);
      setOrderFeedback({
        type: "error",
        message: err?.message?.slice(0, 120) || "Order failed",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      await cancelOrder(orderId);
    } catch (err: any) {
      console.error("[Trade] Cancel failed:", err);
    }
  };

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) return;

    try {
      await deposit(depositCoin, amt);
      setDepositAmount("");
      setShowDeposit(false);
    } catch (err: any) {
      console.error("[Trade] Deposit failed:", err);
    }
  };

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Pool Selector ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TRADE_POOLS.map((pool) => {
          const isActive = pool.key === selectedPool;
          return (
            <button
              key={pool.key}
              onClick={() => setSelectedPool(pool.key)}
              className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-left transition-all ${
                isActive
                  ? "bg-white/10 border-white/10"
                  : "bg-black/20 border-white/[0.04] hover:border-white/10"
              }`}
            >
              <div className="text-xs font-bold text-white">{pool.label}</div>
              {isActive && midPrice > 0 && (
                <div className="text-sm font-mono text-cyan-400 mt-0.5">
                  ${fmt(midPrice, priceDec)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Market Header ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[
          {
            label: "Mid Price",
            value: midPrice > 0 ? `$${fmt(midPrice, priceDec)}` : "—",
          },
          {
            label: "Best Bid",
            value:
              sortedBids.length > 0
                ? `$${fmt(sortedBids[0].price, priceDec)}`
                : "—",
            color: "text-emerald-400",
          },
          {
            label: "Best Ask",
            value:
              sortedAsks.length > 0
                ? `$${fmt(sortedAsks[0].price, priceDec)}`
                : "—",
            color: "text-red-400",
          },
          {
            label: "Taker Fee",
            value: tradeParams ? `${(tradeParams.takerFee * 100).toFixed(3)}%` : "—",
          },
          {
            label: "Maker Fee",
            value: tradeParams ? `${(tradeParams.makerFee * 100).toFixed(3)}%` : "—",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-black/20 border border-white/[0.04] rounded-xl px-3 py-2"
          >
            <div className="text-[10px] text-white/30 uppercase tracking-wider">
              {s.label}
            </div>
            <div
              className={`text-sm font-mono mt-0.5 ${(s as any).color ?? "text-white"}`}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Account Bar (when connected) ── */}
      {account && balanceManagerId && (
        <div className="bg-black/20 border border-white/[0.04] rounded-xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-6 text-[11px] font-mono">
            <div>
              <span className="text-white/30 mr-1.5">SUI Balance</span>
              <span className="text-white">{fmt(suiBalance, 4)}</span>
            </div>
            <div>
              <span className="text-white/30 mr-1.5">USDC Balance</span>
              <span className="text-cyan-400">{fmt(usdcBalance, 2)}</span>
            </div>
            {poolParams && (
              <>
                <div>
                  <span className="text-white/30 mr-1.5">Tick Size</span>
                  <span className="text-white/60">{poolParams.tickSize}</span>
                </div>
                <div>
                  <span className="text-white/30 mr-1.5">Min Size</span>
                  <span className="text-white/60">{poolParams.minSize}</span>
                </div>
              </>
            )}
            <button
              onClick={() => setShowDeposit(true)}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded transition-colors"
            >
              Deposit
            </button>
            <button
              onClick={() => {
                refreshBalances();
                refreshMarketData();
              }}
              className="ml-auto text-[10px] text-white/30 hover:text-white/60 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* ── Deposit Modal ── */}
      {showDeposit && (
        <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-white/60">
              Deposit to Balance Manager
            </span>
            <button
              onClick={() => setShowDeposit(false)}
              className="text-white/30 hover:text-white/60 text-xs"
            >
              Close
            </button>
          </div>
          <div className="flex gap-2">
            {(["SUI", "USDC"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setDepositCoin(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono ${
                  depositCoin === c
                    ? "bg-white/10 text-white"
                    : "bg-white/5 text-white/40"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="Amount"
            className="w-full bg-white/5 border border-white/[0.06] rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/40"
          />
          <button
            onClick={handleDeposit}
            disabled={isLoading || !parseFloat(depositAmount)}
            className="w-full py-2 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/20 transition-all disabled:opacity-40"
          >
            {isLoading ? "Depositing..." : `Deposit ${depositCoin}`}
          </button>
        </div>
      )}

      {/* ── Main Grid: Chart | Orderbook | Trade Panel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Candlestick Chart */}
        <div className="lg:col-span-6 bg-black/20 border border-white/[0.04] rounded-xl p-4 h-[380px]">
          <SpotChart poolKey={selectedPool} label={activePool.label} />
        </div>

        {/* Orderbook */}
        <div className="lg:col-span-3 bg-black/20 border border-white/[0.04] rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <div className="text-xs text-white/30">Orderbook (on-chain)</div>
            <div className="text-[9px] text-white/10 font-mono">DeepBook V3</div>
          </div>
          <div className="space-y-[2px] text-[11px] font-mono">
            <div className="flex justify-between text-white/20 px-1 pb-1">
              <span>Price</span>
              <span>Size</span>
            </div>
            {[...sortedAsks].reverse().map((a, i) => (
              <div
                key={`a-${i}`}
                className="flex justify-between relative px-1 py-[1px]"
              >
                <div
                  className="absolute inset-y-0 right-0 bg-red-500/10"
                  style={{ width: `${(a.quantity / maxDepth) * 100}%` }}
                />
                <span className="relative text-red-400">
                  ${fmt(a.price, priceDec)}
                </span>
                <span className="relative text-white/60">
                  {fmt(a.quantity, 3)}
                </span>
              </div>
            ))}
            <div className="flex justify-center py-1.5 text-white/30 border-y border-white/[0.04]">
              Spread: {spread}
            </div>
            {sortedBids.map((b, i) => (
              <div
                key={`b-${i}`}
                className="flex justify-between relative px-1 py-[1px]"
              >
                <div
                  className="absolute inset-y-0 right-0 bg-emerald-500/10"
                  style={{ width: `${(b.quantity / maxDepth) * 100}%` }}
                />
                <span className="relative text-emerald-400">
                  ${fmt(b.price, priceDec)}
                </span>
                <span className="relative text-white/60">
                  {fmt(b.quantity, 3)}
                </span>
              </div>
            ))}
            {sortedAsks.length === 0 && sortedBids.length === 0 && (
              <div className="text-center text-white/10 text-[10px] py-4">
                Loading orderbook...
              </div>
            )}
          </div>
        </div>

        {/* Trade Panel */}
        <div className="lg:col-span-3 bg-black/20 border border-white/[0.04] rounded-xl p-4 space-y-4">
          <div className="text-xs text-white/30">
            Trade {activePool.label}
          </div>

          {/* Order type tabs */}
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {(["limit", "market"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={`flex-1 text-xs py-1.5 rounded-md capitalize transition-colors ${
                  orderType === t
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Side */}
          <div className="flex gap-1">
            <button
              onClick={() => setSide("buy")}
              className={`flex-1 text-xs py-2 rounded-lg font-bold transition-colors ${
                side === "buy"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-white/5 text-white/40 border border-transparent hover:text-white/60"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setSide("sell")}
              className={`flex-1 text-xs py-2 rounded-lg font-bold transition-colors ${
                side === "sell"
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-white/5 text-white/40 border border-transparent hover:text-white/60"
              }`}
            >
              Sell
            </button>
          </div>

          {/* Limit price input */}
          {orderType === "limit" && (
            <div>
              <label className="text-[10px] text-white/30 block mb-1">
                Price ({activePool.quoteCoin})
              </label>
              <input
                type="number"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={midPrice > 0 ? fmt(midPrice, priceDec) : "0.00"}
                className="w-full bg-white/5 border border-white/[0.06] rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/40"
              />
            </div>
          )}

          {/* Size input */}
          <div>
            <label className="text-[10px] text-white/30 block mb-1">
              Size ({activePool.baseCoin})
            </label>
            <input
              type="number"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder={
                poolParams ? `Min: ${poolParams.minSize}` : "0.00"
              }
              className="w-full bg-white/5 border border-white/[0.06] rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/40"
            />
          </div>

          {/* Summary */}
          {sizeNum > 0 && midPrice > 0 && (
            <div className="space-y-1.5 text-[11px] border-t border-white/[0.04] pt-3">
              <div className="flex justify-between">
                <span className="text-white/30">Price</span>
                <span className="text-white font-mono">
                  $
                  {orderType === "limit" && parseFloat(limitPrice) > 0
                    ? fmt(parseFloat(limitPrice), priceDec)
                    : fmt(midPrice, priceDec)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/30">Notional</span>
                <span className="text-white font-mono">
                  ${fmt(notional, 2)}
                </span>
              </div>
              {tradeParams && (
                <div className="flex justify-between">
                  <span className="text-white/30">
                    Est. Fee ({orderType === "market" ? "Taker" : "Maker"})
                  </span>
                  <span className="text-white/50 font-mono">
                    $
                    {fmt(
                      notional *
                        (orderType === "market"
                          ? tradeParams.takerFee
                          : tradeParams.makerFee),
                      4
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Order feedback */}
          {orderFeedback && (
            <div
              className={`text-[11px] px-3 py-2 rounded-lg ${
                orderFeedback.type === "success"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              {orderFeedback.message}
            </div>
          )}

          {/* DB error */}
          {dbError && (
            <div className="text-[11px] px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
              {dbError.slice(0, 120)}
              <button
                onClick={() => setError(null)}
                className="ml-2 text-white/30 hover:text-white/60"
              >
                x
              </button>
            </div>
          )}

          {/* Submit / Connect / Create Manager */}
          {!account ? (
            <div className="text-center text-[11px] text-white/30 py-4 border border-dashed border-white/10 rounded-xl">
              Connect wallet to trade
            </div>
          ) : !balanceManagerId ? (
            <button
              onClick={createBalanceManager}
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/20 transition-all disabled:opacity-50"
            >
              {isLoading
                ? "Creating..."
                : "Create Balance Manager"}
            </button>
          ) : (
            <button
              onClick={handlePlaceOrder}
              disabled={sizeNum <= 0 || isSubmitting}
              className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${
                sizeNum <= 0 || isSubmitting
                  ? "bg-white/5 text-white/20 cursor-not-allowed"
                  : side === "buy"
                    ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20"
                    : "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20"
              }`}
            >
              {isSubmitting
                ? "Placing order..."
                : sizeNum <= 0
                  ? "Enter Size"
                  : `${side === "buy" ? "Buy" : "Sell"} ${activePool.baseCoin}`}
            </button>
          )}
        </div>
      </div>

      {/* ── Bottom Panel: Open Orders / Pool Info ── */}
      <div className="bg-black/20 border border-white/[0.04] rounded-xl">
        {/* Tabs */}
        <div className="flex border-b border-white/[0.04]">
          {(
            [
              {
                key: "orders" as const,
                label: "Open Orders",
                count: openOrders.length,
              },
              { key: "info" as const, label: "Pool Info", count: 0 },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setBottomTab(tab.key)}
              className={`px-4 py-2.5 text-xs transition-colors ${
                bottomTab === tab.key
                  ? "text-white border-b-2 border-cyan-400"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 bg-white/10 text-white/50 px-1.5 py-0.5 rounded-full text-[9px]">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* Open Orders Table */}
          {bottomTab === "orders" && (
            <div className="overflow-x-auto">
              {openOrders.length === 0 ? (
                <div className="text-center text-white/20 text-sm py-8">
                  {account && balanceManagerId
                    ? "No open orders"
                    : "Connect wallet and create a Balance Manager to trade"}
                </div>
              ) : (
                <table className="w-full text-[11px] font-mono">
                  <thead>
                    <tr className="text-white/20 border-b border-white/[0.04]">
                      <th className="text-left py-2 px-2 font-normal">Pool</th>
                      <th className="text-left py-2 px-2 font-normal">
                        Order ID
                      </th>
                      <th className="text-right py-2 px-2 font-normal">
                        Size
                      </th>
                      <th className="text-right py-2 px-2 font-normal">
                        Filled
                      </th>
                      <th className="text-right py-2 px-2 font-normal">
                        Status
                      </th>
                      <th className="text-right py-2 px-2 font-normal">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {openOrders.map((ord) => (
                      <tr
                        key={ord.orderId}
                        className="border-b border-white/[0.02] hover:bg-white/[0.02]"
                      >
                        <td className="py-2 px-2 text-white font-bold">
                          {activePool.label}
                        </td>
                        <td className="py-2 px-2 text-white/40">
                          {ord.orderId.slice(0, 8)}...
                        </td>
                        <td className="py-2 px-2 text-right text-white">
                          {ord.quantity}
                        </td>
                        <td className="py-2 px-2 text-right text-white/40">
                          {ord.filledQuantity}
                        </td>
                        <td className="py-2 px-2 text-right text-white/30">
                          {ord.status === 0 ? "Open" : `Status ${ord.status}`}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <button
                            onClick={() => handleCancelOrder(ord.orderId)}
                            className="text-[10px] text-red-400 hover:text-red-300 bg-red-500/10 px-2 py-0.5 rounded"
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Pool Info */}
          {bottomTab === "info" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-[11px] font-mono">
              <div>
                <div className="text-white/30 mb-0.5">Pool</div>
                <div className="text-white">{activePool.label}</div>
              </div>
              <div>
                <div className="text-white/30 mb-0.5">Base</div>
                <div className="text-white">{activePool.baseCoin}</div>
              </div>
              <div>
                <div className="text-white/30 mb-0.5">Quote</div>
                <div className="text-white">{activePool.quoteCoin}</div>
              </div>
              {poolParams && (
                <>
                  <div>
                    <div className="text-white/30 mb-0.5">Tick Size</div>
                    <div className="text-white">{poolParams.tickSize}</div>
                  </div>
                  <div>
                    <div className="text-white/30 mb-0.5">Lot Size</div>
                    <div className="text-white">{poolParams.lotSize}</div>
                  </div>
                  <div>
                    <div className="text-white/30 mb-0.5">Min Size</div>
                    <div className="text-white">{poolParams.minSize}</div>
                  </div>
                </>
              )}
              {tradeParams && (
                <>
                  <div>
                    <div className="text-white/30 mb-0.5">Taker Fee</div>
                    <div className="text-white">
                      {(tradeParams.takerFee * 100).toFixed(3)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-white/30 mb-0.5">Maker Fee</div>
                    <div className="text-white">
                      {(tradeParams.makerFee * 100).toFixed(3)}%
                    </div>
                  </div>
                </>
              )}
              <div className="col-span-2 sm:col-span-3 pt-2 border-t border-white/[0.04]">
                <div className="text-white/20 text-[10px]">
                  Powered by DeepBook V3 — Sui&apos;s native on-chain CLOB. All
                  orders execute directly on the Sui blockchain with no
                  intermediary.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
