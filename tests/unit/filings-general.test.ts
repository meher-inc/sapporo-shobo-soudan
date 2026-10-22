// 一般版（条例を確認していない地域）の判定。評価セットの gen-* と突き合わせる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generalFilings, judgeFilings, VERIFIED, deadlineKind, type Scene } from "../../src/rules/filings.ts";
import { CITY_FILINGS } from "../../src/rules/cities/index.ts";
import { judge } from "../../src/rules/install.ts";
import { rulesNote, runRules } from "../../src/rules/extract.ts";

type Case = { id: string; jurisdiction: string; facts: Record<string, unknown>; expect: string; note: string };
const cases = readFileSync(new URL("../../eval/answer-cases.jsonl", import.meta.url), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Case)
  .filter((c) => c.jurisdiction === "general");

const RESULT = { 必要: "required", 不要: "not_required", 条件次第: "conditional" } as const;

test("評価セットに一般版の問いがある", () => assert.ok(cases.length >= 7));

for (const c of cases) {
  const scene = c.note.match(/scene=(\w+)/)![1] as Scene;
  test(`${c.id} ${c.expect}`, () => {
    const [r] = judgeFilings("general", scene, c.facts);
    const want = RESULT[c.expect.match(/^(必要|不要|条件次第)/)![1] as keyof typeof RESULT];
    assert.equal(r.result, want, r.reason);
    if (scene !== "drill") {
      // 条例の届出は期限を断定しない
      if (r.deadline) assert.match(r.deadline, /^所在地の条例で確認/);
      assert.equal(r.form, undefined);
      assert.match(r.basis, /所在地の市町村の火災予防条例/);
      assert.ok(r.caveats.some((x) => /所在地の消防本部で確認/.test(x)));
    }
  });
}

test("gen-001: 使用開始届の期限は21管轄の分かれ方を示す", () => {
  const [r] = generalFilings("use_start", { occupancy: "3ロ", capacity: 40, fire_use: true });
  assert.match(r.deadline!, /7日前まで20、4日前まで1/);
  assert.match(r.reason, /21管轄/);
});

test("集計の対象は確認済みの全管轄（都市を足すと自動で入る）", () => {
  assert.equal(VERIFIED.length, Object.keys(CITY_FILINGS).length + 5);
  assert.equal(new Set(VERIFIED).size, VERIFIED.length);
});

test("消防訓練の注意書きにある管轄（3日前まで）は判定と合っている", () => {
  const threeDays = VERIFIED.filter((j) => /3日前/.test(judgeFilings(j, "drill", { occupancy: "3ロ" })[0].deadline ?? ""));
  assert.deepEqual(threeDays.sort(), ["chiba-city", "nagoya-city"]);
  assert.match(generalFilings("drill", { occupancy: "3ロ" })[0].caveats.join(), /名古屋市・千葉市が3日前まで/);
});

test("期限の書き方をそろえる", () => {
  assert.equal(deadlineKind("使用開始の日の7日前まで"), "7日前まで");
  assert.equal(deadlineKind("あらかじめ（規則第35条により5日前まで）"), "5日前まで");
  assert.equal(deadlineKind("実施する日の前日まで"), "前日まで");
  assert.equal(deadlineKind("実施する日の1日前まで"), "前日まで");
  assert.equal(deadlineKind("あらかじめ"), "あらかじめ（日数の定めなし）");
});

test("設備の判定は国の政令で、条例の上乗せがありうることを添える", () => {
  const v = judge("extinguisher", { occupancy: "3ロ", total_area: 80, fire_use: true }, "general");
  assert.equal(v.result, "required");
  assert.ok(v.caveats.some((x) => /市町村の火災予防条例/.test(x)));
});

test("判定メモに期限の地域差が入る", () => {
  const note = rulesNote(runRules("general", ["飲食店を開業します。延べ80㎡で火を使います。従業員と客で40人です"])!);
  assert.match(note, /防火対象物使用開始届: 必要/);
  assert.match(note, /所在地の条例で確認/);
  assert.doesNotMatch(note, /期限: 使用開始の日の7日前まで/);
});
