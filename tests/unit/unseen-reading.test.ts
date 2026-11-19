// 初めて受ける質問（2026-11-18 の開発用30問）で見つかった読み取りの抜け。
// 質問ごとの答えは書かず、読み取りの規則（数値の幅・否定・状態・危険物の量）だけを確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectScenes, extractFacts, hazmatItems, hazmatRatio, missingForQuestion, runRules, rulesNote } from "../../src/rules/extract.ts";

const filing = (r: ReturnType<typeof runRules>, title: RegExp) => r?.filings.find((f) => title.test(f.title));
const equip = (r: ReturnType<typeof runRules>, e: string) => r?.install.find((v) => v.equipment === e);

// ---- 危険物の量 ----
test("危険物の量: 品名と量が離れていても同じ文の中なら読む", () => {
  assert.deepEqual(hazmatItems("灯油を、屋外に置いた容量490リットルのタンクにためて使います"), [{ name: "灯油", liters: 490, unit: 1000 }]);
  assert.equal(hazmatRatio("軽油は裏の倉庫にあるタンク（容量300L）に入れています"), 0.3);
});
test("危険物の量: 別の品名の量を取り違えない", () => {
  assert.deepEqual(hazmatItems("ガソリンの携行缶と、灯油400リットルを置きます"), [{ name: "灯油", liters: 400, unit: 1000 }]);
  assert.deepEqual(hazmatItems("灯油200Lと軽油300Lを保管します").map((x) => x.liters), [200, 300]);
});
test("危険物の量: 文をまたいだ数字は読まない", () => {
  assert.equal(hazmatRatio("灯油を使っています。倉庫には水を500リットル備蓄しています"), undefined);
});
test("危険物: 量を書かない保管の相談も危険物の場面として読み、要否を言い切らない", () => {
  assert.ok(detectScenes("工場で、暖房用の灯油をまとめ買いして保管しておきたい").includes("small_hazmat"));
  for (const j of ["nagoya-city", "kyoto-city", "sapporo-city", "tokyo-tfd"] as const) {
    const r = runRules(j, ["工場で、暖房用の灯油をまとめ買いして保管しておきたいと考えています。消防署への届出は必要ですか。"]);
    const f = filing(r, /危険物/);
    assert.ok(f, `${j}: 危険物の届出の判定が出る`);
    assert.equal(f.result, "conditional", j);
    assert.ok(f.missing.includes("hazmat_amount"), j);
  }
});
test("危険物: 灯油ストーブを置くだけの相談は危険物の保管として読まない", () => {
  assert.ok(!detectScenes("事務所に灯油ストーブを置きます").includes("small_hazmat"));
});

// ---- 否定 ----
test("否定: 「内装工事はしません」を工事の相談として読まない", () => {
  for (const t of ["内装工事はしません。", "改装は行いません。", "内装工事なしで入居します。", "リフォームの予定はありません。"]) assert.ok(!detectScenes(`テナントを借りて事務所を開きます。${t}`).includes("renovation"), t);
  assert.ok(detectScenes("飲食店の内装工事（間仕切りの変更を含む）を行います。").includes("renovation"));
  assert.ok(detectScenes("内装工事をします。建築確認は要りません。").includes("renovation"));
});
test("否定: 工事をしない入居で、工事の届出を「必要」としない", () => {
  const r = runRules("nagoya-city", ["名古屋市で、既存のビルの1室を借りて事務所を開きます。内装工事はしません。使い始める前に消防署へ出す届出はありますか。"]);
  assert.ok(filing(r, /使用開始/));
  assert.equal(filing(r, /工事計画/), undefined);
});

// ---- 続いている状態 ----
test("状態: 「入居しています」「営業しています」は使い始めの相談として読まない", () => {
  for (const t of ["テナントビルに入居しています。", "3年前に開業して営業しています。", "テナントに入っています。", "開店してから5年たちます。"]) assert.ok(!detectScenes(`${t}消防訓練は年に何回必要ですか。`).includes("use_start"), t);
  for (const t of ["来月テナントに入居します。", "飲食店を開業します。", "新しく店をオープンする予定です。"]) assert.ok(detectScenes(t).includes("use_start"), t);
});

