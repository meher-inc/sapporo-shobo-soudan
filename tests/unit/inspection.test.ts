// Run: node --experimental-strip-types --test tests/unit/
// 定期点検と報告（消防用設備等の点検報告・防火対象物定期点検）。評価セット tnk-001〜007
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runRules } from "../../src/rules/extract.ts";
import { equipmentInspection, fireSafetyInspection } from "../../src/rules/inspection.ts";

const ids = new Set(
  readFileSync(new URL("../../eval/answer-cases.jsonl", import.meta.url), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id as string),
);

const CASES: { id: string; text: string; procedure: string; result: "required" | "not_required" | "conditional"; reason?: RegExp; deadline?: RegExp }[] = [
  { id: "tnk-001", text: "飲食店（延べ面積300㎡、2階建て、収容人員60人）です。消防設備の点検報告はどのくらいの頻度ですか？", procedure: "setsubi-tenken", result: "required", deadline: /1年に1回/, reason: /自ら点検できる/ },
  { id: "tnk-002", text: "事務所ビル（延べ面積800㎡、5階建て）です。消防用設備の点検報告は？", procedure: "setsubi-tenken", result: "required", deadline: /3年に1回/ },
  { id: "tnk-003", text: "物販店（延べ面積1500㎡、3階建て）です。消防用設備の点検は誰がしますか？", procedure: "setsubi-tenken", result: "required", reason: /消防設備士又は消防設備点検資格者/ },
  { id: "tnk-004", text: "飲食店（延べ面積500㎡、2階建て、収容人員350人）です。防火対象物点検は必要ですか？", procedure: "boka-tenken", result: "required" },
  { id: "tnk-006", text: "事務所（延べ面積2000㎡、収容人員400人）です。防火対象物点検は必要ですか？", procedure: "boka-tenken", result: "not_required" },
];

for (const c of CASES)
  for (const j of ["nagoya-city", "general", "kyoto-city"] as const)
    test(`${c.id}（${j}）: ${c.procedure} は ${c.result}`, () => {
      assert.ok(ids.has(c.id), "評価セットに問いがある");
      const f = runRules(j, [c.text])?.filings.find((x) => x.procedure === c.procedure);
      assert.ok(f, `${c.procedure} の判定がある`);
      assert.equal(f.result, c.result, f.reason);
      if (c.deadline) assert.match(f.deadline ?? "", c.deadline);
      if (c.reason) assert.match(f.reason, c.reason);
    });

test("tnk-005: 特定用途が3階にあり直通階段が1つなら、収容人員300人未満でも防火対象物点検の対象（令4条の2の2第2号）", () => {
  assert.ok(ids.has("tnk-005"));
  assert.equal(fireSafetyInspection({ occupancy: "3ロ", total_area: 200, capacity: 40, floor: 3, direct_stairs: 1 })[0].result, "required");
});

test("tnk-007: 平屋で収容人員300人未満の物販店は防火対象物点検の対象外", () => {
  assert.ok(ids.has("tnk-007"));
  assert.equal(fireSafetyInspection({ occupancy: "4", total_area: 400, capacity: 100, floors_above: 1 })[0].result, "not_required");
});

test("2階の店舗は避難階以外の階に当たらない（令4条の2の2は1階・2階を除く）", () => {
  assert.equal(fireSafetyInspection({ occupancy: "3ロ", capacity: 40, floor: 2, direct_stairs: 1 })[0].result, "not_required");
});

test("舟車（令別表第一(20)項）は点検を要しない", () => {
  assert.equal(equipmentInspection({ occupancy: "20" })[0].result, "not_required");
});

test("延べ1000㎡以上の非特定用途は、消防長等の指定しだいで有資格者の点検", () => {
  assert.match(equipmentInspection({ occupancy: "15", total_area: 1200 })[0].reason, /指定/);
});

test("用途が分からなければ条件次第で、用途を聞く", () => {
  const r = runRules("general", ["消防設備の点検報告は必要ですか？"]);
  const f = r?.filings.find((x) => x.procedure === "setsubi-tenken");
  assert.equal(f?.result, "conditional");
  assert.deepEqual(f?.missing, ["occupancy"]);
});

test("防火対象物点検だけを聞いたら設備点検は出さない", () => {
  const r = runRules("general", ["飲食店で収容人員350人です。防火対象物点検は必要ですか？"]);
  assert.equal(r?.filings.some((x) => x.procedure === "setsubi-tenken"), false);
  assert.equal(r?.filings.find((x) => x.procedure === "boka-tenken")?.result, "required");
});

test("用途なしで点検の周期を聞かれたら、用途を聞く判定を出す", () => {
  const f = runRules("tokyo-tfd", ["消火器の点検は何年ごとですか"])?.filings.find((x) => x.procedure === "setsubi-tenken");
  assert.equal(f?.result, "conditional");
});

test("点検の手配の依頼では判定しない", () => {
  assert.equal(runRules("general", ["消火器の点検をお願いしたい"]), null);
  assert.equal(runRules("general", ["点検業者を紹介してほしい"]), null);
});
