// 熊本市の届出の判定（src/rules/cities/kumamoto.ts）を、熊本市火災予防条例・同規則の条文と突き合わせる（2026-10-20 確認）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "kumamoto-city" as const;

test("熊本市: 使用開始届は7日前まで、様式第15号（条例第43条、規則第13条）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "3ロ" });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /様式第15号/);
  assert.match(r.basis, /熊本市火災予防条例 第43条、熊本市火災予防規則 第13条/);
  assert.equal(r.target, "所轄消防署長");
  assert.equal(r.lane, "gyosei");
});

test("熊本市: 厨房設備は350kW以上、設置工事着手の7日前まで（条例第44条第3号の2、規則第14条）", () => {
  const [r] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 350 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /着手する日の7日前/);
  assert.match(r.form ?? "", /様式第16号/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 349 })[0].result, "not_required");
});

test("熊本市: 蓄電池設備は20kWh超、様式第17号", () => {
  const [r] = judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 25 });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /様式第17号/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 20 })[0].result, "not_required");
});

test("熊本市: 少量危険物は「あらかじめ」、様式第27号（条例第46条、規則第17条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { residence: false });
  assert.equal(r.result, "required");
  assert.equal(r.deadline, "あらかじめ");
  assert.match(r.form ?? "", /様式第27号/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
});

test("熊本市: 火気を使う露店は届出、様式第25号（条例第45条第6号）", () => {
  const [r] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(r.result, "required");
  assert.match(r.basis, /第45条第6号/);
  assert.match(r.form ?? "", /様式第25号/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
  assert.equal(judgeFilings(J, "stall", {})[0].result, "conditional");
});

test("熊本市: 消防訓練の通報は条例になく、国の規則による", () => {
  assert.equal(judgeFilings(J, "drill", { occupancy: "6イ" })[0].result, "required");
  assert.equal(judgeFilings(J, "drill", {})[0].result, "conditional");
});

test("熊本市: 溶接・溶断の届出の定めはない", () => {
  const [r] = judgeFilings(J, "hot_work", {});
  assert.equal(r.result, "not_required");
  assert.ok(r.caveats.some((c) => /規則第5条/.test(c)));
});

test("熊本市: たき火・断水は届出（条例第45条第1号・第4号）、やむを得ないときは口頭・電話等", () => {
  const b = judgeFilings(J, "bonfire", {})[0];
  assert.equal(b.result, "required");
  assert.match(b.form ?? "", /様式第20号/);
  assert.ok(b.caveats.some((c) => /口頭/.test(c)));
  const w = judgeFilings(J, "water_outage", {})[0];
  assert.equal(w.result, "required");
  assert.match(w.basis, /第45条第4号/);
  assert.match(w.form ?? "", /様式第23号/);
});
