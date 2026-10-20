// 届出の判定（src/rules/filings.ts）と相談文の読み取り（src/rules/extract.ts）を、評価セットの届出の問いと突き合わせる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { judgeFilings, type FilingFacts, type Jurisdiction, type Scene } from "../../src/rules/filings.ts";
import { detectScenes, extractFacts, rulesNote, runRules } from "../../src/rules/extract.ts";

type Case = { id: string; jurisdiction: string; q: string; expect: string };
const cases = new Map<string, Case>(
  readFileSync(new URL("../../eval/answer-cases.jsonl", import.meta.url), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Case)
    .map((c) => [c.id, c]),
);

// 問題文の条件を判定の入力に置き換えたもの。expect は評価セットの結論の要点
const FILING_CASES: { id: string; scene: Scene; facts: FilingFacts; result: "required" | "not_required" | "conditional"; deadline?: RegExp; form?: RegExp; target?: RegExp }[] = [
  { id: "file-048", scene: "use_start", facts: { occupancy: "3ロ", capacity: 40, fire_use: true }, result: "required", deadline: /7日前/ },
  { id: "file-049", scene: "use_start", facts: { occupancy: "15", total_area: 100, floors_above: 1, floors_below: 0, capacity: 10 }, result: "not_required" },
  { id: "file-050", scene: "use_start", facts: { occupancy: "15", total_area: 100, floors_above: 1, capacity: 10 }, result: "required", deadline: /7日前/ },
  { id: "file-051", scene: "fire_equipment", facts: { facility: "kitchen", exhaust_down: true }, result: "required", deadline: /5日前/ },
  { id: "file-052", scene: "small_hazmat", facts: {}, result: "required", deadline: /7日前/ },
  { id: "file-053", scene: "stall", facts: { stall_fire: true }, result: "required", deadline: /5日前/ },
  { id: "file-054", scene: "renovation", facts: { occupancy: "3ロ", fire_use: true, building_permit: false }, result: "required", deadline: /7日前/ },
  { id: "file-055", scene: "renovation", facts: { occupancy: "3ロ", fire_use: true, building_permit: false }, result: "required", deadline: /7日前/ },
  { id: "file-056", scene: "temp_use", facts: { occupancy: "4" }, result: "required", deadline: /7日前/ },
  { id: "file-057", scene: "fire_equipment", facts: { occupancy: "3ロ", total_area: 500, facility: "kitchen", kitchen_kw: 150, exhaust_down: false }, result: "required", deadline: /7日前/ },
  { id: "file-058", scene: "fire_equipment", facts: { occupancy: "3ロ", total_area: 500, facility: "kitchen", kitchen_kw: 80, exhaust_down: false }, result: "not_required" },
  { id: "file-059", scene: "fire_equipment", facts: { facility: "kitchen", kitchen_kw: 80, exhaust_down: true }, result: "required", deadline: /7日前/ },
  { id: "file-060", scene: "fire_equipment", facts: { facility: "sauna" }, result: "required", deadline: /7日前/ },
  { id: "file-061", scene: "fire_equipment", facts: { facility: "sauna", residence: false }, result: "required", deadline: /5日前/ },
  { id: "file-062", scene: "small_hazmat", facts: {}, result: "required", deadline: /10日前/ },
  { id: "file-064", scene: "event", facts: { exhibition_hall: true }, result: "required", deadline: /3日前/ },
  { id: "file-065", scene: "stall", facts: { stall_fire: true }, result: "required", deadline: /あらかじめ/ },
  { id: "file-068", scene: "fire_equipment", facts: { occupancy: "3ロ", total_area: 500, facility: "kitchen", kitchen_kw: 150, exhaust_down: false }, result: "not_required" },
  { id: "file-069", scene: "fire_equipment", facts: { occupancy: "3ロ", total_area: 1200, facility: "kitchen", small_specific_complex: false }, result: "required", deadline: /5日前/ },
  { id: "file-070", scene: "event", facts: {}, result: "required", deadline: /5日前/ },
  { id: "file-071", scene: "use_start", facts: { occupancy: "15", total_area: 100, floors_above: 1, capacity: 10 }, result: "required", deadline: /7日前/, form: /別記第6/ },
  { id: "file-072", scene: "fire_equipment", facts: { occupancy: "3ロ", facility: "kitchen", has_duct: true }, result: "required", deadline: /あらかじめ/, form: /別記第9/ },
  { id: "file-073", scene: "drill", facts: {}, result: "required", deadline: /3日前/, form: /別記第8/ },
  { id: "file-074", scene: "hot_work", facts: {}, result: "required", deadline: /あらかじめ/, form: /別記第14の2/ },
  { id: "file-075", scene: "renovation", facts: { occupancy: "4" }, result: "required", deadline: /着手する前/, form: /別記第7/ },
  { id: "file-076", scene: "use_start", facts: { occupancy: "15", total_area: 100, floors_above: 1, capacity: 10 }, result: "required", deadline: /7日前/, form: /第3号様式/, target: /消防長/ },
  { id: "file-077", scene: "fire_equipment", facts: { occupancy: "3ロ", facility: "kitchen", kitchen_kw: 100 }, result: "not_required" },
  { id: "file-078", scene: "fire_equipment", facts: { occupancy: "5イ", facility: "kitchen", kitchen_kw: 400 }, result: "required", deadline: /5日前/, target: /消防長/ },
  { id: "file-079", scene: "bonfire", facts: {}, result: "required", deadline: /前日/, target: /消防署長/ },
  { id: "file-080", scene: "stall", facts: { stall_fire: true }, result: "required", deadline: /3日前/, target: /消防署長/ },
  { id: "file-081", scene: "small_hazmat", facts: { occupancy: "12イ" }, result: "required", deadline: /7日前/, form: /第14号様式/ },
  { id: "file-082", scene: "fire_equipment", facts: { occupancy: "15", facility: "battery", battery_kwh: 15 }, result: "not_required" },
  { id: "file-083", scene: "use_start", facts: { occupancy: "15", total_area: 100, floors_above: 1 }, result: "required", deadline: /7日前/, target: /消防署長/ },
  { id: "file-084", scene: "fire_equipment", facts: { occupancy: "5イ", facility: "kitchen", kitchen_kw: 400, residence: false }, result: "required", deadline: /5日前/ },
  { id: "file-085", scene: "fire_equipment", facts: { facility: "sauna", residence: true, personal_use: true }, result: "not_required" },
  { id: "file-086", scene: "water_outage", facts: { multi_ward: true }, result: "required", target: /^消防長$/ },
  { id: "file-087", scene: "small_hazmat", facts: { residence: true, hazmat_ratio: 0.3 }, result: "not_required" },
];

