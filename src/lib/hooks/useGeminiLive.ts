"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { decode, decodeAudioData, createBlob } from "../audio/audioUtils";
import { DARA_FUNCTIONS, DARA_SYSTEM_PROMPT } from "@/agent/functions";
import { executeFunction } from "@/agent/executor";
import { enqueue, isOnline, processQueue } from "@/agent/offline-queue";
import { GEMINI_MODEL, GEMINI_VOICE } from "@/lib/constants";
import type { VoiceState, VoiceMessage } from "@/lib/types";
import type { Transaction } from "@mysten/sui/transactions";

interface UseGeminiLiveProps {
  apiKey: string;
  walletAddress?: string;
  onMessage: (message: VoiceMessage) => void;
  delegatorExecute?: (
    tx: Transaction
  ) => Promise<{ digest: string; success: boolean } | null>;
}

export function useGeminiLive({
  apiKey,
  walletAddress,
  onMessage,
  delegatorExecute,
}: UseGeminiLiveProps) {
  const [appState, setAppState] = useState<VoiceState>("idle");

  const sessionRef = useRef<Session | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const isInitializingRef = useRef(false);

  const currentInputTranscription = useRef("");
  const currentOutputTranscription = useRef("");
  const wasListeningBeforeSpeaking = useRef(false);

  // Process offline queue when coming back online
  useEffect(() => {
    const handleOnline = async () => {
      console.log("[DARA] Back online — processing offline queue...");
      onMessage({
        sender: "ai",
        text: "Back online! Processing queued commands...",
        isFinal: true,
      });

      const results = await processQueue(async (functionName, args) => {
        return executeFunction(functionName, args, {
          walletAddress,
          delegatorExecute,
        });
      });

      if (results.length > 0) {
        const summary = results
          .map((r) => `${r.success ? "Done" : "Failed"}: ${r.result}`)
          .join("\n");
        onMessage({
          sender: "ai",
          text: `Processed ${results.length} queued commands:\n${summary}`,
          isFinal: true,
        });
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [walletAddress, delegatorExecute, onMessage]);

  const sendAudioChunk = useCallback((data: Float32Array) => {
    const session = sessionRef.current;
    if (!session) return;
    const pcmBlob = createBlob(data);
    session.sendRealtimeInput({ media: pcmBlob });
  }, []);

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

  const startMicrophone = useCallback(async () => {
    if (!sessionRef.current || micStreamRef.current) return;

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
  }, [onMessage, setupMicProcessor]);

  const startSession = useCallback(async () => {
    if (!apiKey) {
      onMessage({
        sender: "ai",
        text: "API key not configured. Set NEXT_PUBLIC_GEMINI_API_KEY.",
        isFinal: true,
      });
      return;
    }
    if (sessionRef.current || isInitializingRef.current) return;

    isInitializingRef.current = true;
    setAppState("thinking");

    const ai = new GoogleGenAI({ apiKey });
    audioContextRef.current = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)({ sampleRate: 24000 });
    let nextStartTime = 0;

    try {
      const session = await ai.live.connect({
        model: GEMINI_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: GEMINI_VOICE },
            },
          },
          systemInstruction: {
            parts: [{ text: DARA_SYSTEM_PROMPT }],
          },
          tools: [{ functionDeclarations: DARA_FUNCTIONS }],
        },
        callbacks: {
          onopen: () => {
            console.log("[DARA] Session opened");
            setAppState("idle");
            onMessage({
              sender: "ai",
              text: "DARA connected. I'm ready to optimize your yields.",
              isFinal: true,
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle function calls
            if (message.toolCall?.functionCalls) {
              for (const fc of message.toolCall.functionCalls) {
                console.log(`[DARA] Function call: ${fc.name}`, fc.args);
                let result = "ok";

                try {
                  if (!isOnline()) {
                    enqueue(fc.name || "", fc.args || {});
                    result =
                      "You're currently offline. I've queued this command and will execute it when you're back online.";
                    onMessage({
                      sender: "ai",
                      text: `Queued: ${fc.name} (offline)`,
                      isFinal: true,
                    });
                  } else {
                    onMessage({
                      sender: "ai",
                      text: `Executing: ${fc.name}...`,
                      isFinal: true,
                    });

                    result = await executeFunction(
                      fc.name || "",
                      fc.args || {},
                      {
                        walletAddress,
                        delegatorExecute,
                      }
                    );

                    onMessage({
                      sender: "ai",
                      text: result,
                      isFinal: true,
                    });
                  }
                } catch (e) {
                  result = "There was an error performing that action.";
                  console.error("[DARA] Function error:", e);
                }

                session.sendToolResponse({
                  functionResponses: [
                    {
                      id: fc.id || "",
                      name: fc.name || "",
                      response: { result },
                    },
                  ],
                });
              }
            }

            // Handle transcriptions
            const sc = message.serverContent;
            if (sc?.inputTranscription?.text) {
              currentInputTranscription.current +=
                sc.inputTranscription.text;
            }
            if (sc?.outputTranscription?.text) {
              if (
                micStreamRef.current &&
                !wasListeningBeforeSpeaking.current
              ) {
                wasListeningBeforeSpeaking.current = true;
                if (scriptProcessorRef.current) {
                  scriptProcessorRef.current.disconnect();
                  scriptProcessorRef.current = null;
                }
              }
              setAppState("speaking");
              currentOutputTranscription.current +=
                sc.outputTranscription.text;
            }

            // Handle turn complete
            if (sc?.turnComplete) {
              const finalInput = currentInputTranscription.current.trim();
              const finalOutput = currentOutputTranscription.current.trim();

              if (finalInput) {
                onMessage({ sender: "user", text: finalInput, isFinal: true });
              }
              if (finalOutput) {
                onMessage({ sender: "ai", text: finalOutput, isFinal: true });
              }

              currentInputTranscription.current = "";
              currentOutputTranscription.current = "";

              // Restart microphone after AI finishes speaking
              if (
                wasListeningBeforeSpeaking.current &&
                micStreamRef.current
              ) {
                wasListeningBeforeSpeaking.current = false;
                setupMicProcessor(micStreamRef.current);
                setAppState("listening");
              }
            }

            // Handle audio playback
            const parts = sc?.modelTurn?.parts;
            const audioData = parts?.[0]?.inlineData?.data;
            if (audioData && audioContextRef.current) {
              setAppState("speaking");
              const audioBuffer = await decodeAudioData(
                decode(audioData),
                audioContextRef.current,
                24000,
                1
              );
              const source = audioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioContextRef.current.destination);

              const currentTime = audioContextRef.current.currentTime;
              const startTime = Math.max(currentTime, nextStartTime);
              source.start(startTime);
              nextStartTime = startTime + audioBuffer.duration;

              source.onended = () => {
                if (
                  audioContextRef.current &&
                  nextStartTime <= audioContextRef.current.currentTime
                ) {
                  setAppState("idle");
                }
              };
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error("[DARA] Session error:", e);
            onMessage({
              sender: "ai",
              text: `Connection error: ${e.message}`,
              isFinal: true,
            });
            setAppState("error");
          },
          onclose: () => {
            console.log("[DARA] Session closed");
            stopMicrophone();
            sessionRef.current = null;
            isInitializingRef.current = false;
            setAppState("idle");
          },
        },
      });

      sessionRef.current = session;
      isInitializingRef.current = false;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("[DARA] Connection failed:", msg);
      setAppState("error");
      onMessage({
        sender: "ai",
        text: `Could not connect: ${msg}`,
        isFinal: true,
      });
      sessionRef.current = null;
      isInitializingRef.current = false;
    }
  }, [apiKey, walletAddress, onMessage, delegatorExecute, stopMicrophone, setupMicProcessor]);

  const toggleListening = useCallback(() => {
    if (appState === "listening") {
      stopMicrophone();
    } else {
      startMicrophone();
    }
  }, [appState, startMicrophone, stopMicrophone]);

  const sendTextMessage = useCallback(
    (text: string) => {
      const session = sessionRef.current;
      if (!session || !text.trim()) return;

      onMessage({ sender: "user", text: text.trim(), isFinal: true });
      session.sendClientContent({
        turns: [{ role: "user", parts: [{ text: text.trim() }] }],
        turnComplete: true,
      });
    },
    [onMessage]
  );

  useEffect(() => {
    return () => {
      stopMicrophone();
      sessionRef.current = null;
    };
  }, [stopMicrophone]);

  return {
    appState,
    startSession,
    toggleListening,
    sendTextMessage,
    isConnected: !!sessionRef.current,
  };
}
