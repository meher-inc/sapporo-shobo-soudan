// F-28（plan 20261111-city-answer-tone）: 判定メモの指示文が、回答を「目安・根拠条文・所轄への確認」の形にさせること。
// 判定の計算は変えていないので、判定結果の行（結論・期限・提出先）はこれまでどおり入ることも確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { rulesNote, runRules } from "../../src/rules/extract.ts";

const CASES: [Parameters<typeof runRules>[0], string][] = [
  ["tokyo-tfd", "飲食店を開業します。延べ80㎡で火を使います"],
  ["kyoto-city", "地上5階建、延べ800㎡の事務所。屋内消火栓設備は必要ですか？"],
  ["nagoya-city", "延べ300㎡の事務所に入居します"],
  ["general", "飲食店を開業します。延べ80㎡で火を使います。従業員と客で40人です"],
];

test("判定メモから、断定を優先させる指示と「弱めず」が消えている", () => {
  for (const [j, q] of CASES) {
    const note = rulesNote(runRules(j, [q])!);
    assert.doesNotMatch(note, /「個別の要否を断定しない」という指示より/);
    assert.doesNotMatch(note, /弱めず/);
    assert.doesNotMatch(note, /優先します/);
  }
});

test("判定メモは、目安であること・根拠条文・所轄の消防署での確認を指示する", () => {
  for (const [j, q] of CASES) {
    const note = rulesNote(runRules(j, [q])!);
    assert.match(note, /目安/);
    assert.match(note, /根拠の条文を添え/);
    assert.match(note, /所轄の消防署/);
    assert.match(note, /逆の結論や別の区分にしない/);
    assert.match(note, /言い切りの語は使わない/);
  }
});

test("判定結果の行（結論・期限・提出先）は変わらない", () => {
  const note = rulesNote(runRules("tokyo-tfd", ["飲食店を開業します。延べ80㎡で火を使います"])!);
  assert.match(note, /- 防火対象物使用開始届: 必要（期限: [^、]*7日前[^、]*、提出先: /);
  assert.match(note, /- 消火器具: 必要/);
});
