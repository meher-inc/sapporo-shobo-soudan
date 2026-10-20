// 川崎市の届出の判定（src/rules/cities/kawasaki.ts）を、川崎市火災予防条例・同規則の条文と突き合わせる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "kawasaki-city" as const;

test("川崎市: 使用開始届は7日前まで、第7号様式、署長経由で消防長へ（条例第58条・規則第15条・第14条）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "15", total_area: 100 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /第7号様式/);
  assert.match(r.basis, /川崎市火災予防条例 第58条/);
  assert.match(r.target, /消防署長を経由して消防長/);
  assert.equal(r.lane, "gyosei");
});

test("川崎市: 改装工事等届は特定用途だけ、工事開始の5日前（条例第59条）", () => {
  const [sp] = judgeFilings(J, "renovation", { occupancy: "3ロ" });
  assert.equal(sp.result, "conditional");
  assert.match(sp.deadline ?? "", /5日前/);
  assert.match(sp.form ?? "", /第8号様式/);
  assert.equal(judgeFilings(J, "renovation", { occupancy: "15" })[0].result, "not_required");
  assert.deepEqual(judgeFilings(J, "renovation", {})[0].missing, ["occupancy"]);
});

test("川崎市: 厨房設備は350kW以上で届出、あらかじめ・第10号様式（条例第62条第3号の2）", () => {
  const [big] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 400 });
  assert.equal(big.result, "required");
  assert.match(big.deadline ?? "", /あらかじめ/);
  assert.match(big.form ?? "", /第10号様式/);
  assert.match(big.basis, /第62条第3号の2/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 100 })[0].result, "not_required");
  assert.deepEqual(judgeFilings(J, "fire_equipment", { facility: "kitchen" })[0].missing, ["kitchen_kw"]);
});

test("川崎市: サウナ・蓄電池の設置届", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: false })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: true, personal_use: true })[0].result, "not_required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna" })[0].result, "conditional");
  const [bat] = judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 30 });
  assert.equal(bat.result, "required");
  assert.match(bat.form ?? "", /第11号様式/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 20 })[0].result, "not_required");
});

test("川崎市: 少量危険物は5分の1以上（住居は2分の1以上）、第20号様式（条例第64条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.3 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /あらかじめ/);
  assert.match(r.form ?? "", /第20号様式/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.1 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "small_hazmat", { hazmat_ratio: 2 })[0].result, "not_required");
});

test("川崎市: 露店は対象火気器具等を使う場合に第19号様式で届出（条例第63条第6号）", () => {
  const [r] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /第19号様式/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
  assert.equal(judgeFilings(J, "stall", {})[0].result, "conditional");
});

test("川崎市: 消防訓練は条例に定めがなく、国の規則で判定する", () => {
  const [r] = judgeFilings(J, "drill", { occupancy: "3ロ" });
  assert.equal(r.result, "required");
  assert.match(r.basis, /消防法施行規則 第三条/);
  assert.ok(r.caveats.some((c) => /消防訓練実施計画報告書/.test(c)));
  assert.equal(judgeFilings(J, "drill", { occupancy: "15" })[0].result, "not_required");
});

test("川崎市: 溶接作業の届出の定めはない。たき火・断水は第63条で届出", () => {
  assert.equal(judgeFilings(J, "hot_work", {})[0].result, "not_required");
  const [b] = judgeFilings(J, "bonfire", {});
  assert.equal(b.result, "required");
  assert.match(b.form ?? "", /第14号様式/);
  assert.ok(b.caveats.some((c) => /電話又は口頭/.test(c)));
  const [w] = judgeFilings(J, "water_outage", {});
  assert.equal(w.result, "required");
  assert.match(w.basis, /第63条第4号/);
  assert.match(w.form ?? "", /第17号様式/);
});

test("川崎市: 催物は劇場等以外での演劇・映画など（条例第63条第3号）", () => {
  const [r] = judgeFilings(J, "event", {});
  assert.equal(r.result, "conditional");
  assert.match(r.form ?? "", /第16号様式/);
});
