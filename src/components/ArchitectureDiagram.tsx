"use client";

import { useMemo } from "react";

export function ArchitectureDiagram() {
  return (
    <div className="w-full aspect-video bg-black/40 rounded-xl border border-white/10 relative overflow-hidden flex items-center justify-center p-8">
      {/* Background Grid */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: "linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)",
          backgroundSize: "20px 20px"
        }}
      />

      <div className="relative z-10 flex items-center gap-12 w-full max-w-4xl justify-center">

        {/* User / Agent */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-lg shadow-cyan-500/10">
            <span className="text-3xl">🤖</span>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-white">AI Agent</p>
            <p className="text-[10px] text-slate-400">Gemini 2.0</p>
          </div>
        </div>

        {/* Connectors */}
        <div className="flex-1 h-[2px] bg-gradient-to-r from-cyan-500 to-blue-500 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 bg-black border border-white/20 rounded-full text-[10px] text-cyan-400 font-mono">
            VIEM / SUI SDK
          </div>
          {/* Animated particles */}
          <div className="absolute top-0 left-0 w-2 h-full bg-white blur-[2px] animate-shimmer"></div>
        </div>

        {/* Networks */}
        <div className="grid grid-cols-1 gap-6">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-blue-900/10 border border-blue-500/30 w-64">
            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold">S</div>
            <div>
              <p className="text-sm font-bold text-blue-200">Sui Network</p>
              <p className="text-[10px] text-blue-400">Yield Aggregation</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-purple-900/10 border border-purple-500/30 w-64 translate-x-8">
            <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center text-white font-bold">A</div>
            <div>
              <p className="text-sm font-bold text-purple-200">Arc Network</p>
              <p className="text-[10px] text-purple-400">RWA Settlement</p>
            </div>
          </div>
        </div>

      </div>

      <div className="absolute bottom-4 right-4 text-[10px] text-slate-500 font-mono">
        SYSTEM_ARCH_V1.0 // ONLINE
      </div>
    </div>
  );
}
