"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { useGeminiLiveProxy } from "@/lib/hooks/useGeminiLiveProxy";
import { useDelegatorWallet } from "@/lib/hooks/useDelegatorWallet";
import { FundingDialog } from "./FundingDialog";
import type { VoiceMessage, VoiceState } from "@/lib/types";

interface VoiceAgentProps {
  walletAddress?: string;
  onYieldUpdate?: () => void;
}

const STATE_COLORS: Record<VoiceState, string> = {
  idle: "bg-slate-400",
  listening: "bg-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.5)]",
  thinking: "bg-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.5)]",
  speaking: "bg-cyan-500 shadow-[0_0_15px_rgba(14,165,233,0.5)]",
  error: "bg-red-400",
};

export function VoiceAgent({ walletAddress, onYieldUpdate }: VoiceAgentProps) {
  const suiClient = useSuiClient();
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [textInput, setTextInput] = useState("");
  const [showFunding, setShowFunding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Read delegator key from localStorage for server-side signing
  const delegatorKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const stored = localStorage.getItem("dara_delegator_wallet");
    if (stored) delegatorKeyRef.current = stored;
  }, []);

  const {
    delegatorBalance,
    isInitialized: delegatorReady,
  } = useDelegatorWallet(suiClient);

  const onMessage = useCallback(
    (message: VoiceMessage) => {
      setMessages((prev) => {
        // Deduplicate consecutive identical messages
        const last = prev[prev.length - 1];
        if (last?.text === message.text && last?.sender === message.sender) {
          return prev;
        }
        return [...prev.slice(-50), { ...message, timestamp: Date.now() }];
      });

      // Auto-scroll
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);

      // Trigger yield update when relevant functions complete
      if (
        message.sender === "ai" &&
        (message.text.includes("yield") || message.text.includes("APY"))
      ) {
        onYieldUpdate?.();
      }
    },
    [onYieldUpdate]
  );

  const { appState, startSession, toggleListening, sendTextMessage, isConnected } =
    useGeminiLiveProxy({
      walletAddress,
      delegatorKey: delegatorKeyRef.current,
      onMessage,
    });

  const handleSendText = () => {
    if (!textInput.trim()) return;
    setMessages((prev) => [
      ...prev,
      { sender: "user", text: textInput, isFinal: true, timestamp: Date.now() },
    ]);
    sendTextMessage(textInput);
    setTextInput("");
  };

  const toggleVoice = () => {
    startSession();
  };

  return (
    <div className="h-full flex flex-col bg-white/5 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl relative overflow-hidden group">
      {/* Ambient Glows */}
      <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-br from-cyan-900/10 to-transparent rounded-full blur-[100px] pointer-events-none group-hover:opacity-100 transition-opacity opacity-50" />

      {/* Header */}
      <div className="p-5 border-b border-white/5 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className={`w-3 h-3 rounded-full transition-all duration-500 ${STATE_COLORS[appState]}`}
            />
            {appState === "listening" && (
              <div className="absolute inset-0 rounded-full bg-teal-400 animate-ping opacity-75" />
            )}
          </div>
          <div>
            <h2 className="font-bold text-white tracking-wide">AI AGENT</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">{isConnected ? "Connected" : "Offline"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!delegatorReady ? (
            <button
              onClick={() => setShowFunding(true)}
              className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded border border-red-500/20 hover:bg-red-500/20 transition-colors"
            >
              Setup Wallet
            </button>
          ) : (
            <div className="text-[10px] text-emerald-400 font-mono bg-emerald-900/20 px-2 py-1 rounded border border-emerald-500/20">
              Gas: {(Number(delegatorBalance) / 1e9).toFixed(3)} SUI
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 relative z-10">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-4">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
              <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <p>Connect wallet and click mic to start</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.sender === "user"
                ? "bg-gradient-to-br from-cyan-600 to-blue-600 text-white rounded-tr-none"
                : "bg-white/10 text-slate-200 border border-white/5 rounded-tl-none backdrop-blur-md"
                }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {appState === "thinking" && (
          <div className="flex justify-start">
            <div className="bg-white/5 text-slate-400 text-xs px-4 py-2 rounded-full animate-pulse flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce delay-100"></span>
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce delay-200"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-white/5 bg-black/20 backdrop-blur-xl relative z-10">
        {!isConnected ? (
          <button
            onClick={toggleVoice}
            className="w-full py-3 bg-white hover:bg-slate-200 text-slate-900 rounded-xl text-sm font-bold transition-all shadow-lg hover:shadow-white/10 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Connect Agent
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendText()}
              placeholder="Type message..."
              className="flex-1 bg-white/5 border border-white/10 focus:bg-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
            />
            <button
              onClick={toggleListening}
              className={`w-12 flex items-center justify-center rounded-xl transition-all ${appState === 'listening' ? 'bg-red-500/20 text-red-500 border border-red-500/50' : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                }`}
            >
              {appState === 'listening' ? (
                <span className="w-3 h-3 bg-red-500 rounded-sm animate-pulse"></span>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              )}
            </button>
            <button
              onClick={handleSendText}
              disabled={!textInput.trim()}
              className="w-12 flex items-center justify-center bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition-all"
            >
              <svg className="w-4 h-4 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Funding Modal */}
      <FundingDialog
        open={showFunding}
        onOpenChange={setShowFunding}
      />
    </div>
  );
}
