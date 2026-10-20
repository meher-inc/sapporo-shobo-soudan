// 相模原市の届出の判定（src/rules/cities/sagamihara.ts）を、相模原市消防局の申請書ページの根拠条・時期と突き合わせる（2026-10-20 確認）。
// 条例本文は未確認なので、規模の下限が要る判定は conditional になることも検査する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "sagamihara-city" as const;

test("相模原市: 使用開始届は使用開始の7日前まで（条例第45条）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "3ロ" });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.basis, /相模原市火災予防条例 第45条/);
  assert.match(r.target, /査察指導課/);
  assert.equal(r.form, undefined);
  assert.equal(r.lane, "gyosei");
});

test("相模原市: 厨房設備・蓄電池は規模の下限が未確認なので conditional（第46条、3日前）", () => {
  const [k] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 400 });
  assert.equal(k.result, "conditional");
  assert.match(k.deadline ?? "", /3日前/);
  assert.match(k.reason, /要確認/);
  const [b] = judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 30 });
  assert.equal(b.result, "conditional");
  assert.match(b.basis, /第46条第12号〜第16号/);
});

test("相模原市: 個人が自宅で使う簡易サウナは届出不要", () => {
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", personal_use: true })[0].result, "not_required");
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "sauna", residence: false, personal_use: false })[0].result, "conditional");
});

test("相模原市: 少量危険物はあらかじめ（条例第48条）。指定数量以上は許可", () => {
  const [r] = judgeFilings(J, "small_hazmat", {});
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /あらかじめ/);
  assert.match(r.basis, /第48条/);
  assert.equal(judgeFilings(J, "small_hazmat", { hazmat_ratio: 0.3 })[0].result, "conditional");
  assert.match(judgeFilings(J, "small_hazmat", { hazmat_ratio: 3 })[0].reason, /許可/);
});

test("相模原市: 露店・火煙・断水・催物は3日前（条例第47条）", () => {
  const [stall] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(stall.result, "required");
  assert.match(stall.deadline ?? "", /3日前/);
  assert.match(stall.basis, /第47条第6号/);
  const [fire] = judgeFilings(J, "bonfire", {});
  assert.equal(fire.result, "required");
  assert.match(fire.basis, /第47条第1号/);
  assert.match(fire.deadline ?? "", /3日前/);
  const [w] = judgeFilings(J, "water_outage", {});
  assert.equal(w.result, "required");
  assert.match(w.basis, /第47条第4号/);
  const [ev] = judgeFilings(J, "event", {});
  assert.match(ev.basis, /第47条第3号/);
  assert.match(ev.deadline ?? "", /3日前/);
});

test("相模原市: 消防訓練は国の規則で通報。溶接は要確認", () => {
  const [sp] = judgeFilings(J, "drill", { occupancy: "3ロ" });
  assert.equal(sp.result, "required");
  assert.match(sp.basis, /消防法施行規則/);
  assert.match(sp.form ?? "", /消防訓練通報書/);
  assert.equal(judgeFilings(J, "hot_work", {})[0].result, "conditional");
});
