import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { createAnonymousUser } from "./session";
import { takeUserQuota } from "./caps";
import { ASSISTANT_FALLBACK, SYSTEM_PROMPT } from "../config/prompt";
import { runRules, rulesNote } from "../rules/extract.ts";
import { detectEscalation, laneRules, type Lane } from "./escalation";
import { actionsNote, buildActions, type Actions } from "./actions";
import { recordError, recordLimit } from "./events";

export const chat = new Hono<AppEnv>();

const MAX_INPUT = 2000;
const HISTORY_LIMIT = 12;

type Msg = { role: "user" | "assistant"; content: string };

function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 28 ? `${oneLine.slice(0, 28)}…` : oneLine;
}

/** 今まさに危険がある相談。回答の下に119番のボタンだけを出す */
const EMERGENCY = /燃えて(い|る)|火事です|火が出た|煙が出てい|閉じ込められ|人が倒れ/;

const IDLE_TIMEOUT_MS = 25_000;
const STALLED_NOTE = "\n\n（回答の生成が途中で止まりました。もう一度お試しください。）";

/**
 * Normalizes Workers AI SSE (legacy `response` or OpenAI-style `choices`) into plain text chunks.
 * Ends the reply if the upstream sends nothing for IDLE_TIMEOUT_MS, so a stalled model never hangs the client.
 */
function textStream(
  source: ReadableStream<Uint8Array>,
  onDone: (full: string, failure?: "timeout" | "fallback") => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let full = "";

  const finish = (controller: ReadableStreamDefaultController<Uint8Array>, note = "") => {
    // 計測（error_shown）: 無応答の打ち切りは timeout、何も返らずフォールバック文になったら fallback
    const failure = note === STALLED_NOTE ? "timeout" : full ? undefined : "fallback";
    const tail = full ? note : ASSISTANT_FALLBACK;
    if (tail) {
      full += tail;
      controller.enqueue(encoder.encode(tail));
    }
    controller.close();
    onDone(full, failure);
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
      onDone(full || ASSISTANT_FALLBACK);
    },
  });
}

/** Local E2E only: a fixed Markdown reply streamed in small chunks, in the Workers AI SSE format. */
function mockStream(question: string): ReadableStream<Uint8Array> {
  const reply = `### 確認のポイント\n- ご相談内容: ${question.slice(0, 40)}\n- **条件**によって必要な対応が変わります。\n\n最終的な判断は専門家にご確認ください。`;
  const encoder = new TextEncoder();
  const chunks = reply.match(/.{1,6}/gs) ?? [];
  return new ReadableStream({
    async pull(controller) {
      const next = chunks.shift();
      if (next === undefined) return controller.close();
      await new Promise((r) => setTimeout(r, 15));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: next })}\n\n`));
    },
  });
}

/** Local E2E only: one chunk, then silence, to exercise the idle timeout. */
function stalledStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let sent = false;
  return new ReadableStream({
    pull(controller) {
      if (sent) return new Promise(() => {});
      sent = true;
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: "途中までの回答" })}\n\n`));
    },
  });
}

/**
 * Extension point: a service that needs retrieval (RAG) or extra per-turn rules builds `system` here.
 * See CLAUDE.md "拡張" for how the Tokyo fire consultation service adds law citations.
 */
