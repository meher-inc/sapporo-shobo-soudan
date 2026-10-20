// 千葉市の届出の判定（src/rules/cities/chiba.ts）を、千葉市火災予防条例・規則の条文と突き合わせる（2026-10-20 確認）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "chiba-city" as const;

test("千葉市: 使用開始届は規模にかかわらず7日前まで（条例第43条、規則第31条・様式第2号）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "15", total_area: 100, floors_above: 1 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /様式第2号/);
  assert.match(r.basis, /千葉市火災予防条例 第43条、千葉市火災予防規則 第31条/);
  assert.match(r.target, /消防長又は消防署長/);
  assert.equal(r.lane, "gyosei");
});

test("千葉市: 厨房設備は入力の合計117kW以上が対象（条例第44条第1項第5号）、工事開始の7日前まで", () => {
  const [hit] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 117 });
  assert.equal(hit.result, "required");
  assert.match(hit.deadline ?? "", /7日前/);
  assert.match(hit.form ?? "", /様式第4号/);
  assert.match(hit.basis, /第44条第1項第5号/);
  assert.match(hit.inspection ?? "", /検査/);
  const [miss] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 116 });
  assert.equal(miss.result, "not_required");
  const [unk] = judgeFilings(J, "fire_equipment", { facility: "kitchen" });
  assert.equal(unk.result, "conditional");
  assert.deepEqual(unk.missing, ["kitchen_kw"]);
});

test("千葉市: サウナと蓄電池（第7号の2・第8号、第16号）", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: false })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: true })[0].result, "not_required");
  const [bat] = judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 30 });
  assert.equal(bat.result, "required");
  assert.match(bat.form ?? "", /様式第5号/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 20 })[0].result, "not_required");
});

test("千葉市: 少量危険物は5分の1以上（個人の住居は2分の1以上）、あらかじめ（条例第46条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.3 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /あらかじめ/);
  assert.match(r.form ?? "", /様式第13号/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.1 })[0].result, "not_required");
  assert.match(judgeFilings(J, "small_hazmat", { hazmat_ratio: 2 })[0].reason, /許可/);
});

test("千葉市: 露店・火煙・断水は行為の日の3日前まで（条例第45条、規則第34条）", () => {
  const [stall] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(stall.result, "required");
  assert.match(stall.deadline ?? "", /3日前/);
  assert.match(stall.form ?? "", /様式第11号の3/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
  const [fire] = judgeFilings(J, "bonfire", {});
  assert.match(fire.basis, /第45条第1号/);
  assert.match(fire.form ?? "", /様式第9号/);
  const [w] = judgeFilings(J, "water_outage", {});
  assert.equal(w.result, "required");
  assert.match(w.basis, /第45条第4号/);
  assert.match(w.form ?? "", /様式第11号の2/);
});

test("千葉市: 消防訓練は条例で3日前までの届出（条例第43条の2、規則第32条・様式第3号）", () => {
  const [r] = judgeFilings(J, "drill", {});
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /3日前/);
  assert.match(r.form ?? "", /様式第3号/);
  assert.match(r.basis, /第43条の2/);
});

test("千葉市: 溶接・溶断の届出は条例にない。催物は劇場等以外での演劇などで3日前", () => {
  assert.equal(judgeFilings(J, "hot_work", {})[0].result, "not_required");
  const [ev] = judgeFilings(J, "event", {});
  assert.equal(ev.result, "conditional");
  assert.match(ev.deadline ?? "", /3日前/);
  assert.match(ev.form ?? "", /様式第11号/);
  const [ren] = judgeFilings(J, "renovation", {});
  assert.match(ren.reason, /10日前/);
});
