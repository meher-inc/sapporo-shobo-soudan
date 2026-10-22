import type { CityJurisdiction } from "./cities/index.ts";

// 消防用設備等の設置義務と防火管理者の選任義務を、消防法施行令の条文どおりに決定的に判定する。
// LLM には判定させない（要件定義書 5章 F2、データスキーマ設計 4章）。
// 根拠: 消防法施行令 第1条の2・第10条・第11条・第12条・第19条・第21条〜第29条の2（e-Gov）
// 条例の上乗せ・本部の運用・令第32条の特例・総務省令による免除はここでは扱わず、caveats に書く。

export type Equipment =
  | "fire_manager"
  | "extinguisher"
  | "indoor_hydrant"
  | "sprinkler"
  | "auto_alarm"
  | "leak_alarm"
  | "emergency_alarm"
  | "evac_device"
  | "guide_light"
  | "fire_report"
  | "outdoor_hydrant"
  | "fire_water"
  | "smoke_control"
  | "standpipe"
  | "emergency_outlet";

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  fire_manager: "防火管理者",
  extinguisher: "消火器具",
  indoor_hydrant: "屋内消火栓設備",
  sprinkler: "スプリンクラー設備",
  auto_alarm: "自動火災報知設備",
  leak_alarm: "漏電火災警報器",
  emergency_alarm: "非常警報器具・非常警報設備",
  evac_device: "避難器具",
  guide_light: "誘導灯・誘導標識",
  fire_report: "消防機関へ通報する火災報知設備",
  outdoor_hydrant: "屋外消火栓設備",
  fire_water: "消防用水",
  smoke_control: "排煙設備",
  standpipe: "連結送水管",
  emergency_outlet: "非常コンセント設備",
};

export type Structure =
  | "fireproof_flame_retardant" // 特定主要構造部が耐火構造＋内装が難燃材料（3倍読み）
  | "fireproof" // 特定主要構造部が耐火構造（2倍読み）
  | "quasi_fireproof_flame_retardant" // 準耐火（建基法2条9号の3イ・ロ）＋内装が難燃材料（2倍読み）
  | "other";

export type Facts = {
  occupancy: string; // 令別表第一の項（例: 3ロ、6イ(4)、16イ、16の2）
  total_area?: number; // 延べ面積（㎡）
  floors_above?: number; // 地階を除く階数
  floors_below?: number; // 地階の階数
  capacity?: number; // 収容人員（全体）
  fire_use?: boolean; // 火を使用する設備・器具がある（(3)項）
  structure?: Structure;
  overnight?: boolean; // (6)項ハで入居・宿泊させる
  lath_wall?: boolean; // 準不燃材料以外の下地の鉄網入りの壁・床・天井（ラスモルタル等）
  contract_amperes?: number; // 契約電流容量（A）
  direct_stairs?: number; // 避難階・地上に直通する階段の数
  specific_use_upper?: boolean; // (16)項イで、特定用途の部分が避難階以外の階にある
  // 特定の階について聞かれたとき
  floor?: number; // 階（地階は -1, -2 …）
  floor_area?: number;
  floor_capacity?: number;
  windowless?: boolean; // その階が無窓階
  lower_floor_risky_use?: boolean; // 下階に (1)〜(4)・(9)・(12)イ・(13)イ・(14)・(15) 項の用途がある（令25条）
  building_class?: "fireproof" | "quasi_fireproof" | "other"; // 耐火建築物・準耐火建築物・その他（令19条・27条）
  lower_floors_area?: number; // 1階（2階建以上は1階と2階）の床面積の合計（令19条・27条）
  site_area?: number; // 敷地面積（令27条）
  height?: number; // 建物の高さ（m、令27条）
};

export type Result = "required" | "not_required" | "conditional";

export type Verdict = {
  equipment: Equipment;
  result: Result;
  assertive: boolean; // false = 総務省令の除外・代替などで変わりうる（「原則」）
  scope?: string; // 必要な範囲が建物全体でないとき（例: 11階以上の階）
  detail?: string; // 設備の種類など
  basis: string; // 例: 消防法施行令 第十条第一項第二号
  reason: string;
  caveats: string[];
  missing: (keyof Facts)[];
};

// ---- 用途（令別表第一）の判定 ----

type Occ = { main: string; sub?: string; num?: number };

export function parseOccupancy(raw: string): Occ | null {
  const s = raw
    .normalize("NFKC")
    .replace(/[（(]/g, "(")
    .replace(/[）)]/g, ")")
    .replace(/項/g, "")
    .replace(/\s/g, "")
    .replace(/^\((\d{1,2}(?:の[23])?)\)/, "$1");
  const m = s.match(/^(\d{1,2}(?:の[23])?)([イロハニ])?(?:\((\d)\))?$/);
  if (!m) return null;
  return { main: m[1], sub: m[2], num: m[3] ? Number(m[3]) : undefined };
}

// pattern: "6", "6イ", "6イ(1)", "16の2"。true / false / null（細分が分からない）
function matchOne(o: Occ, pattern: string): boolean | null {
  const p = parseOccupancy(pattern)!;
  if (o.main !== p.main) return false;
  if (!p.sub) return true;
  if (!o.sub) return null;
  if (o.sub !== p.sub) return false;
  if (p.num === undefined) return true;
  if (o.num === undefined) return null;
  return o.num === p.num;
}