for (const fc of FILING_CASES) {
  const c = cases.get(fc.id)!;
  test(`${fc.id} ${c.expect}`, () => {
    assert.ok(c, "評価セットにない");
    const [r] = judgeFilings(c.jurisdiction as Jurisdiction, fc.scene, fc.facts);
    assert.equal(r.result, fc.result, r.reason);
    if (fc.deadline) assert.match(r.deadline ?? "", fc.deadline);
    if (fc.form) assert.match(r.form ?? "", fc.form);
    if (fc.target) assert.match(r.target, fc.target);
    assert.equal(r.lane, "gyosei");
  });
}

test("東京都: 指定防火対象物等なら使用開始前の検査も返す（insp-066）", () => {
  const [r] = judgeFilings("tokyo-tfd", "use_start", { occupancy: "3ロ", fire_use: true });
  assert.match(r.inspection ?? "", /検査を受ける/);
});

test("京都市: 使用開始届の後の検査は署長が必要に応じて行う（insp-067）", () => {
  const [r] = judgeFilings("kyoto-city", "use_start", { occupancy: "3ロ", fire_use: true, capacity: 40 });
  assert.match(r.inspection ?? "", /必要に応じて/);
});

test("相談文から条件と場面を読み取る", () => {
  const f = extractFacts("京都市で平屋・延べ100㎡の事務所を使い始めます。従業員10人です");
  assert.equal(f.occupancy, "15");
  assert.equal(f.total_area, 100);
  assert.equal(f.floors_above, 1);
  assert.equal(f.capacity, 10);
  assert.deepEqual(detectScenes("事務所を使い始めます"), ["use_start"]);
  assert.equal(extractFacts("令別表第一(3)項ロの店舗").occupancy, "3ロ");
  assert.equal(extractFacts("消防法施行令第10条第1項の話").occupancy, undefined);
  const k = extractFacts("厨房設備の入力の合計が150kWで、排気は上方に排気します");
  assert.equal(k.kitchen_kw, 150);
  assert.equal(k.exhaust_down, false);
  assert.equal(k.facility, "kitchen");
  assert.equal(extractFacts("建築確認は受けません").building_permit, false);
  assert.equal(extractFacts("確認申請を出す増築").building_permit, true);
});

test("会話の後の発言で条件を足していける", () => {
  const r = runRules("kyoto-city", ["事務所を開業したい", "延べ100㎡、平屋で、地下はありません。従業員は10人です"]);
  assert.ok(r);
  assert.equal(r.facts.total_area, 100);
  assert.equal(r.filings[0].procedure, "shiyo-kaishi");
});

test("政令市の相談文から場面と数量を読み取る", () => {
  assert.deepEqual(detectScenes("名古屋市の防火管理者が消防訓練を行う"), ["drill"]);
  assert.deepEqual(detectScenes("建物で溶接・溶断の作業をする"), ["hot_work"]);
  assert.deepEqual(detectScenes("空き地でたき火をする"), ["bonfire"]);
  assert.ok(detectScenes("水道工事で、2つの区にまたがって断水する").includes("water_outage"));
  const k = extractFacts("自宅で灯油を300リットル保管する");
  assert.equal(k.hazmat_ratio, 0.3);
  assert.equal(k.residence, true);
  assert.deepEqual(detectScenes("自宅で灯油を300リットル保管する"), ["small_hazmat"]);
  assert.equal(extractFacts("自宅の庭に、家族だけで使うテントサウナを置く").personal_use, true);
  assert.equal(extractFacts("排気ダクト付きの厨房設備").has_duct, true);
  const r = runRules("yokohama-city", ["自宅で灯油を300リットル保管する"])!;
  assert.equal(r.filings[0].result, "not_required");
});

