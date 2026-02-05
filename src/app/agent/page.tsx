"use client";

import { useState, useCallback, useRef } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { Header } from "@/components/Header";
import { AgentContextBar } from "@/components/AgentContextBar";
import { AgentCore } from "@/components/AgentCore";
import { AgentSidebar } from "@/components/AgentSidebar";

export default function AgentPage() {
  const account = useCurrentAccount();
  const [isConnected, setIsConnected] = useState(false);
  const sendRef = useRef<(text: string) => void>(() => { });

  const handleSendRef = useCallback((fn: (text: string) => void) => {
    sendRef.current = fn;
  }, []);

  const sendCommand = useCallback((text: string) => {
    sendRef.current(text);
  }, []);

  return (
    <div className="min-h-screen w-full flex flex-col relative text-foreground selection:bg-cyan-500/30 overflow-x-hidden">
      {/* Background Layer */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-900/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-900/10 blur-[120px]" />
      </div>

      <div className="relative z-50">
        <Header />
      </div>

      {/* Main Cockpit Grid */}
      <main className="flex-1 relative z-10 pt-32 p-4 md:p-6 grid grid-rows-[auto_1fr] gap-6 max-w-[1800px] mx-auto w-full">

        {/* Top: HUD Ticker */}
        <div className="w-full">
          <AgentContextBar />
        </div>

        {/* Center: Split View */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">

          {/* Main Core (Orb + Chat) - Takes up 3/4 width on large screens */}
          <div className="lg:col-span-3 h-full min-h-0">
            <AgentCore
              walletAddress={account?.address}
              onSendRef={handleSendRef}
              onConnectionChange={setIsConnected}
            />
          </div>

          {/* Right Sidebar (Logs + Actions) - Takes up 1/4 width */}
          <div className="lg:col-span-1 h-full min-h-0 hidden lg:block">
            <div className="h-full bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-3xl p-4 overflow-hidden">
              <AgentSidebar sendCommand={sendCommand} isConnected={isConnected} />
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
