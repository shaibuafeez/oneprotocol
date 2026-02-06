"use client";

import { useState, useEffect, useRef } from "react";
import { getAgentLogs, setLogCallback } from "@/agent/executor";
import type { AgentLog } from "@/lib/types";

interface AgentActivityProps {
  suiBalance: bigint;
  arcBalance: bigint;
  isRunning: boolean;
  onToggle: () => void;
}

const LEVEL_COLORS: Record<AgentLog["level"], string> = {
  info: "text-blue-400",
  warn: "text-amber-400",
  action: "text-emerald-400",
  error: "text-red-400",
};

export function AgentActivity({
  suiBalance,
  arcBalance,
  isRunning,
  onToggle,
}: AgentActivityProps) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load existing logs on mount + subscribe to new ones
  useEffect(() => {
    setLogs(getAgentLogs());

    setLogCallback((log) => {
      setLogs((prev) => [...prev.slice(-99), log]);
    });

    return () => {
      setLogCallback(() => { });
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-0 flex flex-col shadow-lg shadow-purple-900/10 hover:border-cyan-500/30 transition-all h-[400px] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
        <h3 className="font-bold text-white flex items-center gap-2">
          <svg
            className={`w-4 h-4 ${isRunning ? "text-emerald-400 animate-pulse" : "text-slate-500"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          AGENT TERMINAL
        </h3>
        <div className="flex items-center gap-3">
          <div className="text-[10px] font-mono text-slate-500">
            {logs.length} entries
          </div>
          <button
            onClick={onToggle}
            className={`
            relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2
            ${isRunning ? "bg-emerald-500" : "bg-slate-700"}
          `}
          >
            <span
              className={`
              pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
              ${isRunning ? "translate-x-4" : "translate-x-0"}
            `}
            />
          </button>
        </div>
      </div>

      {/* Logs Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs bg-black/40 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {logs.length === 0 && (
          <div className="text-slate-600 text-center py-8">
            No agent activity yet. Start the agent or use voice commands.
          </div>
        )}
        {logs.map((log, i) => (
          <div key={`${log.timestamp}-${i}`} className="flex gap-3 group animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="text-slate-600 min-w-[60px]">
              {new Date(log.timestamp).toLocaleTimeString([], {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`font-bold ${LEVEL_COLORS[log.level]}`}>
                  [{log.level.toUpperCase()}]
                </span>
              </div>
              <p className="text-slate-400 group-hover:text-slate-300 transition-colors">
                {log.message}
              </p>
              {log.data && (
                <p className="text-slate-600 text-[10px] mt-0.5">
                  {Object.entries(log.data).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      {/* Footer */}
      <div className="p-2 bg-black/60 border-t border-white/10 text-[10px] font-mono text-slate-500 flex items-center gap-2">
        <span className={isRunning ? "text-cyan-500 animate-pulse" : "text-slate-600"}>
          {isRunning ? ">" : "#"}
        </span>
        <span className="opacity-50">
          {isRunning ? "Agent running..." : "Agent idle"}
        </span>
      </div>
    </div>
  );
}
