// 福岡市の届出の判定（src/rules/cities/fukuoka.ts）を、福岡市火災予防条例・同規則の条文と突き合わせる（2026-10-20 確認）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "fukuoka-city" as const;

test("福岡市: 使用開始届は7日前まで、様式第6号（条例第43条、規則第11条）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "15", total_area: 100 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /様式第6号/);
  assert.match(r.basis, /福岡市火災予防条例 第43条、福岡市火災予防規則 第11条/);
  assert.equal(r.target, "消防署長");
  assert.equal(r.lane, "gyosei");
});

test("福岡市: 厨房設備は350kW以上、設置工事着手の7日前まで（条例第44条第1項第3号の2、規則第12条）", () => {
  const [r] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 400 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /着手する日の7日前/);
  assert.match(r.form ?? "", /様式第7号/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 100 })[0].result, "not_required");
});

test("福岡市: 事業所のサウナは届出、個人が自宅で使う簡易サウナは対象外", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: false })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: true, personal_use: true })[0].result, "not_required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna" })[0].result, "conditional");
});

test("福岡市: 蓄電池設備は20kWh超、様式第8号", () => {
  const [r] = judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 30 });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /様式第8号/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 15 })[0].result, "not_required");
});

test("福岡市: 少量危険物は開始の7日前まで、様式第16号（条例第46条、規則第14条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { residence: false });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /様式第16号/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
});

test("福岡市: 火気を使う露店は3日前まで、様式第15号の2の2（条例第45条第7号、規則第13条）", () => {
  const [r] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /3日前/);
  assert.match(r.form ?? "", /様式第15号の2の2/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
});

test("福岡市: 催物は3日前まで、様式第13号（条例第45条第3号）", () => {
  const [r] = judgeFilings(J, "event", {});
  assert.match(r.deadline ?? "", /3日前/);
  assert.match(r.form ?? "", /様式第13号/);
});

test("福岡市: 消防訓練の通報は条例になく、国の規則による", () => {
  const [r] = judgeFilings(J, "drill", { occupancy: "3ロ" });
  assert.equal(r.result, "required");
  assert.match(r.basis, /消防法施行規則/);
});

test("福岡市: 溶接・溶断の届出の定めはなく、制限区域内の火気使用届に触れる", () => {
  const [r] = judgeFilings(J, "hot_work", {});
  assert.equal(r.result, "not_required");
  assert.ok(r.caveats.some((c) => /規則第5条/.test(c)));
});

test("福岡市: たき火・断水は3日前まで（条例第45条第1号・第4号）", () => {
  const b = judgeFilings(J, "bonfire", {})[0];
  assert.equal(b.result, "required");
  assert.match(b.deadline ?? "", /3日前/);
  assert.match(b.form ?? "", /様式第11号/);
  const w = judgeFilings(J, "water_outage", {})[0];
  assert.equal(w.result, "required");
  assert.match(w.form ?? "", /様式第14号/);
  assert.equal(w.target, "消防署長");
});
