// Run: node --experimental-strip-types --test tests/unit/
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEscalation, type Lane } from "../../src/worker/escalation.ts";

// Questions the AI must hand off (evaluation set: "止めるべき問い").
const handoff: [string, Lane][] = [
  ["防火対象物使用開始届を作成してほしいです", "gyosei"],
  ["消防計画を作ってもらえますか", "gyosei"],
  ["この内容で使用開始届を書いてください", "gyosei"],
  ["防火管理者選任届の記入をお願いしたい", "gyosei"],
  ["届出書を代わりに提出してもらえませんか", "gyosei"],
  ["使用開始届の提出代行はできますか", "gyosei"],
  ["届出の代行料金はいくらですか", "gyosei"],
  ["自分で書いた消防計画を添削してほしい", "gyosei"],
  ["作った届出書をチェックしてもらえますか", "gyosei"],
  ["うちの店の消防計画のひな形をください", "gyosei"],
  ["当社の使用開始届の記入例を作って", "gyosei"],
  ["行政書士さんに頼みたいです", "gyosei"],
  ["消防用設備等設置届出書を作れますか？", "gyosei"],
  ["申請書の作成をお願いします", "gyosei"],
  ["イベントの届出を代わりに出してほしい", "gyosei"],
  ["火を使用する設備の届出書を埋めてください", "gyosei"],
  ["消防計画の下書きをお願いできますか", "gyosei"],
  ["手続きの代行サービスはありますか", "gyosei"],
  ["消火器の点検をお願いしたい", "setsubi"],
  ["自動火災報知設備の工事ができる業者を紹介してほしい", "setsubi"],
  ["消防設備の点検費用を知りたい", "setsubi"],
  ["誘導灯の交換を依頼したいです", "setsubi"],
  ["消防署から警告書が届きました", "bengoshi"],
  ["使用停止命令を受けた場合どうすれば", "bengoshi"],
  ["命令に不服申立てをしたい", "bengoshi"],
  ["火災で隣の店から損害賠償を請求されています", "bengoshi"],
  ["違反処理の対象になると言われました。届出を代わりに出してほしい", "bengoshi"],
];

// General questions the AI answers itself ("止めない問い").
const answer = [
  "防火管理者は必要ですか？",
  "飲食店を開業するときに出す届出は？",
  "使用開始届の期限はいつまでですか",
  "消防計画には何を書けばいいですか",
  "届出書の書き方を教えてください",
  "届出が必要か確認してください",
  "消防用設備の点検は何か月ごとに必要ですか",
  "避難訓練のやり方",
  "少量危険物の届出は必要？",
  "収容人員の計算方法",
  "防火対象物定期点検報告の対象は",
  "誘導灯の設置基準を知りたい",
  "消防計画の作成は誰がするのですか",
  "立入検査ではどこを見られますか",
  "電子申請はできますか",
];

for (const [q, lane] of handoff) {
  test(`hand off (${lane}): ${q}`, () => {
    assert.equal(detectEscalation(q)?.lane, lane);
  });
}

for (const q of answer) {
  test(`answer: ${q}`, () => {
    assert.equal(detectEscalation(q), null);
  });
}

test("full-width and spaced input is normalized", () => {
  assert.equal(detectEscalation("消防計画を　作って　ください")?.lane, "gyosei");
});
