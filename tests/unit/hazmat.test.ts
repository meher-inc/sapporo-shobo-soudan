// Run: node --experimental-strip-types --test tests/unit/
// 危険物の量の読み取り（政令別表第三の指定数量、法10条2項の合算）と、指定数量以上の設置許可。評価セット haz-001〜004
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hazmatRatio, runRules } from "../../src/rules/extract.ts";

const ids = new Set(
  readFileSync(new URL("../../eval/answer-cases.jsonl", import.meta.url), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id as string),
);

test("指定数量の倍数を読み取る", () => {
  assert.equal(hazmatRatio("灯油を300リットル保管する"), 0.3);
  assert.equal(hazmatRatio("ガソリン100Lと灯油600Lを保管する"), 1.1);
  assert.equal(hazmatRatio("灯油のドラム缶5本"), 1);
  assert.equal(hazmatRatio("エタノール 100L"), 0.25);
  assert.equal(hazmatRatio("天ぷら油を2000L"), 0.2);
  assert.equal(hazmatRatio("軽油1,500リットルのタンク"), 1.5);
  assert.equal(hazmatRatio("水を100L"), undefined);
});

for (const j of ["nagoya-city", "general", "kyoto-city", "tokyo-tfd"] as const) {
  test(`haz-001/003（${j}）: 指定数量以上は設置許可が必要`, () => {
    assert.ok(ids.has("haz-001") && ids.has("haz-003"));
    for (const q of ["倉庫でガソリン100Lと灯油600Lを保管します", "工場で軽油1,500リットルのタンクを置きます"]) {
      const r = runRules(j, [q]);
      assert.equal(r?.filings.find((x) => x.procedure === "kikenbutsu-kyoka")?.result, "required");
      assert.equal(r?.filings.find((x) => x.procedure === "shoryo-kikenbutsu")?.result, "not_required");
    }
  });
  test(`haz-002/004（${j}）: 少量危険物は条例の届出`, () => {
    assert.ok(ids.has("haz-002") && ids.has("haz-004"));
    for (const q of ["工場で灯油のドラム缶を3本置きます", "厨房で天ぷら油を2000L保管します"]) {
      const r = runRules(j, [q]);
      assert.equal(r?.filings.find((x) => x.procedure === "kikenbutsu-kyoka"), undefined);
      assert.notEqual(r?.filings.find((x) => x.procedure === "shoryo-kikenbutsu")?.result, "not_required");
    }
  });
}

test("危険物取扱者の資格の話では危険物の届出を判定しない", () => {
  assert.equal(runRules("general", ["危険物取扱者の資格は必要ですか"])?.scenes.includes("small_hazmat") ?? false, false);
});
