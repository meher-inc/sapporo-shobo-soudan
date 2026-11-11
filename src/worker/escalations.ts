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
 * 回答の下の「行政書士に依頼する」（F-26）。その会話の行政書士への引き継ぎ（detected）を作って返す。
 * - 同じ会話にすでに行政書士への引き継ぎがあれば、新しく作らずにそれを返す（2回押しても1件）
 * - 自分の会話にしか作れない（他人の会話は 404）
 * - 連絡先はここでは受け取らない。共有は、依頼カードで同意して送ったとき（/:id/request）だけ
 * - 受け手が「なし」の地域では作らない（ボタンも出していない。F-07）
 */
export async function createButtonEscalation(
  db: D1Database,
  userId: string,
  conversationId: string,
  now = Date.now(),
): Promise<{ id: string; lane: "gyosei"; status: "detected" | "requested" } | null> {
  const conv = await db.prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?").bind(conversationId, userId).first();
  if (!conv) return null;
  const last = await db
    .prepare("SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1")
    .bind(conversationId)
    .first<{ content: string }>();
  const id = crypto.randomUUID();
  // 1文で「なければ作る」にして、続けて押されても重ならないようにする
  await db
    .prepare(
      `INSERT INTO escalations (id, conversation_id, user_id, lane, reasons, question, created_at)
       SELECT ?1, ?2, ?3, 'gyosei', ?4, ?5, ?6
        WHERE NOT EXISTS (SELECT 1 FROM escalations WHERE conversation_id = ?2 AND user_id = ?3 AND lane = 'gyosei')`,
    )
    .bind(id, conversationId, userId, JSON.stringify([BUTTON_REASON]), last?.content ?? "", now)
    .run();
  const row = await db
    .prepare("SELECT id, status FROM escalations WHERE conversation_id = ? AND user_id = ? AND lane = 'gyosei' ORDER BY created_at DESC LIMIT 1")
    .bind(conversationId, userId)
    .first<{ id: string; status: "detected" | "requested" }>();
  if (!row) return null;
  // 会話を開き直しても依頼カードが残るよう、いちばん新しい回答に結びつける（すでにカードがある回答は変えない）
  await db
    .prepare(
      `UPDATE messages SET escalation_id = ?1
        WHERE id = (SELECT id FROM messages WHERE conversation_id = ?2 AND role = 'assistant' ORDER BY created_at DESC LIMIT 1)
          AND escalation_id IS NULL`,
    )
    .bind(row.id, conversationId)
    .run();
  return { id: row.id, lane: "gyosei", status: row.status };
}

escalations.post("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (SERVICE.gyoseiReceiver === "なし") return c.json({ error: "no_receiver" }, 400);
  const body = (await c.req.json().catch(() => null)) as { conversationId?: unknown } | null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  if (!conversationId) return c.json({ error: "conversation_required" }, 400);
  const escalation = await createButtonEscalation(c.env.DB, user.id, conversationId);
  if (!escalation) return c.json({ error: "not_found" }, 404);
  // 押されたことを1件として数える（誰が・何を相談したかは持たない）
  recordEvent(c, "request_clicked", "answer_button", eventIsTest(c, user.email));
  return c.json({ escalation });
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
  if (row.status === "requested") return c.json({ ok: true, status: "requested" });

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
