// 岡山市の届出の判定（src/rules/cities/okayama.ts）を、岡山市火災予防条例・同規則の条文と突き合わせる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeFilings } from "../../src/rules/filings.ts";

const J = "okayama-city" as const;

test("岡山市: 火を使う飲食店は規模を問わず使用開始届、7日前・様式第3号（条例第53条・規則第9条第1項第1号イ）", () => {
  const [r] = judgeFilings(J, "use_start", { occupancy: "3ロ", fire_use: true, total_area: 50 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /様式第3号/);
  assert.match(r.basis, /岡山市火災予防条例 第53条、岡山市火災予防規則 第9条/);
  assert.equal(r.lane, "gyosei");
});

test("岡山市: 事務所は延べ300㎡以上か収容人員50人以上で使用開始届（規則第9条第1項第4号）", () => {
  assert.equal(judgeFilings(J, "use_start", { occupancy: "15", total_area: 400, capacity: 10 })[0].result, "required");
  assert.equal(judgeFilings(J, "use_start", { occupancy: "15", total_area: 100, capacity: 10, floors_above: 1, floors_below: 0 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "use_start", { occupancy: "15", total_area: 100 })[0].result, "conditional");
  assert.equal(judgeFilings(J, "use_start", { occupancy: "15", total_area: 100, capacity: 10, floors_above: 4 })[0].result, "conditional");
});

test("岡山市: 物販店は延べ150㎡以上か収容人員30人以上、旅館は規模を問わない", () => {
  assert.equal(judgeFilings(J, "use_start", { occupancy: "4", total_area: 200, capacity: 10 })[0].result, "required");
  assert.equal(judgeFilings(J, "use_start", { occupancy: "4", total_area: 100, capacity: 10, floors_above: 1, floors_below: 0 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "use_start", { occupancy: "5イ" })[0].result, "required");
});

test("岡山市: 厨房設備は350kW以上、着工の5日前・様式第5号（条例第54条第1項第3号の2・規則第10条）", () => {
  const [r] = judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 400 });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /5日前/);
  assert.match(r.form ?? "", /様式第5号/);
  assert.equal(judgeFilings(J, "fire_equipment", { facility: "kitchen", kitchen_kw: 100 })[0].result, "not_required");
  const [b] = judgeFilings(J, "fire_equipment", { facility: "battery", battery_kwh: 25 });
  assert.match(b.form ?? "", /様式第6号/);
});

test("岡山市: 少量危険物は7日前・様式第16号、一般の住宅は2分の1が下限（条例第56条・規則第12条）", () => {
  const [r] = judgeFilings(J, "small_hazmat", { residence: false });
  assert.equal(r.result, "required");
  assert.match(r.deadline ?? "", /7日前/);
  assert.match(r.form ?? "", /様式第16号/);
  assert.equal(judgeFilings(J, "small_hazmat", { residence: true, hazmat_ratio: 0.3 })[0].result, "not_required");
  assert.equal(judgeFilings(J, "small_hazmat", { residence: false, hazmat_ratio: 0.3 })[0].result, "required");
});

test("岡山市: 露店・催物は4日前、断水は2日前、たき火は前日（規則第11条）", () => {
  const [s] = judgeFilings(J, "stall", { stall_fire: true });
  assert.equal(s.result, "required");
  assert.match(s.deadline ?? "", /4日前/);
  assert.match(s.form ?? "", /様式第14号の2/);
  assert.match(judgeFilings(J, "event", {})[0].deadline ?? "", /4日前/);
  const [w] = judgeFilings(J, "water_outage", {});
  assert.match(w.deadline ?? "", /2日前/);
  assert.match(w.form ?? "", /様式第13号/);
  assert.match(judgeFilings(J, "bonfire", {})[0].deadline ?? "", /前日/);
});

test("岡山市: 消防訓練は国の規則の通報、溶接は届出の定めなし", () => {
  const [d] = judgeFilings(J, "drill", { occupancy: "4" });
  assert.equal(d.result, "required");
  assert.match(d.basis, /消防法施行規則/);
  assert.equal(judgeFilings(J, "hot_work", {})[0].result, "not_required");
});
