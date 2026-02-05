"use client";

import { Header } from "@/components/Header";
import { SwapPanel } from "@/components/SwapPanel";

export default function SwapPage() {
  return (
    <div className="min-h-screen text-foreground">
      <Header />

      <main className="pt-24 max-w-[1200px] mx-auto px-6 pb-12">
        <div className="flex flex-col items-center">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-1">Swap</h2>
            <p className="text-slate-400 text-sm">
              Trade any token on Sui with best execution
            </p>
          </div>

          <div className="w-full max-w-lg">
            <SwapPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