function inList(o: Occ, list: string[]): boolean | null {
  let unknown = false;
  for (const p of list) {
    const r = matchOne(o, p);
    if (r === true) return true;
    if (r === null) unknown = true;
  }
  return unknown ? null : false;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

// 令11条2項の倍読み
function areaMultiplier(st: Structure | undefined): number | null {
  if (st === undefined) return null;
  if (st === "fireproof_flame_retardant") return 3;
  if (st === "fireproof" || st === "quasi_fireproof_flame_retardant") return 2;
  return 1;
}

const ART = "消防法施行令";

type Ctx = { o: Occ; f: Facts };

function verdict(
  equipment: Equipment,
  result: Result,
  basis: string,
  reason: string,
  extra: Partial<Omit<Verdict, "equipment" | "result" | "basis" | "reason">> = {},
): Verdict {
  return { equipment, result, basis, reason, assertive: true, caveats: [], missing: [], ...extra };
}

const isBasement = (f: Facts) => f.floor !== undefined && f.floor < 0;

// ---- 防火管理者（令1条の2第3項第1号）----

function fireManager({ o, f }: Ctx): Verdict {
  const e: Equipment = "fire_manager";
  const b = `${ART} 第一条の二第三項第一号`;
  if (inList(o, ["16の3", "18", "19", "20"])) return verdict(e, "not_required", b, "この用途は防火管理者の選任対象から除かれている");
  let threshold: number | null = null;
  if (inList(o, ["6ロ"])) threshold = 10;
  else if (inList(o, ["16イ", "16の2"])) {
    return verdict(e, f.capacity === undefined ? "conditional" : f.capacity >= 30 ? "required" : f.capacity >= 10 ? "conditional" : "not_required", b,
      "(6)項ロの用途の部分があれば収容人員10人以上、なければ30人以上で必要",
      { missing: f.capacity === undefined ? ["capacity"] : [], caveats: ["(6)項ロ（要介護の入所施設など）の部分があるかで基準が変わる"] });
  } else if (inList(o, ["1", "2", "3", "4", "5イ", "6イ", "6ハ", "6ニ", "9イ"])) threshold = 30;
  else if (inList(o, ["5ロ", "7", "8", "9ロ", ...range(10, 15), "16ロ", "17"])) threshold = 50;
  if (threshold === null) return verdict(e, "conditional", b, "用途の細分が分からない", { missing: ["occupancy"] });
  if (f.capacity === undefined) return verdict(e, "conditional", b, `収容人員${threshold}人以上で必要`, { missing: ["capacity"] });
  return f.capacity >= threshold
    ? verdict(e, "required", b, `収容人員${f.capacity}人（${threshold}人以上）`)
    : verdict(e, "not_required", b, `収容人員${f.capacity}人（${threshold}人未満）`);
}

// ---- 消火器具（令10条1項）----

function extinguisher({ o, f }: Ctx): Verdict {
  const e: Equipment = "extinguisher";
  const floorCaveat = "地階・無窓階・3階以上の階で床面積50㎡以上の階があれば、その階には必要（同項第五号）";
  const hazCaveat = "少量危険物・指定可燃物を貯蔵し、又は取り扱う場合は面積にかかわらず必要（同項第四号）";
  const always = inList(o, ["1イ", "2", "6イ(1)", "6イ(2)", "6イ(3)", "6ロ", "16の2", "16の3", "17", "20"]);
  if (always) return verdict(e, "required", `${ART} 第十条第一項第一号イ`, "この用途は延べ面積にかかわらず必要");
  if (inList(o, ["3"])) {
    if (f.fire_use === true)
      return verdict(e, "required", `${ART} 第十条第一項第一号ロ`, "火を使用する設備・器具がある(3)項は延べ面積にかかわらず必要", {
        caveats: ["総務省令で定める防火上有効な措置が講じられた設備・器具だけの場合は除かれる"],
      });
  }
  let threshold: number | null = null;
  let item = "";
  if (inList(o, ["1ロ", "4", "5", "6イ(4)", "6ハ", "6ニ", "9", "12", "13", "14", "3"])) {
    threshold = 150;
    item = "第二号";
  } else if (inList(o, ["7", "8", "10", "11", "15"])) {
    threshold = 300;
    item = "第三号";
  }
  if (inList(o, ["16イ", "16ロ"]))
    return verdict(e, "conditional", `${ART} 第九条・第十条`, "複合用途は用途ごとの部分に分けて判定する", { missing: ["occupancy"] });
  if (threshold === null) {
    if (always === null || inList(o, ["6イ"]) === true)
      return verdict(e, "conditional", `${ART} 第十条第一項`, "用途の細分（(6)項イの(1)〜(4)など）が分からない", { missing: ["occupancy"] });
    return verdict(e, "conditional", `${ART} 第十条第一項`, "この用途の基準は個別に確認が必要", { missing: ["occupancy"] });
  }
  const b = `${ART} 第十条第一項${item}`;
  if (inList(o, ["3"]) && f.fire_use === undefined && (f.total_area === undefined || f.total_area < 150))
    return verdict(e, "conditional", `${ART} 第十条第一項第一号ロ・第二号ロ`, "火を使用する設備・器具があれば面積にかかわらず必要、なければ延べ150㎡以上で必要", {
      missing: ["fire_use", ...(f.total_area === undefined ? (["total_area"] as const) : [])],
    });
  if (f.total_area === undefined) return verdict(e, "conditional", b, `延べ面積${threshold}㎡以上で必要`, { missing: ["total_area"] });
  if (f.total_area >= threshold) return verdict(e, "required", b, `延べ面積${f.total_area}㎡（${threshold}㎡以上）`);
  // 建物全体では不要。特定の階を聞かれていれば第五号を当てる
  if (f.floor !== undefined && (isBasement(f) || f.floor >= 3 || f.windowless === true)) {
    if (f.floor_area === undefined) return verdict(e, "conditional", `${ART} 第十条第一項第五号`, "その階の床面積50㎡以上で必要", { missing: ["floor_area"] });
    if (f.floor_area >= 50)
      return verdict(e, "required", `${ART} 第十条第一項第五号`, `地階・無窓階・3階以上の階で床面積${f.floor_area}㎡（50㎡以上）`, { scope: "その階" });
  }
  return verdict(e, "not_required", b, `延べ面積${f.total_area}㎡（${threshold}㎡未満）`, { caveats: [floorCaveat, hazCaveat] });
}

// ---- 屋内消火栓設備（令11条）----

function indoorHydrant({ o, f }: Ctx): Verdict {
  const e: Equipment = "indoor_hydrant";
  let base: number | null = null;
  let item = "";
  if (inList(o, ["1"])) [base, item] = [500, "第一号"];
  else if (inList(o, [...range(2, 10), "12", "14"])) [base, item] = [700, "第二号"];
  else if (inList(o, ["11", "15"])) [base, item] = [1000, "第三号"];
  else if (inList(o, ["16の2"])) [base, item] = [150, "第四号"];
  if (inList(o, ["16イ", "16ロ"]))
    return verdict(e, "conditional", `${ART} 第九条・第十一条`, "複合用途は用途ごとの部分に分けて判定する", { missing: ["occupancy"] });
  if (base === null) return verdict(e, "not_required", `${ART} 第十一条第一項`, "この用途は延べ面積による設置対象ではない", {
    caveats: ["指定可燃物を政令別表第四の数量の750倍以上貯蔵・取扱う場合は必要（同項第五号）"],
  });
  const b = `${ART} 第十一条第一項${item}・第二項`;
  if (f.total_area === undefined) return verdict(e, "conditional", b, `延べ面積${base}㎡以上（構造により2倍・3倍）で必要`, { missing: ["total_area"] });
  const mul = areaMultiplier(f.structure);
  const caveats = [
    "地階・無窓階・4階以上の階で一定の床面積以上の階があれば、その階には必要（同項第六号）",
    "スプリンクラー設備などを技術基準どおり設けた部分は不要（同条第四項）",
  ];
  if (mul === null) {
    if (f.total_area < base) return verdict(e, "not_required", b, `延べ面積${f.total_area}㎡（${base}㎡未満）`, { caveats });
    if (f.total_area >= base * 3) return verdict(e, "required", b, `延べ面積${f.total_area}㎡（3倍読みの${base * 3}㎡以上）`, { caveats });
    return verdict(e, "conditional", b, `構造と内装により基準が${base}㎡・${base * 2}㎡・${base * 3}㎡のいずれかになる`, { missing: ["structure"] });
  }
  const t = base * mul;
  return f.total_area >= t
    ? verdict(e, "required", b, `延べ面積${f.total_area}㎡（基準${t}㎡以上）`, { caveats: caveats.slice(1) })
    : verdict(e, "not_required", b, `延べ面積${f.total_area}㎡（基準${t}㎡未満${mul > 1 ? `、${mul}倍読み` : ""}）`, { caveats });
}

// ---- スプリンクラー設備（令12条）----

function sprinkler({ o, f }: Ctx): Verdict {
  const e: Equipment = "sprinkler";
  const shorei = "総務省令で定める部分は除いて判定する";
  const high = f.floors_above !== undefined && f.floors_above >= 11;
  // 第三号: 11階以上の特定用途
  if (high && inList(o, ["1", "2", "3", "4", "5イ", "6", "9イ", "16イ"]))
    return verdict(e, "required", `${ART} 第十二条第一項第三号`, `地階を除く階数が${f.floors_above}（11以上）`, { caveats: [shorei] });
  // 第一号: 社会福祉施設等
  if (inList(o, ["6イ(1)", "6イ(2)", "6ロ(1)", "6ロ(3)"]))
    return verdict(e, "required", `${ART} 第十二条第一項第一号`, "この用途は延べ面積にかかわらず必要", {
      assertive: false,
      caveats: ["火災発生時の延焼を抑制する機能を備える構造として総務省令で定める構造を有するものは除かれる"],
    });
  if (inList(o, ["6ロ(2)", "6ロ(4)", "6ロ(5)"])) {
    const r: Result = f.total_area !== undefined && f.total_area >= 275 ? "required" : "conditional";
    return verdict(e, r, `${ART} 第十二条第一項第一号ハ`, "介助がなければ避難できない者を主として入所させるものは面積にかかわらず、それ以外は延べ275㎡以上で必要", {
      assertive: false,
      caveats: ["延焼を抑制する構造として総務省令で定めるものは除かれる"],
      missing: r === "conditional" ? ["total_area"] : [],
    });
  }
  if (inList(o, ["6イ", "6ロ"]) === true && o.num === undefined)
    return verdict(e, "conditional", `${ART} 第十二条第一項`, "(6)項イ・ロの細分で基準が変わる", { missing: ["occupancy"] });
  // 第六号: 地下街
  if (inList(o, ["16の2"])) {
    if (f.total_area === undefined) return verdict(e, "conditional", `${ART} 第十二条第一項第六号`, "延べ1,000㎡以上で必要", { missing: ["total_area"] });
    return f.total_area >= 1000
      ? verdict(e, "required", `${ART} 第十二条第一項第六号`, `延べ面積${f.total_area}㎡（1,000㎡以上）`)
      : verdict(e, "not_required", `${ART} 第十二条第一項第六号`, `延べ面積${f.total_area}㎡（1,000㎡未満）`, {
          caveats: ["(6)項イ(1)(2)・ロの用途の部分は面積にかかわらず必要（同項第九号）"],
        });
  }
  // 第四号: 平屋建以外の特定用途
  if (inList(o, ["1", "2", "3", "4", "5イ", "6", "9イ"])) {
    const t = inList(o, ["4", "6イ(1)", "6イ(2)", "6イ(3)"]) ? 3000 : 6000;
    const b = `${ART} 第十二条第一項第四号`;
    if (f.floors_above === 1 && (f.floors_below ?? 0) === 0)
      return verdict(e, "not_required", b, "平屋建は第四号の対象外", { caveats: ["地階・無窓階・4階以上の階は階ごとの基準がある（同項第十一号）"] });
    if (f.total_area === undefined) return verdict(e, "conditional", b, `平屋建以外で床面積の合計${t}㎡以上で必要`, { missing: ["total_area"] });
    if (f.total_area >= t) {
      if (f.floors_above === undefined && f.floors_below === undefined)
        return verdict(e, "conditional", b, `平屋建以外なら床面積の合計${t}㎡以上で必要`, { missing: ["floors_above"] });
      return verdict(e, "required", b, `平屋建以外で床面積の合計${f.total_area}㎡（${t}㎡以上）`, { caveats: [shorei] });
    }
    return verdict(e, "not_required", b, `床面積の合計${f.total_area}㎡（${t}㎡未満）`, {
      caveats: ["地階・無窓階は床面積1,000㎡以上、4階以上10階以下の階は1,500㎡（(2)項・(4)項は1,000㎡）以上で、その階に必要（同項第十一号）"],
    });
  }
  if (inList(o, ["16イ", "16ロ"]))
    return verdict(e, "conditional", `${ART} 第十二条第一項第十号・第十一号`, "複合用途は特定用途の部分の床面積で判定する", { missing: ["occupancy"] });
  // 第十二号: その他の用途の11階以上の階
  if (high)
    return verdict(e, "required", `${ART} 第十二条第一項第十二号`, `地階を除く階数が${f.floors_above}`, { scope: "11階以上の階", caveats: [shorei] });
  if (f.floors_above === undefined) return verdict(e, "conditional", `${ART} 第十二条第一項第十二号`, "11階以上の階があればその階に必要", { missing: ["floors_above"] });
  return verdict(e, "not_required", `${ART} 第十二条第一項`, "この用途・規模は対象外", {
    caveats: ["(14)項のラック式倉庫、指定可燃物の大量貯蔵などは別に基準がある（同項第五号・第八号）"],
  });
}

// ---- 自動火災報知設備（令21条）----

function autoAlarm({ o, f }: Ctx): Verdict {
  const e: Equipment = "auto_alarm";
  const floorCaveats = [
    "地階・無窓階・3階以上の階で床面積300㎡以上の階があれば、その階には必要（同項第十一号）",
    "11階以上の階には必要（同項第十四号）",
  ];
  if (inList(o, ["2ニ", "5イ", "6イ(1)", "6イ(2)", "6イ(3)", "6ロ", "13ロ", "17"]))
    return verdict(e, "required", `${ART} 第二十一条第一項第一号イ`, "この用途は延べ面積にかかわらず必要");
  if (inList(o, ["6ハ"])) {
    if (f.overnight === true) return verdict(e, "required", `${ART} 第二十一条第一項第一号ロ`, "入居・宿泊させる(6)項ハは延べ面積にかかわらず必要");
    if (f.overnight === undefined) return verdict(e, "conditional", `${ART} 第二十一条第一項第一号ロ・第三号ロ`, "入居・宿泊させるなら面積にかかわらず、それ以外は延べ300㎡以上で必要", { missing: ["overnight"] });
  }
  if (inList(o, ["6イ"]) === true && o.num === undefined)
    return verdict(e, "conditional", `${ART} 第二十一条第一項`, "(6)項イの細分で基準が変わる", { missing: ["occupancy"] });
  if (inList(o, ["16の3"]))
    return verdict(e, "conditional", `${ART} 第二十一条第一項第五号`, "延べ500㎡以上で、特定用途の部分が300㎡以上なら必要", { missing: ["occupancy"] });
  let threshold: number | null = null;
  let item = "";
  if (inList(o, ["9イ"])) [threshold, item] = [200, "第二号"];
  else if (inList(o, ["1", "2イ", "2ロ", "2ハ", "3", "4", "6イ(4)", "6ニ", "16イ", "16の2", "6ハ"])) [threshold, item] = [300, "第三号"];
  else if (inList(o, ["5ロ", "7", "8", "9ロ", "10", "12", "13イ", "14"])) [threshold, item] = [500, "第四号"];
  else if (inList(o, ["11", "15"])) [threshold, item] = [1000, "第六号"];
  if (threshold === null) return verdict(e, "conditional", `${ART} 第二十一条第一項`, "この用途の基準は個別に確認が必要", { missing: ["occupancy"] });
  const b = `${ART} 第二十一条第一項${item}`;
  const assertive = !inList(o, ["5ロ"]);
  const altCaveat = inList(o, ["5ロ"]) ? ["共同住宅は、特定共同住宅等の総務省令（平成17年総務省令第40号）により、住戸用自火報などで代えられる場合がある"] : [];
  if (f.total_area === undefined) return verdict(e, "conditional", b, `延べ面積${threshold}㎡以上で必要`, { missing: ["total_area"] });
  if (f.total_area >= threshold) return verdict(e, "required", b, `延べ面積${f.total_area}㎡（${threshold}㎡以上）`, { assertive, caveats: altCaveat });
  // 第七号: 特定一階段等防火対象物
  const specific = inList(o, ["1", "2", "3", "4", "5イ", "6", "9イ"]) === true || (inList(o, ["16イ"]) === true && f.specific_use_upper === true);
  const multi = (f.floors_above ?? 0) >= 2 || (f.floors_below ?? 0) >= 1;
  if (specific && multi) {
    if (f.direct_stairs === undefined)
      return verdict(e, "conditional", `${ART} 第二十一条第一項第七号`, "避難階以外の階から直通する階段が2つ（屋外階段などは1つ）以上なければ、面積にかかわらず必要", { missing: ["direct_stairs"] });
    if (f.direct_stairs < 2)
      return verdict(e, "required", `${ART} 第二十一条第一項第七号`, "特定用途が避難階以外の階にあり、直通階段が1つ", {
        caveats: ["その階段が屋外に設けられ、又は総務省令で定める避難上有効な構造の場合は1つでよい"],
      });
  }
  if (inList(o, ["16イ"]) === true && multi && f.specific_use_upper === undefined)
    return verdict(e, "conditional", b, `延べ面積${f.total_area}㎡（${threshold}㎡未満）。特定用途の部分が避難階以外にあり直通階段が1つなら必要（同項第七号）`, {
      missing: ["specific_use_upper", ...(f.direct_stairs === undefined ? (["direct_stairs"] as const) : [])],
    });
  return verdict(e, "not_required", b, `延べ面積${f.total_area}㎡（${threshold}㎡未満）`, { caveats: floorCaveats });
}

// ---- 漏電火災警報器（令22条）----

function leakAlarm({ o, f }: Ctx): Verdict {
  const e: Equipment = "leak_alarm";
  const b0 = `${ART} 第二十二条第一項`;
  if (f.lath_wall === false) return verdict(e, "not_required", b0, "準不燃材料以外の下地の鉄網入りの壁・床・天井（ラスモルタル等）がない");
  let threshold: number | null = null;
  let item = "";
  if (inList(o, ["17"])) [threshold, item] = [0, "第一号"];
  else if (inList(o, ["5", "9"])) [threshold, item] = [150, "第二号"];
  else if (inList(o, ["1", "2", "3", "4", "6", "12", "16の2"])) [threshold, item] = [300, "第三号"];
  else if (inList(o, ["7", "8", "10", "11"])) [threshold, item] = [500, "第四号"];
  else if (inList(o, ["14", "15"])) [threshold, item] = [1000, "第五号"];
  else if (inList(o, ["16イ"])) [threshold, item] = [500, "第六号"];
  const b = `${b0}${item}`;
  const ampCaveat = inList(o, [...range(1, 6), "15", "16"]) ? ["契約電流容量が50Aを超える建築物は、面積にかかわらず必要（同項第七号）"] : [];
  if (threshold === null) return verdict(e, "conditional", b0, "この用途の基準は個別に確認が必要", { missing: ["occupancy"] });
  const areaOk = f.total_area === undefined ? null : f.total_area >= threshold;
  const ampOk = ampCaveat.length > 0 && f.contract_amperes !== undefined ? f.contract_amperes > 50 : null;
  if (f.lath_wall === undefined)
    return verdict(e, "conditional", b, "ラスモルタル等（準不燃材料以外の下地の鉄網入りの壁・床・天井）がある建物だけが対象", { missing: ["lath_wall"] });
  if (areaOk || ampOk) return verdict(e, "required", ampOk && !areaOk ? `${b0}第七号` : b, areaOk ? `延べ面積${f.total_area}㎡（${threshold}㎡以上）` : `契約電流容量${f.contract_amperes}A（50A超）`,
    { caveats: inList(o, ["16イ"]) ? ["(16)項イは、特定用途の部分の床面積の合計が300㎡以上であることも必要"] : [] });
  if (areaOk === null) return verdict(e, "conditional", b, `延べ面積${threshold}㎡以上で必要`, { missing: ["total_area"] });
  return verdict(e, "not_required", b, `延べ面積${f.total_area}㎡（${threshold}㎡未満）`, { caveats: ampOk === false ? [] : ampCaveat });
}

// ---- 非常警報器具・非常警報設備（令24条）----

function emergencyAlarm({ o, f }: Ctx): Verdict {
  const e: Equipment = "emergency_alarm";
  const exempt = ["自動火災報知設備を技術基準どおり設けた場合、その有効範囲内は不要"];
  const cap = f.capacity;
  // 第三項（非常ベル＋放送設備 または 自動式サイレン＋放送設備）
  const bothDetail = "非常ベル＋放送設備、または自動式サイレン＋放送設備";
  if (inList(o, ["16の2", "16の3"])) return verdict(e, "required", `${ART} 第二十四条第三項第一号`, "地下街・準地下街", { detail: bothDetail });
  if ((f.floors_above ?? 0) >= 11 || (f.floors_below ?? 0) >= 3)
    return verdict(e, "required", `${ART} 第二十四条第三項第二号`, "地階を除く階数が11以上、又は地階の階数が3以上", { detail: bothDetail });
  if (cap !== undefined) {
    if (inList(o, ["16イ"]) && cap >= 500) return verdict(e, "required", `${ART} 第二十四条第三項第三号`, `収容人員${cap}人（500人以上）`, { detail: bothDetail });
    if (inList(o, ["1", "2", "3", "4", "5イ", "6", "9イ"]) && cap >= 300)
      return verdict(e, "required", `${ART} 第二十四条第三項第四号`, `収容人員${cap}人（300人以上）`, { detail: bothDetail });
    if (inList(o, ["5ロ", "7", "8"]) && cap >= 800) return verdict(e, "required", `${ART} 第二十四条第三項第四号`, `収容人員${cap}人（800人以上）`, { detail: bothDetail });
  }
  if (cap === undefined) return verdict(e, "conditional", `${ART} 第二十四条`, "収容人員で決まる", { missing: ["capacity"] });
  // 第二項（非常ベル・自動式サイレン・放送設備のいずれか）
  const oneDetail = "非常ベル、自動式サイレン又は放送設備のいずれか";
  if (inList(o, ["5イ", "6イ", "9イ"]) && cap >= 20)
    return verdict(e, "required", `${ART} 第二十四条第二項第一号`, `収容人員${cap}人（20人以上）`, { detail: oneDetail, caveats: exempt });
  if (inList(o, [...range(1, 17), "16イ", "16ロ"]) && cap >= 50)
    return verdict(e, "required", `${ART} 第二十四条第二項第二号`, `収容人員${cap}人（50人以上）`, { detail: oneDetail, caveats: exempt });
  // 第一項（非常警報器具）
  if (inList(o, ["4", "6ロ", "6ハ", "6ニ", "9ロ", "12"]) && cap >= 20)
    return verdict(e, "required", `${ART} 第二十四条第一項`, `収容人員${cap}人（20人以上50人未満）`, { detail: "非常警報器具", caveats: exempt });
  return verdict(e, "not_required", `${ART} 第二十四条`, `収容人員${cap}人で、この用途の基準に達しない`, {
    caveats: ["地階・無窓階の収容人員が20人以上なら非常ベル等が必要（同条第二項第二号）"],
  });
}

// ---- 避難器具（令25条）。階ごとに判定する ----

function evacDevice({ o, f }: Ctx): Verdict {
  const e: Equipment = "evac_device";
  const b0 = `${ART} 第二十五条第一項`;
  if (f.floor === undefined || f.floor_capacity === undefined)
    return verdict(e, "conditional", b0, "階ごとに、その階の収容人員で判定する", {
      missing: [...(f.floor === undefined ? (["floor"] as const) : []), ...(f.floor_capacity === undefined ? (["floor_capacity"] as const) : [])],
    });
  if (f.floor === 1) return verdict(e, "not_required", b0, "避難階（通常は1階）は対象外");
  if (f.floor >= 11) return verdict(e, "not_required", b0, "11階以上の階は対象外");
  const cap = f.floor_capacity;
  const upperOrBasement = f.floor >= 2 || f.floor < 0;
  const hits: { item: string; t: number; lowered: number | null }[] = [];
  if (inList(o, ["6"]) && upperOrBasement) hits.push({ item: "第一号", t: 20, lowered: 10 });
  if (inList(o, ["5"]) && upperOrBasement) hits.push({ item: "第二号", t: 30, lowered: 10 });
  if (inList(o, ["1", "2", "3", "4", ...range(7, 11)]) && upperOrBasement && !(f.floor === 2 && f.structure?.startsWith("fireproof")))
    hits.push({ item: "第三号", t: 50, lowered: null });
  if (inList(o, ["12", "15"]) && (f.floor >= 3 || f.floor < 0))
    hits.push({ item: "第四号", t: (f.windowless || f.floor < 0) ? 100 : 150, lowered: null });
  for (const h of hits) {
    if (cap >= h.t) return verdict(e, "required", `${b0}${h.item}`, `その階の収容人員${cap}人（${h.t}人以上）`, { scope: "その階" });
    if (h.lowered !== null && cap >= h.lowered) {
      if (f.lower_floor_risky_use === true)
        return verdict(e, "required", `${b0}${h.item}`, `下階に一定の用途があり、その階の収容人員${cap}人（10人以上）`, { scope: "その階" });
      if (f.lower_floor_risky_use === undefined)
        return verdict(e, "conditional", `${b0}${h.item}`, `下階に(1)〜(4)・(9)・(12)イ・(13)イ・(14)・(15)項の用途があれば10人以上で必要`, { missing: ["lower_floor_risky_use"] });
    }
  }
  // 第五号: 直通階段が2未満の階
  const minFloor = inList(o, ["2", "3"]) ? 2 : 3;
  if (f.floor >= minFloor && cap >= 10) {
    if (f.direct_stairs === undefined)
      return verdict(e, "conditional", `${b0}第五号`, "直通階段が2つ以上なければ収容人員10人以上で必要", { missing: ["direct_stairs"] });
    if (f.direct_stairs < 2) return verdict(e, "required", `${b0}第五号`, `直通階段が${f.direct_stairs}つで、その階の収容人員${cap}人（10人以上）`, { scope: "その階" });
  }
  return verdict(e, "not_required", b0, `その階の収容人員${cap}人で、この用途の基準に達しない`);
}

// ---- 誘導灯・誘導標識（令26条）----

function guideLight({ o, f }: Ctx): Verdict {
  const e: Equipment = "guide_light";
  const b = `${ART} 第二十六条第一項`;
  const exempt = ["避難が容易であると認められるもので総務省令で定めるものは除かれる（同項ただし書）"];
  if (inList(o, ["1", "2", "3", "4", "5イ", "6", "9", "16イ", "16の2", "16の3"]))
    return verdict(e, "required", `${b}第一号・第二号`, "避難口誘導灯と通路誘導灯が必要", {
      assertive: false,
      detail: inList(o, ["1"]) ? "避難口誘導灯・通路誘導灯・客席誘導灯" : "避難口誘導灯・通路誘導灯",
      caveats: exempt,
    });
  if (inList(o, ["5ロ", "7", "8", ...range(10, 15), "16ロ"])) {
    const high = (f.floors_above ?? 0) >= 11;
    const below = (f.floors_below ?? 0) >= 1;
    if (high || below)
      return verdict(e, "required", `${b}第一号・第二号`, "地階・無窓階・11階以上の部分に誘導灯が必要", { assertive: false, scope: "地階・無窓階・11階以上の部分", caveats: exempt });
    if (f.floors_above === undefined || f.floors_below === undefined)
      return verdict(e, "conditional", `${b}第一号・第二号`, "地階・無窓階・11階以上の部分にだけ誘導灯が必要。誘導標識は全体に必要", { missing: ["floors_above", "floors_below"] });
    return verdict(e, "not_required", `${b}第四号`, "誘導灯は不要（地階・無窓階・11階以上の部分がない）。誘導標識は必要", {
      detail: "誘導標識",
      caveats: ["無窓階があれば、その階には誘導灯が必要"],
    });
  }
  if (inList(o, ["17", "18", "19", "20"])) return verdict(e, "not_required", b, "この用途は対象外");
  return verdict(e, "conditional", b, "用途の細分が分からない", { missing: ["occupancy"] });
}

// ---- 消防機関へ通報する火災報知設備（令23条）----

function fireReport({ o, f }: Ctx): Verdict {
  const e: Equipment = "fire_report";
  const phone = "消防機関へ常時通報できる電話を設けたときは設置しないことができる（同条第3項）";
  if (inList(o, ["6イ(1)", "6イ(2)", "6イ(3)", "6ロ", "16の2", "16の3"]))
    return verdict(e, "required", `${ART} 第二十三条第一項第一号`, "この用途は延べ面積にかかわらず必要", {
      caveats: inList(o, ["16の2", "16の3"]) ? [phone] : [],
    });
  let t: number | null = null;
  let item = "";
  if (inList(o, ["1", "2", "4", "5イ", "6イ(4)", "6ハ", "6ニ", "12", "17"])) [t, item] = [500, "第二号"];
  else if (inList(o, ["3", "5ロ", ...range(7, 11), "13", "14", "15"])) [t, item] = [1000, "第三号"];
  if (inList(o, ["6イ", "6ロ"]) === null || (inList(o, ["6イ"]) === true && o.num === undefined))
    return verdict(e, "conditional", `${ART} 第二十三条第一項`, "(6)項イの細分で基準が変わる", { missing: ["occupancy"] });
  if (inList(o, ["16イ", "16ロ"])) return verdict(e, "conditional", `${ART} 第九条・第二十三条`, "複合用途は用途ごとの部分に分けて判定する", { missing: ["occupancy"] });
  if (t === null) return verdict(e, "not_required", `${ART} 第二十三条第一項`, "この用途は対象外");
  const b = `${ART} 第二十三条第一項${item}`;
  const noPhoneExempt = inList(o, ["5イ", "6イ(4)", "6ハ"]) === true;
  if (f.total_area === undefined) return verdict(e, "conditional", b, `延べ面積${t}㎡以上で必要`, { missing: ["total_area"] });
  if (f.total_area < t) return verdict(e, "not_required", b, `延べ面積${f.total_area}㎡（${t}㎡未満）`);
  return verdict(e, "required", b, `延べ面積${f.total_area}㎡（${t}㎡以上）`, {
    assertive: noPhoneExempt,
    caveats: noPhoneExempt ? [] : [phone],
  });
}

// ---- 屋外消火栓設備（令19条）----

function outdoorHydrant({ o, f }: Ctx): Verdict {
  const e: Equipment = "outdoor_hydrant";
  const b = `${ART} 第十九条第一項`;
  if (!inList(o, [...range(1, 15), "17", "18"]) || inList(o, ["16イ", "16ロ", "16の2", "16の3"]))
    return verdict(e, "not_required", b, "この用途の建築物は第十九条の対象外（複合用途は用途ごとに確認）");
  const t = f.building_class === "fireproof" ? 9000 : f.building_class === "quasi_fireproof" ? 6000 : f.building_class === "other" ? 3000 : null;
  const area = f.lower_floors_area ?? (f.floors_above === 1 ? f.total_area : undefined);
  if (area === undefined) {
    if (f.total_area !== undefined && f.total_area < 3000) return verdict(e, "not_required", b, `延べ面積${f.total_area}㎡で、1階・2階の床面積の合計が3,000㎡に届かない`);
    return verdict(e, "conditional", b, "1階（2階建以上は1階と2階）の床面積の合計が、耐火建築物9,000㎡・準耐火建築物6,000㎡・その他3,000㎡以上で必要", { missing: ["lower_floors_area", ...(t === null ? (["building_class"] as const) : [])] });
  }
  if (area < 3000) return verdict(e, "not_required", b, `1階・2階の床面積の合計${area}㎡（3,000㎡未満）`);
  if (t === null) return verdict(e, "conditional", b, `1階・2階の床面積の合計${area}㎡。建物の構造で基準（9,000㎡・6,000㎡・3,000㎡）が変わる`, { missing: ["building_class"] });
  return area >= t
    ? verdict(e, "required", b, `1階・2階の床面積の合計${area}㎡（基準${t}㎡以上）`, { caveats: ["同一敷地内の2以上の建築物は、延焼のおそれのある部分の位置関係で1つの建築物とみなす場合がある（同条第2項）"] })
    : verdict(e, "not_required", b, `1階・2階の床面積の合計${area}㎡（基準${t}㎡未満）`);
}

// ---- 消防用水（令27条）----

function fireWater({ o, f }: Ctx): Verdict {
  const e: Equipment = "fire_water";
  const b = `${ART} 第二十七条第一項`;
  const tall = f.height !== undefined && f.total_area !== undefined && f.height > 31 && f.total_area >= 25000;
  if (tall) return verdict(e, "required", `${b}第二号`, `高さ${f.height}m（31m超）で延べ面積${f.total_area}㎡（25,000㎡以上）`, { caveats: ["延べ面積は地階を除いて計算する"] });
  if (f.total_area !== undefined && f.total_area < 5000) return verdict(e, "not_required", b, `延べ面積${f.total_area}㎡で、第一号・第二号の規模に届かない`);
  if (!inList(o, [...range(1, 15), "17", "18"])) {
    if (f.height !== undefined && f.height <= 31) return verdict(e, "not_required", b, "この用途は第一号の対象外で、高さ31m以下");
    return verdict(e, "conditional", `${b}第二号`, "高さ31m超かつ延べ面積（地階を除く）25,000㎡以上なら必要", { missing: ["height", "total_area"] });
  }
  return verdict(e, "conditional", b, "敷地面積20,000㎡以上で1階・2階の床面積が耐火15,000㎡・準耐火10,000㎡・その他5,000㎡以上、又は高さ31m超かつ延べ25,000㎡以上なら必要", {
    missing: [...(f.site_area === undefined ? (["site_area"] as const) : []), ...(f.lower_floors_area === undefined ? (["lower_floors_area"] as const) : []), ...(f.height === undefined ? (["height"] as const) : [])],
  });
}

// ---- 排煙設備（令28条）----

function smokeControl({ o, f }: Ctx): Verdict {
  const e: Equipment = "smoke_control";
  const b = `${ART} 第二十八条第一項`;
  if (inList(o, ["16の2"])) {
    if (f.total_area === undefined) return verdict(e, "conditional", `${b}第一号`, "地下街は延べ1,000㎡以上で必要", { missing: ["total_area"] });
    return f.total_area >= 1000 ? verdict(e, "required", `${b}第一号`, `地下街で延べ面積${f.total_area}㎡（1,000㎡以上）`) : verdict(e, "not_required", `${b}第一号`, `地下街で延べ面積${f.total_area}㎡（1,000㎡未満）`);
  }
  const caveats: string[] = [];
  if (inList(o, ["1"])) caveats.push("舞台部の床面積が500㎡以上なら舞台部に必要（同項第二号）");
  if (inList(o, ["2", "4", "10", "13"])) {
    if (f.floor !== undefined && (f.floor < 0 || f.windowless) && f.floor_area !== undefined)
      return f.floor_area >= 1000
        ? verdict(e, "required", `${b}第三号`, `地階・無窓階で床面積${f.floor_area}㎡（1,000㎡以上）`, { scope: "その階" })
        : verdict(e, "not_required", `${b}第三号`, `地階・無窓階で床面積${f.floor_area}㎡（1,000㎡未満）`);
    if (f.total_area !== undefined && f.total_area < 1000) return verdict(e, "not_required", b, `延べ面積${f.total_area}㎡で、床面積1,000㎡以上の地階・無窓階はない`);
    return verdict(e, "conditional", `${b}第三号`, "地階・無窓階で床面積1,000㎡以上の階があれば、その階に必要", { missing: ["floor", "floor_area"] });
  }
  return verdict(e, "not_required", b, "この用途は消防法施行令の排煙設備の対象外", { caveats: [...caveats, "建築基準法の排煙設備は別に必要な場合がある"] });
}

// ---- 連結送水管（令29条）----

function standpipe({ o, f }: Ctx): Verdict {
  const e: Equipment = "standpipe";
  const b = `${ART} 第二十九条第一項`;
  if (inList(o, ["18"])) return verdict(e, "required", `${b}第四号`, "アーケードは規模にかかわらず必要");
  if (inList(o, ["16の2"]) && f.total_area !== undefined && f.total_area >= 1000) return verdict(e, "required", `${b}第三号`, `地下街で延べ面積${f.total_area}㎡（1,000㎡以上）`);
  if (f.floors_above === undefined) return verdict(e, "conditional", b, "地上7階以上、又は地上5階以上で延べ6,000㎡以上なら必要", { missing: ["floors_above"] });
  if (f.floors_above >= 7) return verdict(e, "required", `${b}第一号`, `地階を除く階数が${f.floors_above}（7以上）`);
  if (f.floors_above >= 5) {
    if (f.total_area === undefined) return verdict(e, "conditional", `${b}第二号`, "地上5階以上で延べ6,000㎡以上なら必要", { missing: ["total_area"] });
    if (f.total_area >= 6000) return verdict(e, "required", `${b}第二号`, `地上${f.floors_above}階で延べ面積${f.total_area}㎡（6,000㎡以上）`);
  }
  return verdict(e, "not_required", b, `地上${f.floors_above}階${f.total_area !== undefined ? `、延べ面積${f.total_area}㎡` : ""}で基準に届かない`, { caveats: ["道路の用に供される部分がある場合は必要（同項第五号）"] });
}

// ---- 非常コンセント設備（令29条の2）----

function emergencyOutlet({ o, f }: Ctx): Verdict {
  const e: Equipment = "emergency_outlet";
  const b = `${ART} 第二十九条の二第一項`;
  if (inList(o, ["16の2"]) && f.total_area !== undefined && f.total_area >= 1000) return verdict(e, "required", `${b}第二号`, `地下街で延べ面積${f.total_area}㎡（1,000㎡以上）`);
  if (f.floors_above === undefined) return verdict(e, "conditional", b, "地上11階以上なら必要", { missing: ["floors_above"] });
  return f.floors_above >= 11
    ? verdict(e, "required", `${b}第一号`, `地階を除く階数が${f.floors_above}（11以上）`, { scope: "11階以上の階" })
    : verdict(e, "not_required", b, `地上${f.floors_above}階（11階未満）`);
}

const JUDGES: Record<Equipment, (c: Ctx) => Verdict> = {
  fire_manager: fireManager,
  extinguisher,
  indoor_hydrant: indoorHydrant,
  sprinkler,
  auto_alarm: autoAlarm,
  leak_alarm: leakAlarm,
  emergency_alarm: emergencyAlarm,
  evac_device: evacDevice,
  guide_light: guideLight,
  fire_report: fireReport,
  outdoor_hydrant: outdoorHydrant,
  fire_water: fireWater,
  smoke_control: smokeControl,
  standpipe,
  emergency_outlet: emergencyOutlet,
};

/** 用途が list のどれかに当たるか（細分が分からなければ null） */
export function occupancyIn(raw: string, list: string[]): boolean | null {
  const o = parseOccupancy(raw);
  return o ? inList(o, list) : null;
}

// ---- 条例による上乗せ（消防法第17条第2項）----
// 京都市火災予防条例 第5章（第36条〜第45条の3）。国の判定が「不要」「条件次第」のときに、条例の基準で上書きする。
// 条例第46条により、消防長・消防署長が認めた場合は適用されない（caveats に書く）。

const K_JO = "京都市火災予防条例";
const K_TOKUREI = "消防長・消防署長が同等以上の効力があると認めた場合は適用されない（京都市火災予防条例第46条）";

function kyotoOverlay(base: Verdict, o: Occ, f: Facts): Verdict {
  if (base.result === "required" && base.assertive) {
    if (base.equipment === "extinguisher")
      return { ...base, caveats: [...base.caveats, "変電設備・ボイラー室・火花を生じる設備のある場所などには、別に消火器を1個以上置く（京都市火災予防条例第36条第2項）"] };
    return base;
  }
  const up = (result: Result, basis: string, reason: string, extra: Partial<Verdict> = {}): Verdict => ({
    ...base,
    result,
    basis,
    reason,
    assertive: extra.assertive ?? true,
    scope: extra.scope,
    caveats: [...(extra.caveats ?? []), K_TOKUREI],
    missing: extra.missing ?? [],
  });
  switch (base.equipment) {
    case "extinguisher": {
      if (inList(o, ["16イ", "16ロ"]) && f.total_area !== undefined && f.total_area >= 150)
        return up("required", `${K_JO} 第36条第1項`, `複合用途で延べ面積${f.total_area}㎡（150㎡以上）。(3)〜(6)・(9)・(12)〜(15)項の用途の部分ごとに消火器を1個以上置く`, { assertive: false, caveats: ["該当する用途の部分がなければ、この条は当たらない"] });
      return { ...base, caveats: [...base.caveats, "変電設備・ボイラー室・火花を生じる設備のある場所などには、別に消火器を1個以上置く（京都市火災予防条例第36条第2項）"] };
    }
    case "indoor_hydrant": {
      if (inList(o, ["16イ", "16ロ"]) && f.total_area !== undefined) {
        const mul = areaMultiplier(f.structure);
        if (mul === null) {
          if (f.total_area >= 3000) return up("required", `${K_JO} 第38条第1項第1号・第2項`, `複合用途で延べ面積${f.total_area}㎡（3倍読みの3,000㎡以上）`);
          if (f.total_area >= 1000) return up("conditional", `${K_JO} 第38条第1項第1号・第2項`, "複合用途は延べ1,000㎡以上で必要。構造と内装で基準が2倍・3倍になる", { missing: ["structure"] });
        } else if (f.total_area >= 1000 * mul) return up("required", `${K_JO} 第38条第1項第1号・第2項`, `複合用途で延べ面積${f.total_area}㎡（基準${1000 * mul}㎡以上）`);
      }
      if (f.floors_above !== undefined && f.floors_above >= 5)
        return up("required", `${K_JO} 第38条第1項第2号`, `地階を除く階数が${f.floors_above}（5以上）`, {
          assertive: f.structure === "other",
          caveats: ["特定主要構造部が耐火構造などで、5階以上の部分の床面積の合計が100㎡（内装が準不燃なら200㎡）以下の建物は除かれる"],
        });
      return base;
    }
    case "sprinkler": {
      if (f.height !== undefined && f.height > 31) return up("required", `${K_JO} 第39条第1項第4号`, `高さ${f.height}m（31m超）`, { scope: "高さ31mを超える部分" });
      if (inList(o, ["5ロ", "7", "8", "12イ"]) && f.floor !== undefined && (f.floor < 0 || f.windowless) && f.floor_area !== undefined && f.floor_area >= 2000)
        return up("required", `${K_JO} 第39条第1項第2号`, `地階・無窓階で床面積${f.floor_area}㎡（2,000㎡以上）`, { scope: "その階" });
      if (inList(o, ["12ロ"]) && f.floor !== undefined && f.floor_area !== undefined && f.floor_area >= ((f.floor < 0 || f.windowless) ? 500 : 1000))
        return up("required", `${K_JO} 第39条第1項第1号`, `映画スタジオ等の階で床面積${f.floor_area}㎡`, { scope: "その階" });
      if (f.height === undefined && f.floors_above !== undefined && f.floors_above >= 9 && base.result === "not_required")
        return up("conditional", `${K_JO} 第39条第1項第4号`, "高さ31mを超える部分があれば、その部分に必要", { missing: ["height"] });
      return base;
    }
    case "evac_device": {
      if (inList(o, ["1", "2", "3", "4", ...range(7, 16), "16イ", "16ロ"]) && f.floor !== undefined && f.floor >= 6 && f.floor <= 10 && f.floor_capacity !== undefined && f.floor_capacity >= 30)
        return up("required", `${K_JO} 第43条第1項`, `6階以上の階で収容人員${f.floor_capacity}人（30人以上）`, { scope: "その階" });
      return base;
    }
    case "standpipe": {
      if (inList(o, ["2", "4", "10", "13", "16イ"]) && f.floor !== undefined && (f.floor < 0 || (f.windowless && f.floor >= 3)) && f.floor_area !== undefined && f.floor_area >= 1000)
        return up("required", `${K_JO} 第45条第1項第1号`, `地階・無窓階（1階・2階を除く）で床面積${f.floor_area}㎡（1,000㎡以上）`, { scope: "その階", assertive: !inList(o, ["16イ"]) });
      return { ...base, caveats: [...base.caveats, "屋上をヘリコプターの発着場や駐車場に使う場合は必要（京都市火災予防条例第45条第1項第2号）"] };
    }
    case "emergency_outlet": {
      if (inList(o, range(1, 16)) && f.floor !== undefined && f.floor < 0 && f.floor_area !== undefined && f.floor_area >= 1000)
        return up("required", `${K_JO} 第45条の2第1項`, `地階の床面積${f.floor_area}㎡（地階の合計1,000㎡以上）`, { scope: "地階" });
      if (base.result === "not_required") return { ...base, caveats: [...base.caveats, "地階の床面積の合計が1,000㎡以上なら地階に必要（京都市火災予防条例第45条の2）"] };
      return base;
    }
    default:
      return base;
  }
}

// 東京都の火災予防条例（昭和37年東京都条例第65号）第5章（第35条〜第47条、東京都例規集）。
// 適用は東京消防庁管内（特別区と、消防事務を委託した多摩地区の市町村）。方式は kyotoOverlay と同じ。
// 第47条により、消防署長が認めた場合は適用されない（caveats に書く）。

const T_JO = "火災予防条例（東京都）";
const T_TOKUREI = "消防署長が、火災の発生・延焼のおそれが著しく少ない、又は同等以上の効力があると認めた場合は適用されない（火災予防条例（東京都）第四十七条）";
const T_EXT_PLACES = "火花を生ずる設備、変電設備・発電設備、ボイラー室・サウナ室など多量の火気を使用する場所などには、別に消火器具を設ける（火災予防条例（東京都）第三十六条第二項）。一定規模以上の変電設備・発電設備のある場所には大型消火器も必要（同第三十七条）";

// 特定主要構造部が耐火構造か、準耐火建築物（建基法2条9号の3イ・ロ）に当たるか。分からなければ null
function tokyoFireResistant(f: Facts): boolean | null {
  if (f.building_class === "fireproof" || f.building_class === "quasi_fireproof") return true;
  if (f.structure !== undefined && f.structure !== "other") return true;
  if (f.building_class === "other") return false;
  return null;
}

function tokyoOverlay(base: Verdict, o: Occ, f: Facts): Verdict {
  const note = (v: Verdict, ...cs: string[]): Verdict => ({ ...v, caveats: [...v.caveats, ...cs] });
  if (base.result === "required" && base.assertive) {
    if (base.equipment === "extinguisher") return note(base, T_EXT_PLACES);
    return base;
  }
  const up = (result: Result, basis: string, reason: string, extra: Partial<Verdict> = {}): Verdict => ({
    ...base,
    result,
    basis,
    reason,
    assertive: extra.assertive ?? true,
    scope: extra.scope,
    detail: extra.detail ?? base.detail,
    caveats: [...(extra.caveats ?? []), T_TOKUREI],
    missing: extra.missing ?? [],
  });
  const basement4 = f.floor !== undefined && f.floor <= -4;
  switch (base.equipment) {
    case "extinguisher": {
      if (inList(o, ["16イ", "16ロ"]) && f.total_area !== undefined && f.total_area >= 150)
        return up("required", `${T_JO} 第三十六条第一項`, `複合用途で延べ面積${f.total_area}㎡（150㎡以上）。(3)〜(6)・(9)・(12)〜(15)項の用途の部分があれば消火器具が必要`, {
          assertive: false,
          caveats: ["該当する用途の部分がなければ、この条は当たらない", T_EXT_PLACES],
        });
      return note(base, T_EXT_PLACES);
    }
    case "indoor_hydrant": {
      if (inList(o, ["16イ", "16ロ"]) && f.total_area !== undefined) {
        const mul = areaMultiplier(f.structure);
        const b = `${T_JO} 第三十八条第一項第一号`;
        if (mul === null) {
          if (f.total_area >= 3000) return up("required", b, `複合用途で延べ面積${f.total_area}㎡（3倍読みの3,000㎡以上）`);
          if (f.total_area >= 1000) return up("conditional", b, "複合用途は延べ1,000㎡以上で必要。構造と内装で基準が2,000㎡・3,000㎡になる", { missing: ["structure"] });
        } else if (f.total_area >= 1000 * mul) return up("required", b, `複合用途で延べ面積${f.total_area}㎡（基準${1000 * mul}㎡以上）`);
      }
      if (f.floors_above !== undefined && f.floors_above >= 5)
        return up("required", `${T_JO} 第三十八条第一項第二号`, `地階を除く階数が${f.floors_above}（5以上）`, {
          assertive: f.structure === "other",
          caveats: ["特定主要構造部が耐火構造か主要構造部が不燃材料で、5階以上の階の床面積の合計が150㎡（耐火構造で内装が準不燃なら300㎡）以下のもの、又は5階以上の部分が150㎡（同300㎡）以内ごとに耐火構造の床・壁・防火戸で区画されたものは除かれる"],
        });
      if (base.result === "not_required")
        return note(base, "紙類等を別表第七の数量の750倍以上貯蔵・取扱う場合は必要（火災予防条例（東京都）第三十八条第一項第三号）");
      return base;
    }
    case "sprinkler": {
      if (f.height !== undefined && f.height > 31)
        return up("required", `${T_JO} 第三十九条第一項第五号`, `高さ${f.height}m（31m超）`, { scope: "地盤面からの高さが31mを超える階" });
      if (f.floor !== undefined && f.floor_area !== undefined) {
        const lowOrWindowless = f.floor < 0 || f.windowless === true;
        if (inList(o, ["12ロ"]) && f.floor_area >= (lowOrWindowless || f.floor >= 4 ? 300 : 500))
          return up("required", `${T_JO} 第三十九条第一項第一号`, `映画・テレビの撮影スタジオのある階で床面積${f.floor_area}㎡（${lowOrWindowless || f.floor >= 4 ? "地階・無窓階・4階以上は300" : "500"}㎡以上）`, {
            scope: "その階",
            assertive: false,
            caveats: ["床面積はスタジオ部分（接続する大道具室・小道具室を含む）の合計で判定する"],
          });
        if (inList(o, ["5ロ", "7", "8", "12イ"]) && lowOrWindowless && f.floor_area >= 2000)
          return up("required", `${T_JO} 第三十九条第一項第三号`, `地階・無窓階で床面積${f.floor_area}㎡（2,000㎡以上）`, { scope: "その階" });
        if (inList(o, ["16イ", "16ロ"]) && lowOrWindowless && f.floor_area >= 2000)
          return up("conditional", `${T_JO} 第三十九条第一項第四号`, "複合用途の地階・無窓階は、(5)項ロ・(7)・(8)・(12)項の部分の床面積の合計が2,000㎡以上なら必要", { scope: "その階", missing: ["occupancy"] });
        if (basement4) {
          const specific = inList(o, ["1", "2", "3", "4", "5イ", "6", "9イ", "16イ"]) === true;
          const t = specific ? 1000 : 2000;
          if (f.floor_area >= t)
            return up("required", `${T_JO} 第三十九条第一項${specific ? "第四号の二" : "第四号の三"}`, `地下4階以下の階で床面積${f.floor_area}㎡（地下4階以下の合計${t.toLocaleString()}㎡以上）`, {
              scope: "地下4階以下の階",
              assertive: !inList(o, ["16イ"]),
              caveats: inList(o, ["16イ"]) ? ["小規模特定用途複合防火対象物は基準が2,000㎡になる（同号の三）"] : [],
            });
        }
      }
      if (f.height === undefined && f.floors_above !== undefined && f.floors_above >= 9 && base.result === "not_required")
        return up("conditional", `${T_JO} 第三十九条第一項第五号`, "地盤面からの高さが31mを超える階があれば、その階に必要", { missing: ["height"] });
      if (inList(o, ["10"])) return note(base, "地階に乗降場がある鉄道の停車場は、地階の停車場の部分に必要（火災予防条例（東京都）第三十九条第一項第四号の四）");
      return base;
    }
    case "auto_alarm": {
      const fr = tokyoFireResistant(f);
      if (inList(o, ["5ロ"]) && f.total_area !== undefined && f.total_area >= 200) {
        const b = `${T_JO} 第四十一条第一項第一号`;
        if (fr === false) return up("required", b, `共同住宅で耐火構造・準耐火建築物でなく、延べ面積${f.total_area}㎡（200㎡以上）`);
        if (fr === null) return up("conditional", b, "共同住宅は、特定主要構造部が耐火構造でも準耐火建築物（イ・ロ）でもなければ延べ200㎡以上で必要", { missing: ["building_class"] });
      }
      if (inList(o, ["16ロ"]) && f.total_area !== undefined) {
        if (f.total_area >= 1000) return up("required", `${T_JO} 第四十一条第一項第三号`, `(16)項ロで延べ面積${f.total_area}㎡（1,000㎡以上）`);
        if (f.total_area >= 300 && fr !== true)
          return up("conditional", `${T_JO} 第四十一条第一項第二号`, "耐火構造・準耐火建築物でない(16)項ロで、2階以上の階を共同住宅に使うものは延べ300㎡以上で必要", {
            missing: fr === null ? ["building_class"] : [],
            assertive: false,
          });
      }
      if (base.result === "not_required")
        return note(base, "紙類等を別表第七の数量の500倍以上貯蔵・取扱う場合は必要（火災予防条例（東京都）第四十一条第一項第四号）");
      return base;
    }
    case "emergency_alarm":
      if (inList(o, ["10"])) return note(base, "地階に乗降場がある車両の停車場は、非常ベル＋放送設備又は自動式サイレン＋放送設備が必要（火災予防条例（東京都）第四十三条の二）");
      return base;
    case "evac_device": {
      if (inList(o, ["1", "2", "3", "4", ...range(7, 16), "16イ", "16ロ"]) && f.floor !== undefined && f.floor >= 6 && f.floor_capacity !== undefined && f.floor_capacity >= 30)
        return up("required", `${T_JO} 第四十四条第一項`, `6階以上の階で収容人員${f.floor_capacity}人（30人以上）`, { scope: "その階" });
      return base;
    }
    case "guide_light": {
      if (inList(o, ["12"]) && f.total_area !== undefined && f.total_area >= 300)
        return up("required", `${T_JO} 第四十五条第一項第二号`, `工場・作業場等で延べ面積${f.total_area}㎡（300㎡以上）`, {
          assertive: false,
          detail: "避難口誘導灯",
          caveats: ["避難が容易な部分として省令の例により不要とされた部分は除かれる", "通路誘導灯は、地階・無窓階・11階以上の部分にだけ必要（消防法施行令第二十六条）"],
        });
      if (inList(o, ["7"]) && (f.total_area === undefined || f.total_area >= 300))
        return note(base, "夜間に授業を行う課程を置く学校で延べ300㎡以上なら、避難口誘導灯と通路誘導灯が必要（火災予防条例（東京都）第四十五条第一項第一号）");
      return base;
    }
    case "smoke_control":
      if ((f.floors_below ?? 0) >= 4 && inList(o, ["1", "3", ...range(5, 9), "11", "12", "14", "15", "16"]))
        return note(base, "地下4階以下の階で、駐車の用に供する部分の床面積が1,000㎡以上なら必要（火災予防条例（東京都）第四十五条の二）");
      return base;
    case "standpipe": {
      if (inList(o, ["2", "4", "10", "13"]) && f.floor !== undefined && (f.floor < 0 || (f.windowless === true && f.floor >= 3)) && f.floor_area !== undefined && f.floor_area >= 1000)
        return up("required", `${T_JO} 第四十六条第一項第一号`, `地階・無窓階（1階・2階を除く）で床面積${f.floor_area}㎡（1,000㎡以上）`, { scope: "その階" });
      return note(base, "屋上を回転翼航空機の発着場や自動車駐車場に使う場合は必要（火災予防条例（東京都）第四十六条第一項第二号）");
    }
    case "emergency_outlet": {
      if (inList(o, range(1, 16)) && basement4 && f.floor_area !== undefined && f.floor_area >= 1000)
        return up("required", `${T_JO} 第四十六条の二第一項`, `地下4階以下の階で床面積${f.floor_area}㎡（地下4階以下の合計1,000㎡以上）`, { scope: "地下4階以下の階" });
      if (base.result === "not_required")
        return note(base, "地下4階以下の階の床面積の合計が1,000㎡以上なら、その階に必要（火災予防条例（東京都）第四十六条の二）");
      return base;
    }
    default:
      return base;
  }
}

// 名古屋市火災予防条例（昭和37年名古屋市条例第16号）第3章第1節（第44条〜第56条）。
// 名古屋市消防局「名古屋市火災予防条例」（令和8年版PDF）の条文本文で確認。方式は kyotoOverlay と同じ。
// 第56条により、消防局長・消防署長が認めた場合は適用されない（caveats に書く）。

const N_JO = "名古屋市火災予防条例";
const N_TOKUREI = "消防局長・消防署長が、火災の発生・延焼のおそれが著しく少ない、又は同等以上の効力があると認めた場合は適用されない（名古屋市火災予防条例第56条）";
const N_EXT_PLACES = "火花を生ずる設備、引火性・発火性の物質の貯蔵取扱い場所、変圧器・配電盤などの電気設備、ボイラー室・サウナ室など多量の火気を使用する場所、溶接・溶断の作業場所などには、別に消火器を設ける（名古屋市火災予防条例第45条第2項）";

function nagoyaOverlay(base: Verdict, o: Occ, f: Facts): Verdict {
  const note = (v: Verdict, ...cs: string[]): Verdict => ({ ...v, caveats: [...v.caveats, ...cs] });
  if (base.result === "required" && base.assertive) {
    if (base.equipment === "extinguisher") return note(base, N_EXT_PLACES);
    return base;
  }
  const up = (result: Result, basis: string, reason: string, extra: Partial<Verdict> = {}): Verdict => ({
    ...base,
    result,
    basis,
    reason,
    assertive: extra.assertive ?? true,
    scope: extra.scope,
    detail: extra.detail ?? base.detail,
    caveats: [...(extra.caveats ?? []), N_TOKUREI],
    missing: extra.missing ?? [],
  });
  const lowOrWindowless = f.floor !== undefined && (f.floor < 0 || f.windowless === true);
  switch (base.equipment) {
    case "extinguisher": {
      if (inList(o, ["16イ", "16ロ"]) && f.total_area !== undefined && f.total_area >= 150)
        return up("required", `${N_JO} 第45条第1項`, `複合用途で延べ面積${f.total_area}㎡（150㎡以上）。(1)項ロ・(3)〜(5)・(6)項イ(4)・ハ・ニ・(7)〜(15)項の用途の部分ごとに消火器を設ける`, {
          assertive: false,
          caveats: ["該当する用途の部分がなければ、この条は当たらない", N_EXT_PLACES],
        });
      return note(base, N_EXT_PLACES);
    }
    case "indoor_hydrant": {
      if (inList(o, ["16イ", "16ロ"]) && f.total_area !== undefined) {
        const mul = areaMultiplier(f.structure);
        const b = `${N_JO} 第46条第1項第1号・第2項`;
        if (mul === null) {
          if (f.total_area >= 3000) return up("required", b, `複合用途で延べ面積${f.total_area}㎡（3倍読みの3,000㎡以上）`);
          if (f.total_area >= 1000) return up("conditional", b, "複合用途は延べ1,000㎡以上で必要。構造と内装で基準が2,000㎡・3,000㎡になる", { missing: ["structure"] });
        } else if (f.total_area >= 1000 * mul) return up("required", b, `複合用途で延べ面積${f.total_area}㎡（基準${1000 * mul}㎡以上）`);
      }
      const b2 = `${N_JO} 第46条第1項第2号`;
      const exc = "特定主要構造部を耐火構造とし、5階以上の部分が床面積100㎡未満ごとに耐火構造の床・壁・防火戸で区画されたものは除かれる";
      if (f.floor !== undefined && f.floor >= 5) {
        if (f.floor_area === undefined) return up("conditional", b2, "5階以上の階で床面積100㎡以上なら、その階に必要", { missing: ["floor_area"] });
        if (f.floor_area >= 100)
          return up("required", b2, `5階以上の階で床面積${f.floor_area}㎡（100㎡以上）`, { scope: "その階", assertive: f.structure === "other", caveats: [exc] });
      } else if (f.floor === undefined && f.floors_above !== undefined && f.floors_above >= 5)
        return up("conditional", b2, "5階以上の階で床面積100㎡以上の階があれば、その階に必要", { missing: ["floor", "floor_area"], caveats: [exc] });
      return base;
    }
    case "sprinkler": {
      const spExc = "総務省令（消防法施行規則第13条第2項）で定める部分は除かれる";
      if (f.height !== undefined && f.height > 31)
        return up("required", `${N_JO} 第47条第1項第4号`, `高さ${f.height}m（31m超）`, { scope: "高さ31mを超える部分", caveats: [spExc] });
      if (f.floor !== undefined && f.floor_area !== undefined) {
        if (inList(o, ["12ロ"])) {
          const t = lowOrWindowless || f.floor >= 4 ? 300 : 500;
          if (f.floor_area >= t)
            return up("required", `${N_JO} 第47条第1項第1号`, `映画スタジオ・テレビスタジオの階で床面積${f.floor_area}㎡（${t}㎡以上）`, {
              scope: "その階",
              assertive: false,
              caveats: ["床面積は主たる用途に供する部分で判定する", spExc],
            });
        }
        if (lowOrWindowless) {
          if (inList(o, ["2", "3"]) && f.floor_area >= 100)
            return up("required", `${N_JO} 第47条第1項第7号`, `地階・無窓階で床面積${f.floor_area}㎡（100㎡以上）`, { scope: "その階", caveats: [spExc] });
          if (inList(o, ["4", "9イ"]) && f.floor_area >= 300)
            return up("required", `${N_JO} 第47条第1項第7号`, `地階・無窓階で床面積${f.floor_area}㎡（300㎡以上）`, { scope: "その階", caveats: [spExc] });
          if (inList(o, ["5ロ", "7", "8", "12イ"]) && f.floor_area >= 2000)
            return up("required", `${N_JO} 第47条第1項第5号`, `地階・無窓階で床面積${f.floor_area}㎡（2,000㎡以上）`, { scope: "その階", caveats: [spExc] });
          if (inList(o, ["16イ"]) && f.floor_area >= 100)
            return up("conditional", `${N_JO} 第47条第1項第6号・第8号`, "複合用途の地階・無窓階は、(2)項・(3)項の部分が100㎡以上、又は(5)項ロ・(7)・(8)・(12)項の部分が2,000㎡以上なら必要", { scope: "その階", missing: ["occupancy"] });
          if (inList(o, ["16ロ"]) && f.floor_area >= 2000)
            return up("conditional", `${N_JO} 第47条第1項第6号`, "複合用途の地階・無窓階は、(5)項ロ・(7)・(8)・(12)項の部分の床面積の合計が2,000㎡以上なら必要", { scope: "その階", missing: ["occupancy"] });
        }
      }
      if (f.height === undefined && f.floors_above !== undefined && f.floors_above >= 9 && base.result === "not_required")
        return up("conditional", `${N_JO} 第47条第1項第4号`, "高さ31mを超える部分があれば、その部分に必要", { missing: ["height"] });
      if (inList(o, ["2", "3", "16イ"])) return note(base, "地階・無窓階・4階以上に達する吹抜けを共有する(2)項・(3)項ロの階は、床面積の合計で必要になる場合がある（名古屋市火災予防条例第47条第1項第2号・第3号）");
      return base;
    }
    case "auto_alarm": {
      if (inList(o, ["16ロ"]) && f.total_area !== undefined) {
        if (f.total_area >= 1000) return up("required", `${N_JO} 第49条第1項第2号`, `(16)項ロで延べ面積${f.total_area}㎡（1,000㎡以上）`);
        const fr = f.building_class === "fireproof" || f.building_class === "quasi_fireproof" || (f.structure !== undefined && f.structure !== "other");
        if (f.total_area >= 300 && !fr)
          return up("conditional", `${N_JO} 第49条第1項第1号`, "耐火構造・準耐火建築物でない(16)項ロで、(12)〜(14)項の部分の上階を共同住宅に使うものは延べ300㎡以上で必要", {
            assertive: false,
            missing: f.building_class === undefined && f.structure === undefined ? ["building_class"] : [],
          });
      }
      return base;
    }
    case "emergency_alarm":
      if (inList(o, ["10"])) return note(base, "地下に設置する車両の停車場は、非常ベル＋放送設備又は自動式サイレン＋放送設備が必要（名古屋市火災予防条例第50条）");
      return base;
    case "evac_device": {
      if (inList(o, ["5"]) && f.floor !== undefined && f.floor >= 2) {
        const b = `${N_JO} 第52条第1項`;
        const fireproof = f.structure === "fireproof" || f.structure === "fireproof_flame_retardant";
        if (fireproof) return base;
        if (f.direct_stairs === undefined)
          return up("conditional", b, "特定主要構造部が耐火構造でない(5)項の2階以上の階は、直通階段が2以上なければ収容人員にかかわらず必要", {
            missing: ["direct_stairs", ...(f.structure === undefined ? (["structure"] as const) : [])],
          });
        if (f.direct_stairs < 2) {
          if (f.structure === undefined)
            return up("conditional", b, "直通階段が1つの(5)項の2階以上の階は、特定主要構造部が耐火構造でなければ収容人員にかかわらず必要", { missing: ["structure"] });
          return up("required", b, `特定主要構造部が耐火構造でない(5)項の${f.floor}階で、直通階段が${f.direct_stairs}つ`, {
            scope: "その階",
            caveats: ["避難上有効な開口部のない壁で区画された部分がある場合は、その部分ごとに直通階段の数を数える"],
          });
        }
      }
      return base;
    }
    case "standpipe": {
      if (inList(o, ["1", "2", "3", "4", "10", "13"]) && f.floor !== undefined && (f.floor < 0 || (f.windowless === true && f.floor >= 3)) && f.floor_area !== undefined) {
        const t = inList(o, ["1"]) && f.floor < 0 ? 500 : 1000;
        if (f.floor_area >= t)
          return up("required", `${N_JO} 第54条第1項第1号`, `地階・無窓階（1階・2階を除く）で床面積${f.floor_area}㎡（${t.toLocaleString()}㎡以上）`, { scope: "その階" });
      }
      return note(base, "平屋建以外で、屋上の回転翼航空機の発着場や駐車場の部分が200㎡以上なら必要（名古屋市火災予防条例第54条第1項第2号）");
    }
    case "emergency_outlet": {
      if (f.floor !== undefined && f.floor < 0 && f.floor_area !== undefined) {
        const t = inList(o, ["1"]) ? 500 : inList(o, ["2", "3", "4", "10", "13"]) ? 1000 : null;
        if (t !== null && f.floor_area >= t)
          return up("required", `${N_JO} 第55条第1項`, `地階の部分で床面積${f.floor_area}㎡（${t.toLocaleString()}㎡以上）`, { scope: "地階" });
      }
      return base;
    }
    default:
      return base;
  }
}

export type InstallJurisdiction = "jp" | "general" | "kyoto-city" | "tokyo-tfd" | "nagoya-city" | "osaka-city" | "yokohama-city" | CityJurisdiction;

export function judge(equipment: Equipment, facts: Facts, jurisdiction: InstallJurisdiction = "jp"): Verdict {
  const o = parseOccupancy(facts.occupancy);
  if (!o) return verdict(equipment, "conditional", "消防法施行令 別表第一", "用途（令別表第一の項）が読み取れない", { missing: ["occupancy"] });
  const base = JUDGES[equipment]({ o, f: facts });
  if (jurisdiction === "kyoto-city") return kyotoOverlay(base, o, facts);
  if (jurisdiction === "tokyo-tfd") return tokyoOverlay(base, o, facts);
  if (jurisdiction === "nagoya-city") return nagoyaOverlay(base, o, facts);
  // 一般版（政令指定都市以外など、条例を確認していない地域）: 国の政令だけで判定し、条例の上乗せがありうることを添える
  if (jurisdiction === "general") return { ...base, caveats: [...base.caveats, "建物がある市町村の火災予防条例で、設置の基準が上乗せされている場合がある（この判定には入っていない。所轄の消防本部で確認）"] };
  if (jurisdiction !== "jp") return { ...base, caveats: [...base.caveats, "この管轄の火災予防条例による上乗せは、まだ判定に入っていない"] };
  return base;
}

export function judgeAll(facts: Facts, jurisdiction: InstallJurisdiction = "jp"): Verdict[] {
  return (Object.keys(JUDGES) as Equipment[]).map((e) => judge(e, facts, jurisdiction));
}
