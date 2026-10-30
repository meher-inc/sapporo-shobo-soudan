// Run: node --experimental-strip-types --test tests/unit/
import { test } from "node:test";
import assert from "node:assert/strict";
import { isBot, isClientEvent, isValidProp, pageViewProp } from "../../src/worker/events.ts";
import { conditionProp } from "../../src/client/events.ts";
import { buildActions } from "../../src/worker/actions.ts";

test("prop は英小文字・数字・_:.- の60文字以内だけを通す", () => {
  for (const ok of ["occupancy", "unknown:total_area", "other:fire_use", "search:google", "ref:example.com", "todokede_widget:plan", "a-b", "x".repeat(60)])
    assert.ok(isValidProp(ok), ok);
  for (const bad of ["", "Occupancy", "飲食店", "a b", "a@example.com", "x".repeat(61), "1/2", null, undefined, 3, {}])
    assert.ok(!isValidProp(bad), String(bad));
});

test("クライアントから送ってよいイベントは condition_answered だけ", () => {
  assert.ok(isClientEvent("condition_answered"));
  for (const bad of ["page_view", "limit_reached", "error_shown", "other", "", null]) assert.ok(!isClientEvent(bad), String(bad));
});

test("User-Agent が空、またはボット・監視・コマンドラインの道具は page_view に数えない", () => {
  for (const ua of [undefined, null, "", "  ", "Googlebot/2.1", "Mozilla/5.0 (compatible; bingbot/2.0)", "Slurp", "facebookexternalhit preview", "UptimeRobot monitor", "Mozilla/5.0 HeadlessChrome/120", "Chrome-Lighthouse", "curl/8.4.0", "Wget/1.21", "python-requests/2.31", "Go-http-client/2.0", "AhrefsSpider", "Screaming Frog crawler"])
    assert.ok(isBot(ua), String(ua));
  for (const ua of [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  ])
    assert.ok(!isBot(ua), ua);
});

test("page_view の prop は流入元。テーマページは soudan: を付け、規約のページは数えない", () => {
  assert.equal(pageViewProp("/", "search:google"), "search:google");
  assert.equal(pageViewProp("/index.html", "direct"), "direct");
  assert.equal(pageViewProp("/soudan/inshokuten", "seo"), "soudan:seo");
  assert.equal(pageViewProp("/legal/terms", "direct"), null);
  assert.ok((pageViewProp("/soudan/x", "x".repeat(60)) ?? "").length <= 60);
});

test("条件の選択肢の prop（わからない・その他）", () => {
  assert.equal(conditionProp("occupancy", { label: "飲食店", text: "飲食店です。" }), "occupancy");
  assert.equal(conditionProp("total_area", { label: "わからない", text: "延べ面積はわかりません。調べ方を教えてください。" }), "unknown:total_area");
  assert.equal(conditionProp("occupancy", { label: "その他（入力する）", text: "" }), "other:occupancy");
});

test("条件の選択肢には topic が付き、その prop は形式検査を通る", () => {
  const a = buildActions({ userTexts: ["お店を始めるときの消防の手続を知りたい"], rules: null });
  assert.equal(a.question?.topic, "occupancy");
  for (const o of a.question!.options) assert.ok(isValidProp(conditionProp(a.question!.topic, o)), o.label);
});
