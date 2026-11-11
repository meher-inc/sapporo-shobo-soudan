// F-26（plan 20261111-city-request-button）: 回答の下の「行政書士に依頼する」が作る引き継ぎ（POST /api/escalations）。
// D1 の代わりに node:sqlite に migrations/ を当てたデータベースで、API をそのまま呼ぶ。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { BUTTON_REASON, escalations } from "../../src/worker/escalations.ts";

/** D1 の prepare/bind/first/all/run だけをまねる */
function d1(db: DatabaseSync) {
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind: (...a: unknown[]) => ((args = a), stmt),
      first: async () => (db.prepare(sql).get(...(args as never[])) as unknown) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
      run: async () => (db.prepare(sql).run(...(args as never[])), { success: true }),
    };
    return stmt;
  };
  return { prepare } as unknown as D1Database;
}

function setup() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
  const now = Date.now();
  for (const u of ["alice", "bob"])
    db.prepare("INSERT INTO users (id, google_sub, email, is_anonymous, created_at) VALUES (?, ?, '', 1, ?)").run(u, `anon:${u}`, now);
  db.prepare("INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES ('c-alice', 'alice', 't', ?, ?)").run(now, now);
  db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('m1', 'c-alice', 'user', '飲食店を開業します', ?)").run(now);
  db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('m2', 'c-alice', 'assistant', '回答', ?)").run(now + 1);
  const env = { DB: d1(db) };
  const call = async (userId: string | null, conversationId: unknown) => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("user" as never, (userId ? { id: userId, email: "", is_anonymous: 1 } : null) as never);
      await next();
    });
    app.route("/api/escalations", escalations as never);
    const res = await app.request(
      "/api/escalations",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId }) },
      env,
      { waitUntil: () => {}, passThroughOnException: () => {} } as never,
    );
    return { status: res.status, body: (await res.json()) as { escalation?: { id: string; lane: string; status: string }; error?: string } };
  };
  return { db, call };
}

test("押すとその会話の行政書士への引き継ぎを作り、2回押しても1件のまま", async () => {
  const { db, call } = setup();
  const first = await call("alice", "c-alice");
  assert.equal(first.status, 200);
  assert.equal(first.body.escalation?.lane, "gyosei");
  assert.equal(first.body.escalation?.status, "detected");
  const second = await call("alice", "c-alice");
  assert.equal(second.body.escalation?.id, first.body.escalation?.id);
  const rows = db.prepare("SELECT * FROM escalations WHERE conversation_id = 'c-alice'").all() as { reasons: string; question: string; user_id: string }[];
  assert.equal(rows.length, 1);
  assert.deepEqual(JSON.parse(rows[0].reasons), [BUTTON_REASON]);
  assert.equal(rows[0].question, "飲食店を開業します");
  assert.equal(rows[0].user_id, "alice");
  // 会話を開き直してもカードが残るよう、いちばん新しい回答に結びつける
  assert.equal((db.prepare("SELECT escalation_id FROM messages WHERE id = 'm2'").get() as { escalation_id: string }).escalation_id, first.body.escalation?.id);
  // 押したことを1件ずつ数える（本文・連絡先は入れない）
  const ev = db.prepare("SELECT name, prop FROM events").all() as { name: string; prop: string }[];
  assert.deepEqual(ev.map((e) => `${e.name}:${e.prop}`), ["request_clicked:answer_button", "request_clicked:answer_button"]);
});

test("相談文から検知した行政書士への引き継ぎが同じ会話にあれば、新しく作らずそれを返す", async () => {
  const { db, call } = setup();
  db.prepare("INSERT INTO escalations (id, conversation_id, user_id, lane, reasons, question, created_at) VALUES ('e0', 'c-alice', 'alice', 'gyosei', '[\"書類の作成・記入\"]', 'q', 1)").run();
  const r = await call("alice", "c-alice");
  assert.equal(r.body.escalation?.id, "e0");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM escalations").get() as { n: number }).n, 1);
});

test("他人の会話・存在しない会話には作れず、ログインなし（セッションなし）は断る", async () => {
  const { db, call } = setup();
  assert.equal((await call("bob", "c-alice")).status, 404);
  assert.equal((await call("alice", "no-such")).status, 404);
  assert.equal((await call(null, "c-alice")).status, 401);
  assert.equal((await call("alice", 123)).status, 400);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM escalations").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n, 0);
});
