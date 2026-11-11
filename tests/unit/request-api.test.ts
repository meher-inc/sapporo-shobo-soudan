// F-26（plan 20261111-city-request-button と fixrules R1〜R4）: 回答の下の「行政書士に依頼する」が作る引き継ぎ（POST /api/escalations）。
// D1 の代わりに node:sqlite に migrations/ を当てたデータベースで、API をそのまま呼ぶ。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { BUTTON_REASON, escalations, withRequestEscalations } from "../../src/worker/escalations.ts";

/** D1 の prepare/bind/first/all/run だけをまねる */
function d1(db: DatabaseSync) {
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind: (...a: unknown[]) => ((args = a), stmt),
      first: async () => (db.prepare(sql).get(...(args as never[])) as unknown) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
      run: async () => ({ success: true, meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } }),
    };
    return stmt;
  };
  return { prepare } as unknown as D1Database;
}

const msg = (db: DatabaseSync, id: string, role: "user" | "assistant", at: number, escalationId: string | null = null, conv = "c-alice") =>
  db
    .prepare("INSERT INTO messages (id, conversation_id, role, content, escalation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, conv, role, role === "user" ? `相談${id}` : `回答${id}`, escalationId, at);
const esc = (db: DatabaseSync, id: string, lane: string, at: number, status = "detected") =>
  db
    .prepare("INSERT INTO escalations (id, conversation_id, user_id, lane, reasons, question, status, created_at) VALUES (?, 'c-alice', 'alice', ?, '[\"検知\"]', 'q', ?, ?)")
    .run(id, lane, status, at);
const count = (db: DatabaseSync, sql: string) => (db.prepare(sql).get() as { n: number }).n;

function setup(opts: { limited?: boolean } = {}) {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
  for (const u of ["alice", "bob"])
    db.prepare("INSERT INTO users (id, google_sub, email, is_anonymous, created_at) VALUES (?, ?, ?, 0, 1)").run(u, `g:${u}`, `${u}@example.com`);
  db.prepare("INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES ('c-alice', 'alice', 't', 1, 1)").run();
  db.prepare("INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES ('c-empty', 'alice', 't', 1, 1)").run();
  msg(db, "m1", "user", 100);
  msg(db, "m2", "assistant", 101);
  const env = { DB: d1(db), CHAT_LIMITER: { limit: async () => ({ success: !opts.limited }) } };
  const app = (userId: string | null) => {
    const a = new Hono();
    a.use("*", async (c, next) => {
      c.set("user" as never, (userId ? { id: userId, email: `${userId}@example.com`, is_anonymous: 0 } : null) as never);
      await next();
    });
    a.route("/api/escalations", escalations as never);
    return a;
  };
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as never;
  const call = async (userId: string | null, conversationId: unknown) => {
    const res = await app(userId).request(
      "/api/escalations",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId }) },
      env,
      ctx,
    );
    return { status: res.status, body: (await res.json()) as { escalation?: { id: string; lane: string; status: string }; error?: string } };
  };
  const submit = async (userId: string, id: string) => {
    const res = await app(userId).request(
      `/api/escalations/${id}/request`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ consent: true, name: "テスト", email: "t@example.com" }) },
      env,
      ctx,
    );
    return { status: res.status, body: (await res.json()) as { ok?: boolean; error?: string } };
  };
  const events = () => count(db, "SELECT COUNT(*) AS n FROM events WHERE name = 'request_clicked' AND prop = 'answer_button'");
  return { db, call, submit, events };
}

test("押すといちばん新しい相談文の引き継ぎを作り、2回押しても1件・計測も1件", async () => {
  const { db, call, events } = setup();
  const first = await call("alice", "c-alice");
  assert.equal(first.status, 200);
  assert.equal(first.body.escalation?.lane, "gyosei");
  assert.equal(first.body.escalation?.status, "detected");
  const second = await call("alice", "c-alice");
  assert.equal(second.body.escalation?.id, first.body.escalation?.id);
  const rows = db.prepare("SELECT * FROM escalations WHERE conversation_id = 'c-alice'").all() as { reasons: string; question: string; user_id: string; created_at: number }[];
  assert.equal(rows.length, 1);
  assert.deepEqual(JSON.parse(rows[0].reasons), [BUTTON_REASON]);
  // 質問と作成時刻は、いちばん新しい相談文のもの
  assert.equal(rows[0].question, "相談m1");
  assert.equal(rows[0].created_at, 100);
  assert.equal(rows[0].user_id, "alice");
  // 回答（messages.escalation_id）には結びつけない（点検・弁護士のカードを上書きしない）
  assert.equal((db.prepare("SELECT escalation_id FROM messages WHERE id = 'm2'").get() as { escalation_id: string | null }).escalation_id, null);
  // 新しく作ったときだけ数える（fixrules R3）
  assert.equal(events(), 1);
});

test("同時に5回押しても1件", async () => {
  const { db, call } = setup();
  const res = await Promise.all([1, 2, 3, 4, 5].map(() => call("alice", "c-alice")));
  assert.equal(new Set(res.map((r) => r.body.escalation?.id)).size, 1);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM escalations"), 1);
});

