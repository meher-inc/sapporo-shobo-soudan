// 静岡市の届出の判定（src/rules/cities/shizuoka.ts）を、静岡市火災予防条例・同施行規則の条文と突き合わせる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "shizuoka-city" as const;

test("静岡市: 使用開始届は7日前まで、様式第3号、消防署長へ（条例第62条・規則第6条）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "3ロ" });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /様式第3号/);
  assert.match(r.basis, /静岡市火災予防条例 第62条/);
  assert.equal(r.target, "消防署長");
  assert.equal(r.lane, "gyosei");
});

test("静岡市: 工事計画の届出は条例にない", () => {
  const [r] = judgeFilings(J, "renovation", { occupancy: "4" });
  assert.equal(r.result, "conditional");
  assert.match(r.reason, /工事計画そのものの届出はない/);
});

test("静岡市: 厨房設備は350kW以上で届出、あらかじめ・様式第4号（条例第63条第4号）", () => {
  const [big] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 350 });
  assert.equal(big.result, "required");
  assert.match(big.deadline ?? "", /あらかじめ/);
  assert.match(big.form ?? "", /様式第4号/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 349 })[0].result, "not_required");
  assert.deepEqual(judgeFilings(J, "fire_equipment", { facility: "kitchen" })[0].missing, ["kitchen_kw"]);
});

test("静岡市: サウナは様式第4号、蓄電池は20kWh超で様式第5号", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: false })[0].result, "required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: true, personal_use: true })[0].result, "not_required");
  const [bat] = judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 25 });
  assert.equal(bat.result, "required");
  assert.match(bat.form ?? "", /様式第5号/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 15 })[0].result, "not_required");
});

test("静岡市: 少量危険物は5分の1以上（住居は2分の1以上）、様式第14号（条例第66条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.4 });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /様式第14号/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.6 })[0].result, "required");
});

test("静岡市: 露店は対象火気器具等を使う場合に様式第12号の2（条例第64条第1項第6号）", () => {
  const [r] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(r.result, "required");
  assert.match(r.form ?? "", /様式第12号の2/);
  assert.equal(judgeFilings(J, "stall", { stall_fire: false })[0].result, "not_required");
});

test("静岡市: 消防訓練は国の規則で判定し、自衛消防訓練等通知書の案内を添える", () => {
  const [r] = judgeFilings(J, "drill", { occupancy: "6イ" });
  assert.equal(r.result, "required");
  assert.match(r.basis, /消防法施行規則/);
  assert.ok(r.caveats.some((c) => /自衛消防訓練等通知書/.test(c)));
});

test("静岡市: 溶接は定めなし、たき火（たき火を含む）・断水は第64条で届出", () => {
  assert.equal(judgeFilings(J, "hot_work", {})[0].result, "not_required");
  const [b] = judgeFilings(J, "bonfire", {});
  assert.equal(b.result, "required");
  assert.match(b.form ?? "", /様式第8号/);
  assert.match(b.reason, /たき火を含む/);
  const [w] = judgeFilings(J, "water_outage", {});
  assert.equal(w.result, "required");
  assert.match(w.form ?? "", /様式第11号/);
});

test("静岡市: 催物は様式第10号", () => {
  const [r] = judgeFilings(J, "event", {});
  assert.match(r.form ?? "", /様式第10号/);
  assert.match(r.basis, /第64条第1項第3号/);
});
