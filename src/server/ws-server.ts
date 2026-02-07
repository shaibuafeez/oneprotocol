/**
 * DARA WebSocket Server — proxies Gemini Live API sessions
 *
 * Runs on port 3001 (configurable via DARA_WS_PORT).
 * Each client WebSocket gets its own Gemini Live session.
 * Function calls execute server-side via executor.ts.
 * API key stays on the server — never sent to browser.
 */

import { WebSocketServer, WebSocket } from "ws";
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { DARA_FUNCTIONS, DARA_SYSTEM_PROMPT } from "@/agent/functions";
import { executeFunction } from "@/agent/executor";
import { GEMINI_MODEL, GEMINI_VOICE, SUI_NETWORK } from "@/lib/constants";
import type { VoiceState } from "@/lib/types";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";

const PORT = parseInt(process.env.DARA_WS_PORT || "3001", 10);

// Build a delegator execute function from a base64 secret key
function buildDelegatorExecute(delegatorKeyB64: string) {
  const keyBytes = Buffer.from(delegatorKeyB64, "base64");
  const privateKey = keyBytes.slice(0, 32);
  const keypair = Ed25519Keypair.fromSecretKey(privateKey);
  const address = keypair.getPublicKey().toSuiAddress();
  const network = SUI_NETWORK as "testnet" | "mainnet" | "devnet" | "localnet";
  const rpcClient = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(network),
    network,
  });

  console.log("[WS] Delegator address:", address);

  return async (
    transaction: Transaction
  ): Promise<{ digest: string; success: boolean } | null> => {
    try {
      transaction.setSender(address);
      const result = await rpcClient.signAndExecuteTransaction({
        signer: keypair as Parameters<
          typeof rpcClient.signAndExecuteTransaction
        >[0]["signer"],
        transaction: transaction as Parameters<
          typeof rpcClient.signAndExecuteTransaction
        >[0]["transaction"],
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });
      console.log("[WS] Delegator executed:", result.digest);
      return {
        digest: result.digest,
        success: result.effects?.status.status === "success",
      };
    } catch (error) {
      console.error("[WS] Delegator execution failed:", error);
      throw error;
    }
  };
}

