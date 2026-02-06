"use client";

import { useState, useEffect } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { getCurrentPositions } from "@/agent/yield-scanner";
import { fetchPrices } from "@/agent/strategy";

export function AgentContextBar() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const [suiBalance, setSuiBalance] = useState<number>(0);
  const [suiPrice, setSuiPrice] = useState<number>(0);
  const [positionCount, setPositionCount] = useState<number>(0);
  const [totalDeposited, setTotalDeposited] = useState<number>(0);
  const [bestApy, setBestApy] = useState<number>(0);

  useEffect(() => {
    const update = async () => {
      try {
        const prices = await fetchPrices();
        const sui = prices.find((p) => p.asset === "SUI");
        if (sui) setSuiPrice(sui.price);
      } catch { }

      if (account?.address) {
        try {
          const bal = await suiClient.getBalance({
            owner: account.address,
            coinType: "0x2::sui::SUI",
          });
          setSuiBalance(Number(bal.totalBalance) / 1e9);
        } catch { }
      }

      const positions = getCurrentPositions();
      setPositionCount(positions.length);
      setTotalDeposited(positions.reduce((s, p) => s + p.amountUsd, 0));
      if (positions.length > 0) {
        setBestApy(Math.max(...positions.map((p) => p.apy)));
      }
    };

    update();
    const interval = setInterval(update, 15000);
    return () => clearInterval(interval);
  }, [account?.address, suiClient]);

  const metrics = [
    {
      label: "Balance",
      value: `${suiBalance.toFixed(2)} SUI`,
      sub: `$${(suiBalance * suiPrice).toFixed(2)}`,
    },
    {
      label: "Positions",
      value: String(positionCount),
      sub: totalDeposited > 0 ? `$${totalDeposited.toFixed(0)}` : "None",
    },
    {
      label: "Best APY",
      value: bestApy > 0 ? `${bestApy.toFixed(1)}%` : "--",
    },
  ];

  return (
    <div className="w-full flex items-center justify-between px-6 py-4 bg-black/20 border border-white/[0.04] backdrop-blur-xl rounded-full">
      {/* Status indicator */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-2 h-2 rounded-full bg-emerald-500/80 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse"></div>
        </div>
        <span className="text-[10px] font-mono text-white/30 tracking-[0.3em] font-bold">SYSTEM ONLINE</span>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-8 md:gap-12">
        {metrics.map((m, i) => (
          <div key={i} className="flex flex-col items-end">
            <span className="text-[9px] text-white/30 font-mono uppercase tracking-widest mb-0.5">{m.label}</span>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-mono font-medium text-white/90">{m.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