test("いちばん新しい相談文から検知した依頼があればそれを返し、古い相談文の依頼は使い回さない（fixrules R1）", async () => {
  const { db, call, events } = setup();
  // m1 の相談文から検知した依頼（m2 のカード）
  esc(db, "e-old", "gyosei", 100, "requested");
  db.prepare("UPDATE messages SET escalation_id = 'e-old' WHERE id = 'm2'").run();
  // 次の相談文 m3 とその回答 m4。m3 の相談文から検知した依頼がある
  msg(db, "m3", "user", 200);
  esc(db, "e-new", "gyosei", 200);
  msg(db, "m4", "assistant", 201, "e-new");
  const r = await call("alice", "c-alice");
  assert.equal(r.body.escalation?.id, "e-new");
  assert.equal(events(), 0);
  // さらに次の相談文 m5 では、古い依頼（e-old・e-new）を使わずに新しく作る
  msg(db, "m5", "user", 300);
  msg(db, "m6", "assistant", 301);
  const r2 = await call("alice", "c-alice");
  assert.notEqual(r2.body.escalation?.id, "e-new");
  assert.notEqual(r2.body.escalation?.id, "e-old");
  assert.equal(r2.body.escalation?.status, "detected");
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM escalations"), 3);
  assert.equal(events(), 1);
});

test("送信済みの依頼は使い回して requested を返し、送信 API は送信済みに「受け付けました」を返さない（fixrules R2）", async () => {
  const { db, call, submit, events } = setup();
  const r = await call("alice", "c-alice");
  const id = r.body.escalation!.id;
  const ok = await submit("alice", id);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  const again = await call("alice", "c-alice");
  assert.equal(again.body.escalation?.id, id);
  assert.equal(again.body.escalation?.status, "requested");
  const twice = await submit("alice", id);
  assert.equal(twice.status, 409);
  assert.equal(twice.body.error, "already_requested");
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM escalations"), 1);
  assert.equal(events(), 1);
});

test("他人の会話・存在しない会話・相談文のない会話には作れず、未ログインは断る", async () => {
  const { db, call, events } = setup();
  assert.equal((await call("bob", "c-alice")).status, 404);
  assert.equal((await call("alice", "no-such")).status, 404);
  assert.equal((await call("alice", "c-empty")).status, 404);
  assert.equal((await call(null, "c-alice")).status, 401);
  assert.equal((await call("alice", 123)).status, 400);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM escalations"), 0);
  assert.equal(events(), 0);
});

test("レート制限を超えたら作らず 429（fixrules R3）", async () => {
  const { db, call, events } = setup({ limited: true });
  assert.equal((await call("alice", "c-alice")).status, 429);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM escalations"), 0);
  assert.equal(events(), 0);
});

test("開き直したとき、ボタンで作った依頼はその相談文の回答に付き、点検のカードも残る（fixrules R4）", async () => {
  const { db, call } = setup();
  // m1 の相談文から点検の手配を検知し、回答 m2 に点検のカードが付いている
  esc(db, "e-setsubi", "setsubi", 100);
  db.prepare("UPDATE messages SET escalation_id = 'e-setsubi' WHERE id = 'm2'").run();
  const r = await call("alice", "c-alice");
  // 次の相談（まだ押していない）
  msg(db, "m3", "user", 200);
  msg(db, "m4", "assistant", 201);
  const rows = db
    .prepare(
      `SELECT m.id, m.role, m.created_at AS createdAt, e.id AS escalationId, e.lane AS escalationLane FROM messages m
        LEFT JOIN escalations e ON e.id = m.escalation_id WHERE m.conversation_id = 'c-alice' ORDER BY m.created_at`,
    )
    .all() as { id: string; role: string; createdAt: number; escalationId: string | null }[];
  const out = await withRequestEscalations(d1(db), "c-alice", rows);
  const m2 = out.find((x) => x.id === "m2")!;
  assert.equal(m2.escalationId, "e-setsubi");
  assert.equal(m2.requestEscalationId, r.body.escalation?.id);
  assert.equal(m2.requestEscalationLane, "gyosei");
  assert.equal(out.find((x) => x.id === "m4")!.requestEscalationId, undefined);
});

test("回答の保存より先に作られた依頼も、開き直したときはその相談文の回答に付く（fixrules R4）", async () => {
  const { db, call } = setup();
  // m1 の回答がまだ保存されていない状態で押す
  db.prepare("DELETE FROM messages WHERE id = 'm2'").run();
  const r = await call("alice", "c-alice");
  // その後で回答が保存される
  msg(db, "m2", "assistant", 150);
  const rows = db.prepare("SELECT id, role, created_at AS createdAt, escalation_id AS escalationId FROM messages ORDER BY created_at").all() as {
    id: string;
    role: string;
    createdAt: number;
    escalationId: string | null;
  }[];
  const out = await withRequestEscalations(d1(db), "c-alice", rows);
  assert.equal(out.find((x) => x.id === "m2")!.requestEscalationId, r.body.escalation?.id);
});