function sendJson(ws: WebSocket, data: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendState(ws: WebSocket, state: VoiceState) {
  sendJson(ws, { type: "state", state });
}

export function startGeminiWsServer() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(
      "[WS] GOOGLE_GEMINI_API_KEY not set. Voice agent will not work."
    );
    return;
  }

  const wss = new WebSocketServer({ port: PORT });
  console.log(`[WS] DARA WebSocket server listening on port ${PORT}`);

  wss.on("connection", (ws) => {
    console.log("[WS] Client connected");

    let geminiSession: Session | null = null;
    let walletAddress: string | undefined;
    let delegatorExecute:
      | ((
        tx: Transaction
      ) => Promise<{ digest: string; success: boolean } | null>)
      | undefined;

    // Transcription accumulators
    let currentInputTranscription = "";
    let currentOutputTranscription = "";

    ws.on("message", async (raw) => {
      let msg: {
        type: string;
        walletAddress?: string;
        delegatorKey?: string;
        data?: string;
        mimeType?: string;
        text?: string;
      };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendJson(ws, { type: "error", message: "Invalid JSON" });
        return;
      }

      switch (msg.type) {
        // ─── Initialize Gemini session ───
        case "init": {
          if (geminiSession) {
            sendJson(ws, {
              type: "error",
              message: "Session already active",
            });
            return;
          }

          walletAddress = msg.walletAddress;

          // Build delegator from key if provided
          if (msg.delegatorKey) {
            try {
              delegatorExecute = buildDelegatorExecute(msg.delegatorKey);
            } catch (e) {
              console.error("[WS] Invalid delegator key:", e);
            }
          }

          sendState(ws, "thinking");

          const ai = new GoogleGenAI({ apiKey });

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
                  console.log("[WS] Gemini session opened");
                  sendState(ws, "idle");
                  sendJson(ws, { type: "ready" });
                },

                onmessage: async (message: LiveServerMessage) => {
                  // ── Function calls ──
                  if (message.toolCall?.functionCalls) {
                    for (const fc of message.toolCall.functionCalls) {
                      console.log(
                        `[WS] Function call: ${fc.name}`,
                        fc.args
                      );
                      sendJson(ws, {
                        type: "function_call",
                        name: fc.name,
                        args: fc.args,
                      });

                      let result = "ok";
                      try {
                        result = await executeFunction(
                          fc.name || "",
                          fc.args || {},
                          { walletAddress, delegatorExecute }
                        );
                      } catch (e) {
                        result =
                          "There was an error performing that action.";
                        console.error("[WS] Function error:", e);
                      }

                      sendJson(ws, {
                        type: "function_result",
                        name: fc.name,
                        result,
                      });

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

                  // ── Transcriptions ──
                  const sc = message.serverContent;
                  if (sc?.inputTranscription?.text) {
                    currentInputTranscription +=
                      sc.inputTranscription.text;
                    sendJson(ws, {
                      type: "transcript_input",
                      text: sc.inputTranscription.text,
                    });
                  }
                  if (sc?.outputTranscription?.text) {
                    sendState(ws, "speaking");
                    currentOutputTranscription +=
                      sc.outputTranscription.text;
                    sendJson(ws, {
                      type: "transcript_output",
                      text: sc.outputTranscription.text,
                    });
                  }

                  // ── Turn complete ──
                  if (sc?.turnComplete) {
                    const inputText =
                      currentInputTranscription.trim();
                    const outputText =
                      currentOutputTranscription.trim();

                    sendJson(ws, {
                      type: "turn_complete",
                      inputText,
                      outputText,
                    });

                    currentInputTranscription = "";
                    currentOutputTranscription = "";
                  }

                  // ── Audio data ──
                  const parts = sc?.modelTurn?.parts;
                  const audioData = parts?.[0]?.inlineData?.data;
                  if (audioData) {
                    sendState(ws, "speaking");
                    sendJson(ws, {
                      type: "audio",
                      data: audioData,
                    });
                  }
                },

                onerror: (e: ErrorEvent) => {
                  console.error("[WS] Gemini error:", e.message);
                  sendJson(ws, {
                    type: "error",
                    message: e.message,
                  });
                  sendState(ws, "error");
                },

                onclose: () => {
                  console.log("[WS] Gemini session closed");
                  geminiSession = null;
                  sendState(ws, "idle");
                },
              },
            });

            geminiSession = session;
          } catch (e: unknown) {
            const errMsg =
              e instanceof Error ? e.message : "Unknown error";
            console.error("[WS] Gemini connect failed:", errMsg);
            sendJson(ws, {
              type: "error",
              message: `Could not connect: ${errMsg}`,
            });
            sendState(ws, "error");
          }
          break;
        }

        // ─── Audio from client mic ───
        case "audio": {
          if (!geminiSession) return;
          geminiSession.sendRealtimeInput({
            media: {
              data: msg.data!,
              mimeType: msg.mimeType || "audio/pcm;rate=16000",
            },
          });
          break;
        }

        // ─── Text message from client ───
        case "text": {
          if (!geminiSession || !msg.text?.trim()) return;
          geminiSession.sendClientContent({
            turns: [
              { role: "user", parts: [{ text: msg.text.trim() }] },
            ],
            turnComplete: true,
          });
          break;
        }

        default:
          sendJson(ws, {
            type: "error",
            message: `Unknown message type: ${msg.type}`,
          });
      }
    });

    ws.on("close", () => {
      console.log("[WS] Client disconnected");
      geminiSession = null;
    });

    ws.on("error", (err) => {
      console.error("[WS] Socket error:", err.message);
    });
  });
}
