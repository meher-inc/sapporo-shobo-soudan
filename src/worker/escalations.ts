import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { handoffLanes, type Lane } from "./escalation";
import { SERVICE } from "../config/service";
import { caseSheet, missingRequired, sanitize, type HearingAnswers } from "../hearing/hearing.ts";
import { prefill } from "../hearing/prefill.ts";

const LANE_LABEL: Record<Lane, string> = {
  gyosei: "行政書士（書類の作成・提出）",
  setsubi: "点検・工事の手配",
  bengoshi: "弁護士への相談案内",
};

const MAX = { name: 60, email: 254, phone: 30, note: 1000 };

export const escalations = new Hono<AppEnv>();

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
