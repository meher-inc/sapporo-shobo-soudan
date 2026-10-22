// 流入元の記録と試験分の除外（相談件数の測り方）。
// - 最初に開いたページの utm_source（なければ Referer の送り元）を cookie に残し、利用者を作るときに users.source に書く（最初の接触を数える）
// - ?test=1 で開いた端末と、TEST_EMAILS・ADMIN_EMAILS のアカウントは試験として users.is_test=1 にし、相談件数から除く
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, Env, User } from "./env";

export const SOURCE_COOKIE = "tdk_src";
export const TEST_COOKIE = "tdk_test";
const SOURCE_TTL_S = 90 * 86400;
const TEST_TTL_S = 365 * 86400;

const SEARCH = [
  [/(^|\.)google\./, "search:google"],
  [/(^|\.)yahoo\.co\.jp$/, "search:yahoo"],
  [/(^|\.)bing\.com$/, "search:bing"],
  [/(^|\.)duckduckgo\.com$/, "search:duckduckgo"],
] as const;
const SNS = [
  [/^(t\.co|x\.com|twitter\.com|mobile\.twitter\.com)$/, "sns:x"],
  [/(^|\.)instagram\.com$/, "sns:instagram"],
  [/(^|\.)facebook\.com$/, "sns:facebook"],
  [/(^|\.)line\.me$/, "line"],
  [/(^|\.)youtube\.com$/, "sns:youtube"],
] as const;

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9_.:\-]/g, "").slice(0, 60);

/** 流入元の名前。utm_source（utm_content があれば「:」で足す）→ Referer の送り元 → direct の順 */
export function classifySource(url: URL, referer: string | undefined): string {
  const utm = url.searchParams.get("utm_source");
  if (utm) {
    const content = url.searchParams.get("utm_content");
    return clean(content ? `${utm}:${content}` : utm) || "utm";
  }
  if (!referer) return "direct";
  let host: string;
  try {
    host = new URL(referer).hostname.toLowerCase();
  } catch {
    return "direct";
  }
  // 同じサイトの検索流入用ページ（東京版の /soudan）から相談画面に来た人は seo
  if (host === url.hostname) return /^\/soudan(\/|$)/.test(new URL(referer).pathname) ? "seo" : "direct";
  if (!host) return "direct";
  if (host === "ai.todokede.jp") return "portal";
  for (const [re, name] of [...SEARCH, ...SNS]) if (re.test(host)) return name;
  if (host === "todokede.jp" || host.endsWith(".todokede.jp")) return `todokede:${host.replace(/\.?todokede\.jp$/, "") || "hub"}`;
  return clean(`ref:${host}`);
}

/** ページを開いたとき（HTML の GET）に流入元と試験の印を cookie に残す */
export function rememberVisit(c: Context<AppEnv>): void {
  const url = new URL(c.req.url);
  const secure = url.protocol === "https:";
  const test = url.searchParams.get("test");
  if (test === "1") setCookie(c, TEST_COOKIE, "1", { httpOnly: true, secure, sameSite: "Lax", path: "/", maxAge: TEST_TTL_S });
  if (test === "0") deleteCookie(c, TEST_COOKIE, { path: "/", secure });
  // 最初の接触を残す。広告などの utm つきで開き直したときだけ上書きする
  if (!getCookie(c, SOURCE_COOKIE) || url.searchParams.get("utm_source")) {
    setCookie(c, SOURCE_COOKIE, classifySource(url, c.req.header("referer")), {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: SOURCE_TTL_S,
    });
  }
}

export function visitSource(c: Context<AppEnv>): string {
  return clean(getCookie(c, SOURCE_COOKIE) ?? "") || "direct";
}

export function isTestEmail(env: Env, email: string | null | undefined): boolean {
  if (!email) return false;
  const list = `${env.TEST_EMAILS ?? ""},${env.ADMIN_EMAILS ?? ""}`
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** この端末・アカウントが試験か */
export function isTestVisit(c: Context<AppEnv>, email?: string | null): boolean {
  return getCookie(c, TEST_COOKIE) === "1" || isTestEmail(c.env, email);
}

/** 既にいる利用者を、試験の端末から使われたら試験に切り替える（戻すことはしない） */
export async function markTestUser(c: Context<AppEnv>, user: User | null): Promise<void> {
  if (!user || user.is_test || !isTestVisit(c, user.email)) return;
  await c.env.DB.prepare("UPDATE users SET is_test = 1 WHERE id = ?").bind(user.id).run();
  user.is_test = 1;
}
