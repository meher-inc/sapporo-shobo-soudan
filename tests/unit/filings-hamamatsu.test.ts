// 浜松市の届出の判定（src/rules/cities/hamamatsu.ts）を、浜松市火災予防条例・同規則の条文と突き合わせる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "hamamatsu-city" as const;

test("浜松市: 使用開始届は7日前まで、第3号様式（条例第43条・規則第14条）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "3ロ" });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /第3号様式/);
  assert.match(r.basis, /浜松市火災予防条例 第43条/);
  assert.equal(r.target, "消防署長");
  assert.equal(r.lane, "gyosei");
});

test("浜松市: 厨房設備は350kW以上で届出、期限は工事開始の7日前（条例第44条第3号の2・規則第15条）", () => {
  const [big] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 400 });
  assert.equal(big.result, "required");
  assert.match(big.deadline ?? "", /7日前/);
  assert.match(big.form ?? "", /第4号様式/);
  const [small] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 100 });
  assert.equal(small.result, "not_required");
  const [unknown] = judgeFilings(J, "fire_equipment", { facility: "kitchen" });
  assert.equal(unknown.result, "conditional");
  assert.deepEqual(unknown.missing, ["kitchen_kw"]);
});

test("浜松市: 蓄電池設備は20kWh超で届出、工事開始の3日前・第5号様式", () => {
  const [r] = judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 30 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /3日前/);
  assert.match(r.form ?? "", /第5号様式/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 15 })[0].result, "not_required");
});

test("浜松市: サウナは個人が設ける簡易サウナ・住居の一般サウナを除く", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: false })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: true, personal_use: true })[0].result, "not_required");
});

test("浜松市: 少量危険物は「あらかじめ」第14号様式、住居は2分の1以上（条例第46条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { occupancy: "12イ" });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /あらかじめ/);
  assert.match(r.form ?? "", /第14号様式/);
  assert.match(r.basis, /第46条/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.1 })[0].result, "not_required");
});

test("浜松市: 露店は屋外の催しで火気器具を使うものだけ、3日前・第12号様式の2（条例第45条第6号）", () => {
  const [r] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /3日前/);
  assert.match(r.form ?? "", /第12号様式の2/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
});

test("浜松市: 消防訓練の通報は条例になく国の規則による", () => {
  const [r] = judgeFilings(J, "drill", { occupancy: "3ロ" });
  assert.equal(r.result, "required");
  assert.match(r.basis, /消防法施行規則/);
  assert.equal(judgeFilings(J, "drill", { occupancy: "15" })[0].result, "not_required");
});

test("浜松市: 溶接・溶断の届出の定めはない", () => {
  const [r] = judgeFilings(J, "hot_work", {});
  assert.equal(r.result, "not_required");
  assert.match(r.basis, /第45条/);
});

test("浜松市: たき火・断水は3日前まで（規則第16条）", () => {
  const [b] = judgeFilings(J, "bonfire", {});
  assert.equal(b.result, "required");
  assert.match(b.deadline ?? "", /3日前/);
  assert.match(b.form ?? "", /第8号様式/);
  const [w] = judgeFilings(J, "water_outage", {});
  assert.equal(w.result, "required");
  assert.match(w.deadline ?? "", /3日前/);
  assert.match(w.basis, /第45条第4号/);
});

test("浜松市: 催物は3日前・第10号様式、工事計画の届出はない", () => {
  const [e] = judgeFilings(J, "event", {});
  assert.match(e.deadline ?? "", /3日前/);
  assert.match(e.form ?? "", /第10号様式/);
  assert.equal(judgeFilings(J, "renovation", {})[0].result, "conditional");
});
