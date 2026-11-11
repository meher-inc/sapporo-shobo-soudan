// Workers AI のストリーム（SSE）を、画面に流す文字だけのストリームにする。chat.ts から分けたのは、Node の単体テストで動かすため
import { ASSISTANT_FALLBACK } from "../config/prompt.ts";

const IDLE_TIMEOUT_MS = 25_000;
const STALLED_NOTE = "\n\n（回答の生成が途中で止まりました。もう一度お試しください。）";

/**
 * Normalizes Workers AI SSE (legacy `response` or OpenAI-style `choices`) into plain text chunks.
 * Ends the reply if the upstream sends nothing for IDLE_TIMEOUT_MS, so a stalled model never hangs the client.
 */
export function textStream(
  source: ReadableStream<Uint8Array>,
  onDone: (full: string, failure?: "timeout" | "fallback") => void | Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let full = "";
  // 保存は1回だけ。終わり（finish）と相手の切断（cancel）のどちらが先でも、もう一方は保存しない（F-26 レビュー M-5）
  let finished = false;

  // 回答の保存を終えてからストリームを閉じる。閉じた時点で画面に回答の下のボタンが出るので、
  // その後に押された「行政書士に依頼する」が、保存済みの回答を前提にできる（F-26 fixrules R4）
  const finish = async (controller: ReadableStreamDefaultController<Uint8Array>, note = "") => {
    if (finished) return;
    // 計測（error_shown）: 無応答の打ち切りは timeout、何も返らずフォールバック文になったら fallback
    const failure = note === STALLED_NOTE ? "timeout" : full ? undefined : "fallback";
    const tail = full ? note : ASSISTANT_FALLBACK;
    if (tail) {
      full += tail;
      controller.enqueue(encoder.encode(tail));
    }
    finished = true;
    await Promise.resolve(onDone(full, failure)).catch((err) => console.error("save_error", err));
    controller.close();
  };

  return new ReadableStream<Uint8Array>({
    // Loops until something is enqueued: a pull that enqueues nothing may not be called again.
    async pull(controller) {
      for (;;) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const idle = new Promise<"idle">((resolve) => (timer = setTimeout(() => resolve("idle"), IDLE_TIMEOUT_MS)));
        const result = await Promise.race([reader.read(), idle]).finally(() => clearTimeout(timer));
        if (result === "idle") {
          reader.cancel().catch(() => {});
          return finish(controller, STALLED_NOTE);
        }
        if (result.done) return finish(controller);
        buffer += decoder.decode(result.value, { stream: true });
        let emitted = false;
        let idx: number;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const json = JSON.parse(data) as { response?: string; choices?: { delta?: { content?: string } }[] };
            const piece = json.response ?? json.choices?.[0]?.delta?.content ?? "";
            if (piece) {
              full += piece;
              controller.enqueue(encoder.encode(piece));
              emitted = true;
            }
          } catch {
            // partial or non-JSON keepalive line
          }
        }
        if (emitted) return;
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
      if (finished) return;
      finished = true;
      void Promise.resolve(onDone(full || ASSISTANT_FALLBACK)).catch((err) => console.error("save_error", err));
    },
  });
}
