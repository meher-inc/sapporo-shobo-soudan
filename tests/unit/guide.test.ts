// Run: node --experimental-strip-types --test tests/unit/
// 検索流入用の解説ページ（/soudan）。ルール判定の結論をそのまま載せる
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeScenario, publishedScenarios, renderIndex, renderScenario, SCENARIOS } from "../../src/worker/guide-pages.ts";

test("シナリオの slug は重複せず、URL に使える文字だけ", () => {
  const slugs = SCENARIOS.map((s) => s.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/);
});

test("すべてのシナリオで「必要」な届出か設備が出る（載らないシナリオを作らない）", () => {
  for (const s of SCENARIOS) assert.ok(judgeScenario(s), `${s.slug} の判定に「必要」がない`);
  assert.equal(publishedScenarios().length, SCENARIOS.length);
});

test("ページに結論・根拠・相談への導線・公式でない旨が入り、キャッチコピーの語を使わない", () => {
  const s = SCENARIOS.find((x) => x.slug === "inshokuten-kaigyo-250")!;
  const html = renderScenario("https://example.test", s, judgeScenario(s)!);
  assert.match(html, /<h1>[^<]*飲食店/);
  assert.match(html, /防火対象物使用開始届/);
  assert.match(html, /根拠: /);
  assert.match(html, /href="\/\?utm_source=guide&amp;utm_content=inshokuten-kaigyo-250"/);
  assert.match(html, /公式サービスではありません/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example.test\/soudan\/inshokuten-kaigyo-250">/);
  for (const w of ["お任せ", "絶対", "大丈夫です", "問題ありません", "—"]) assert.ok(!html.includes(w), w);
});

test("「不要」の届出はページに載せない", () => {
  const s = SCENARIOS.find((x) => x.slug === "jimusho-kaisetsu-200")!;
  const html = renderScenario("https://example.test", s, judgeScenario(s)!);
  assert.ok(!html.includes("防火管理者選任届"), "不要の届出が載っている");
});

test("一覧にすべてのシナリオへのリンクがある", () => {
  const html = renderIndex("https://example.test", publishedScenarios());
  for (const s of SCENARIOS) assert.ok(html.includes(`href="/soudan/${s.slug}"`), s.slug);
});
