// Run: node --experimental-strip-types --test tests/unit/
// 2026-11-17 の比較実験（Kindle本 第3章の20問）で誤った問の判定メモ。原文と言い換え文の両方で確かめる
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFacts, runRules, rulesNote } from "../../src/rules/extract.ts";
import type { Jurisdiction } from "../../src/rules/filings.ts";

const verdict = (j: Jurisdiction, text: string, procedure: string) => runRules(j, [text])?.filings.find((x) => x.procedure === procedure);

test("問2: 建築確認が要らない工事は、東京都の工事等計画届を「不要」にしない", () => {
  for (const text of [
    "東京都内のテナントビルで、飲食店の内装工事（間仕切りの変更を含む）を行います。建築確認が要らない工事です。工事を始める前に消防署へ出す届出はありますか。期限も教えてください。",
    "都内の飲食店で改装工事をします。建築確認は不要です。消防署への届出は？",
    "東京の店舗の内装工事で、建築確認の必要はありません。届出はいりますか。",
  ]) {
    assert.equal(extractFacts(text).building_permit, false, text);
    const v = verdict("tokyo-tfd", text, "koji-keikaku");
    assert.ok(v && v.result !== "not_required", text);
    assert.match(v!.deadline ?? "", /7日前/);
  }
  assert.equal(extractFacts("建築確認を受ける工事です").building_permit, true);
  assert.equal(verdict("tokyo-tfd", "都内の飲食店で、建築確認を受ける増築工事をします。届出は？", "koji-keikaku")?.result, "not_required");
  const fire = verdict("tokyo-tfd", "都内の飲食店（ガスコンロを使う）で内装工事をします。建築確認が要らない工事です。", "koji-keikaku");
  assert.equal(fire?.result, "required");
});

test("問1・5: 席数と従業員数を足して収容人員にする", () => {
  assert.equal(extractFacts("客席は固定式のいす40席、従業員は5人です。収容人員は何人になりますか。").capacity, 45);
  assert.equal(extractFacts("京都市で居酒屋を開業します。既存のテナントビルの1区画（客席40席、従業員5人）に入居します。").capacity, 45);
  assert.equal(extractFacts("従業員3人、席数20席のカフェです").capacity, 23);
  assert.equal(extractFacts("収容人員40人の飲食店で、従業員は5人、席は30席").capacity, 40);
});

test("問4: 物販店を飲食店に変える相談は、飲食店として使用開始（変更）を判定する", () => {
  for (const text of [
    "大阪市で、物販店として使っていた店舗を飲食店に変えて営業します。消防関係で必要な届出と期限、消防用設備について注意することを教えてください。",
    "物品販売店舗として使用していた区画を、カフェに変更します。",
  ]) {
    const f = extractFacts(text);
    assert.equal(f.occupancy, "3ロ", text);
    assert.equal(f.use_change, true);
    const r = runRules("osaka-city", [text])!;
    assert.ok(r.scenes.includes("use_start"));
    assert.match(r.notes.join(""), /第十七条の三第二項第四号/);
    assert.doesNotMatch(rulesNote(r), /\(6\)項ロの用途の部分があれば/);
  }
});

test("問6: 業務用ガスコンロの設置は、札幌市の厨房設備の届出（350kW）で判定する", () => {
  for (const text of ["札幌市の飲食店で、業務用ガスコンロを3台新しく設置します。消防署への設置の届出は必要ですか。", "札幌のラーメン店でガスコンロを2台増設します。届出は？"]) {
    const v = runRules("sapporo-city", [text])!.filings.find((x) => x.procedure === "kaki-setsubi");
    assert.equal(v?.result, "conditional", text);
    assert.match(v!.reason, /350kW/);
  }
  // 調理に使うだけの文は、設置の届出の場面にしない（問7）
  assert.ok(!runRules("general", ["延べ面積100㎡の飲食店で、ガスコンロを使って調理します。消火器の設置は義務ですか。"])!.scenes.includes("fire_equipment"));
});

test("問8: 福岡市の固定式の発電機と蓄電池は、両方を判定する", () => {
  const r = runRules("fukuoka-city", ["福岡市の事業所に、固定式の非常用発電機（ディーゼル）と蓄電池設備を設置します。消防署への届出は必要ですか。"])!;
  const titles = r.filings.map((x) => `${x.title}:${x.result}`).join("\n");
  assert.match(titles, /内燃機関を原動力とする発電設備.*:required/);
  assert.match(titles, /蓄電池設備.*:conditional/);
  assert.equal(runRules("fukuoka-city", ["福岡市の工場に発電機を据え付けます。届出は？"])!.filings[0].result, "required");
});

