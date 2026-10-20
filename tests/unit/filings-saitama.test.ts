// さいたま市の届出の判定（src/rules/cities/saitama.ts）を、さいたま市火災予防条例・規則の条文と突き合わせる（2026-10-20 確認）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "saitama-city" as const;

test("さいたま市: 使用開始届は規模にかかわらず7日前まで、消防長へ（条例第63条、規則第8条）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "15", total_area: 100, floors_above: 1 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /様式第4号/);
  assert.match(r.basis, /さいたま市火災予防条例 第63条、さいたま市火災予防規則 第8条/);
  assert.match(r.target, /^消防長/);
  assert.equal(r.lane, "gyosei");
});

test("さいたま市: 厨房設備は同一厨房室の入力合計350kW以上、あらかじめ（条例第64条第4号）", () => {
  const [hit] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 350 });
  assert.equal(hit.result, "required");
  assert.match(hit.deadline ?? "", /あらかじめ/);
  assert.match(hit.form ?? "", /様式第6号/);
  assert.match(hit.basis, /第64条第4号/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 200 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen" })[0].result, "conditional");
});

test("さいたま市: サウナ・蓄電池（第7号の2・第8号、第16号）", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: false })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", personal_use: true })[0].result, "not_required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 25 })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 15 })[0].result, "not_required");
});

test("さいたま市: 少量危険物は5分の1以上（個人の住居は2分の1以上）、あらかじめ（条例第67条、規則第12条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", {});
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /あらかじめ/);
  assert.match(r.form ?? "", /様式第16号/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.3 })[0].result, "required");
});

test("さいたま市: 露店・火煙・断水は条例第65条であらかじめ。軽易な火煙・断水は口頭でよい", () => {
  const [stall] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(stall.result, "required");
  assert.match(stall.basis, /第65条第6号/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
  const [w] = judgeFilings(J, "water_outage", {});
  assert.equal(w.result, "required");
  assert.match(w.deadline ?? "", /あらかじめ/);
  assert.match(w.caveats.join(), /口頭/);
  assert.match(judgeFilings(J, "bonfire", {})[0].basis, /第65条第1号/);
});

test("さいたま市: 消防訓練は条例になく国の規則による。溶接・溶断の届出は条例にない", () => {
  const [sp] = judgeFilings(J, "drill", { occupancy: "3ロ" });
  assert.equal(sp.result, "required");
  assert.match(sp.basis, /消防法施行規則/);
  assert.equal(judgeFilings(J, "drill", { occupancy: "15" })[0].result, "not_required");
  assert.equal(judgeFilings(J, "hot_work", {})[0].result, "not_required");
  assert.equal(judgeFilings(J, "event", {})[0].result, "conditional");
});
