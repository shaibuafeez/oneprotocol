"use client";

import { useState, useEffect } from "react";
import type { TreasuryDecision } from "@/lib/types";

const ARC_EXPLORER = "https://testnet.arcscan.app";

const TYPE_CONFIG: Record<
  TreasuryDecision["type"],
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  safety_deposit: {
    label: "Safety",
    color: "text-red-400",
    bgColor: "bg-red-900/30",
    borderColor: "border-red-500/20",
  },
  yield_withdraw: {
    label: "Deploy",
    color: "text-emerald-400",
    bgColor: "bg-emerald-900/30",
    borderColor: "border-emerald-500/20",
  },
  rebalance: {
    label: "Rebalance",
    color: "text-blue-400",
    bgColor: "bg-blue-900/30",
    borderColor: "border-blue-500/20",
  },
  risk_assessment: {
    label: "Risk",
    color: "text-amber-400",
    bgColor: "bg-amber-900/30",
    borderColor: "border-amber-500/20",
  },
  auto_safety: {
    label: "Auto Safety",
    color: "text-red-400",
    bgColor: "bg-red-900/20",
    borderColor: "border-red-500/30",
  },
  auto_redeploy: {
    label: "Auto Deploy",
    color: "text-emerald-400",
    bgColor: "bg-emerald-900/20",
    borderColor: "border-emerald-500/30",
  },
};

const DOT_COLORS: Record<TreasuryDecision["type"], string> = {
  safety_deposit: "bg-red-500 shadow-[0_0_8px_#ef4444]",
  yield_withdraw: "bg-emerald-500 shadow-[0_0_8px_#10b981]",
  rebalance: "bg-blue-500 shadow-[0_0_8px_#3b82f6]",
  risk_assessment: "bg-amber-500 shadow-[0_0_8px_#f59e0b]",
  auto_safety: "bg-red-500 shadow-[0_0_8px_#ef4444]",
  auto_redeploy: "bg-emerald-500 shadow-[0_0_8px_#10b981]",
};

export function TreasuryDecisionTimeline() {
  const [decisions, setDecisions] = useState<TreasuryDecision[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/treasury");
        if (!res.ok) return;
        const data = await res.json();
        setDecisions(data.decisions || []);
      } catch (e) {
        console.error("Failed to fetch decisions:", e);
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg shadow-blue-900/10">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide">
          Agent Decision Timeline
        </h3>
        <span className="text-[10px] text-slate-500 font-mono">
          {decisions.length} decision{decisions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {decisions.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">
          <p>No treasury decisions yet.</p>
          <p className="mt-1 text-xs text-slate-600">
            Start the auto-optimizer or ask DARA to assess treasury risk.
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent" />

          <div className="space-y-4">
            {[...decisions].reverse().map((d) => {
              const config = TYPE_CONFIG[d.type];
              return (
                <div key={d.id} className="relative pl-7 group">
                  {/* Timeline dot */}
                  <div
                    className={`absolute left-0 top-2 w-[15px] h-[15px] rounded-full border-2 border-slate-800 ${DOT_COLORS[d.type]} transition-all group-hover:scale-125`}
                  />

                  <div className="space-y-1">
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${config.bgColor} ${config.color} border ${config.borderColor}`}
                      >
                        {config.label}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(d.timestamp).toLocaleTimeString()}
                      </span>
                      {d.riskScore > 0 && (
                        <span
                          className={`text-[10px] font-mono ${
                            d.riskScore >= 65
                              ? "text-red-400"
                              : d.riskScore >= 35
                                ? "text-amber-400"
                                : "text-emerald-400"
                          }`}
                        >
                          Risk: {d.riskScore}/100
                        </span>
                      )}
                    </div>

                    {/* Action */}
                    <p className="text-sm text-white font-medium">{d.action}</p>

                    {/* Reasoning */}
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {d.reasoning}
                    </p>

                    {/* Amount + Tx */}
                    <div className="flex items-center gap-3 text-[10px]">
                      {d.amount && d.amount > 0 && (
                        <span className="text-slate-500 font-mono">
                          ${d.amount.toFixed(2)} USDC
                        </span>
                      )}
                      {d.txHash && (
                        <a
                          href={`${ARC_EXPLORER}/tx/${d.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-500 hover:text-cyan-400 hover:underline font-mono"
                        >
                          {d.txHash.startsWith("sim_")
                            ? d.txHash
                            : `${d.txHash.slice(0, 10)}...`}
                        </a>
                      )}
                      <span className="text-slate-600">{d.chain}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
