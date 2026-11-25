// Run: node --experimental-strip-types --test tests/unit/
// 2026-11-17 の初見10問の修正後に残った点（記録: 00_master/10_仕事/02_案件/Kindle本/資料/聞き返し測定_2026-11-17/結果.md）
// A 選択肢で聞けない項目は本文で聞かせる / B 防火対象物の点検報告の読み取り / C 防火対象物点検の人数の前提 /
// D 条件次第の項目の書き方 / E「任せる」の言い回し / F <button> や区切りだけの行を消す
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingForQuestion, missingLabel, runRules, rulesNote } from "../../src/rules/extract.ts";
import { actionsNote, buildActions } from "../../src/worker/actions.ts";
import { stripEchoes } from "../../src/client/echo.ts";

const fireInspection = (text: string) => runRules("general", [text])?.filings.find((x) => x.procedure === "boka-tenken");

test("A: 判定に足りないのが選択肢で聞けない項目だけなら、選択肢を出さずに本文で聞かせる", () => {
  const texts = ["札幌市で焼肉店を開きます。ガスの設備について消防への届出は必要ですか。"];
  const a = buildActions({ userTexts: texts, rules: runRules("sapporo-city", texts) });
  assert.equal(a.question, undefined);
  assert.equal(a.ask, missingLabel("kitchen_kw"));
  assert.match(actionsNote(a), /同じ厨房室の厨房設備の入力の合計（kW）」が足りません/);
  // 「わからない」と答えたあとは聞き直さない
  const after = [...texts, "入力の合計はわかりません。"];
  assert.equal(buildActions({ userTexts: after, rules: runRules("sapporo-city", after) }).ask, undefined);
});

test("B: 「防火対象物の点検報告」は防火対象物点検として読み、設備の点検報告を混ぜない", () => {
  const text = "雑居ビルでバーを開業します。防火対象物の点検報告は必要ですか。";
  const r = runRules("general", [text])!;
  assert.ok(r.filings.some((x) => x.procedure === "boka-tenken"));
  assert.ok(!r.filings.some((x) => x.procedure === "setsubi-tenken"));
  // 選択肢は延べ面積ではなく、点検の判定に足りない収容人員から
  assert.equal(missingForQuestion(r).find((k) => ["occupancy", "total_area", "capacity", "floors_above", "fire_use"].includes(k)), "capacity");
});

test("C: 特定一階段でも、防火管理者を定める規模（収容人員30人以上）でなければ防火対象物点検の対象外", () => {
  assert.equal(fireInspection("雑居ビルの3階でバーを開業します。直通階段は1つで、ビル全体の収容人員は20人です。防火対象物の点検報告は必要ですか。")?.result, "not_required");
  assert.equal(fireInspection("雑居ビルの3階でバーを開業します。直通階段は1つで、収容人員は40人です。防火対象物の点検報告は必要ですか。")?.result, "required");
  // ビルの一部の相談で「収容人員は20人」とだけ書かれたときは、建物全体の人数とは限らないので「不要」と言い切らない（2026-11-19）
  assert.equal(fireInspection("雑居ビルの3階でバーを開業します。直通階段は1つで、収容人員は20人です。防火対象物の点検報告は必要ですか。")?.result, "conditional");
  const unknown = fireInspection("雑居ビルの3階でバーを開業します。直通階段は1つです。防火対象物の点検報告は必要ですか。");
  assert.equal(unknown?.result, "conditional");
  assert.ok(unknown?.missing.includes("capacity"));
  assert.match(unknown!.reason, /30人以上/);
  // 300人以上は階段に関係なく対象
  assert.equal(fireInspection("飲食店で収容人員は350人です。防火対象物の点検報告は必要ですか。")?.result, "required");
});

test("D・E: 条件次第の項目は決め手を添えて書かせ、「任せる」という言い方をさせない", () => {
  const r = runRules("nagoya-city", ["名古屋市で雑貨店の内装を改装します。消防の手続きは必要ですか。"])!;
  // 条件次第の項目は、足りない情報（決め手）を添えて載せる。聞かれていない項目は書かせない（2026-11-25 の本番テスト）
  assert.match(rulesNote(r), /足りない情報: /);
  assert.match(rulesNote(r), /聞かれていない設備・届出は書かないでください/);
  assert.doesNotMatch(rulesNote(r), /まとめて一文で触れ/);
  assert.match(actionsNote({ buttons: [] }), /「任せる」「お任せ」という言い方はしない/);
});

test("F: <button> タグで書かれたボタン名・選択肢の行と、区切りの記号だけの行を消す", () => {
  const a = {
    buttons: [{ kind: "link" as const, label: "届出書類を自分で作る", href: "https://docs.todokede.jp/", sub: "トドケデ 書類作成" }],
    question: { text: "建物全体の広さ（延べ面積）は？", options: [{ label: "150㎡未満", text: "x" }, { label: "わからない", text: "y" }] },
  };
  const text = "使用開始届が必要です。\n\n<button>届出書類を自分で作る</button>\n\n<button>150㎡未満</button> <button>わからない</button>\n\n***\n\n---\n\n**";
  assert.equal(stripEchoes(text, a), "使用開始届が必要です。");
  // 表の区切り行は消さない
  assert.equal(stripEchoes("| 項目 | 結論 |\n|---|---|\n| 防火管理者 | 必要 |", a), "| 項目 | 結論 |\n|---|---|\n| 防火管理者 | 必要 |");
});