// ---- 数値の幅 ----
test("幅: 「100人以上」は100人ちょうどとして言い切らない（境目をまたぐ判定は条件次第）", () => {
  const f = extractFacts("飲食店が入る5階建てのビルで、収容人員は100人以上です");
  assert.deepEqual(f.ranges?.capacity, { lo: 100, hi: 10_000_000, text: "100人以上" });
  const r = runRules("general", ["飲食店が入る3階建てのビルで、収容人員は100人以上です。階段は1つです。防火対象物点検報告は必要ですか。"]);
  // 300人以上なら必要、未満なら階段の条件次第。100人以上だけでは決まらない
  const note = rulesNote(r!);
  assert.match(note, /収容人員 100人以上/);
  assert.doesNotMatch(note, /収容人員100人（/);
  // 30人の境目はどこでも超えているので、防火管理者は「必要」のまま
  assert.equal(equip(r, "fire_manager")?.result, "required");
});
test("幅: 「以上・以下・超・未満・約」と「A以上B未満」を幅として読む", () => {
  assert.deepEqual(extractFacts("飲食店で延べ面積は150㎡以上300㎡未満です").ranges?.total_area, { lo: 150, hi: 299, text: "150㎡以上300㎡未満" });
  assert.deepEqual(extractFacts("飲食店で延べ面積は1000㎡以上です").ranges?.total_area, { lo: 1000, hi: 10_000_000, text: "1000㎡以上" });
  assert.deepEqual(extractFacts("飲食店で延べ面積は300㎡を超えます").ranges?.total_area?.lo, 301);
  assert.deepEqual(extractFacts("事務所で延べ面積は500㎡以下です").ranges?.total_area, { lo: 1, hi: 500, text: "500㎡以下" });
  assert.deepEqual(extractFacts("飲食店で延べ面積は約300㎡です").ranges?.total_area, { lo: 270, hi: 330, text: "約300㎡" });
  assert.equal(extractFacts("飲食店で延べ面積は320㎡です").ranges, undefined);
  assert.deepEqual(extractFacts("飲食店で収容人員は10人以上30人未満です").ranges?.capacity, { lo: 10, hi: 29, text: "10人以上30人未満" });
});
test("幅: 境目をまたぐ項目だけ条件次第にし、またがない項目は結論を変えない", () => {
  // 約300㎡: 自動火災報知設備（飲食店は300㎡以上）は決まらない。消火器（火を使えば面積に関係なく必要）は決まる
  const r = runRules("general", ["飲食店です。延べ面積は約300㎡で、コンロを使います。"]);
  assert.equal(equip(r, "auto_alarm")?.result, "conditional");
  assert.ok(equip(r, "auto_alarm")?.missing.includes("total_area"));
  assert.equal(equip(r, "extinguisher")?.result, "required");
  // 約120㎡: 300㎡の境目から遠いので「不要」のまま
  assert.equal(equip(runRules("general", ["飲食店です。延べ面積は約120㎡です。"]), "auto_alarm")?.result, "not_required");
});
test("幅: 「1000㎡以上」は、もっと大きい建物で必要になる設備を「不要」と言い切らない", () => {
  const r = runRules("general", ["飲食店です。延べ面積は1000㎡以上です。"]);
  assert.equal(equip(r, "auto_alarm")?.result, "required");
  assert.equal(equip(r, "sprinkler")?.result, "conditional");
});

