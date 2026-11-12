import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { handoffLanes, type Lane } from "./escalation.ts";
import { SERVICE } from "../config/service.ts";
import { caseSheet, missingRequired, sanitize, type HearingAnswers } from "../hearing/hearing.ts";
import { prefill } from "../hearing/prefill.ts";
import { eventIsTest, recordEvent } from "./events.ts";

const LANE_LABEL: Record<Lane, string> = {
  gyosei: "行政書士（書類の作成・提出）",
  setsubi: "点検・工事の手配",
  bengoshi: "弁護士への相談案内",
};

const MAX = { name: 60, email: 254, phone: 30, note: 1000 };

export const escalations = new Hono<AppEnv>();

/** 回答の下の「行政書士に依頼する」から作った引き継ぎの reasons（相談文から検知したものと区別する） */
export const BUTTON_REASON = "回答の下の依頼ボタン";

/**
 * 回答の下の「行政書士に依頼する」（F-26）。押した回答の相談文に結びついた、行政書士への引き継ぎを返す
 * （fixrules R1 を「押した回答の相談文の依頼を使い回す」に読み替え。plan 20261112-keep-requests-on-login N-2）。
 * - answerId: 押した回答（messages.id、role=assistant）。この会話の保存済みの回答でなければ null。
 *   渡されないとき（古い画面）は、回答のある最後の相談文を使う。AI が失敗して回答のない相談文の依頼は作らない
 * - その相談文に結びついた gyosei の引き継ぎ（相談文から検知したもの・ボタンで作ったもの）があれば、それを返す（created=false）
 * - なければ作る（status=detected、reasons=[BUTTON_REASON]、質問と作成時刻はその相談文のもの）。ほかの相談文の引き継ぎは使い回さない
 * - 同じ相談文には、何度押しても・同時に押しても1件（1文の INSERT ... WHERE NOT EXISTS）
 * - 自分の会話にしか作れない（他人の会話・回答のない会話は null）
 * - 回答（messages.escalation_id）には結びつけない。開き直したときは withRequestEscalations() が、相談文の次の回答に付けて返す（fixrules R4）
 */