async function runModel(env: Env, messages: Msg[], question: string, realAi: boolean, rules?: string, lane?: Lane, actions?: Actions) {
  if (env.E2E_MODE === "1" && question === "__stall__") return stalledStream();
  if (env.AI_MOCK === "1" && !realAi) return mockStream(question);
  // 設置義務・届出の要否は条文どおりのルールで判定し（src/rules）、結論を固定してからモデルに説明させる
  // 引き継ぎの扱い（laneRules）は最後に置き、回答の書き方より優先させる
  // 画面に出るボタンの説明は判定メモの後、引き継ぎの扱いの前に置く
  const system = [SYSTEM_PROMPT, rules, actions ? actionsNote(actions) : "", lane ? laneRules(lane) : ""].filter(Boolean).join("\n\n");
  return (await env.AI.run(env.AI_MODEL as keyof AiModels, {
    messages: [{ role: "system", content: system }, ...messages],
    stream: true,
    max_tokens: 1200,
    temperature: 0.3,
    // Gemma / Qwen think before answering unless told not to; thinking adds seconds before the first token.
    ...(/gemma|qwen/.test(env.AI_MODEL) ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  } as never)) as unknown as ReadableStream<Uint8Array>;
}

chat.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { conversationId?: string; message?: string } | null;
  const message = body?.message?.trim();
  if (!message) return c.json({ error: "empty" }, 400);
  if (message.length > MAX_INPUT) return c.json({ error: "too_long" }, 400);

  // 相談は無料。セッションのない最初の送信で匿名の利用者を作る（同じ回線から24時間に作れる数に上限あり）。
  // 1人あたりの送信は日本時間の1日ごとに USER_DAILY_MESSAGE_LIMIT 件まで（caps.ts）。
  const user = c.get("user") ?? (await createAnonymousUser(c));
  if (!user) {
    recordLimit(c, "anon_ip");
    return c.json({ error: "trial_limit" }, 429);
  }

  const { success } = await c.env.CHAT_LIMITER.limit({ key: user.id });
  if (!success) {
    recordLimit(c, "rate", user.email);
    return c.json({ error: "rate_limited" }, 429);
  }
  if (!(await takeUserQuota(c.env, user.id))) {
    recordLimit(c, "daily", user.email);
    return c.json({ error: "user_limit" }, 429);
  }

  const db = c.env.DB;
  const now = Date.now();

  let conversationId = body?.conversationId;
  if (conversationId) {
    const owned = await db
      .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
      .bind(conversationId, user.id)
      .first();
    if (!owned) return c.json({ error: "not_found" }, 404);
  } else {
    conversationId = crypto.randomUUID();
    await db
      .prepare("INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(conversationId, user.id, titleFrom(message), now, now)
      .run();
  }

  const { results: history } = await db
    .prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(conversationId, HISTORY_LIMIT)
    .all<Msg>();
  await db
    .prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)")
    .bind(crypto.randomUUID(), conversationId, message, now)
    .run();

  // 行政書士・消防設備士などの資格者にしかできない依頼は、情報提供として答え、引き継ぎを案内する
  const detected = detectEscalation(message);
  const escalation = detected ? { id: crypto.randomUUID(), lane: detected.lane, status: "detected" as const } : null;
  if (detected && escalation) {
    await db
      .prepare("INSERT INTO escalations (id, conversation_id, user_id, lane, reasons, question, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(escalation.id, conversationId, user.id, detected.lane, JSON.stringify(detected.reasons), message, now)
      .run();
  }

  const messages: Msg[] = [...history.reverse(), { role: "user", content: message }];
  const rulesResult = c.env.RULES_ENABLED === "1" ? runRules("sapporo-city", messages.filter((m) => m.role === "user").map((m) => m.content)) : null;
  const rules = rulesResult ? rulesNote(rulesResult) : undefined;
  // 回答の下に出すボタンと選択肢。モデルにも伝え、本文にURLや別の質問を重ねて書かせない
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content);
  const actions = buildActions({ userTexts, rules: rulesResult, lane: detected?.lane, emergency: EMERGENCY.test(message) });
  const convId = conversationId;
  let source: ReadableStream<Uint8Array>;
  // Local E2E only: tests that check answer quality opt in to the real model.
  const realAi = c.env.E2E_MODE === "1" && c.req.header("x-test-real-ai") === "1";
  try {
    source = await runModel(c.env, messages, message, realAi, rules, detected?.lane, actions);
  } catch (first) {
    // Workers AI occasionally drops the upstream connection; one retry covers most of these.
    // 4006 is the daily quota, where retrying cannot help.
    console.error("ai_error_retry", first);
    if (String(first).includes("4006")) {
      recordError(c, "ai_error", user.email);
      return c.json({ error: "ai_unavailable", conversationId: convId }, 503);
    }
    try {
      source = await runModel(c.env, messages, message, realAi, rules, detected?.lane, actions);
    } catch (err) {
      console.error("ai_error", err);
      recordError(c, "ai_error", user.email);
      return c.json({ error: "ai_unavailable", conversationId: convId }, 503);
    }
  }

  let resolveSaved: () => void;
  c.executionCtx.waitUntil(new Promise<void>((r) => (resolveSaved = r)));
  const stream = textStream(source, (full, failure) => {
    if (failure) recordError(c, failure === "timeout" ? "ai_timeout" : "ai_error", user.email);
    db.batch([
      db
        .prepare("INSERT INTO messages (id, conversation_id, role, content, escalation_id, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)")
        .bind(crypto.randomUUID(), convId, full, escalation?.id ?? null, Date.now()),
      db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").bind(Date.now(), convId),
    ])
      .catch((err) => console.error("save_error", err))
      .finally(() => resolveSaved());
  });

  // c.body keeps the session cookie set for a new anonymous user.
  return c.body(stream, 200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-conversation-id": convId,
    ...(escalation ? { "x-escalation": encodeURIComponent(JSON.stringify(escalation)) } : {}),
    ...(actions.buttons.length || actions.question ? { "x-actions": encodeURIComponent(JSON.stringify(actions)) } : {}),
  });
});

export const conversations = new Hono<AppEnv>();

conversations.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const { results } = await c.env.DB.prepare(
    "SELECT id, title, updated_at AS updatedAt FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50",
  )
    .bind(user.id)
    .all();
  return c.json({ conversations: results });
});

conversations.get("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const conv = await c.env.DB.prepare("SELECT id, title FROM conversations WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), user.id)
    .first();
  if (!conv) return c.json({ error: "not_found" }, 404);
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.role, m.content, e.id AS escalationId, e.lane AS escalationLane, e.status AS escalationStatus
       FROM messages m LEFT JOIN escalations e ON e.id = m.escalation_id
      WHERE m.conversation_id = ? ORDER BY m.created_at ASC`,
  )
    .bind(c.req.param("id"))
    .all();
  return c.json({ conversation: conv, messages: results });
});

conversations.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  await c.env.DB.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).run();
  return c.json({ ok: true });
});
