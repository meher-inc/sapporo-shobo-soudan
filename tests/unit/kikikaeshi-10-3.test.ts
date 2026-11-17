// Run: node --experimental-strip-types --test tests/unit/
// 2026-11-17 の初見10問の3回目で出た表示の崩れ（記録: 00_master/10_仕事/02_案件/Kindle本/資料/聞き返し測定_2026-11-17/結果.md）
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripEchoes } from "../../src/client/echo.ts";

const a = {
  buttons: [{ kind: "link" as const, label: "届出書類を自分で作る", href: "https://docs.todokede.jp/", sub: "トドケデ 書類作成" }],
  question: {
    text: "建物は何に使いますか？",
    options: [
      { label: "飲食店", text: "x" },
      { label: "お店（物販）", text: "x" },
      { label: "事務所", text: "x" },
      { label: "その他（入力する）", text: "" },
    ],
  },
};

test("「（選択肢ボタン：…）」のように前置きを付けて選択肢を並べた行を消す", () => {
  assert.equal(stripEchoes("使用開始届が必要です。\n\n（選択肢ボタン：飲食店／お店（物販）／事務所／その他（入力する））", a), "使用開始届が必要です。");
  assert.equal(stripEchoes("使用開始届が必要です。\n選択肢：飲食店、事務所", a), "使用開始届が必要です。");
  // 前置きのあとに選択肢以外の文があれば残す
  assert.equal(stripEchoes("ボタン：下から書類を作れます。", a), "ボタン：下から書類を作れます。");
});

test("選択肢を JSON で書いたコードブロックを消す", () => {
  const text = '工事計画届が必要です。\n\n```json\n{\n"action": "show_choice",\n"choices": [\n"150㎡未満",\n"わからない"\n],\n"\n}\n```\n\n下のボタンから書類を作れます。';
  assert.equal(stripEchoes(text, a), "工事計画届が必要です。\n\n下のボタンから書類を作れます。");
  // 閉じていないブロックも消す
  assert.equal(stripEchoes('必要です。\n```json\n{"choices": ["飲食店"]', a), "必要です。");
  // 選択肢と関係のないコードブロックは残す
  assert.equal(stripEchoes("例\n```\n届出書\n```", a), "例\n```\n届出書\n```");
});

test("太字の記号で囲んだ質問・選択肢の行を消し、記号だけを残さない", () => {
  // 画面に選択肢が出るときは本文の質問を消す。太字で書かれていても「**」を残さない（大阪の問3、2026-11-17）
  assert.equal(stripEchoes("使用開始届が必要です。\n\n**建物は何に使いますか？**", a), "使用開始届が必要です。");
  assert.equal(stripEchoes("使用開始届が必要です。\n\n**（選択肢ボタン：飲食店／事務所）**", a), "使用開始届が必要です。");
  assert.equal(stripEchoes("使用開始届が必要です。\n\n**飲食店／お店（物販）／事務所**", a), "使用開始届が必要です。");
  // 太字の本文は残す
  assert.equal(stripEchoes("**使用開始届**が必要です。", a), "**使用開始届**が必要です。");
});
