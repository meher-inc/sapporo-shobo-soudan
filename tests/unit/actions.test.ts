// Run: node --experimental-strip-types --test tests/unit/
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildActions, actionsNote, findStation, DOCS_URL, PLAN_URL, WARD_STATIONS } from "../../src/worker/actions.ts";
import { extractFacts, runRules } from "../../src/rules/extract.ts";
const STATIONS = WARD_STATIONS;

const J = "nagoya-city" as const;
const act = (texts: string[], lane?: "gyosei" | "setsubi" | "bengoshi") => buildActions({ userTexts: texts, rules: runRules(J, texts), lane });

test("用途が分からないときは用途を聞く（「その他」は入力欄を開く）", () => {
  const a = act(["消防の手続を知りたい"]);
  assert.equal(a.question?.text, "建物は何に使いますか？");
  assert.ok(a.question.options.some((o) => o.label === "その他（入力する）" && o.text === ""));
});

test("選択肢の文は判定がそのまま読み取れる（区分の下限、最下段は境目の手前）", () => {
  const check = (key: string, text: string, field: keyof ReturnType<typeof extractFacts>, value: unknown) =>
    assert.equal(extractFacts(text)[field], value, `${key}: ${text}`);
  const q = (texts: string[]) => act(texts).question!;
  // 用途
  for (const o of q(["消防の手続を知りたい"]).options.filter((o) => o.text)) assert.ok(extractFacts(o.text).occupancy, o.text);
  // 面積・人数・階数・火気
  const area = q(["飲食店です。"]);
  assert.equal(area.text, "建物全体の広さ（延べ面積）は？");
  const areas = area.options.filter((o) => o.label !== "わからない").map((o) => extractFacts(o.text).total_area);
  assert.deepEqual(areas, [149, 150, 300, 500, 1000]);
  const cap = q(["飲食店です。", "延べ面積は150㎡以上300㎡未満です。"]);
  assert.equal(cap.text, "お客さんと従業員、あわせて最大で何人いますか？");
  assert.deepEqual(cap.options.filter((o) => o.label !== "わからない").map((o) => extractFacts(o.text).capacity), [9, 10, 30, 50, 300]);
  check("floors", "平屋です。", "floors_above", 1);
  check("floors", "3階建て以上5階建て以下です。", "floors_above", 3);
  check("fire", "コンロなど火を使う器具を使います。", "fire_use", true);
  check("fire", "火を使う器具はありません。IHのみです。", "fire_use", false);
});

const S = STATIONS[0];
const WHERE = S ? `${S.ward}で` : "";

test("届出がある相談には書類作成のボタン、防火管理者が要る相談には消防計画のボタンを出す", () => {
  const a = act([`${WHERE}飲食店を開店します。延べ面積は400㎡、収容人員は60人、2階建てでコンロを使います。`]);
  const labels = a.buttons.map((b) => b.label);
  assert.ok(labels.includes("届出書類を作る"));
  assert.ok(labels.includes("消防計画を作る"));
  assert.equal(a.buttons.find((b) => b.label === "届出書類を作る")?.href, DOCS_URL);
  assert.equal(a.buttons.find((b) => b.label === "消防計画を作る")?.href, PLAN_URL);
  if (S) assert.ok(labels.includes(`${S.name}に電話する`));
});

test("区は長い名前から照合し、別の区の名前を含む区を取り違えない", () => {
  // ある区の名前が別の区の名前を含むとき（例: 北区 と 東北区）は、長い方に当たる
  for (const long of STATIONS)
    for (const short of STATIONS)
      if (long !== short && long.ward.includes(short.ward)) assert.equal(findStation([`${long.ward}の倉庫です`])?.ward, long.ward);
  for (const s of STATIONS) assert.equal(findStation([`${s.ward}の事務所です`])?.ward, s.ward);
  assert.equal(findStation(["市内の事務所です"]), null);
});

test("用途・面積などがそろい、区が分からないときは区を聞く", () => {
  const a = act(["飲食店を開店します。延べ面積は120㎡、収容人員は25人、2階建てでコンロを使います。"]);
  if (!STATIONS.length) assert.notEqual(a.question?.text, "建物はどの区にありますか？");
  else if (a.question?.text === "建物はどの区にありますか？") {
    assert.equal(a.question.options.length, STATIONS.length);
    assert.equal(a.question.options[0].text, `建物は${STATIONS[0].ward}にあります。`);
  } else assert.ok(a.question, "判定に足りない項目があれば、その選択肢を出す");
});

test("違反処理・紛争の相談にはボタンも選択肢も出さない。点検・工事の手配では質問しない", () => {
  assert.deepEqual(act(["是正命令が来ました"], "bengoshi"), { buttons: [] });
  assert.equal(act(["消火器の点検をお願いしたい"], "setsubi").question, undefined);
});

test("行政書士への依頼では書類作成のボタンを出す", () => {
  assert.ok(act(["防火管理者選任届の記入をお願いしたい"], "gyosei").buttons.some((b) => b.label === "届出書類を作る"));
});

test("緊急の相談には119番のボタンだけを出す", () => {
  assert.deepEqual(buildActions({ userTexts: ["店が燃えています"], rules: null, emergency: true }), {
    buttons: [{ kind: "tel", label: "119番に電話する", href: "tel:119" }],
  });
});

test("モデルへの指示は、URL を書かせず、質問を画面の選択肢の1つに絞らせる", () => {
  const note = actionsNote(act(["消防の手続を知りたい"]));
  assert.match(note, /URL は本文に書かない/);
  assert.match(note, /「建物は何に使いますか？」/);
  assert.match(note, /ほかの質問はしないでください/);
});

test("「わからない」と答えた項目は、もう一度聞かずに次の項目へ進む", () => {
  const first = act(["飲食店です。"]).question!;
  assert.equal(first.text, "建物全体の広さ（延べ面積）は？");
  const unknownText = first.options.find((o) => o.label === "わからない")!.text;
  assert.equal(extractFacts(unknownText).total_area, undefined);
  assert.notEqual(act(["飲食店です。", unknownText]).question?.text, first.text);
});

test("本文に書き出されたボタン名・選択肢の行は除き、ほかの文は残す", async () => {
  const { stripEchoes } = await import("../../src/client/echo.ts");
  const a = { buttons: [{ kind: "link" as const, label: "届出書類を作る", href: DOCS_URL }], question: { text: "何人？", options: [{ label: "10人未満", text: "x" }, { label: "わからない", text: "y" }] } };
  const text = "使用開始届が必要です。\n\n下のボタンから作れます。\n\n[届出書類を作る]\n\n- 10人未満\n- わからない";
  assert.equal(stripEchoes(text, a), "使用開始届が必要です。\n\n下のボタンから作れます。");
  assert.equal(stripEchoes("10人未満なら不要です。", a), "10人未満なら不要です。");
});
