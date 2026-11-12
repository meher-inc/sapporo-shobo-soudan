// plan 20261112-keep-requests-on-login N-1: 匿名で依頼してから Google でログインしても、依頼の記録（escalations）を残す。
// D1 の代わりに node:sqlite に migrations/ を当て、外部キーを有効にして（D1 と同じく ON DELETE CASCADE が働く）、
// Google ログイン（auth.ts の /callback と /test-login）が呼ぶ adoptAnonymous をそのまま動かす。ルートを通す確認は E2E が受け持つ。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { adoptAnonymous } from "../../src/worker/adopt.ts";
import { escalations } from "../../src/worker/escalations.ts";

/** D1 の prepare/bind/first/all/run/batch だけをまねる（batch は1つのトランザクション） */
function d1(db: DatabaseSync) {
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind: (...a: unknown[]) => ((args = a), stmt),
      first: async () => (db.prepare(sql).get(...(args as never[])) as unknown) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
      run: async () => ({ success: true, meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } }),
      exec: () => db.prepare(sql).run(...(args as never[])),
    };
    return stmt;
  };
  const batch = async (stmts: { exec: () => unknown }[]) => {
    db.exec("BEGIN");
    try {
      for (const s of stmts) s.exec();
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return stmts.map(() => ({ success: true }));
  };
  return { prepare, batch } as unknown as D1Database;
}

const count = (db: DatabaseSync, sql: string, ...args: string[]) => (db.prepare(sql).get(...args) as { n: number }).n;

function setup() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  // 匿名の利用者が相談し、回答の下の「行政書士に依頼する」から依頼を送った状態
  db.prepare("INSERT INTO users (id, google_sub, email, is_anonymous, trial_started_at, created_at) VALUES ('anon', 'anon:anon', '', 1, 50, 1)").run();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('h', 'anon', 9999999999999)").run();
  db.prepare("INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES ('c1', 'anon', 't', 1, 1)").run();
  db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('m1', 'c1', 'user', '飲食店の届出', 100)").run();
  db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('m2', 'c1', 'assistant', '回答', 101)").run();
  db.prepare(
    `INSERT INTO escalations (id, conversation_id, user_id, lane, reasons, question, status, contact_name, contact_email, created_at, requested_at)
     VALUES ('e-sent', 'c1', 'anon', 'gyosei', '["回答の下の依頼ボタン"]', '飲食店の届出', 'requested', '依頼者', 'a@example.com', 100, 120)`,
  ).run();
  // 別の会話で、シートを開いたまま未送信の依頼
  db.prepare("INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES ('c2', 'anon', 't', 2, 2)").run();
  db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('m3', 'c2', 'user', '記入をお願いしたい', 200)").run();
  db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('m4', 'c2', 'assistant', '回答', 201)").run();
  db.prepare(
    "INSERT INTO escalations (id, conversation_id, user_id, lane, reasons, question, created_at) VALUES ('e-open', 'c2', 'anon', 'gyosei', '[\"検知\"]', '記入をお願いしたい', 200)",
  ).run();
  const anon = db.prepare("SELECT * FROM users WHERE id = 'anon'").get();
  const env = { DB: d1(db), CHAT_LIMITER: { limit: async () => ({ success: true }) } };
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as never;
  const app = (user: unknown) => {
    const a = new Hono();
    a.use("*", async (c, next) => {
      c.set("user" as never, user as never);
      await next();
    });
    a.route("/api/escalations", escalations as never);
    return a;
  };
  /** auth.ts と同じ順: アカウントを探すか作り（upsertUser）、匿名の利用者の記録を移す */
  const login = async (email: string) => {
    const existing = db.prepare("SELECT id FROM users WHERE google_sub = ?").get(`test-${email}`) as { id: string } | undefined;
    const userId = existing?.id ?? "new";
    if (!existing) db.prepare("INSERT INTO users (id, google_sub, email, created_at) VALUES ('new', ?, ?, 3)").run(`test-${email}`, email);
    await adoptAnonymous(env.DB, anon as never, userId);
    return userId;
  };
  const as = (userId: string) => ({ id: userId, email: "x@example.com", is_anonymous: 0 });
  const press = async (userId: string, conversationId: string) => {
    const res = await app(as(userId)).request(
      "http://localhost/api/escalations",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId }) },
      env,
      ctx,
    );
    return { status: res.status, body: (await res.json()) as { escalation?: { id: string; status: string } } };
  };
  const submit = async (userId: string, id: string) =>
    (
      await app(as(userId)).request(
        `http://localhost/api/escalations/${id}/request`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ consent: true, name: "依頼者", email: "a@example.com" }) },
        env,
        ctx,
      )
    ).status;
  return { db, login, press, submit };
}

for (const kind of ["新しいアカウント", "すでにあるアカウント"] as const) {
  test(`匿名で依頼してから${kind}でログインしても、依頼の記録が残り、押すと「ご依頼済み」になる（N-1）`, async () => {
    const { db, login, press, submit } = setup();
    if (kind === "すでにあるアカウント") {
      db.prepare("INSERT INTO users (id, google_sub, email, is_anonymous, created_at) VALUES ('old', 'test-me@example.com', 'me@example.com', 0, 1)").run();
    }
    const userId = await login("me@example.com");
    // 匿名の利用者は消え、会話と依頼は新しいアカウントへ移る
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM users WHERE id = 'anon'"), 0);
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?", userId), 2);
    const rows = db.prepare("SELECT id, user_id, status, contact_name FROM escalations ORDER BY id").all() as {
      id: string;
      user_id: string;
      status: string;
      contact_name: string | null;
    }[];
    assert.deepEqual(
      rows.map((r) => [r.id, r.user_id, r.status, r.contact_name]),
      [
        ["e-open", userId, "detected", null],
        ["e-sent", userId, "requested", "依頼者"],
      ],
    );
    // 送信済みの相談でもう一度押すと、新しく作らずに「ご依頼済み」（requested）を返す
    const again = await press(userId, "c1");
    assert.equal(again.status, 200);
    assert.equal(again.body.escalation?.id, "e-sent");
    assert.equal(again.body.escalation?.status, "requested");
    assert.equal(await submit(userId, "e-sent"), 409);
    // ログイン前に開いた未送信の依頼は、ログインした後でも送れる
    assert.equal(await submit(userId, "e-open"), 200);
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM escalations"), 2);
  });
}

test("移す途中で失敗したら、会話も依頼も匿名の利用者のまま（1つの batch）", async () => {
  const { db, login } = setup();
  // 匿名の利用者の削除だけが失敗するようにする
  db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'boom'); END");
  await login("me@example.com").catch(() => {});
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM users WHERE id = 'anon'"), 1);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM conversations WHERE user_id = 'anon'"), 2);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM escalations WHERE user_id = 'anon'"), 2);
});
