// 北九州市の届出の判定（src/rules/cities/kitakyushu.ts）を、北九州市火災予防条例の条文と突き合わせる（2026-10-20 確認）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "kitakyushu-city" as const;

test("北九州市: 使用開始届は7日前まで、所轄消防署長へ（条例第65条）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "3ロ" });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.basis, /北九州市火災予防条例 第65条/);
  assert.equal(r.target, "所轄消防署長");
  assert.equal(r.form, undefined);
  assert.equal(r.lane, "gyosei");
});

test("北九州市: 厨房設備は同一厨房室の入力合計350kW以上が対象（条例第67条第3号の2）", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 400 })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 150 })[0].result, "not_required");
  const u = judgeFilings(J, "fire_equipment", { facility: "kitchen" })[0];
  assert.equal(u.result, "conditional");
  assert.deepEqual(u.missing, ["kitchen_kw"]);
  assert.match(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 400 })[0].basis, /第67条第3号の2/);
});

test("北九州市: 蓄電池設備は20kWh超が対象（条例第67条第13号）", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 15 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 30 })[0].result, "required");
});

test("北九州市: 少量危険物は5分の1以上（個人の住居は2分の1以上）（条例第69条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { residence: false });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /あらかじめ/);
  assert.match(r.basis, /第69条/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.1 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "small_hazmat", { hazmat_ratio: 1.5 })[0].result, "not_required");
});

test("北九州市: 火気を使う露店は届出（条例第72条第1項第8号）、指定催しの例外も伝える", () => {
  const [r] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(r.result, "required");
  assert.match(r.basis, /第72条第1項第8号/);
  assert.ok(r.caveats.some((c) => /第72条第2項/.test(c)));
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
});

test("北九州市: 消防訓練の通報は条例になく、国の規則による", () => {
  const [r] = judgeFilings(J, "drill", { occupancy: "4" });
  assert.equal(r.result, "required");
  assert.match(r.basis, /消防法施行規則/);
  assert.equal(judgeFilings(J, "drill", { occupancy: "15" })[0].result, "not_required");
});

test("北九州市: 溶接・溶断の届出の定めはない", () => {
  const [r] = judgeFilings(J, "hot_work", {});
  assert.equal(r.result, "not_required");
  assert.match(r.basis, /第72条/);
});

test("北九州市: たき火・断水は届出、期限は条例の「あらかじめ」（条例第72条第1項第1号・第4号）", () => {
  const b = judgeFilings(J, "bonfire", {})[0];
  assert.equal(b.result, "required");
  assert.match(b.basis, /第72条第1項第1号/);
  const w = judgeFilings(J, "water_outage", {})[0];
  assert.equal(w.result, "required");
  assert.equal(w.deadline, "あらかじめ");
  assert.match(w.basis, /第72条第1項第4号/);
});

test("北九州市: 工事計画そのものの届出はなく、消防用設備等の工事計画書は10日前（条例第71条）", () => {
  const [r] = judgeFilings(J, "renovation", { occupancy: "4" });
  assert.equal(r.result, "conditional");
  assert.match(r.deadline ?? "", /10日前/);
  assert.match(r.basis, /第71条/);
});