// ---- 選択肢で聞く項目 ----
test("聞く項目: 聞かれた届出の結論が決まっていれば、何も聞かない", () => {
  // 危険物の届出は量だけで決まる。用途や延べ面積は聞かない
  assert.deepEqual(missingForQuestion(runRules("kyoto-city", ["店舗の倉庫に軽油を300リットル保管します。消防署への届出は必要ですか。"])), []);
  // 防火管理者は決まっている。ついでに判定した設備の不足（延べ面積）は聞かない
  assert.deepEqual(missingForQuestion(runRules("general", ["収容人員40人の飲食店です。防火管理者は必要ですか。"])), []);
});
test("聞く項目: 聞かれた項目が条件次第なら、その判定に足りない項目だけを聞く", () => {
  assert.deepEqual(missingForQuestion(runRules("general", ["飲食店です。防火管理者は必要ですか。"])), ["capacity"]);
  assert.equal(missingForQuestion(runRules("general", ["事務所です。消火器は必要ですか。"]))[0], "total_area");
  assert.deepEqual(missingForQuestion(runRules("nagoya-city", ["灯油を保管したいです。届出は必要ですか。"])), ["hazmat_amount"]);
});
test("聞く項目: 規則が扱っていない論点の相談では、関係のない延べ面積を聞かない", () => {
  assert.deepEqual(missingForQuestion(runRules("general", ["物販店です。防火扉の前に段ボールを置いています。問題はありますか。"])), []);
  assert.deepEqual(missingForQuestion(runRules("kyoto-city", ["旅館です。客室に避難経路図を貼る義務はありますか。"])), []);
});
test("聞く項目: 何が必要かを広く聞く相談では、これまでどおり設備の判定に足りない項目を聞く", () => {
  const m = missingForQuestion(runRules("general", ["飲食店です。消防で必要な設備を教えてください。"]));
  assert.ok(m.includes("total_area") && m.includes("capacity"));
  assert.deepEqual(missingForQuestion(null), ["occupancy"]);
});

// ---- 建物全体の用途 ----
test("区画の相談: 事務所の区画でも、建物に特定用途が入っていれば基準が変わるので、両方の場合を書く", () => {
  // 防火管理者: 事務所だけの建物は50人以上、特定用途が入る建物は30人以上。40人ではどちらか決まらない
  const r = runRules("general", ["ビルの一室を借りて会社をやっています。ビル全体の収容人員は40人です。防火管理者は必要ですか。"])!;
  const fm = equip(r, "fire_manager")!;
  assert.equal(fm.result, "conditional");
  assert.ok(fm.missing.includes("building_use"));
  assert.match(fm.reason, /この用途だけの建物なら不要/);
  assert.match(fm.reason, /特定用途が入っている建物なら必要/);
  assert.match(rulesNote(r), /建物に飲食店・物販店など（特定用途）が入っているか/);
  // 誘導灯: 事務所だけの建物は地階・無窓階・11階以上だけ、特定用途が入る建物は全体が対象
  const g = equip(runRules("general", ["オフィスを借りて事務所を開きます。誘導灯は付けないといけませんか。"]), "guide_light")!;
  assert.equal(g.result, "conditional");
  assert.ok(g.missing.includes("building_use"));
});
test("区画の相談: どちらの用途でも結論が同じ項目と、建物をまるごと使う相談は、これまでどおり", () => {
  // 60人なら、事務所だけでも（50人以上）特定用途入りでも（30人以上）必要
  assert.equal(equip(runRules("general", ["ビルの一室を借りて会社をやっています。ビル全体の収容人員は60人です。防火管理者は必要ですか。"]), "fire_manager")?.result, "required");
  // 自社の建物をまるごと使う事務所は、区画の相談として読まない
  const own = runRules("general", ["自社ビルの事務所です。収容人員は40人です。防火管理者は必要ですか。"]);
  assert.equal(equip(own, "fire_manager")?.result, "not_required");
  assert.equal(own?.facts.tenant, undefined);
  // 飲食店の区画は、もともと特定用途の基準で判定する
  assert.equal(equip(runRules("general", ["テナントビルの1階で飲食店をしています。ビル全体の収容人員は40人です。防火管理者は必要ですか。"]), "fire_manager")?.result, "required");
});