test("問9: 灯油200Lは指定数量1,000Lの5分の1ちょうどで届出が必要。計算をメモに書く", () => {
  for (const text of ["京都市の店舗で、暖房用の灯油を200リットル保管したいです。消防署への届出は必要ですか。", "京都の事務所で灯油200Lを置きます"]) {
    const r = runRules("kyoto-city", [text])!;
    assert.equal(r.filings.find((x) => x.procedure === "shoryo-kikenbutsu")?.result, "required", text);
    const note = rulesNote(r);
    assert.match(note, /灯油200L ÷ 指定数量1,000L ＝ 指定数量の0\.2倍/);
    assert.match(note, /ちょうど5分の1/);
  }
});

test("問10: 東京都の客席では、キャンドルは解除承認不要、アルコールランプは100㎡以上で解除承認が必要", () => {
  const r = runRules("tokyo-tfd", ["東京都内の飲食店（客席部分の床面積は約120㎡）で、テーブルにキャンドルやアルコールランプを置く演出をしたいです。消防のルール上、問題はありますか。"])!;
  const by = (t: RegExp) => r.filings.find((x) => t.test(x.title));
  assert.equal(by(/キャンドル/)?.result, "not_required");
  assert.match(by(/キャンドル/)!.reason, /従業員の監視の下/);
  assert.equal(by(/アルコールランプ/)?.result, "required");
  assert.equal(r.facts.total_area, undefined);
  assert.equal(runRules("tokyo-tfd", ["都内のバー（客席80㎡）でアルコールランプを使いたい"])!.filings.find((x) => /アルコールランプ/.test(x.title))?.result, "not_required");
  assert.equal(runRules("tokyo-tfd", ["都内のレストランでアルコールランプを置きたい"])!.filings.find((x) => /アルコールランプ/.test(x.title))?.result, "conditional");
  // 東京以外では判定しない（条文を確認していない）
  assert.ok(!(runRules("kyoto-city", ["京都の飲食店（客席120㎡）でアルコールランプを置きたい"])?.filings ?? []).some((x) => x.procedure === "kinshi-kaijo"));
});

test("問12: 管理権原が分かれた地上5階・100人以上のビルは統括防火管理者が必要", () => {
  const r = runRules("osaka-city", ["大阪市の5階建てのテナントビル（ビル全体の収容人員は100人以上、テナントごとに管理者が別）の3階に、飲食店として入居します。防火管理者や消防計画について、テナントとして何をする必要がありますか。"])!;
  assert.equal(r.filings.find((x) => x.procedure === "toukatsu")?.result, "required");
  assert.equal(runRules("general", ["2階建て、収容人員40人、オーナーが別の飲食店テナントです"])!.filings.find((x) => x.procedure === "toukatsu")?.result, "not_required");
  assert.ok(!runRules("osaka-city", ["大阪市の5階建てのビルの3階で飲食店を開業します"])!.filings.some((x) => x.procedure === "toukatsu"));
});

test("問14: 「100人未満」を99人と書かず、0〜99人で結論が変わる項目は条件次第にする", () => {
  const r = runRules("general", ["階段が1つしかない3階建ての雑居ビルで、2階に飲食店、3階に事務所があります。ビル全体の収容人員は100人未満です。このビルは防火対象物点検報告が必要ですか。"])!;
  const note = rulesNote(r);
  assert.doesNotMatch(note, /99人/);
  assert.match(note, /100人未満/);
  assert.equal(r.install.find((x) => x.equipment === "fire_manager")?.result, "conditional");
  assert.doesNotMatch(note, /\(6\)項ロの用途の部分があれば/);
});

test("問17: 京都市の露店は5日前と消火器の準備をメモに載せる", () => {
  const v = verdict("kyoto-city", "京都市のお祭りで露店を出し、カセットコンロで焼きそばを作って販売します。消防への届出や準備は必要ですか。", "roten");
  assert.equal(v?.result, "required");
  assert.match(v!.deadline ?? "", /5日前/);
  assert.match(v!.caveats.join(""), /消火器/);
});

test("問18: 京都市の民泊は、消防法令適合通知書を届出の前に申請する", () => {
  for (const text of ["京都市で、自分が住んでいない一戸建てを使って民泊（住宅宿泊事業）を始めます。消防関係の手続きを教えてください。", "京都で住宅宿泊事業の届出をしたい"]) {
    const v = runRules("kyoto-city", [text])?.filings.find((x) => x.procedure === "tekigo-tsuchi");
    assert.equal(v?.result, "required", text);
  }
});