test("条件が読み取れない相談では判定しない", () => {
  assert.equal(runRules("tokyo-tfd", ["消火器の点検は何年ごとですか"]), null);
});

test("判定メモに結論・期限・足りない情報が入る", () => {
  const r = runRules("tokyo-tfd", ["飲食店を開業します。延べ80㎡で火を使います"])!;
  const note = rulesNote(r);
  assert.match(note, /防火対象物使用開始届: 必要/);
  assert.match(note, /7日前/);
  assert.match(note, /消火器具: 必要/);
  assert.match(note, /防火管理者: 条件次第.*収容人員/);
});

test("大規模な建物の設備は、聞かれていなければ必要のときだけ判定メモに載せる", () => {
  const big = rulesNote(runRules("kyoto-city", ["地上7階建、延べ3,000㎡の事務所を使い始めます"])!);
  assert.match(big, /連結送水管: 必要/);
  assert.match(big, /消防機関へ通報する火災報知設備: 必要（原則）/);
  const small = rulesNote(runRules("kyoto-city", ["平屋、延べ100㎡の事務所を使い始めます"])!);
  assert.doesNotMatch(small, /連結送水管|非常コンセント|屋外消火栓/);
});

test("特定の階の収容人員・床面積は建物全体の値として読まない", () => {
  const f = extractFacts("京都市の事務所ビルの7階を借ります。7階の収容人員は35人、直通階段は2つです");
  assert.equal(f.floor, 7);
  assert.equal(f.floor_capacity, 35);
  assert.equal(f.capacity, undefined);
  assert.equal(f.direct_stairs, 2);
  const b = extractFacts("物品販売店舗の地下1階、床面積1,200㎡です");
  assert.equal(b.floor, -1);
  assert.equal(b.floor_area, 1200);
  assert.equal(b.total_area, undefined);
  const w = extractFacts("3階建ての飲食店で2階、延べ200㎡、席数40席");
  assert.equal(w.floor, 2);
  assert.equal(w.floors_above, 3);
  assert.equal(w.total_area, 200);
  assert.equal(w.capacity, 40);
  assert.equal(extractFacts("地上5階建、延べ800㎡の事務所").floor, undefined);
});

test("階が分かれば避難器具も判定し、階の収容人員で防火管理者を断定しない", () => {
  const r = runRules("kyoto-city", ["京都市の事務所ビルの7階を借ります。7階の収容人員は35人、直通階段は2つです。避難器具はいりますか？"])!;
  const evac = r.install.find((v) => v.equipment === "evac_device")!;
  assert.equal(evac.result, "required");
  assert.match(evac.basis, /京都市火災予防条例 第43条/);
  assert.equal(r.install.find((v) => v.equipment === "fire_manager")!.result, "conditional");
});

test("露店で調理する（焼く・揚げる）なら火気を使うものとして読む", () => {
  assert.equal(extractFacts("お祭りで露店を出してたこ焼きを焼きます").stall_fire, true);
  assert.equal(extractFacts("屋台で唐揚げを揚げる").stall_fire, true);
  assert.equal(extractFacts("露店で手作りの雑貨を売る").stall_fire, undefined);
});

test("判定メモは、聞かれた項目を先に答え、メモを丸写ししないよう指示する", () => {
  const note = rulesNote(runRules("kyoto-city", ["延べ800㎡の事務所"])!);
  assert.match(note, /聞いた設備・届出の結論と根拠を最初に/);
  assert.match(note, /そのまま写さず/);
});

test("聞かれた設備は判定メモの先頭に分け、大規模な建物の設備も条件次第なら載せる", () => {
  const r = runRules("kyoto-city", ["京都市内の物品販売店舗の地下1階、床面積1,200㎡です。連結送水管は必要ですか？"])!;
  assert.deepEqual(r.asked, ["standpipe"]);
  assert.equal(r.install[0].equipment, "standpipe");
  const note = rulesNote(r);
  assert.match(note, /## 相談者が聞いている設備[^#]*連結送水管: 必要/);
  const q = runRules("kyoto-city", ["延べ300㎡の事務所。連結送水管は必要？"])!;
  assert.equal(q.install[0].equipment, "standpipe");
  assert.equal(q.install[0].result, "conditional");
  assert.doesNotMatch(rulesNote(runRules("kyoto-city", ["延べ300㎡の事務所"])!), /連結送水管/);
});

test("原則として必要な項目は、除外・例外も判定メモに載せる", () => {
  const note = rulesNote(runRules("kyoto-city", ["地上5階建、延べ800㎡の事務所。屋内消火栓設備は必要ですか？"])!);
  assert.match(note, /屋内消火栓設備: 必要（原則）.*除外・例外（「原則として必要」と書き、これに触れる）: 特定主要構造部が耐火構造/);
});
