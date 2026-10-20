// 堺市の届出の判定（src/rules/cities/sakai.ts）を、堺市火災予防条例・同施行規則の条文と突き合わせる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "sakai-city" as const;

test("堺市: 使用開始届は7日前まで、様式第3号、使用開始前の検査も（条例第84条・規則第6条）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "3ロ" });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /様式第3号/);
  assert.match(r.basis, /堺市火災予防条例 第84条/);
  assert.match(r.target, /消防長又は消防署長/);
  assert.match(r.inspection ?? "", /検査を受ける/);
  assert.equal(r.lane, "gyosei");
});

test("堺市: 厨房設備は350kW以上で届出、設置の5日前・様式第5号（条例第85条第3号・規則第7条）", () => {
  const [big] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 400 });
  assert.equal(big.result, "required");
  assert.match(big.deadline ?? "", /5日前/);
  assert.match(big.form ?? "", /様式第5号/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 100 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen" })[0].result, "conditional");
});

test("堺市: 蓄電池設備は20kWh超、様式第6号（条例第85条第15号）", () => {
  const [r] = judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 25 });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /様式第6号/);
  assert.match(r.deadline ?? "", /5日前/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 20 })[0].result, "not_required");
});

test("堺市: サウナは事業所なら届出、専ら個人が使うものは対象外", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: false })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: true, personal_use: true })[0].result, "not_required");
});

test("堺市: 少量危険物は5日前まで・様式第16号（条例第88条・規則第10条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { occupancy: "12イ" });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /5日前/);
  assert.match(r.form ?? "", /様式第16号/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "small_hazmat", { hazmat_ratio: 1.5 })[0].result, "not_required");
});

test("堺市: 露店は3日前・様式第14号の2（条例第86条第7号・規則第8条第7項）", () => {
  const [r] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /3日前/);
  assert.match(r.form ?? "", /様式第14号の2/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
});

test("堺市: 消防訓練の通報は条例になく国の規則による", () => {
  const [r] = judgeFilings(J, "drill", { occupancy: "4" });
  assert.equal(r.result, "required");
  assert.match(r.basis, /消防法施行規則/);
});

test("堺市: 溶接・溶断の届出の定めはない", () => {
  assert.equal(judgeFilings(J, "hot_work", {})[0].result, "not_required");
});

test("堺市: たき火・断水・催物は前日まで（規則第8条）", () => {
  const [b] = judgeFilings(J, "bonfire", {});
  assert.equal(b.result, "required");
  assert.match(b.deadline ?? "", /前日/);
  assert.match(b.form ?? "", /様式第9号/);
  const [w] = judgeFilings(J, "water_outage", {});
  assert.equal(w.result, "required");
  assert.match(w.deadline ?? "", /前日/);
  assert.match(w.form ?? "", /様式第12号/);
  const [e] = judgeFilings(J, "event", {});
  assert.match(e.deadline ?? "", /前日/);
  assert.match(e.form ?? "", /様式第11号/);
});

test("堺市: 工事は消防用設備等の工事設計書（10日前）を案内する", () => {
  const [r] = judgeFilings(J, "renovation", {});
  assert.equal(r.result, "conditional");
  assert.match(r.reason, /10日前/);
  assert.match(r.basis, /第91条/);
});
