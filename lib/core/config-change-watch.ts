import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const POLL_MS = 1000;
const encoder = new TextEncoder();

type LiveListener = (payload: string) => void;

declare global {
  var __MODEL_PULSE_LIVE_LISTENERS__: Set<LiveListener> | undefined;
  var __MODEL_PULSE_LIVE_TIMER__: NodeJS.Timeout | undefined;
  var __MODEL_PULSE_LIVE_STAMP__: string | null | undefined;
}

function getListeners(): Set<LiveListener> {
  if (!globalThis.__MODEL_PULSE_LIVE_LISTENERS__) {
    globalThis.__MODEL_PULSE_LIVE_LISTENERS__ = new Set();
  }
  return globalThis.__MODEL_PULSE_LIVE_LISTENERS__;
}

function encodeSse(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function encodeComment(text: string): Uint8Array {
  return encoder.encode(`: ${text}\n\n`);
}

async function readRevisionStamp(): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("check_data_revision")
    .select("bumped_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("[model-pulse] 读取配置版本失败", error);
    return null;
  }

  const bumpedAt = data?.bumped_at;
  return typeof bumpedAt === "string" ? bumpedAt : bumpedAt ? new Date(bumpedAt).toISOString() : null;
}

async function pollRevision(): Promise<void> {
  const stamp = await readRevisionStamp();
  if (!stamp) {
    return;
  }

  const previous = globalThis.__MODEL_PULSE_LIVE_STAMP__;
  if (previous === undefined) {
    globalThis.__MODEL_PULSE_LIVE_STAMP__ = stamp;
    return;
  }
  if (previous === stamp) {
    return;
  }

  globalThis.__MODEL_PULSE_LIVE_STAMP__ = stamp;
  const payload = JSON.stringify({ type: "configs-changed" });
  for (const listener of getListeners()) {
    listener(payload);
  }
}

function ensureWatcher(): void {
  if (globalThis.__MODEL_PULSE_LIVE_TIMER__) {
    return;
  }
  globalThis.__MODEL_PULSE_LIVE_TIMER__ = setInterval(() => {
    pollRevision().catch((error) => {
      console.error("[model-pulse] 配置版本轮询失败", error);
    });
  }, POLL_MS);
  pollRevision().catch(() => undefined);
}

function stopWatcherIfIdle(): void {
  if (getListeners().size > 0) {
    return;
  }
  if (globalThis.__MODEL_PULSE_LIVE_TIMER__) {
    clearInterval(globalThis.__MODEL_PULSE_LIVE_TIMER__);
    globalThis.__MODEL_PULSE_LIVE_TIMER__ = undefined;
  }
}

export function createConfigChangeStream(): ReadableStream<Uint8Array> {
  let listener: LiveListener | undefined;
  let heartbeat: NodeJS.Timeout | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      listener = (payload) => {
        try {
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // 客户端已断开
        }
      };
      getListeners().add(listener);
      ensureWatcher();
      controller.enqueue(encodeSse({ type: "hello" }));
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encodeComment("ping"));
        } catch {
          // 客户端已断开
        }
      }, 15000);
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      if (listener) {
        getListeners().delete(listener);
      }
      stopWatcherIfIdle();
    },
  });
}
