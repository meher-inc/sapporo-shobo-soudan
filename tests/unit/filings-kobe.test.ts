// 神戸市の届出の判定（src/rules/cities/kobe.ts）を、神戸市火災予防条例・同規則の条文と突き合わせる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "kobe-city" as const;

test("神戸市: 使用開始届は7日前まで、消防長へ、様式第9号、使用開始前の検査（条例第52条第2項・規則第12条）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "3ロ" });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /様式第9号/);
  assert.match(r.basis, /神戸市火災予防条例 第52条第2項/);
  assert.match(r.target, /^消防長/);
  assert.match(r.inspection ?? "", /消防長の検査/);
  assert.equal(r.lane, "gyosei");
});

test("神戸市: 厨房設備は350kW以上で届出、あらかじめ・様式第10号（条例第53条第4号）", () => {
  const [big] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 400 });
  assert.equal(big.result, "required");
  assert.match(big.deadline ?? "", /あらかじめ/);
  assert.match(big.form ?? "", /様式第10号/);
  assert.match(big.basis, /第53条第4号/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 100 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen" })[0].result, "conditional");
});

test("神戸市: 蓄電池設備は20kWh超、様式第12号。サウナは個人の住居なら不要", () => {
  const [b] = judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 25 });
  assert.equal(b.result, "required");
  assert.match(b.form ?? "", /様式第12号/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 15 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: false })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: true, personal_use: true })[0].result, "not_required");
});

test("神戸市: 少量危険物は所轄消防署長へ、様式第21号。住居でも5分の1が下限（条例第31条の2・第55条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { occupancy: "12イ" });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /様式第21号/);
  assert.match(r.target, /所轄消防署長/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "required");
  assert.equal(judgeFilings(J, "small_hazmat", { hazmat_ratio: 0.1 })[0].result, "not_required");
});

test("神戸市: 露店は対象火気器具等を使うときだけ、様式第20号の2（条例第54条第1項第7号）", () => {
  const [r] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /様式第20号の2/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
});

test("神戸市: 消防訓練は国の規則の通報と、統括防火管理者の全体訓練の届出（条例第51条の4）", () => {
  const rs = judgeFilings(J, "drill", { occupancy: "3ロ" });
  assert.equal(rs[0].result, "required");
  assert.match(rs[0].basis, /消防法施行規則/);
  assert.match(rs[1].basis, /第51条の4/);
  assert.match(rs[1].form ?? "", /様式第5号/);
});

test("神戸市: 溶接は届出の定めなし、断水は様式第19号、たき火は口頭でも可", () => {
  assert.equal(judgeFilings(J, "hot_work", {})[0].result, "not_required");
  const [w] = judgeFilings(J, "water_outage", {});
  assert.equal(w.result, "required");
  assert.match(w.form ?? "", /様式第19号/);
  assert.match(w.basis, /第54条第1項第5号/);
  const [b] = judgeFilings(J, "bonfire", {});
  assert.match(b.caveats.join(""), /口頭/);
});
