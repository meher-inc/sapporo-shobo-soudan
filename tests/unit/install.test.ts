// 設置義務の判定（src/rules/install.ts）を、評価セットの inst- の問いと突き合わせる（京都市・東京都・名古屋市の条例の上乗せを含む）。
// 評価セットの結論と判定が食い違った問いは KNOWN_DIFF に理由つきで載せ、丸岡の確認を待つ。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { judge, type Equipment, type Facts, type InstallJurisdiction } from "../../src/rules/install.ts";

type Case = { id: string; jurisdiction: string; facts: Facts; expect: string; basis: [string, string][]; assertive: boolean; note?: string };

const cases: Case[] = readFileSync(new URL("../../eval/answer-cases.jsonl", import.meta.url), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((c: Case) => c.id.startsWith("inst-"));

const KYOTO_ARTICLE: Record<string, Equipment> = { 第36条: "extinguisher", 第38条: "indoor_hydrant", 第39条: "sprinkler", 第43条: "evac_device", 第45条: "standpipe", 第45条の2: "emergency_outlet" };

const TOKYO_ARTICLE: Record<string, Equipment> = {
  第三十六条: "extinguisher",
  第三十八条: "indoor_hydrant",
  第三十九条: "sprinkler",
  第四十一条: "auto_alarm",
  第四十四条: "evac_device",
  第四十五条: "guide_light",
  第四十六条: "standpipe",
  第四十六条の二: "emergency_outlet",
};

const NAGOYA_ARTICLE: Record<string, Equipment> = {
  第45条: "extinguisher",
  第46条: "indoor_hydrant",
  第47条: "sprinkler",
  第49条: "auto_alarm",
  第52条: "evac_device",
  第54条: "standpipe",
  第55条: "emergency_outlet",
};

const BY_ARTICLE: Record<string, Equipment> = {
  第一条の二: "fire_manager",
  第十条: "extinguisher",
  第十一条: "indoor_hydrant",
  第十二条: "sprinkler",
  第二十一条: "auto_alarm",
  第二十二条: "leak_alarm",
  第二十四条: "emergency_alarm",
  第二十五条: "evac_device",
  第二十六条: "guide_light",
  第十九条: "outdoor_hydrant",
  第二十三条: "fire_report",
  第二十八条: "smoke_control",
  第二十九条: "standpipe",
  第二十九条の二: "emergency_outlet",
};

// 問題文・注記に書かれているが facts に入っていない条件
const EXTRA_FACTS: Record<string, Partial<Facts>> = {
  "inst-031": { specific_use_upper: true }, // 注記「特定用途が避難階以外にあり」
};

// 評価セットと判定が食い違うもの（確認待ち）
const KNOWN_DIFF: Record<string, string> = {};

test("評価セットに設置義務の問いがある", () => {
  assert.ok(cases.length >= 85);
});

for (const c of cases) {
  test(`${c.id} ${c.expect}`, (t) => {
    const art = c.basis[0][1];
    const law = c.basis[0][0];
    const eq = law === "京都市火災予防条例" ? KYOTO_ARTICLE[art] : law === "火災予防条例（東京都）" ? TOKYO_ARTICLE[art] : law === "名古屋市火災予防条例" ? NAGOYA_ARTICLE[art] : BY_ARTICLE[art];
    assert.ok(eq, `条文 ${art} に対応する設備がない`);
    const v = judge(eq, { ...c.facts, ...EXTRA_FACTS[c.id] }, c.jurisdiction as InstallJurisdiction);
    if (KNOWN_DIFF[c.id]) {
      t.diagnostic(`確認待ち: ${KNOWN_DIFF[c.id]}（判定: ${v.result}）`);
      return;
    }
    const exp = c.expect;
    if (exp === "不要") assert.equal(v.result, "not_required", v.reason);
    else if (exp.startsWith("条件次第")) assert.equal(v.result, "conditional", v.reason);
    else if (exp === "誘導灯は不要、誘導標識が必要") {
      assert.equal(v.result, "not_required", v.reason);
      assert.equal(v.detail, "誘導標識");
    } else {
      assert.equal(v.result, "required", v.reason);
      if (exp === "原則必要" || exp === "避難口誘導灯が必要") assert.equal(v.assertive, false);
      if (exp === "11階以上の階に必要") assert.equal(v.scope, "11階以上の階");
      if (exp === "高さ31mを超える部分に必要") assert.equal(v.scope, "高さ31mを超える部分");
      if (exp === "地盤面からの高さが31mを超える階に必要") assert.equal(v.scope, "地盤面からの高さが31mを超える階");
      if (exp === "避難口誘導灯が必要") assert.equal(v.detail, "避難口誘導灯");
      if (c.jurisdiction === "kyoto-city") assert.match(v.basis, /京都市火災予防条例/);
      if (c.jurisdiction === "tokyo-tfd") assert.match(v.basis, /火災予防条例（東京都）/);
      if (c.jurisdiction === "nagoya-city") assert.match(v.basis, /名古屋市火災予防条例/);
      if (exp === "非常警報器具が必要") assert.equal(v.detail, "非常警報器具");
      if (exp.startsWith("非常ベル・自動式サイレン・放送設備")) assert.match(v.detail ?? "", /いずれか/);
      if (exp.startsWith("非常ベル＋放送設備")) assert.match(v.detail ?? "", /放送設備$/);
    }
    // 評価セットで「断定しない」問いは、判定も断定しない
    if (!c.assertive) assert.ok(v.result === "conditional" || !v.assertive, "断定してはいけない問いで断定している");
  });
}

test("入力が足りなければ条件次第にして、足りない項目を返す", () => {
  const v = judge("extinguisher", { occupancy: "3ロ" });
  assert.equal(v.result, "conditional");
  assert.deepEqual(v.missing, ["fire_use", "total_area"]);
  assert.equal(judge("indoor_hydrant", { occupancy: "4", total_area: 1000 }).result, "conditional");
  assert.equal(judge("indoor_hydrant", { occupancy: "4", total_area: 2200 }).result, "required");
});

test("用途の表記ゆれを読める", () => {
  for (const occ of ["(3)項ロ", "３ロ", "（６）項イ（４）", "16の2"]) {
    assert.notEqual(judge("guide_light", { occupancy: occ }).missing.join(), "occupancy", occ);
  }
});

test("東京都の上乗せは他の管轄に出ない", () => {
  const f: Facts = { occupancy: "15", floors_above: 5, total_area: 800, structure: "other" };
  assert.equal(judge("indoor_hydrant", f, "jp").result, "not_required");
  assert.equal(judge("indoor_hydrant", f, "osaka-city").result, "not_required");
  assert.equal(judge("indoor_hydrant", f, "tokyo-tfd").result, "required");
});

test("東京都: 共同住宅の構造が分からなければ条件次第", () => {
  const v = judge("auto_alarm", { occupancy: "5ロ", total_area: 300 }, "tokyo-tfd");
  assert.equal(v.result, "conditional");
  assert.deepEqual(v.missing, ["building_class"]);
});

test("東京都: 国の判定で断定して必要なものには特例の注意を足さない", () => {
  const v = judge("auto_alarm", { occupancy: "4", total_area: 400 }, "tokyo-tfd");
  assert.equal(v.result, "required");
  assert.ok(!v.caveats.some((c) => c.includes("第四十七条")));
});

test("名古屋市: 5階以上の階を聞かれていなければ条件次第", () => {
  const v = judge("indoor_hydrant", { occupancy: "15", floors_above: 6, total_area: 800, structure: "other" }, "nagoya-city");
  assert.equal(v.result, "conditional");
  assert.deepEqual(v.missing, ["floor", "floor_area"]);
});

test("名古屋市: 共同住宅の構造が分からなければ避難器具は条件次第", () => {
  const v = judge("evac_device", { occupancy: "5ロ", floor: 3, floor_capacity: 8, direct_stairs: 1 }, "nagoya-city");
  assert.equal(v.result, "conditional");
  assert.deepEqual(v.missing, ["structure"]);
});
