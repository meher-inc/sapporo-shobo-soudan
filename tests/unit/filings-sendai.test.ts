// 仙台市の届出の判定（src/rules/cities/sendai.ts）を、仙台市火災予防条例・規則の条文と突き合わせる（2026-10-20 確認）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "sendai-city" as const;

test("仙台市: 使用開始届は規則第10条の防火対象物だけで、期限は7日前まで（条例第55条）", () => {
  const [big] = judgeFilings(J, "use_start", { occupancy: "15", total_area: 400, floors_above: 2, floors_below: 0, capacity: 20 });
  assert.equal(big.result, "required");
  assert.match(big.deadline ?? "", /7日前/);
  assert.match(big.form ?? "", /別記様式第3号/);
  assert.match(big.basis, /仙台市火災予防条例 第55条、仙台市火災予防規則 第10条/);
  assert.match(big.reason, /第5号/);
  assert.equal(big.lane, "gyosei");
});

test("仙台市: 小さな平屋の事務所は使用開始届の対象外", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "15", total_area: 100, floors_above: 1, floors_below: 0, capacity: 10 });
  assert.equal(r.result, "not_required");
});

test("仙台市: 規模にかかわらず対象の用途（規則第10条第1号）", () => {
  assert.equal(judgeFilings(J, "use_start", { occupancy: "2ロ", total_area: 50 })[0].result, "required");
  assert.equal(judgeFilings(J, "use_start", { occupancy: "6ロ", total_area: 50 })[0].result, "required");
});

test("仙台市: 飲食店は延べ150㎡以上・収容30人以上、又は階の床面積100㎡以上で対象", () => {
  assert.equal(judgeFilings(J, "use_start", { occupancy: "3ロ", total_area: 80, capacity: 40 })[0].result, "required");
  assert.equal(judgeFilings(J, "use_start", { occupancy: "3ロ", total_area: 120, floors_above: 1, floors_below: 0, capacity: 20 })[0].result, "required");
  const [u] = judgeFilings(J, "use_start", { occupancy: "3ロ" });
  assert.equal(u.result, "conditional");
  assert.ok(u.missing.includes("total_area"));
  assert.equal(judgeFilings(J, "use_start", {})[0].result, "conditional");
});

test("仙台市: 厨房設備は同一厨房室の入力合計350kW以上で届出（条例第56条第7号の2）", () => {
  const [hi] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 360 });
  assert.equal(hi.result, "required");
  assert.match(hi.form ?? "", /別記様式第5号/);
  assert.match(hi.basis, /第56条第7号の2/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 100 })[0].result, "not_required");
});

test("仙台市: サウナ・蓄電池設備", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: false })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: true, personal_use: true })[0].result, "not_required");
  const [b] = judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 25 });
  assert.equal(b.result, "required");
  assert.match(b.form ?? "", /別記様式第6号/);
});

test("仙台市: 少量危険物（条例第58条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.5 });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /別記様式第16号/);
  assert.match(r.caveats.join(""), /遅滞なく/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
});

test("仙台市: 露店（条例第57条第6号、別記様式第14号）", () => {
  const [r] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /別記様式第14号/);
  assert.match(r.basis, /第57条第6号/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
});

test("仙台市: 消防訓練は国の規則、溶接は届出の定めがない", () => {
  assert.match(judgeFilings(J, "drill", { occupancy: "4" })[0].basis, /消防法施行規則/);
  assert.equal(judgeFilings(J, "drill", { occupancy: "15" })[0].result, "not_required");
  assert.equal(judgeFilings(J, "hot_work", {})[0].result, "not_required");
});

test("仙台市: たき火と断水（水道供給の停止・制限）", () => {
  const [b] = judgeFilings(J, "bonfire", {});
  assert.equal(b.result, "required");
  assert.match(b.form ?? "", /別記様式第9号/);
  assert.match(b.caveats.join(""), /口頭/);
  const [w] = judgeFilings(J, "water_outage", {});
  assert.equal(w.result, "required");
  assert.match(w.form ?? "", /別記様式第12号/);
  assert.match(w.basis, /第57条第4号/);
});
