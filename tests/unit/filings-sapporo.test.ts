// 札幌市の届出の判定（src/rules/cities/sapporo.ts）を、札幌市火災予防条例・規則の条文と突き合わせる（2026-10-20 確認）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "sapporo-city" as const;

test("札幌市: 使用開始届は規模にかかわらず必要で、期限は4日前まで（条例第64条第3項）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "15", total_area: 100, floors_above: 1, capacity: 10 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /4日前/);
  assert.match(r.form ?? "", /様式9/);
  assert.match(r.basis, /札幌市火災予防条例 第64条/);
  assert.match(r.inspection ?? "", /検査/);
  assert.equal(r.lane, "gyosei");
});

test("札幌市: 厨房設備は同一厨房室の入力合計350kW以上で届出（条例第66条第1項第3号の2）", () => {
  const [hi] = judgeFilings(J, "fire_equipment", { occupancy: "3ロ", facility: "kitchen", kitchen_kw: 400 });
  assert.equal(hi.result, "required");
  assert.match(hi.form ?? "", /様式11/);
  assert.match(hi.basis, /第66条第1項第3号の2/);
  const [lo] = judgeFilings(J, "fire_equipment", { occupancy: "3ロ", facility: "kitchen", kitchen_kw: 100 });
  assert.equal(lo.result, "not_required");
  const [unk] = judgeFilings(J, "fire_equipment", { facility: "kitchen" });
  assert.equal(unk.result, "conditional");
  assert.deepEqual(unk.missing, ["kitchen_kw"]);
});

test("札幌市: サウナ・蓄電池設備", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: false })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: true })[0].result, "not_required");
  const [b] = judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 30 });
  assert.equal(b.result, "required");
  assert.match(b.form ?? "", /様式12/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 15 })[0].result, "not_required");
});

test("札幌市: 少量危険物は5分の1以上（個人の住居は2分の1以上）で届出（条例第71条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.3 });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /様式24/);
  assert.match(r.basis, /第71条/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.6 })[0].result, "required");
  assert.equal(judgeFilings(J, "small_hazmat", { hazmat_ratio: 1.5 })[0].result, "not_required");
});

test("札幌市: 露店は対象火気器具等を使うものだけ（条例第67条第7号）", () => {
  const [r] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /様式19の2/);
  assert.match(r.basis, /第67条第7号/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
});

test("札幌市: 消防訓練は条例に定めがなく国の規則、溶接は届出の定めがない", () => {
  const [d] = judgeFilings(J, "drill", { occupancy: "3ロ" });
  assert.equal(d.result, "required");
  assert.match(d.basis, /消防法施行規則/);
  const [h] = judgeFilings(J, "hot_work", {});
  assert.equal(h.result, "not_required");
  assert.match(h.caveats.join(""), /第33条/);
});

test("札幌市: たき火（揚煙等）と断水はあらかじめ届出", () => {
  const [b] = judgeFilings(J, "bonfire", {});
  assert.equal(b.result, "required");
  assert.match(b.form ?? "", /様式15/);
  assert.match(b.caveats.join(""), /口頭/);
  const [w] = judgeFilings(J, "water_outage", {});
  assert.equal(w.result, "required");
  assert.match(w.deadline ?? "", /あらかじめ/);
  assert.match(w.basis, /第67条第5号/);
});

test("札幌市: 工事・催物は条件次第", () => {
  assert.equal(judgeFilings(J, "renovation", { occupancy: "4" })[0].result, "conditional");
  const [e] = judgeFilings(J, "event", {});
  assert.equal(e.result, "conditional");
  assert.match(e.form ?? "", /様式17/);
});
