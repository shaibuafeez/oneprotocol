"use client";

import { useState, useEffect, useRef } from "react";
import { getAgentLogs, setLogCallback } from "@/agent/executor";
import type { AgentLog } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";

// Monochromatic Ice Palette for Logs
const LEVEL_COLORS: Record<AgentLog["level"], string> = {
    info: "text-slate-400",
    warn: "text-[#88BDF2]", // Ice Blue for warning (replaces Amber)
    action: "text-white",   // White for action (replaces Emerald)
    error: "text-red-500",  // Keep red for critical errors
};

export function NeuralFeed() {
    const [logs, setLogs] = useState<AgentLog[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLogs(getAgentLogs());
        setLogCallback((log) => {
            setLogs((prev) => [...prev.slice(-49), log]);
        });
        return () => setLogCallback(() => { });
    }, []);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    return (
        <div className="flex flex-col h-full font-mono text-xs overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2">
                <h3 className="text-[#88BDF2] tracking-widest uppercase text-[10px] font-bold opacity-80">
                    Neural_Link // Active
                </h3>
                <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-[#88BDF2] rounded-full animate-pulse" />
                    <span className="w-1.5 h-1.5 bg-[#88BDF2]/50 rounded-full" />
                    <span className="w-1.5 h-1.5 bg-[#88BDF2]/20 rounded-full" />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-none mask-image-gradient">
                <AnimatePresence initial={false}>
                    {logs.map((log, i) => (
                        <motion.div
                            key={`${log.timestamp}-${i}`}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="border-l border-white/10 pl-3 py-1 hover:border-[#88BDF2]/50 transition-colors group"
                        >
                            <div className="flex items-baseline justify-between opacity-50 text-[10px] mb-0.5 group-hover:opacity-100 transition-opacity">
                                <span className="text-slate-500">
                                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span className={`font-bold tracking-wide ${LEVEL_COLORS[log.level]}`}>
                                    {log.level.toUpperCase()}
                                </span>
                            </div>
                            <p className="text-slate-300 leading-relaxed text-shadow-sm">
                                {log.message}
                            </p>
                            {log.data && (
                                <div className="mt-1 p-2 bg-white/5 rounded border border-white/5 text-[10px] text-slate-500 font-mono overflow-hidden">
                                    {JSON.stringify(log.data)}
                                </div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
                <div ref={logsEndRef} />
            </div>

            {/* Decorative Bottom Line */}
            <div className="mt-2 h-[1px] bg-gradient-to-r from-transparent via-[#88BDF2]/30 to-transparent" />
        </div>
    );
}
