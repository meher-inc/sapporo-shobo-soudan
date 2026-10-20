// 広島市の届出の判定（src/rules/cities/hiroshima.ts）を、広島市火災予防条例・同規則の条文と突き合わせる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "hiroshima-city" as const;

test("広島市: 使用開始届は7日前まで、所轄消防署長へ、検査の案内つき（条例第55条・規則第11条）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "3ロ", fire_use: true });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.basis, /広島市火災予防条例 第55条/);
  assert.match(r.target, /所轄消防署長/);
  assert.match(r.inspection ?? "", /検査を受けてから使用を開始する/);
  assert.equal(r.lane, "gyosei");
});

test("広島市: 厨房設備は350kW以上、工事の7日前まで、使用前の検査（条例第56条・規則第12条）", () => {
  const [r] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 400 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.inspection ?? "", /検査/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 100 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 25 })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: true, personal_use: true })[0].result, "not_required");
});

test("広島市: 少量危険物は場所を設ける日の7日前、個人の住居は2分の1が下限（条例第58条・規則第15条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { residence: false });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
});

test("広島市: 露店・催物・断水は3日前、たき火は1日前（規則第13条）", () => {
  const [s] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(s.result, "required");
  assert.match(s.deadline ?? "", /3日前/);
  assert.match(s.basis, /第57条第6号/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
  assert.match(judgeFilings(J, "event", {})[0].deadline ?? "", /3日前/);
  const [w] = judgeFilings(J, "water_outage", {});
  assert.equal(w.result, "required");
  assert.match(w.deadline ?? "", /3日前/);
  assert.match(judgeFilings(J, "bonfire", {})[0].deadline ?? "", /1日前/);
});

test("広島市: 消防訓練は国の規則の通報、溶接は届出の定めなし、工事は設置等計画の届出（条例第60条）", () => {
  const [d] = judgeFilings(J, "drill", { occupancy: "15" });
  assert.equal(d.result, "not_required");
  assert.match(d.basis, /消防法施行規則/);
  assert.equal(judgeFilings(J, "hot_work", {})[0].result, "not_required");
  assert.match(judgeFilings(J, "renovation", {})[0].basis, /第60条/);
});
