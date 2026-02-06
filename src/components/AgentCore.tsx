"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useGeminiLiveProxy } from "@/lib/hooks/useGeminiLiveProxy";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Send, Radio, Terminal, CheckCircle } from "lucide-react";
import type { VoiceMessage, VoiceState } from "@/lib/types";
import { VoiceOrb } from "./VoiceOrb";

interface AgentCoreProps {
  walletAddress?: string;
  onYieldUpdate?: () => void;
  onSendRef?: (fn: (text: string) => void) => void;
  onConnectionChange?: (connected: boolean) => void;
}

function FunctionCallCard({ msg }: { msg: VoiceMessage }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mr-auto"
    >
      <div className="border border-ice/20 rounded-lg px-3 py-2.5 bg-ice/[0.03]">
        <div className="flex items-center gap-1.5 mb-1">
          <Terminal className="w-3 h-3 text-ice/60" />
          <span className="text-[10px] font-mono text-ice/60 uppercase tracking-wider">exec</span>
        </div>
        <p className="text-xs font-mono text-white/80">{msg.functionName}</p>
        {msg.functionArgs && Object.keys(msg.functionArgs).length > 0 && (
          <pre className="mt-1.5 text-[10px] text-slate-600 font-mono bg-black/20 rounded p-2 overflow-x-auto">
            {JSON.stringify(msg.functionArgs, null, 2)}
          </pre>
        )}
      </div>
    </motion.div>
  );
}

function FunctionResultCard({ msg }: { msg: VoiceMessage }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mr-auto"
    >
      <div className="border border-emerald-500/20 rounded-lg px-3 py-2.5 bg-emerald-500/[0.03]">
        <div className="flex items-center gap-1.5 mb-1">
          <CheckCircle className="w-3 h-3 text-emerald-500/60" />
          <span className="text-[10px] font-mono text-emerald-500/60 uppercase tracking-wider">result</span>
        </div>
        <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{msg.text}</p>
      </div>
    </motion.div>
  );
}

export function AgentCore({ walletAddress, onYieldUpdate, onSendRef, onConnectionChange }: AgentCoreProps) {
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [textInput, setTextInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const delegatorKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const stored = localStorage.getItem("dara_delegator_wallet");
    if (stored) delegatorKeyRef.current = stored;
  }, []);

  const onMessage = useCallback(
    (message: VoiceMessage) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (
          last?.text === message.text &&
          last?.sender === message.sender &&
          last?.type === message.type
        )
          return prev;
        return [...prev, { ...message, timestamp: Date.now() }];
      });

      if (message.sender === "ai" && (message.text.includes("yield") || message.text.includes("APY"))) {
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

  useEffect(() => {
    if (onSendRef) {
      onSendRef((text: string) => {
        if (!isConnected) return;
        setMessages((prev) => [
          ...prev,
          { sender: "user", text, isFinal: true, type: "text", timestamp: Date.now() },
        ]);
        sendTextMessage(text);
      });
    }
  }, [onSendRef, sendTextMessage, isConnected]);

  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, appState]);

  const handleSendText = () => {
    if (!textInput.trim()) return;
    setMessages((prev) => [
      ...prev,
      { sender: "user", text: textInput, isFinal: true, type: "text", timestamp: Date.now() },
    ]);
    sendTextMessage(textInput);
    setTextInput("");
  };

  return (
    <div className="flex flex-col h-full border border-white/[0.04] rounded-3xl bg-black/20 backdrop-blur-3xl overflow-hidden relative shadow-2xl shadow-black/50">
      {/* Content */}
      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Orb / Connect */}
        <div className={`flex-shrink-0 flex items-center justify-center transition-all duration-700 ${isConnected ? "h-64" : "h-full"}`}>
          {isConnected ? (
            <VoiceOrb state={appState} />
          ) : (
            <div className="text-center z-10">
              <button
                onClick={startSession}
                className="group relative inline-flex items-center justify-center px-8 py-3 text-sm font-mono font-medium text-white transition-all duration-300 bg-white/[0.03] border border-white/[0.1] rounded-full hover:bg-white/[0.06] hover:border-white/[0.2] focus:outline-none"
              >
                <span className="flex items-center gap-3">
                  <Radio className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
                  INITIALIZE SYSTEM
                </span>
              </button>
              <p className="mt-4 text-[10px] text-white/30 font-mono tracking-[0.2em] uppercase">
                Awaiting Manual Override
              </p>
            </div>
          )}
        </div>

        {/* Chat */}
        {isConnected && (
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 scrollbar-none">
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => {
                if (msg.type === "function_call") return <FunctionCallCard key={i} msg={msg} />;
                if (msg.type === "function_result") return <FunctionResultCard key={i} msg={msg} />;

                const isUser = msg.sender === "user";
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${isUser
                        ? "bg-white/[0.06] text-white border border-white/[0.08]"
                        : "bg-transparent text-slate-300"
                        }`}
                    >
                      {msg.text}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {appState === "thinking" && (
              <div className="flex gap-1 px-1 py-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.2, 0.8, 0.2] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                    className="w-1.5 h-1.5 bg-slate-500 rounded-full"
                  />
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      {isConnected && (
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleListening}
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${appState === "listening"
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-white"
                }`}
            >
              {appState === "listening" ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>

            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendText()}
              placeholder="Type a command..."
              className="flex-1 bg-transparent border-none text-sm text-white font-mono placeholder-slate-700 focus:outline-none px-2"
            />

            <button
              onClick={handleSendText}
              disabled={!textInput.trim()}
              className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-colors disabled:opacity-20"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
