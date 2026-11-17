// Run: node --experimental-strip-types --test tests/unit/
// 2026-11-17 の初見10問（条件を書かない聞き方）で、条件を聞かずに要否を言い切った問の判定メモと、選択肢で聞く項目。
// 記録: 00_master/10_仕事/02_案件/Kindle本/資料/聞き返し測定_2026-11-17/結果.md
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectScenes, extractFacts, missingForQuestion, runRules, rulesNote } from "../../src/rules/extract.ts";
import type { Jurisdiction } from "../../src/rules/filings.ts";

const filing = (j: Jurisdiction, text: string, procedure: string) => runRules(j, [text])?.filings.find((x) => x.procedure === procedure);

test("問5: 飲食店の「ガスの設備」は厨房設備として読み、札幌市の設置届を入力の合計で条件付きにする", () => {
  for (const text of [
    "札幌市で焼肉店を開きます。ガスの設備について消防への届出は必要ですか。",
    "札幌の居酒屋です。ガス器具を入れるとき消防に届け出はいりますか。",
    "札幌市でラーメン店を始めます。ガス機器の届出は必要？",
  ]) {
    assert.equal(extractFacts(text).facility, "kitchen", text);
    const v = filing("sapporo-city", text, "kaki-setsubi");
    assert.equal(v?.result, "conditional", text);
    assert.deepEqual(v?.missing, ["kitchen_kw"], text);
  }
});

test("飲食以外の「ガスの設備」は設備の種類を不明のまま、火を使う設備の場面にする", () => {
  const text = "札幌市の事務所にガスの設備を設けます。消防への届出は必要ですか。";
  assert.ok(detectScenes(text).includes("fire_equipment"));
  assert.equal(extractFacts(text).facility, undefined);
  const v = filing("sapporo-city", text, "kaki-setsubi");
  assert.equal(v?.result, "conditional");
  assert.ok(v?.missing.includes("facility"));
});

test("ガスコンロを使って調理するだけの文は、設備の設置の場面にしない", () => {
  assert.ok(!detectScenes("ガスコンロを使って調理する飲食店です。").includes("fire_equipment"));
});

test("問10: コンロを増やす・追加する改装は、京都市の厨房設備設置届を条件付きで判定する", () => {
  for (const text of [
    "店舗の改装で厨房を広げ、コンロを増やします。消防に何か届け出る必要がありますか。",
    "京都市の飲食店で、コンロを2口追加します。届出は必要ですか。",
    "厨房にコンロを取り付けます。消防への届出は？",
  ]) {
    assert.ok(detectScenes(text).includes("fire_equipment"), text);
    const v = filing("kyoto-city", text, "kaki-setsubi");
    assert.equal(v?.result, "conditional", text);
    assert.ok(v?.missing.includes("kitchen_kw"), text);
  }
});

test("問10: 京都市の改装の判定は、火を使う設備の設置届を条件なしで「要る」と書かない", () => {
  const v = filing("kyoto-city", "京都市で店舗を改装します。消防の手続きは必要ですか。", "koji");
  assert.ok(v);
  assert.doesNotMatch(v!.reason, /火を使う設備を設ける場合は設置届（5日前）が要る/);
  assert.match(v!.reason, /350kW/);
});

test("届出を聞かれたのに場面を判定できないときは、要否を言い切らないよう判定メモで伝える", () => {
  const r = runRules("sapporo-city", ["札幌市の焼肉店です。消防への届出は必要ですか。"]);
  assert.ok(r);
  assert.equal(r!.filings.length, 0);
  assert.match(rulesNote(r!), /どの届出の場面かを判定できなかった/);
  // 場面を判定できたときは出さない
  const ok = runRules("sapporo-city", ["札幌市で焼肉店を開きます。ガスの設備について消防への届出は必要ですか。"]);
  assert.doesNotMatch(rulesNote(ok!), /どの届出の場面かを判定できなかった/);
});

test("選択肢: 聞かれた設備の判定に足りない項目を先に聞く", () => {
  // 問2: 防火管理者を聞かれたら、延べ面積ではなく収容人員
  assert.deepEqual(missingForQuestion(runRules("tokyo-tfd", ["東京都内で居酒屋を開きます。防火管理者は必要ですか。"])), ["capacity"]);
  // 問7: 消火器を聞かれたら、火を使うかを先に
  assert.equal(missingForQuestion(runRules("general", ["小さな飲食店を始めます。消火器は必要ですか。"]))[0], "fire_use");
  // 問5: 届出の判定に足りないのが入力の合計だけなら、選択肢の項目（延べ面積など）を混ぜない
  assert.deepEqual(missingForQuestion(runRules("sapporo-city", ["札幌市で焼肉店を開きます。ガスの設備について消防への届出は必要ですか。"])), ["kitchen_kw"]);
  // 判定できないときと用途が不明なときは用途を最初に聞く
  assert.deepEqual(missingForQuestion(null), ["occupancy"]);
  assert.equal(missingForQuestion(runRules("osaka-city", ["大阪市のテナントビルで美容室を開業します。消防署に出す書類はありますか。"]))[0], "occupancy");
});
