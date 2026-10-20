// 新潟市の届出の判定（src/rules/cities/niigata.ts）を、新潟市火災予防条例・施行規則・事務取扱規程の条文と突き合わせる（2026-10-20 確認）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "niigata-city" as const;

test("新潟市: 使用開始届は規模にかかわらず7日前まで、届出先は消防長（条例第48条）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "15", total_area: 100, floors_above: 1, capacity: 10 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /別記様式第3号/);
  assert.match(r.target, /消防長/);
  assert.match(r.target, /所轄消防署長に提出/);
  assert.match(r.basis, /新潟市火災予防条例 第48条/);
  assert.equal(r.lane, "gyosei");
});

test("新潟市: 厨房設備は同一厨房室の入力合計350kW以上で届出（条例第49条第3号の2）", () => {
  const [hi] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 350 });
  assert.equal(hi.result, "required");
  assert.match(hi.basis, /第49条第3号の2/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 120 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen" })[0].result, "conditional");
});

test("新潟市: サウナ・蓄電池設備", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: false })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", personal_use: true })[0].result, "not_required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 21 })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 20 })[0].result, "not_required");
});

test("新潟市: 少量危険物（条例第51条、別記様式第17号）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.2 });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /別記様式第17号/);
  assert.match(r.caveats.join(""), /廃止/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.1 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
});

test("新潟市: 露店（条例第50条第7号）", () => {
  const [r] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /あらかじめ/);
  assert.match(r.basis, /第50条第7号/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
});

test("新潟市: 消防訓練は国の規則、溶接は届出の定めがない", () => {
  assert.match(judgeFilings(J, "drill", { occupancy: "6イ" })[0].basis, /消防法施行規則/);
  const [h] = judgeFilings(J, "hot_work", {});
  assert.equal(h.result, "not_required");
  assert.match(h.caveats.join(""), /第28条/);
});

test("新潟市: たき火と断水はあらかじめ届出、軽易なものは口頭でよい", () => {
  const [b] = judgeFilings(J, "bonfire", {});
  assert.equal(b.result, "required");
  assert.match(b.basis, /第50条第1号/);
  assert.match(b.caveats.join(""), /口頭/);
  const [w] = judgeFilings(J, "water_outage", {});
  assert.equal(w.result, "required");
  assert.match(w.basis, /第50条第5号/);
});

test("新潟市: 工事・催物は条件次第", () => {
  assert.equal(judgeFilings(J, "renovation", {})[0].result, "conditional");
  assert.equal(judgeFilings(J, "temp_use", {})[0].result, "conditional");
});
