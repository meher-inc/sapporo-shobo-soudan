// Run: node --experimental-strip-types --test tests/unit/
// 国の届出（防火管理者選任届・消防計画・着工届・設置届）。評価セット nat-001〜009
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runRules } from "../../src/rules/extract.ts";
import { inspectionBuilding } from "../../src/rules/national.ts";

const ids = new Set(
  readFileSync(new URL("../../eval/answer-cases.jsonl", import.meta.url), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l).id as string),
);

// 問題文（相談の書き方）→ 手続 → 期待する結論
const CASES: { id: string; text: string; procedure: string; result: "required" | "not_required" | "conditional"; deadline?: RegExp }[] = [
  { id: "nat-001", text: "名古屋市中区で飲食店を開業します。延べ面積350㎡、3階建て、収容人員40人、コンロを使います。", procedure: "boka-kanrisha", result: "required", deadline: /遅滞なく/ },
  { id: "nat-002", text: "名古屋市中区で飲食店を開業します。延べ面積350㎡、3階建て、収容人員40人、コンロを使います。", procedure: "shobo-keikaku", result: "required" },
  { id: "nat-003", text: "事務所を開設します。延べ面積200㎡、従業員20人です。防火管理者の選任届は要りますか？", procedure: "boka-kanrisha", result: "not_required" },
  { id: "nat-004", text: "飲食店（延べ面積350㎡、3階建て、40人）に自動火災報知設備を新設する工事をします。届出は？", procedure: "chakko", result: "required", deadline: /10日前/ },
  { id: "nat-005", text: "飲食店（延べ面積350㎡、3階建て、40人）に自動火災報知設備を新設する工事をします。届出は？", procedure: "setchi", result: "required", deadline: /4日以内/ },
  { id: "nat-007", text: "倉庫（延べ面積500㎡、平屋）に自動火災報知設備を設置する工事をします。", procedure: "setchi", result: "conditional" },
  { id: "nat-008", text: "物販店（延べ面積100㎡、平屋、10人）に消火器を設置します。", procedure: "chakko", result: "not_required" },
  { id: "nat-009", text: "ホテル（延べ面積200㎡、2階建て、20人）に自動火災報知設備を設置します。", procedure: "setchi", result: "required" },
];

for (const c of CASES)
  for (const j of ["nagoya-city", "general", "kyoto-city"] as const)
    test(`${c.id}（${j}）: ${c.procedure} は ${c.result}`, () => {
      assert.ok(ids.has(c.id), "評価セットに問いがある");
      const f = runRules(j, [c.text])?.filings.find((x) => x.procedure === c.procedure);
      assert.ok(f, `${c.procedure} の判定がある`);
      assert.equal(f.result, c.result, f.reason);
      if (c.deadline) assert.match(f.deadline ?? "", c.deadline);
    });

test("nat-006: 特定用途が避難階以外の階にあり直通階段が1つなら、延べ300㎡未満でも設置届の対象（令35条1項4号）", () => {
  assert.ok(ids.has("nat-006"));
  assert.equal(inspectionBuilding({ occupancy: "3ロ", total_area: 200, floor: 3, direct_stairs: 1 }).hit, true);
  assert.equal(inspectionBuilding({ occupancy: "3ロ", total_area: 200, floor: 1, direct_stairs: 1 }).hit, false);
  // 階が分からなければ断定しない
  const u = inspectionBuilding({ occupancy: "3ロ", total_area: 200, floors_above: 3, direct_stairs: 1 });
  assert.equal(u.hit, null);
  assert.ok(u.missing.includes("floor"));
});

test("(6)項ハは入居・宿泊させるかで分かれる", () => {
  assert.equal(inspectionBuilding({ occupancy: "6ハ", total_area: 100, overnight: true }).hit, true);
  assert.equal(inspectionBuilding({ occupancy: "6ハ", total_area: 100 }).hit, null);
  assert.equal(inspectionBuilding({ occupancy: "6ハ", total_area: 100, overnight: false }).hit, false);
});

test("防火管理者の選任が条件次第なら、選任届も条件次第で足りない情報を引き継ぐ", () => {
  const r = runRules("nagoya-city", ["飲食店を開業します。"])!;
  const f = r.filings.find((x) => x.procedure === "boka-kanrisha")!;
  assert.equal(f.result, "conditional");
  assert.ok(f.missing.includes("capacity"));
});

test("用途も場面もなくても、防火管理者・消防計画を聞いていれば判定する", () => {
  const r = runRules("general", ["消防計画の届出はいつまでに出しますか？"]);
  assert.ok(r?.filings.some((x) => x.procedure === "shobo-keikaku" && x.result === "conditional"));
});
