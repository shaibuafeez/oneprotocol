"use client";

import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { TreasuryState } from "@/lib/types";

const ALLOC_COLORS = {
  arc: "#22d3ee",
  sui: "#a855f7",
};

export function ArcVaultStatus() {
  const [blockNumber, setBlockNumber] = useState("0");
  const [loading, setLoading] = useState(true);
  const [treasury, setTreasury] = useState<TreasuryState>({
    arcVaultBalance: 0,
    suiYieldTotal: 0,
    lastDecision: null,
    lastDecisionTime: 0,
    riskScore: 0,
    allocationArcPct: 0,
    allocationSuiPct: 100,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/treasury");
        if (!res.ok) throw new Error("Failed to fetch treasury");
        const data = await res.json();
        setBlockNumber(data.blockNumber || "0");
        setTreasury(data.state);
      } catch (e) {
        console.error("Treasury fetch failed:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const blockNum = BigInt(blockNumber);
  const totalValue = treasury.arcVaultBalance + treasury.suiYieldTotal;

  const pieData =
    totalValue > 0
      ? [
          {
            name: "Arc Vault (USDC)",
            value: treasury.arcVaultBalance,
            color: ALLOC_COLORS.arc,
          },
          {
            name: "Sui Yield",
            value: treasury.suiYieldTotal,
            color: ALLOC_COLORS.sui,
          },
        ]
      : [];

  // Risk score colors
  const riskColor =
    treasury.riskScore >= 65
      ? "text-red-400"
      : treasury.riskScore >= 35
        ? "text-amber-400"
        : "text-emerald-400";
  const riskBgColor =
    treasury.riskScore >= 65
      ? "bg-red-500"
      : treasury.riskScore >= 35
        ? "bg-amber-500"
        : "bg-emerald-500";
  const riskLabel =
    treasury.riskScore >= 65
      ? "HIGH"
      : treasury.riskScore >= 35
        ? "MEDIUM"
        : "LOW";

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg shadow-blue-900/10 hover:border-cyan-500/30 transition-all">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee] animate-pulse" />
            Arc Treasury Vault
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {loading
              ? "Loading..."
              : `Block #${blockNumber} | RWA-Backed USDC`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500 font-mono uppercase">
            Total Treasury
          </p>
          <p className="text-2xl font-mono font-bold text-white drop-shadow-sm">
            {loading ? "..." : `$${totalValue.toFixed(2)}`}
          </p>
        </div>
      </div>

      {/* Risk Score Gauge */}
      <div className="mb-6 p-4 bg-black/20 rounded-xl border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400 uppercase tracking-wide">
            Risk Score
          </span>
          <span className={`text-sm font-bold font-mono ${riskColor}`}>
            {treasury.riskScore}/100 ({riskLabel})
          </span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${riskBgColor}`}
            style={{ width: `${treasury.riskScore}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-slate-600 font-mono">
          <span>Safe</span>
          <span>Moderate</span>
          <span>High Risk</span>
        </div>
      </div>

      {/* Allocation Chart */}
      {pieData.length > 0 && totalValue > 0 ? (
        <div className="flex flex-col md:flex-row items-center gap-8 mb-6">
          {/* Chart */}
          <div className="w-36 h-36 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={55}
                  outerRadius={68}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(0,0,0,0.8)",
                    borderColor: "rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                  itemStyle={{ color: "#fff", fontSize: "12px" }}
                  formatter={(value) => `$${Number(value).toFixed(2)}`}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[9px] text-slate-500 uppercase">Split</span>
              <span className="text-xs font-bold text-white">
                {treasury.allocationArcPct.toFixed(0)}% /{" "}
                {treasury.allocationSuiPct.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 w-full space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-1 h-8 rounded-full"
                  style={{ backgroundColor: ALLOC_COLORS.arc }}
                />
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    Arc Vault (Safety)
                  </p>
                  <p className="text-[10px] text-slate-500">
                    USDC backed by US Treasuries
                  </p>
                </div>
              </div>
              <p className="text-sm font-bold text-white font-mono">
                ${treasury.arcVaultBalance.toFixed(2)}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-1 h-8 rounded-full"
                  style={{ backgroundColor: ALLOC_COLORS.sui }}
                />
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    Sui Yield (Growth)
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Scallop, NAVI, DeepBook
                  </p>
                </div>
              </div>
              <p className="text-sm font-bold text-white font-mono">
                ${treasury.suiYieldTotal.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500 text-sm mb-6">
          {loading ? (
            <span className="animate-pulse">Querying Arc network...</span>
          ) : (
            <div>
              <p>No treasury positions yet</p>
              <p className="text-xs text-slate-600 mt-1">
                Ask DARA to assess treasury risk or deposit to Arc vault
              </p>
            </div>
          )}
        </div>
      )}

      {/* Last Decision */}
      {treasury.lastDecision && (
        <div className="p-3 bg-black/20 rounded-lg border border-white/5 mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">
              Last Agent Decision
            </span>
            <span className="text-[10px] text-slate-600 font-mono">
              {new Date(treasury.lastDecisionTime).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-xs text-slate-300">{treasury.lastDecision.action}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {treasury.lastDecision.reasoning.slice(0, 80)}
            {treasury.lastDecision.reasoning.length > 80 ? "..." : ""}
          </p>
        </div>
      )}

      {/* RWA Backing Info */}
      <div className="p-3 bg-gradient-to-r from-cyan-900/10 to-blue-900/10 rounded-lg border border-cyan-500/10">
        <p className="text-[10px] text-cyan-400/80 font-medium uppercase tracking-wider mb-1">
          RWA Backing
        </p>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          USDC in Arc vault is backed by US Treasury securities and cash
          equivalents held in Circle&apos;s reserve fund. Arc is Circle&apos;s L1
          blockchain purpose-built for institutional settlement.
        </p>
      </div>

      {/* Network Status */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
        <span>Arc Testnet</span>
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${blockNum > 0n ? "bg-emerald-500" : "bg-red-500"}`}
          />
          <span>{blockNum > 0n ? "Connected" : "Offline"}</span>
        </div>
      </div>
    </div>
  );
}