export async function createButtonEscalation(
  db: D1Database,
  userId: string,
  conversationId: string,
  answerId?: string,
): Promise<{ escalation: { id: string; lane: "gyosei"; status: "detected" | "requested" }; created: boolean } | null> {
  const conv = await db.prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?").bind(conversationId, userId).first();
  if (!conv) return null;
  // 押した回答。回答は相談文の後に保存されるので、回答の時刻以前の最後の相談文がその回答の相談文
  const answer = answerId
    ? await db
        .prepare("SELECT created_at FROM messages WHERE id = ? AND conversation_id = ? AND role = 'assistant'")
        .bind(answerId, conversationId)
        .first<{ created_at: number }>()
    : await db
        .prepare("SELECT created_at FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1")
        .bind(conversationId)
        .first<{ created_at: number }>();
  if (!answer) return null;
  const asked = await db
    .prepare("SELECT content, created_at FROM messages WHERE conversation_id = ? AND role = 'user' AND created_at <= ? ORDER BY created_at DESC LIMIT 1")
    .bind(conversationId, answer.created_at)
    .first<{ content: string; created_at: number }>();
  if (!asked) return null;
  // 相談文から検知した引き継ぎは、相談文と同じ時刻で作られる（chat.ts）。ボタンで作るものも相談文の時刻にそろえる。
  // その相談文の引き継ぎ = 作成時刻が相談文から回答までのもの
  const res = await db
    .prepare(
      `INSERT INTO escalations (id, conversation_id, user_id, lane, reasons, question, created_at)
       SELECT ?1, ?2, ?3, 'gyosei', ?4, ?5, ?6
        WHERE NOT EXISTS (SELECT 1 FROM escalations WHERE conversation_id = ?2 AND user_id = ?3 AND lane = 'gyosei' AND created_at >= ?6 AND created_at <= ?7)`,
    )
    .bind(crypto.randomUUID(), conversationId, userId, JSON.stringify([BUTTON_REASON]), asked.content, asked.created_at, answer.created_at)
    .run();
  const row = await db
    .prepare(
      "SELECT id, status FROM escalations WHERE conversation_id = ? AND user_id = ? AND lane = 'gyosei' AND created_at >= ? AND created_at <= ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(conversationId, userId, asked.created_at, answer.created_at)
    .first<{ id: string; status: "detected" | "requested" }>();
  if (!row) return null;
  return { escalation: { id: row.id, lane: "gyosei", status: row.status }, created: (res.meta?.changes ?? 0) > 0 };
}

type MessageRow = { role: string; createdAt: number; escalationId?: string | null } & Record<string, unknown>;

/**
 * 会話を開き直したときの行に、回答に結びついていない行政書士の引き継ぎ（ボタンで作ったもの）を足す（fixrules R4）。
 * 引き継ぎの作成時刻（＝相談文の時刻）の相談文の、直後の回答に requestEscalation* として付ける（回答がなければ付けない）。点検・弁護士のカードが付いた回答でも両方を出せる
 */
export async function withRequestEscalations<T extends MessageRow>(db: D1Database, conversationId: string, rows: T[]) {
  const { results } = await db
    .prepare(
      `SELECT e.id, e.lane, e.status, e.created_at AS createdAt FROM escalations e
        WHERE e.conversation_id = ? AND e.lane = 'gyosei' AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.escalation_id = e.id)
        ORDER BY e.created_at ASC`,
    )
    .bind(conversationId)
    .all<{ id: string; lane: Lane; status: string; createdAt: number }>();
  const out = rows.map((r) => ({ ...r }) as T & { requestEscalationId?: string; requestEscalationLane?: Lane; requestEscalationStatus?: string });
  for (const e of results) {
    // 付ける先は、その相談文（作成時刻以前の最後の相談文）の直後の回答だけ。AI の失敗などで回答が保存されていなければ付けない（F-26 レビュー L-12）
    let asked = -1;
    out.forEach((r, i) => {
      if (r.role === "user" && Number(r.createdAt) <= e.createdAt) asked = i;
    });
    const target = asked >= 0 ? out[asked + 1] : undefined;
    if (!target || target.role !== "assistant" || target.requestEscalationId) continue;
    target.requestEscalationId = e.id;
    target.requestEscalationLane = e.lane;
    target.requestEscalationStatus = e.status;
  }
  return out;
}

escalations.post("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (SERVICE.gyoseiReceiver === "なし") return c.json({ error: "no_receiver" }, 400);
  const body = (await c.req.json().catch(() => null)) as { conversationId?: unknown; answerId?: unknown } | null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  if (!conversationId) return c.json({ error: "conversation_required" }, 400);
  // 押した回答の ID（N-2）。古い画面は送らない（回答のある最後の相談文で扱う）
  if (body?.answerId !== undefined && (typeof body.answerId !== "string" || !body.answerId || body.answerId.length > 64)) {
    return c.json({ error: "invalid_answer" }, 400);
  }
  const answerId = typeof body?.answerId === "string" ? body.answerId : undefined;
  // 相談の送信と同じレート制限（利用者ごと。鍵は相談とは別）。制限の仕組みが使えないときは通す（fixrules R3）
  try {
    const { success } = await c.env.CHAT_LIMITER.limit({ key: `request:${user.id}` });
    if (!success) return c.json({ error: "rate_limited" }, 429);
  } catch (err) {
    console.error("request_limit_error", err);
  }
  const result = await createButtonEscalation(c.env.DB, user.id, conversationId, answerId);
  if (!result) return c.json({ error: "not_found" }, 404);
  // 新しく依頼を始めたときだけ1件として数える（誰が・何を相談したかは持たない。fixrules R3）
  if (result.created) recordEvent(c, "request_clicked", "answer_button", eventIsTest(c, user.email));
  return c.json({ escalation: result.escalation });
});

/**
 * 相談者が画面で同意し、連絡先を送ったときだけ、この相談を提携の専門家に共有する。
 * 紹介料は受け取らない（契約は専門家と相談者の間）。
 */
escalations.post("/:id/request", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const body = (await c.req.json().catch(() => null)) as
    | { consent?: boolean; name?: string; email?: string; phone?: string; note?: string; hearing?: unknown }
    | null;
  if (body?.consent !== true) return c.json({ error: "consent_required" }, 400);
  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const note = body.note?.trim() ?? "";
  if (!name || (!email && !phone)) return c.json({ error: "contact_required" }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: "invalid_email" }, 400);
  if (phone && !/^[0-9+\-() ]{8,}$/.test(phone)) return c.json({ error: "invalid_phone" }, 400);
  if (name.length > MAX.name || email.length > MAX.email || phone.length > MAX.phone || note.length > MAX.note) {
    return c.json({ error: "too_long" }, 400);
  }

  const row = await c.env.DB.prepare("SELECT id, conversation_id, lane, status FROM escalations WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), user.id)
    .first<{ id: string; conversation_id: string; lane: Lane; status: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (!handoffLanes.includes(row.lane)) return c.json({ error: "no_handoff" }, 400);
  // 送信済みの依頼に「受け付けました」を返さない（通知を送っていないので。fixrules R2）
  if (row.status === "requested") return c.json({ error: "already_requested", status: "requested" }, 409);

  // ヒアリングは行政書士への依頼だけ。送られていなければ、従来どおり連絡先だけで受ける
  let hearing: HearingAnswers | null = null;
  if (row.lane === "gyosei" && body.hearing !== undefined && body.hearing !== null) {
    hearing = sanitize(body.hearing);
    if (!hearing) return c.json({ error: "invalid_hearing" }, 400);
    if (missingRequired(hearing).length) return c.json({ error: "hearing_incomplete" }, 400);
  }

  const now = Date.now();
  await c.env.DB.prepare(
    "UPDATE escalations SET status = 'requested', contact_name = ?, contact_email = ?, contact_phone = ?, note = ?, hearing = ?, requested_at = ? WHERE id = ?",
  )
    .bind(name, email || null, phone || null, note || null, hearing ? JSON.stringify(hearing) : null, now, row.id)
    .run();

  c.executionCtx.waitUntil(notifyRequest(c.env, row.id).catch((e) => console.error("escalation_notify_error", e)));
  return c.json({ ok: true, status: "requested" });
});

