export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startGeminiWsServer } = await import("./server/ws-server");
    startGeminiWsServer();
  }
}
