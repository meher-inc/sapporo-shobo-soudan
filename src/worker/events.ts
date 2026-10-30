// 計測のイベント（plan 11）。D1 の events に1行ずつ残す。外部の計測サービスには送らない。
// - 誰の操作かは持たない。本文・連絡先・メール・IP は入れない（prop は英小文字・数字・_:.- の60文字以内）
// - is_test は traffic.ts の isTestVisit で決める（?test=1 の端末と、TEST_EMAILS・ADMIN_EMAILS のアカウント）
// - 記録の失敗で本来の応答を壊さない（waitUntil で非同期に書き、例外はログだけ）
import { Hono, type Context } from "hono";
import type { AppEnv } from "./env";
import { getCookie } from "hono/cookie";
import { TEST_COOKIE, classifySource, isTestEmail, isTestVisit } from "./traffic.ts";

export const EVENT_NAMES = ["page_view", "limit_reached", "error_shown", "condition_answered"] as const;
export type EventName = (typeof EVENT_NAMES)[number];
/** クライアントから POST /api/event で送ってよいもの。ほかは Worker だけが書く */
export const CLIENT_EVENTS: readonly EventName[] = ["condition_answered"];

export type LimitProp = "daily" | "anon_ip" | "rate";
export type ErrorProp = "ai_timeout" | "ai_error";

const PROP_RE = /^[a-z0-9_:.\-]{1,60}$/;
const BOT_RE = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python|go-http/i;

export function isValidProp(prop: unknown): prop is string {
  return typeof prop === "string" && PROP_RE.test(prop);
}

export function isClientEvent(name: unknown): name is EventName {
  return typeof name === "string" && (CLIENT_EVENTS as readonly string[]).includes(name);
}

/** page_view を数えない相手（User-Agent が空、またはボット・監視・コマンドラインの道具）。完全ではない */
export function isBot(ua: string | null | undefined): boolean {
  return !ua || !ua.trim() || BOT_RE.test(ua);
}

/** 相談画面の page_view の prop。規約などのページは数えない（null）。検索流入用のテーマページは先頭に soudan: を付ける */
export function pageViewProp(path: string, source: string): string | null {
  if (/^\/legal(\/|$)/.test(path)) return null;
  const prop = /^\/soudan(\/|$)/.test(path) ? `soudan:${source}` : source;
  return prop.slice(0, 60);
}

/** イベントを1行書く。待たずに返り、失敗しても例外を投げない */
export function recordEvent(c: Context<AppEnv>, name: EventName, prop: string | null, isTest: boolean): void {
  const p = prop === null ? null : prop.slice(0, 60);
  const write = c.env.DB.prepare("INSERT INTO events (id, name, prop, is_test, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), name, p !== null && isValidProp(p) ? p : null, isTest ? 1 : 0, Date.now())
    .run()
    .then(() => {})
    .catch((err) => console.error("event_error", name, err));
  try {
    c.executionCtx.waitUntil(write);
  } catch {
    // executionCtx がない環境では書き込みをそのまま走らせる
  }
}

/** 今の利用者・端末が試験か（user は c.get("user") か、その場で作った匿名の利用者） */
export function eventIsTest(c: Context<AppEnv>, email?: string | null): boolean {
  return isTestVisit(c, email ?? c.get("user")?.email);
}

/** 上限で送信を断ったとき */
export function recordLimit(c: Context<AppEnv>, prop: LimitProp, email?: string | null): void {
  recordEvent(c, "limit_reached", prop, eventIsTest(c, email));
}

/** AI の開始失敗（再試行後）・無応答の打ち切り・フォールバック文を返したとき */
export function recordError(c: Context<AppEnv>, prop: ErrorProp, email?: string | null): void {
  recordEvent(c, "error_shown", prop, eventIsTest(c, email));
}

/** 相談画面の HTML を GET で返したとき。?test=1 / ?test=0 はこのリクエストの cookie より優先する（rememberVisit が付ける cookie はまだ届いていない） */
export function recordPageView(c: Context<AppEnv>): void {
  if (c.req.method !== "GET" || isBot(c.req.header("user-agent"))) return;
  const url = new URL(c.req.url);
  // この訪問の流入元（最初の接触の cookie ではなく、このリクエストの utm_source・Referer から見分ける）
  const prop = pageViewProp(url.pathname, classifySource(url, c.req.header("referer")));
  if (prop === null) return;
  const flag = url.searchParams.get("test");
  const isTest = flag === "1" || (flag !== "0" && getCookie(c, TEST_COOKIE) === "1") || isTestEmail(c.env, c.get("user")?.email);
  recordEvent(c, "page_view", prop, isTest);
}

/** POST /api/event（認証不要。/api/click と同じ扱い）。本文は sendBeacon の JSON 文字列 */
export const eventApi = new Hono<AppEnv>();
eventApi.post("/", async (c) => {
  const body = (await c.req.text().then((t) => JSON.parse(t)).catch(() => null)) as { name?: unknown; prop?: unknown } | null;
  if (!isClientEvent(body?.name) || !isValidProp(body?.prop)) return c.json({ error: "bad_request" }, 400);
  recordEvent(c, body.name, body.prop, eventIsTest(c));
  return c.body(null, 204);
});

const isLocal = (url: string) => ["localhost", "127.0.0.1"].includes(new URL(url).hostname);

/** Local E2E only: GET /api/test/events?name=&prop= の件数（total）と、そのうち試験の件数（test） */
export const eventTestApi = new Hono<AppEnv>();
eventTestApi.get("/", async (c) => {
  if (c.env.E2E_MODE !== "1" || !isLocal(c.req.url)) return c.notFound();
  const name = c.req.query("name") ?? "";
  const prop = c.req.query("prop");
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total, COALESCE(SUM(is_test), 0) AS test FROM events WHERE name = ?1 AND (?2 IS NULL OR prop = ?2)",
  )
    .bind(name, prop ?? null)
    .first<{ total: number; test: number }>();
  return c.json({ total: row?.total ?? 0, test: row?.test ?? 0 });
});