/** ヒアリングの初期値: 相談の文面から推した届出の種類と、すでに分かっている項目 */
escalations.get("/:id/hearing", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const row = await c.env.DB.prepare("SELECT conversation_id, lane FROM escalations WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), user.id)
    .first<{ conversation_id: string; lane: Lane }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.lane !== "gyosei") return c.json({ error: "no_hearing" }, 400);
  const { results } = await c.env.DB.prepare("SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at ASC")
    .bind(row.conversation_id)
    .all<{ content: string }>();
  return c.json(prefill(results.map((r) => r.content)));
});

export const adminEscalations = new Hono<AppEnv>();

/** 引き継ぎの一覧（新しい順）。ADMIN_EMAILS のアカウントだけ */
adminEscalations.get("/", async (c) => {
  const user = c.get("user");
  const admins = (c.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!user?.email || user.is_anonymous || !admins.includes(user.email)) return c.json({ error: "forbidden" }, 403);
  const status = c.req.query("status");
  const { results } = await c.env.DB.prepare(
    `SELECT id, conversation_id AS conversationId, lane, reasons, question, status, contact_name AS name,
            contact_email AS email, contact_phone AS phone, note, hearing, created_at AS createdAt, requested_at AS requestedAt
       FROM escalations ${status ? "WHERE status = ?" : ""} ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(...(status ? [status] : []))
    .all();
  return c.json({ escalations: results });
});

/** 専門家に渡す内容: 依頼者、きっかけの質問、相談のやり取り全体 */
export async function caseCard(env: Env, id: string): Promise<{ subject: string; text: string; replyTo?: string } | null> {
  const e = await env.DB.prepare("SELECT * FROM escalations WHERE id = ?").bind(id).first<Record<string, string | number | null>>();
  if (!e) return null;
  const { results: msgs } = await env.DB.prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .bind(e.conversation_id)
    .all<{ role: string; content: string }>();
  const lane = e.lane as Lane;
  const subject = `【トドケデ AI】${LANE_LABEL[lane]}の依頼（${SERVICE.area}）`;
  const text = [
    `区分: ${LANE_LABEL[lane]}`,
    `地域: ${SERVICE.area}`,
    `検知理由: ${(JSON.parse(String(e.reasons)) as string[]).join("、")}`,
    `依頼日時: ${new Date(Number(e.requested_at ?? e.created_at)).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
    "",
    "■ 依頼者",
    `氏名: ${e.contact_name ?? ""}`,
    `メール: ${e.contact_email ?? "（なし）"}`,
    `電話: ${e.contact_phone ?? "（なし）"}`,
    `補足: ${e.note ?? "（なし）"}`,
    "",
    ...(e.hearing ? [caseSheet(JSON.parse(String(e.hearing)) as HearingAnswers, Number(e.requested_at ?? Date.now())), ""] : []),
    "■ きっかけになった質問",
    String(e.question),
    "",
    "■ 相談のやり取り",
    ...msgs.map((m) => `${m.role === "user" ? "相談者" : "AI"}: ${m.content}`),
    "",
    "依頼者は、この内容を提携の専門家に共有することに同意しています。契約・報酬は専門家と依頼者の間で決めてください。",
  ].join("\n");
  return { subject, text, replyTo: e.contact_email ? String(e.contact_email) : undefined };
}

async function notifyRequest(env: Env, id: string) {
  const card = await caseCard(env, id);
  if (!card) return;
  console.log("escalation_requested", id);
  if (!env.EMAIL || !env.NOTIFY_FROM || !env.NOTIFY_TO) return;
  for (const to of env.NOTIFY_TO.split(",").map((s) => s.trim()).filter(Boolean)) {
    await env.EMAIL.send({
      to,
      from: { email: env.NOTIFY_FROM, name: "トドケデ AI" },
      subject: card.subject,
      text: card.text,
      ...(card.replyTo ? { replyTo: card.replyTo } : {}),
    });
  }
}
