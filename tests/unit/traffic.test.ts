// Run: node --experimental-strip-types --test tests/unit/
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySource, isTestEmail } from "../../src/worker/traffic.ts";
import type { Env } from "../../src/worker/env.ts";

const at = (q = "") => new URL(`https://nagoya.todokede.jp/${q}`);

test("utm_source があればそれを流入元にする（utm_content を足す）", () => {
  assert.equal(classifySource(at("?utm_source=todokede_widget&utm_medium=referral&utm_content=plan"), "https://plan.todokede.jp/"), "todokede_widget:plan");
  assert.equal(classifySource(at("?utm_source=Google_Ads"), undefined), "google_ads");
});

test("Referer から検索・SNS・入口・トドケデの各サイトを見分ける", () => {
  assert.equal(classifySource(at(), "https://www.google.co.jp/"), "search:google");
  assert.equal(classifySource(at(), "https://search.yahoo.co.jp/search?p=x"), "search:yahoo");
  assert.equal(classifySource(at(), "https://t.co/abc"), "sns:x");
  assert.equal(classifySource(at(), "https://l.instagram.com/"), "sns:instagram");
  assert.equal(classifySource(at(), "https://ai.todokede.jp/"), "portal");
  assert.equal(classifySource(at(), "https://todokede.jp/"), "todokede:hub");
  assert.equal(classifySource(at(), "https://docs.todokede.jp/x"), "todokede:docs");
  assert.equal(classifySource(at(), "https://example.com/a"), "ref:example.com");
});

test("Referer がない・同じサイト・読めないときは direct", () => {
  assert.equal(classifySource(at(), undefined), "direct");
  assert.equal(classifySource(at(), "https://nagoya.todokede.jp/legal/terms"), "direct");
  assert.equal(classifySource(at(), "not a url"), "direct");
});

test("TEST_EMAILS と ADMIN_EMAILS のアカウントは試験", () => {
  const env = { TEST_EMAILS: "a@example.com, B@example.com", ADMIN_EMAILS: "admin@example.com" } as Env;
  assert.ok(isTestEmail(env, "b@example.com"));
  assert.ok(isTestEmail(env, "admin@example.com"));
  assert.ok(!isTestEmail(env, "user@example.com"));
  assert.ok(!isTestEmail(env, ""));
});
