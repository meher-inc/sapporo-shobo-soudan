// Run: node --experimental-strip-types --test tests/unit/
// 2026-11-17 の初見10問の3回目で残った点（記録: 00_master/10_仕事/02_案件/Kindle本/資料/聞き返し測定_2026-11-17/結果.md）
// A 締めくくりの一文が抜けたら画面側で補う / B 条件次第の項目を言い切らず、条件をすべて書かせる
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLOSING_TEXT, withClosing } from "../../src/client/echo.ts";
import { runRules, rulesNote } from "../../src/rules/extract.ts";

const link = { buttons: [{ kind: "link" as const, label: "届出書類を自分で作る", href: "https://docs.todokede.jp/" }] };

test("A: 作成ツールのボタンが出る回答で締めくくりが抜けていたら補う", () => {
  assert.equal(withClosing("消火器具は条件次第で必要です。", link), `消火器具は条件次第で必要です。\n\n${CLOSING_TEXT}`);
  // すでに所轄の消防署での確認に触れていれば足さない
  assert.equal(withClosing(`必要です。\n\n${CLOSING_TEXT}`, link), `必要です。\n\n${CLOSING_TEXT}`);
  assert.equal(withClosing("必要です。最終的な要否は、所轄の消防署でご確認ください。", link), "必要です。最終的な要否は、所轄の消防署でご確認ください。");
  // ボタンが出ない回答（緊急時・弁護士の案内）と空の回答には足さない
  assert.equal(withClosing("119番に通報してください。", { buttons: [{ kind: "tel" as const, label: "119番に電話する", href: "tel:119" }] }), "119番に通報してください。");
  assert.equal(withClosing("弁護士にご相談ください。", { buttons: [] }), "弁護士にご相談ください。");
  assert.equal(withClosing("", link), "");
});

test("B: 条件次第の項目は冒頭で言い切らず、条件をすべて書くよう判定メモで伝える", () => {
  const note = rulesNote(runRules("kyoto-city", ["店舗の改装で厨房を広げ、コンロを増やします。消防に何か届け出る必要がありますか。"])!);
  assert.match(note, /冒頭や結論の文で「必要になる目安です」と言い切らず/);
  assert.match(note, /すべての条件を書いてください/);
});
