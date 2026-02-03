import { OfflineIntent } from "@/lib/types";

const STORAGE_KEY = "dara_offline_queue";

/**
 * Offline intent queue — stores voice commands when user is offline
 * Processes them in order when connectivity resumes
 */

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/** Get all queued intents */
export function getQueue(): OfflineIntent[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Save queue to localStorage */
function saveQueue(queue: OfflineIntent[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

/** Add an intent to the offline queue */
export function enqueue(
  functionName: string,
  args: Record<string, unknown>
): OfflineIntent {
  const intent: OfflineIntent = {
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    functionName,
    args,
    status: "queued",
  };

  const queue = getQueue();
  queue.push(intent);
  saveQueue(queue);

  console.log("[OfflineQueue] Queued intent:", intent.functionName);
  return intent;
}

/** Update an intent's status */
export function updateIntent(
  id: string,
  updates: Partial<Pick<OfflineIntent, "status" | "result" | "error">>
): void {
  const queue = getQueue();
  const idx = queue.findIndex((i) => i.id === id);
  if (idx >= 0) {
    queue[idx] = { ...queue[idx], ...updates };
    saveQueue(queue);
  }
}

/** Get pending (unprocessed) intents */
export function getPending(): OfflineIntent[] {
  return getQueue().filter((i) => i.status === "queued");
}

/** Clear completed/failed intents */
export function clearProcessed(): void {
  const queue = getQueue().filter(
    (i) => i.status === "queued" || i.status === "processing"
  );
  saveQueue(queue);
}

/** Clear entire queue */
export function clearQueue(): void {
  saveQueue([]);
}

/**
 * Process the offline queue
 * @param executor Function that executes each intent
 * @returns Array of processed results
 */
export async function processQueue(
  executor: (
    functionName: string,
    args: Record<string, unknown>
  ) => Promise<string>
): Promise<{ id: string; result: string; success: boolean }[]> {
  const pending = getPending();
  if (pending.length === 0) return [];

  console.log(
    `[OfflineQueue] Processing ${pending.length} queued intents...`
  );

  const results: { id: string; result: string; success: boolean }[] = [];

  for (const intent of pending) {
    updateIntent(intent.id, { status: "processing" });

    try {
      const result = await executor(intent.functionName, intent.args);
      updateIntent(intent.id, { status: "completed", result });
      results.push({ id: intent.id, result, success: true });
      console.log(`[OfflineQueue] Processed: ${intent.functionName} -> OK`);
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error ? error.message : "Unknown error";
      updateIntent(intent.id, { status: "failed", error: errMsg });
      results.push({ id: intent.id, result: errMsg, success: false });
      console.error(
        `[OfflineQueue] Failed: ${intent.functionName}:`,
        errMsg
      );
    }
  }

  return results;
}

/**
 * Format queue status for voice response
 */
export function formatQueueForVoice(): string {
  const queue = getQueue();
  if (queue.length === 0) return "No offline intents queued.";

  const pending = queue.filter((i) => i.status === "queued").length;
  const processing = queue.filter((i) => i.status === "processing").length;
  const completed = queue.filter((i) => i.status === "completed").length;
  const failed = queue.filter((i) => i.status === "failed").length;

  const parts: string[] = [];
  if (pending > 0) parts.push(`${pending} pending`);
  if (processing > 0) parts.push(`${processing} processing`);
  if (completed > 0) parts.push(`${completed} completed`);
  if (failed > 0) parts.push(`${failed} failed`);

  return `Offline queue: ${parts.join(", ")}`;
}
