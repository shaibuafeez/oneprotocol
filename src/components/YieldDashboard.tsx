"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import type {
  YieldOpportunity,
  YieldPosition,
  RiskLevel,
} from "@/lib/types";
import { scanYields } from "@/agent/yield-scanner";
import {
  fetchFundingRates,
  type BluefinFundingRate,
} from "@/agent/protocols/bluefin";

interface YieldDashboardProps {
  refreshTrigger?: number;
}

/* Theme Colors */
const COLORS = {
  ice: "#88BDF2",
  iceGlow: "rgba(136, 189, 242, 0.5)",
  background: "#000000",
  cardBg: "rgba(255, 255, 255, 0.03)",
  border: "rgba(255, 255, 255, 0.08)",
  text: "#f8fafc",
  subtext: "#94a3b8",

  warning: "#f59e0b",
  error: "#f43f5e",
};

const CHAIN_COLORS: Record<string, string> = {
  Sui: "#88BDF2",
  Arbitrum: "#60a5fa",
  Optimism: "#f472b6",
  Arc: "#c084fc",
};

export function YieldDashboard({ refreshTrigger }: YieldDashboardProps) {
  const [opportunities, setOpportunities] = useState<YieldOpportunity[]>([]);
  const [positions, setPositions] = useState<YieldPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastScan, setLastScan] = useState<number>(0);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("moderate");
  const [fundingRates, setFundingRates] = useState<BluefinFundingRate[]>([]);
  const [history, setHistory] = useState<{ apy: number[]; tvl: number[] }>({ apy: [], tvl: [] });
  const [agentActive, setAgentActive] = useState(false);

  const loadYields = useCallback(async () => {
    setLoading(true);
    try {
      const [yields, rates, treasuryRes] = await Promise.all([
        scanYields(),
        fetchFundingRates().catch(() => [] as BluefinFundingRate[]),
        fetch("/api/treasury").then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setOpportunities(yields);
      setFundingRates(rates);

      // Get positions + agent state from server API
      const pos = treasuryRes?.positions || [];
      setPositions(pos);
      setLastScan(Date.now());
      setRiskLevel(treasuryRes?.riskLevel || "moderate");
      setAgentActive(treasuryRes?.agentRunning || false);

      const bestApy = yields[0]?.netApy || 0;
      setHistory(prev => ({
        apy: [...prev.apy, bestApy].slice(-20),
        tvl: [...prev.tvl, pos.reduce((s: number, p: YieldPosition) => s + p.amountUsd, 0)].slice(-20)
      }));

    } catch (err) {
      console.error("[YieldDashboard] Scan failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadYields(); }, [loadYields]);
  useEffect(() => { if (refreshTrigger) loadYields(); }, [refreshTrigger, loadYields]);

  const totalDeployed = positions.reduce((sum, p) => sum + p.amountUsd, 0);
  const bestApy = opportunities[0]?.netApy || 0;

  // Prepare Chart Data
  const chartData = opportunities.slice(0, 5).map(o => ({
    name: o.protocol,
    apy: o.netApy,
    chain: o.chain
  }));

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 md:grid-cols-12 gap-6"
    >
      {/* 1. Main Welcome / Net Worth Card (Top Left, Large) */}
      <motion.div variants={itemVariants} className="col-span-12 md:col-span-8 relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-8 flex flex-col justify-between min-h-[300px] group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-ice/10 rounded-full blur-[100px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="relative z-10">
          <h2 className="text-slate-400 text-sm font-medium tracking-wide uppercase mb-1">Total Portfolio Value</h2>
          <div className="flex items-baseline gap-4">
            <span className="text-5xl md:text-6xl font-bold text-white tracking-tight">
              ${totalDeployed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="flex items-center gap-1 text-cyan-400 font-medium bg-cyan-400/10 px-2 py-1 rounded-lg text-sm border border-cyan-400/20">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
              {bestApy.toFixed(1)}% APY
            </span>
          </div>

        </div>

        {/* Sparkline Area */}
        <div className="absolute bottom-0 left-0 right-0 h-32 opacity-20 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history.apy.length > 0 ? history.apy.map((v, i) => ({ i, v })) : [{ i: 0, v: 0 }]}>
              <defs>
                <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.ice} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={COLORS.ice} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={COLORS.ice} strokeWidth={3} fill="url(#chartGlow)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* 2. Agent Status Card (Top Right, Small) */}
      <motion.div variants={itemVariants} className="col-span-12 md:col-span-4 rounded-3xl bg-black/40 border border-white/10 backdrop-blur-xl p-6 flex flex-col justify-center items-center relative overflow-hidden shadow-inner shadow-ice/5">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 relative ${agentActive ? "shadow-[0_0_30px_rgba(136,189,242,0.4)]" : "opacity-50"}`}>
          <div className={`absolute inset-0 rounded-full border-2 border-ice/30 ${agentActive ? "animate-[spin_10s_linear_infinite]" : ""}`} />
          <div className={`absolute inset-2 rounded-full border border-ice/50 ${agentActive ? "animate-[spin_4s_linear_infinite_reverse]" : ""}`} />
          <div className="w-3 h-3 bg-ice rounded-full animate-pulse shadow-[0_0_10px_#88BDF2]" />
        </div>
        <h3 className="text-white font-bold text-lg mb-1">AI Agent {agentActive ? "Online" : "Standby"}</h3>
        <p className="text-slate-400 text-xs text-center px-4">
          Scan interval: 60s &middot; Protocol: Aggressive
        </p>
        <button
          onClick={loadYields}
          disabled={loading}
          className="mt-6 px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs font-medium text-ice transition-colors flex items-center gap-2"
        >
          {loading ? "Scanning..." : "Force Scan"}
        </button>
      </motion.div>

      {/* 3. Asset Allocation (Middle Row, Chart) */}
      <motion.div variants={itemVariants} className="col-span-12 md:col-span-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-6 min-h-[320px] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-white font-semibold">Allocation</h3>
          <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-slate-400 border border-white/5">Auto-Rebalancing</span>
        </div>
        <div className="flex-1 w-full h-full min-h-[200px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={positions.length > 0 ? positions : [{ protocol: "Empty", amountUsd: 1 }]}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="amountUsd"
                stroke="none"
              >
                {positions.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={Object.values(CHAIN_COLORS)[index % 4]} />
                ))}
                {positions.length === 0 && <Cell fill="#334155" />}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: COLORS.background, borderColor: COLORS.border, borderRadius: '12px' }}
                itemStyle={{ color: COLORS.text }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-white">{positions.length}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest">Active</span>
          </div>
        </div>
      </motion.div>

      {/* 4. Top Opportunity (Middle Row, Main) */}
      <motion.div variants={itemVariants} className="col-span-12 md:col-span-8 rounded-3xl bg-gradient-to-br from-white/5 to-black/60 border border-white/10 backdrop-blur-xl p-6 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              Top Yield Opportunities
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
            </h3>
            <p className="text-slate-500 text-xs mt-1">AI-ranked based on risk-adjusted Net APY</p>
          </div>
          <div className="flex gap-2">
            {Object.keys(CHAIN_COLORS).map(chain => (
              <span key={chain} className="w-2 h-2 rounded-full" style={{ background: CHAIN_COLORS[chain] }} title={chain} />
            ))}
          </div>
        </div>

        <div className="flex-1 w-full min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 0, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.border} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: COLORS.subtext, fontSize: 10 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: COLORS.subtext, fontSize: 10 }} tickFormatter={v => `${v}%`} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-black/90 border border-white/10 rounded-lg p-3 shadow-xl">
                      <p className="text-ice font-bold mb-1">{payload[0].payload.name}</p>
                      <p className="text-white text-xs">APY: {payload[0].value}%</p>
                    </div>
                  )
                }
                return null;
              }} />
              <Bar dataKey="apy" radius={[4, 4, 0, 0]} barSize={40}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={CHAIN_COLORS[d.chain] || COLORS.subtext} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* 5. Detailed List / Bento Items (Bottom Row) */}
      <motion.div variants={itemVariants} className="col-span-12 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-1 overflow-hidden">
        <div className="bg-black/20 p-4 border-b border-white/5 flex justify-between items-center">
          <h3 className="text-sm font-medium text-slate-300 pl-2">Intelligence Feed</h3>
          <span className="text-[10px] font-mono text-slate-600">LIVE FEED</span>
        </div>
        <div className="grid grid-cols-1 divide-y divide-white/5">
          {opportunities.slice(0, 4).map((opp, i) => (
            <div key={i} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-slate-300 border border-white/10 group-hover:border-ice/30 group-hover:text-ice transition-all">
                  {i + 1}
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{opp.protocol}</p>
                  <p className="text-slate-500 text-xs flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: CHAIN_COLORS[opp.chain] || "#64748b" }} />
                    {opp.chain} &middot; {opp.asset}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-8 text-right">
                <div className="hidden md:block">
                  <p className="text-slate-500 text-[10px] uppercase">TVL</p>
                  <p className="text-slate-300 text-sm font-mono">${formatTvl(opp.tvl)}</p>
                </div>
                <div className="hidden md:block">
                  <p className="text-slate-500 text-[10px] uppercase">Est. Yield</p>
                  <p className="text-cyan-400 text-sm font-mono">+{(opp.netApy / 12).toFixed(2)}%/mo</p>
                </div>
                <div>
                  <p className="text-slate-500 text-[10px] uppercase">Net APY</p>
                  <div className="flex items-center justify-end gap-2">
                    {opp.bridgeCostPct > 0 && (
                      <span className="text-slate-500 text-[9px] bg-black/40 px-1.5 py-0.5 rounded border border-white/5">
                        -{opp.bridgeCostPct.toFixed(1)}% fee
                      </span>
                    )}
                    <p className="text-ice text-lg font-bold font-mono tracking-tight">{opp.netApy.toFixed(2)}%</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {opportunities.length === 0 && (
            <div className="p-12 text-center text-slate-500 text-sm italic">
              Scanning cross-chain protocols...
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function formatTvl(tvl: number): string {
  if (tvl >= 1e9) return `${(tvl / 1e9).toFixed(1)}B`;
  if (tvl >= 1e6) return `${(tvl / 1e6).toFixed(1)}M`;
  if (tvl >= 1e3) return `${(tvl / 1e3).toFixed(0)}K`;
  return tvl.toFixed(0);
}
