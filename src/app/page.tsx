"use client";

import { useState, useCallback } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { WalletConnect } from "@/components/WalletConnect";
import { YieldDashboard } from "@/components/YieldDashboard";
import { Header } from "@/components/Header";

export default function DashboardPage() {
  const account = useCurrentAccount();
  const [yieldRefreshTrigger, setYieldRefreshTrigger] = useState(0);

  const handleYieldUpdate = useCallback(() => {
    setYieldRefreshTrigger((p) => p + 1);
  }, []);

  return (
    <div className="min-h-screen text-foreground">
      <Header />

      <main className="pt-24 max-w-[1400px] mx-auto px-6 pb-12">
        {!account ? (
          /* Hero Landing */
          <div className="text-center py-32 animate-in fade-in zoom-in duration-700">
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 bg-ice/20 rounded-full blur-3xl animate-pulse-slow"></div>
              <div className="relative w-full h-full bg-gradient-to-br from-slate-900 to-black rounded-2xl flex items-center justify-center shadow-2xl border border-white/10 shadow-ice/20">
                <div className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-ice to-blue-500">D</div>
              </div>
            </div>

            <h2 className="text-5xl font-extrabold tracking-tight text-white mb-6 drop-shadow-[0_0_15px_rgba(136,189,242,0.5)]">
              The Winter of <span className="text-ice">Yield</span>
            </h2>
            <p className="text-slate-400 max-w-lg mx-auto mb-10 text-lg leading-relaxed font-light">
              AI-driven treasury management. Seamlessly bridging Sui and Arc.
              Pure, autonomous, and precise.
            </p>

            <div className="flex justify-center mb-12">
              <WalletConnect />
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              {[
                "Real APY Detection",
                "Cross-Chain Bridging",
                "Voice Control",
                "Autonomous Rebalancing",
                "Arc Settlement",
              ].map((feature) => (
                <span
                  key={feature}
                  className="text-xs font-medium px-4 py-1.5 bg-white/5 border border-white/10 backdrop-blur-md text-ice rounded-full shadow-sm hover:bg-white/10 transition-colors"
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>
        ) : (
          /* Dashboard — Yield data only, spacious */
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Portfolio</h2>
              <p className="text-slate-400 text-sm">
                Live yield opportunities across Sui, Arbitrum, Optimism & Arc
              </p>
            </div>
            <YieldDashboard refreshTrigger={yieldRefreshTrigger} />
          </div>
        )}
      </main>
    </div>
  );
}
