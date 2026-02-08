"use client";

import { useState, useEffect, useRef } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { motion } from "framer-motion";
import { PriceData, YieldPosition } from "@/lib/types";
import { fetchPrices } from "@/agent/strategy";
import {
  Wallet,
  Activity,
  Layers,
  ShieldCheck,
  Zap,
  TrendingUp
} from "lucide-react";

interface VaultStatusProps {
  suiBalance: bigint;
}

const COLORS = {
  ice: "#88BDF2",
  iceDark: "#1e3a8a",
  white: "#ffffff",
  slate: "#94a3b8",
  background: "#000000",
  cardBg: "rgba(255, 255, 255, 0.03)",
};

const PIE_COLORS = [
  "#88BDF2", // Ice
  "#60a5fa", // Blue 400
  "#3b82f6", // Blue 500
  "#2563eb", // Blue 600
  "#1d4ed8", // Blue 700
];

export function VaultStatus({ suiBalance }: VaultStatusProps) {
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [arcVaultBalance, setArcVaultBalance] = useState(0);
  const [positions, setPositions] = useState<YieldPosition[]>([]);
  const [earnings, setEarnings] = useState(0);
  const earningsRef = useRef(0);
  const rateRef = useRef(0);

  // Fetch prices from CoinGecko (public API, works from client)
  useEffect(() => {
    const update = async () => {
      const p = await fetchPrices();
      setPrices(p);
    };
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Arc vault balance + positions from server API
  useEffect(() => {
    const fetchTreasury = async () => {
      try {
        const res = await fetch("/api/treasury");
        if (!res.ok) return;
        const data = await res.json();
        // Real on-chain vault balance from Arc
        if (data.vaultHealth) {
          setArcVaultBalance(data.vaultHealth.balance);
        }
        // Real positions from server state
        if (data.positions) {
          setPositions(data.positions);
        }
      } catch (e) {
        console.error("Treasury API fetch failed:", e);
      }
    };
    fetchTreasury();
    const interval = setInterval(fetchTreasury, 10000);
    return () => clearInterval(interval);
  }, []);

  const suiPrice = prices.find((x) => x.asset === "SUI")?.price || 0;
  const suiValueUsd = (Number(suiBalance) / 1e9) * suiPrice;
  const arcValueUsd = arcVaultBalance; // already in USD from getVaultHealth

  const totalYield = positions.reduce((sum, p) => sum + p.earnedUsd, 0);
  const totalDeployed = positions.reduce((sum, p) => sum + p.amountUsd, 0);
  const avgApy =
    positions.length > 0
      ? positions.reduce((sum, p) => sum + p.apy, 0) / positions.length
      : 0;

  // Live earnings ticker
  useEffect(() => {
    earningsRef.current = totalYield;
    rateRef.current =
      totalDeployed > 0 && avgApy > 0
        ? (totalDeployed * (avgApy / 100)) / (365.25 * 24 * 3600 * 1000)
        : 0;
  }, [totalYield, totalDeployed, avgApy]);

  useEffect(() => {
    if (rateRef.current === 0) {
      setEarnings(earningsRef.current);
      return;
    }
    let last = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      earningsRef.current += rateRef.current * dt;
      setEarnings(earningsRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [avgApy, totalDeployed]);

  // Build pie data from real sources
  const pieData = [
    { name: "Sui", value: suiValueUsd },
    { name: "Arc USDC", value: arcValueUsd },
    ...positions.map((p) => ({
      name: p.protocol,
      value: p.amountUsd,
    })),
  ].filter((d) => d.value > 0);

  const totalValue = suiValueUsd + arcValueUsd + totalDeployed;

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
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
      className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full"
    >
      {/* 1. Total Vault Value */}
      <motion.div variants={itemVariants} className="col-span-12 md:col-span-4 relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-8 flex flex-col justify-between min-h-[220px] hover:border-white/20 transition-colors group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-[50px] pointer-events-none group-hover:bg-blue-500/20 transition-all" />

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
            <Wallet className="w-5 h-5 text-ice" />
          </div>
          <h2 className="text-slate-400 text-sm font-medium tracking-wide uppercase">Total Value</h2>
        </div>

        <div>
          <span className="text-5xl font-bold text-white tracking-tight block mb-2 font-mono">
            ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <div className="flex gap-3 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              {(Number(suiBalance) / 1e9).toFixed(2)} SUI
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-ice" />
              ${arcValueUsd.toFixed(2)} Arc
            </span>
          </div>
        </div>
      </motion.div>

      {/* 2. Live Earnings */}
      <motion.div variants={itemVariants} className="col-span-12 md:col-span-4 relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-8 flex flex-col justify-between min-h-[220px] hover:border-white/20 transition-colors group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-ice/10 rounded-full blur-[50px] pointer-events-none group-hover:bg-ice/20 transition-all" />

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
            <Zap className="w-5 h-5 text-ice" />
          </div>
          <h2 className="text-slate-400 text-sm font-medium tracking-wide uppercase">Live Yield</h2>
        </div>

        <div>
          <div className="text-5xl font-mono font-bold text-ice tracking-tighter tabular-nums mb-2 drop-shadow-[0_0_15px_rgba(136,189,242,0.3)]">
            ${earnings.toFixed(2)}
          </div>
          <p className="text-sm text-slate-500">
            Accruing real-time from {positions.length} active strategies
          </p>
        </div>
      </motion.div>

      {/* 3. Net APY */}
      <motion.div variants={itemVariants} className="col-span-12 md:col-span-4 relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-8 flex flex-col justify-between min-h-[220px] hover:border-white/20 transition-colors group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-[50px] pointer-events-none group-hover:bg-blue-600/20 transition-all" />

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
            <TrendingUp className="w-5 h-5 text-blue-300" />
          </div>
          <h2 className="text-slate-400 text-sm font-medium tracking-wide uppercase">Net APY</h2>
        </div>

        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-5xl font-bold text-white tracking-tight font-mono">
              {avgApy.toFixed(2)}%
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Weighted average across all positions
          </p>
        </div>
      </motion.div>

      {/* 4. Asset Allocation */}
      <motion.div variants={itemVariants} className="col-span-12 lg:col-span-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-8 min-h-[400px] flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
              <Layers className="w-5 h-5 text-ice" />
            </div>
            <h3 className="text-white font-medium text-lg">Asset Allocation</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {pieData.map((entry, index) => (
              <div key={index} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                <span className="text-xs text-slate-300 font-medium">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData.length > 0 ? pieData : [{ name: "Empty", value: 1 }]}
                innerRadius={100}
                outerRadius={130}
                paddingAngle={4}
                dataKey="value"
                stroke="none"
              >
                {pieData.length > 0
                  ? pieData.map((_entry, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="rgba(0,0,0,0)" strokeWidth={0} />
                    ))
                  : <Cell fill="#334155" />
                }
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#050505', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                itemStyle={{ color: '#fff', fontSize: '14px', fontWeight: 500 }}
                formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Value']}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-sm text-slate-500 uppercase tracking-wider mb-1">Total Assets</span>
            <span className="text-3xl font-bold text-white font-mono pointer-events-auto">
              {totalValue >= 1000 ? `$${(totalValue / 1000).toFixed(1)}k` : `$${totalValue.toFixed(2)}`}
            </span>
          </div>
        </div>
      </motion.div>

      {/* 5. Live Oracles */}
      <motion.div variants={itemVariants} className="col-span-12 lg:col-span-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-8 min-h-[400px] flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
              <Activity className="w-5 h-5 text-ice" />
            </div>
            <h3 className="text-white font-medium text-lg">Live Oracles</h3>
          </div>
          <div className="flex items-center gap-2 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-xs text-blue-300 font-medium">Synced</span>
          </div>
        </div>

        <div className="flex-1 grid gap-3 content-start">
          {prices.map((p) => (
            <div key={p.asset} className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5 hover:bg-white/5 transition-colors group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-sm font-bold text-slate-300 border border-white/5 group-hover:border-ice/30 group-hover:text-ice transition-colors">
                  {p.asset.substring(0, 3)}
                </div>
                <div>
                  <p className="text-white text-base font-medium">{p.asset}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white font-mono font-medium text-lg">${p.price.toFixed(2)}</p>
              </div>
            </div>
          ))}
          {prices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3">
              <div className="w-6 h-6 border-2 border-white/10 border-t-ice rounded-full animate-spin" />
              <span className="text-sm">Connecting to oracles...</span>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4" />
          <span>CoinGecko Oracle Feed</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
