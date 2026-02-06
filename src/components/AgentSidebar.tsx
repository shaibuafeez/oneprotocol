"use client";

import { useState, useEffect, useRef } from "react";
import { getCurrentPositions } from "@/agent/yield-scanner";
import { getAgentLogs, setLogCallback } from "@/agent/executor";
import type { AgentLog, YieldPosition } from "@/lib/types";
import { AnimatePresence, motion } from "framer-motion";
import { Search, PieChart, Zap, BarChart3 } from "lucide-react";


const LEVEL_COLORS: Record<AgentLog["level"], string> = {
  info: "text-slate-500",
  warn: "text-amber-400/70",
  action: "text-ice/70",
  error: "text-red-400/70",
};

const QUICK_ACTIONS = [
  { icon: <Search className="w-3.5 h-3.5" />, label: "Find Yield", command: "What's the best yield opportunity right now?" },
  { icon: <PieChart className="w-3.5 h-3.5" />, label: "Portfolio", command: "Show me my portfolio and all positions" },
  { icon: <Zap className="w-3.5 h-3.5" />, label: "Optimize", command: "Start the auto-yield optimizer" },
  { icon: <BarChart3 className="w-3.5 h-3.5" />, label: "Rates", command: "What are the current Bluefin perpetual funding rates?" },
];

interface AgentSidebarProps {
  sendCommand: (text: string) => void;
  isConnected: boolean;
}

export function AgentSidebar({ sendCommand, isConnected }: AgentSidebarProps) {
  const [positions, setPositions] = useState<YieldPosition[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setPositions(getCurrentPositions());
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setLogs(getAgentLogs().slice(-20));
    setLogCallback((log) => {
      setLogs((p) => [...p.slice(-19), log]);
    });
    return () => setLogCallback(() => { });
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Quick Actions */}
      <div className="bg-white/[0.02] border border-white/[0.04] backdrop-blur-xl rounded-2xl p-4">
        <h3 className="text-[10px] text-white/40 font-mono uppercase tracking-[0.2em] font-bold mb-3">Quick Commands</h3>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((action, i) => (
            <button
              key={i}
              onClick={() => isConnected && sendCommand(action.command)}
              disabled={!isConnected}
              className="flex flex-col items-center justify-center gap-2 p-3 bg-transparent hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.15] rounded-xl transition-all disabled:opacity-20 disabled:cursor-not-allowed group"
            >
              <span className="text-white/40 group-hover:text-white transition-colors">{action.icon}</span>
              <span className="text-[10px] font-medium text-white/60 group-hover:text-white uppercase tracking-wider">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Positions */}
      <div>
        <h3 className="text-[10px] text-slate-600 font-mono uppercase tracking-wider mb-2.5 px-1">Positions</h3>
        {positions.length === 0 ? (
          <p className="text-[11px] text-slate-700 px-1">No active positions</p>
        ) : (
          <div className="space-y-1">
            {positions.map((pos, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-white/[0.02] rounded-lg">
                <div>
                  <p className="text-xs text-white">{pos.protocol}</p>
                  <p className="text-[10px] text-slate-600">{pos.asset}</p>
                </div>
                <p className="text-xs font-mono text-cyan-400">{pos.apy.toFixed(1)}%</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logs */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <h3 className="text-[10px] text-slate-600 font-mono uppercase tracking-wider mb-2.5 px-1 flex-shrink-0">Activity</h3>
        <div className="flex-1 overflow-y-auto space-y-0.5 font-mono text-[10px] scrollbar-none">
          <AnimatePresence initial={false}>
            {logs.map((log, i) => (
              <motion.div
                key={`${log.timestamp}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-2 px-1 py-0.5"
              >
                <span className="text-slate-700 flex-shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className={LEVEL_COLORS[log.level]}>{log.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
