import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HEARING_TYPES,
  caseSheet,
  daysUntil,
  guessType,
  itemsOf,
  missingRequired,
  requestDraft,
  sanitize,
  summarize,
  type HearingAnswers,
} from "../../src/hearing/hearing.ts";
import { prefill } from "../../src/hearing/prefill.ts";

const NOW = Date.parse("2026-10-22T03:00:00Z"); // 日本時間 2026-10-22 12:00

test("相談の文面から届出の種類を推す", () => {
  assert.equal(guessType("個室ブースを3台置きたいので特例の申請をお願いしたい"), "booth");
  assert.equal(guessType("誘導灯を更新するので設置届を作ってほしい"), "equipment_work");
  assert.equal(guessType("事務所を7階に移転するので消防計画を作成してほしい"), "tenant_plan");
  assert.equal(guessType("テナントが8つ入るビル全体の消防計画を作りたい"), "building_plan");
  assert.equal(guessType("防火対象物使用開始届を作成してほしいです"), "other");
});

test("相談の中ですでに分かっていることを先に入れる", () => {
  const p = prefill(["名古屋駅前の5階建てのビルの7階、床面積320㎡を事務所として借ります。消防計画を作ってほしい"]);
  assert.equal(p.type, "tenant_plan");
  assert.equal(p.values.floors, "地上5階");
  assert.equal(p.values.use, "事務所");
  assert.match(p.values.tp_area ?? "", /^7階/);
});

test("どの種類にも、所在地と予定日を必須で聞き、項目の id は重ならない", () => {
  for (const t of HEARING_TYPES) {
    const items = itemsOf(t);
    const ids = items.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, `${t} に重複した項目がある`);
    assert.deepEqual(items.filter((i) => i.required).map((i) => i.id).sort(), ["address", "start_date"]);
    assert.ok(items.some((i) => i.kind === "doc"), `${t} に資料の項目がない`);
    for (const i of items.filter((x) => x.kind === "choice")) assert.ok(i.options && i.options.length >= 2, i.id);
  }
});

test("設置届・着工届は、工事をする消防設備士がいるかを最初に聞く", () => {
  const items = itemsOf("equipment_work").filter((i) => i.id.startsWith("ew_"));
  assert.equal(items[0].id, "ew_licensed");
  assert.match(items[0].hint ?? "", /第17条の14/);
});

test("画面から来た回答は、定義にある項目と選択肢だけ残す", () => {
  const a = sanitize({
    type: "tenant_plan",
    values: { address: "  名古屋市中村区 ", tp_unified: "している", tp_center: "地下にある", start_date: "2026/12/01", injected: "x" },
    docs: { tp_plan_doc: { holder: "kanri", when: "来週" }, tp_prev_doc: { holder: "nobody" } },
  });
  assert.ok(a);
  assert.deepEqual(a.values, { address: "名古屋市中村区", tp_unified: "している" });
  assert.deepEqual(a.docs, { tp_plan_doc: { holder: "kanri", when: "来週" } });
  assert.equal(sanitize({ type: "unknown" }), null);
  assert.equal(sanitize("x"), null);
  assert.deepEqual(missingRequired(a), ["工事日・使用開始日・オープン日"]);
});

test("期限までの日数は日本時間の日付で数える", () => {
  assert.equal(daysUntil("2026-10-22", NOW), 0);
  assert.equal(daysUntil("2026-10-29", NOW), 7);
  assert.equal(daysUntil("2026-10-21", NOW), -1);
  // 日本時間の深夜（UTC では前日）でも同じ日として数える
  assert.equal(daysUntil("2026-10-23", Date.parse("2026-10-22T15:30:00Z")), 0);
});

const sample: HearingAnswers = {
  type: "equipment_work",
  values: {
    address: "名古屋市中村区名駅4丁目 ○○ビル",
    start_date: "2026-11-05",
    started: "まだ",
    ew_licensed: "いない",
    ew_existing: "分からない",
    fd_deadline: "言われている",
  },
  docs: {
    ew_drawing_doc: { holder: "kanri", when: "来週中" },
    ew_spec_doc: { holder: "maker" },
    ew_prev_doc: { holder: "unknown" },
  },
};

test("要約は、急ぎ・消防設備士の不在・確認する事項・資料の持ち主をまとめる", () => {
  const s = summarize(sample, NOW);
  assert.ok(s.alerts.some((x) => x.includes("14日")));
  assert.ok(s.alerts.some((x) => x.includes("甲種消防設備士")));
  assert.ok(s.alerts.some((x) => x.includes("消防署から期限")));
  assert.deepEqual(s.byHolder.map((g) => g.holder), ["kanri", "maker"]);
  assert.ok(s.toConfirm.includes("今ある設備（受信機・配線など）に手を加えますか"));
  assert.ok(s.toConfirm.some((x) => x.startsWith("以前の設置届の控え")));
  // 未回答の資料も確認する事項に入る
  assert.equal(summarize({ ...sample, docs: {} }, NOW).toConfirm.filter((x) => x.includes("持ち主が分からない")).length, 3);
});

test("すでに始まっている工事は、事後の届出として知らせる", () => {
  const s = summarize({ ...sample, values: { ...sample.values, started: "もう始まっている" } }, NOW);
  assert.ok(s.alerts[0].includes("事後"));
});

test("第三者あての依頼文には、建物・届出・資料・予定日が入り、個人の連絡先は入らない", () => {
  const draft = requestDraft("kanri", [{ label: "平面図・系統図・機器の配置図" }], sample);
  assert.match(draft, /^管理会社ご担当者さま/);
  assert.ok(draft.includes("名古屋市中村区名駅4丁目 ○○ビル"));
  assert.ok(draft.includes("設置届・着工届の届出"));
  assert.ok(draft.includes("・平面図・系統図・機器の配置図"));
  assert.ok(draft.includes("2026/11/05"));
  assert.doesNotMatch(draft, /@|電話/);
});

test("案件シートは、行政書士がそのまま着手できる順に並ぶ", () => {
  const sheet = caseSheet(sample, NOW);
  const order = ["■ ヒアリング（設置届・着工届", "！ ", "［建物と時期］", "所在地・建物名: 名古屋市中村区", "■ 資料と持ち主", "［管理会社］", "・平面図・系統図・機器の配置図（来週中）", "■ こちらで確認する事項"];
  let at = -1;
  for (const o of order) {
    const i = sheet.indexOf(o, at + 1);
    assert.ok(i > at, `${o} が順番どおりにない`);
    at = i;
  }
});
