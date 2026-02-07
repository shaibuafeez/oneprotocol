"use client";

import { useState, useEffect } from "react";
import { getAgentLogs, setLogCallback } from "@/agent/executor";
import type { AgentLog } from "@/lib/types";

export function BridgeMonitor() {
  const [bridgeLogs, setBridgeLogs] = useState<AgentLog[]>([]);

  useEffect(() => {
    // Filter existing logs for bridge-related activity
    const allLogs = getAgentLogs();
    const filtered = allLogs.filter(
      (l) =>
        l.message.toLowerCase().includes("bridge") ||
        l.message.toLowerCase().includes("cross-chain") ||
        l.message.toLowerCase().includes("lifi") ||
        l.message.toLowerCase().includes("cctp") ||
        l.message.toLowerCase().includes("route")
    );
    setBridgeLogs(filtered);

    // Subscribe to new logs and filter for bridge activity
    const prevCallback = setLogCallback;
    setLogCallback((log) => {
      const msg = log.message.toLowerCase();
      if (
        msg.includes("bridge") ||
        msg.includes("cross-chain") ||
        msg.includes("lifi") ||
        msg.includes("cctp") ||
        msg.includes("route")
      ) {
        setBridgeLogs((prev) => [...prev.slice(-19), log]);
      }
    });

    return () => {
      setLogCallback(() => { });
    };
  }, []);

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg shadow-blue-900/10 hover:border-cyan-500/30 transition-all">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Bridge Monitor
        </h2>
        <span className="text-xs font-mono text-slate-500 bg-white/5 px-2 py-1 rounded border border-white/10">
          {bridgeLogs.length} events
        </span>
      </div>

      <div className="space-y-4">
        {bridgeLogs.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No bridge activity yet. Use the bridge panel or voice agent to initiate transfers.
          </div>
        ) : (
          bridgeLogs.slice(-5).map((log, i) => (
            <div key={`${log.timestamp}-${i}`} className="relative pl-6 border-l border-white/10 pb-2 last:pb-0">
              {/* Timeline Dot */}
              <div className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full border border-black ${log.level === "action"
                ? "bg-cyan-500 shadow-[0_0_8px_#22d3ee]"
                : log.level === "error"
                  ? "bg-red-500 shadow-[0_0_8px_#ef4444]"
                  : "bg-blue-500 shadow-[0_0_8px_#3b82f6]"
                }`}></div>

              <div className="bg-black/40 border border-white/5 rounded-xl p-4 hover:bg-white/5 transition-colors">
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-xs font-bold uppercase ${log.level === "action" ? "text-cyan-400" :
                    log.level === "error" ? "text-red-400" :
                      log.level === "warn" ? "text-amber-400" :
                        "text-blue-400"
                    }`}>
                    {log.level}
                  </span>
                  <span className="text-[10px] text-slate-600 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-slate-300">{log.message}</p>
                {log.data && (
                  <p className="text-[10px] text-slate-600 mt-1 font-mono">
                    {Object.entries(log.data).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
