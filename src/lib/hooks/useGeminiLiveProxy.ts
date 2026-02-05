"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { decode, decodeAudioData, createBlob } from "../audio/audioUtils";
import type { VoiceState, VoiceMessage } from "@/lib/types";

interface UseGeminiLiveProxyProps {
  walletAddress?: string;
  delegatorKey?: string; // base64 secret key from localStorage
  onMessage: (message: VoiceMessage) => void;
}

const WS_URL =
  typeof window !== "undefined"
    ? `ws://${window.location.hostname}:${process.env.NEXT_PUBLIC_DARA_WS_PORT || "3001"}`
    : "";

export function useGeminiLiveProxy({
  walletAddress,
  delegatorKey,
  onMessage,
}: UseGeminiLiveProxyProps) {
  const [appState, setAppState] = useState<VoiceState>("idle");
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const nextStartTimeRef = useRef(0);
  const wasListeningBeforeSpeaking = useRef(false);

  const sendWs = useCallback(
    (data: Record<string, unknown>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data));
      }
    },
    []
  );

  // ── Audio helpers ──

  const sendAudioChunk = useCallback(
    (data: Float32Array) => {
      const pcmBlob = createBlob(data);
      sendWs({ type: "audio", data: pcmBlob.data, mimeType: pcmBlob.mimeType });
    },
    [sendWs]
  );

  const setupMicProcessor = useCallback(
    (stream: MediaStream) => {
      const inputCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)({ sampleRate: 16000 });
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        sendAudioChunk(e.inputBuffer.getChannelData(0));
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);
    },
    [sendAudioChunk]
  );

  const stopMicrophone = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    wasListeningBeforeSpeaking.current = false;
    setAppState((cur) => (cur === "listening" ? "idle" : cur));
  }, []);

  const startMicrophone = useCallback(async () => {
    if (!isConnected || micStreamRef.current) return;

    try {
      setAppState("listening");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setupMicProcessor(stream);
    } catch {
      onMessage({
        sender: "ai",
        text: "Microphone access needed. Please enable it in browser settings.",
        isFinal: true,
      });
      setAppState("idle");
    }
  }, [isConnected, onMessage, setupMicProcessor]);

  // ── Session lifecycle ──

  const startSession = useCallback(() => {
    if (wsRef.current) return;

    setAppState("thinking");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    // Create playback AudioContext
    audioContextRef.current = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)({ sampleRate: 24000 });
    nextStartTimeRef.current = 0;

    ws.onopen = () => {
      console.log("[DARA] WS connected, sending init");
      sendWs({
        type: "init",
        walletAddress,
        delegatorKey,
      });
    };

    ws.onmessage = async (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      switch (msg.type) {
        case "ready":
          setIsConnected(true);
          setAppState("idle");
          onMessage({
            sender: "ai",
            text: "DARA connected. I'm ready to optimize your yields.",
            isFinal: true,
          });
          break;

        case "state":
          setAppState(msg.state as VoiceState);
          // Pause mic when AI starts speaking
          if (
            msg.state === "speaking" &&
            micStreamRef.current &&
            !wasListeningBeforeSpeaking.current
          ) {
            wasListeningBeforeSpeaking.current = true;
            if (scriptProcessorRef.current) {
              scriptProcessorRef.current.disconnect();
              scriptProcessorRef.current = null;
            }
          }
          break;

        case "audio": {
          const ctx = audioContextRef.current;
          if (!ctx) break;
          const audioBuffer = await decodeAudioData(
            decode(msg.data as string),
            ctx,
            24000,
            1
          );
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);

          const currentTime = ctx.currentTime;
          const startTime = Math.max(currentTime, nextStartTimeRef.current);
          source.start(startTime);
          nextStartTimeRef.current = startTime + audioBuffer.duration;

          source.onended = () => {
            if (ctx && nextStartTimeRef.current <= ctx.currentTime) {
              setAppState("idle");
            }
          };
          break;
        }

        case "turn_complete": {
          const inputText = (msg.inputText as string) || "";
          const outputText = (msg.outputText as string) || "";

          if (inputText) {
            onMessage({ sender: "user", text: inputText, isFinal: true });
          }
          if (outputText) {
            onMessage({ sender: "ai", text: outputText, isFinal: true });
          }

          // Restart mic after AI finishes
          if (wasListeningBeforeSpeaking.current && micStreamRef.current) {
            wasListeningBeforeSpeaking.current = false;
            setupMicProcessor(micStreamRef.current);
            setAppState("listening");
          }
          break;
        }

        case "function_call":
          onMessage({
            sender: "ai",
            text: `Executing: ${msg.name}...`,
            isFinal: true,
            type: "function_call",
            functionName: msg.name as string,
            functionArgs: msg.args as Record<string, unknown>,
          });
          break;

        case "function_result":
          onMessage({
            sender: "ai",
            text: msg.result as string,
            isFinal: true,
            type: "function_result",
            functionName: msg.name as string,
          });
          break;

        case "error":
          onMessage({
            sender: "ai",
            text: `Error: ${msg.message}`,
            isFinal: true,
          });
          setAppState("error");
          break;
      }
    };

    ws.onclose = () => {
      console.log("[DARA] WS disconnected");
      stopMicrophone();
      wsRef.current = null;
      setIsConnected(false);
      setAppState("idle");
    };

    ws.onerror = (e) => {
      console.error("[DARA] WS error:", e);
      onMessage({
        sender: "ai",
        text: "Connection error. Please try again.",
        isFinal: true,
      });
      setAppState("error");
    };
  }, [walletAddress, delegatorKey, onMessage, sendWs, stopMicrophone, setupMicProcessor]);

  const toggleListening = useCallback(() => {
    if (appState === "listening") {
      stopMicrophone();
    } else {
      startMicrophone();
    }
  }, [appState, startMicrophone, stopMicrophone]);

  const sendTextMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      onMessage({ sender: "user", text: text.trim(), isFinal: true });
      sendWs({ type: "text", text: text.trim() });
    },
    [onMessage, sendWs]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicrophone();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [stopMicrophone]);

  return {
    appState,
    startSession,
    toggleListening,
    sendTextMessage,
    isConnected,
  };
}
