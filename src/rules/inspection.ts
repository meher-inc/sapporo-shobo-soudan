// 定期点検と報告（全国共通の国の法令）。
// 根拠（2026-11-02 e-Gov 法令API で条文本文を確認）
//   消防用設備等の点検報告: 消防法 第十七条の三の三、消防法施行令 第三十六条（点検不要＝別表第一(20)項、有資格者が点検する防火対象物）、
//                           消防法施行規則 第三十一条の六（点検は1年以内で消防庁長官が定める期間ごと。報告は特定用途等1年に1回、その他3年に1回）
//                           点検の期間（機器点検6月に1回・総合点検1年に1回）は平成16年消防庁告示第9号（消防庁の資料で確認）
//   防火対象物の定期点検報告: 消防法 第八条の二の二（防火対象物点検資格者に点検させて報告。法第八条の二の三の認定を受けたものは適用しない）、
//                           消防法施行令 第四条の二の二（特定用途で収容人員300人以上、又は特定用途が避難階以外の階にあり直通階段が1つ）、
//                           消防法施行規則 第四条の二の四（1年に1回）
import { occupancyIn } from "./install.ts";
import { v, type FilingFacts, type FilingVerdict } from "./filing-base.ts";

const TARGET = "消防長又は消防署長";

/** 定期点検・点検報告を聞いているか */
export function asksInspection(text: string): boolean {
  const t = text.normalize("NFKC");
  // 点検の手配（業者探し・依頼）は判定せず、設備業者への引き継ぎに任せる
  if (/(点検|業者)[^。？?]{0,10}(お願い|依頼|頼み|手配|見積|紹介)|業者を探/.test(t)) return false;
  return /点検|防火セイフティマーク|特例認定/.test(t);
}

// 規則31条の6第3項1号・令36条2項1号（報告が1年に1回の用途）
const YEARLY = ["1", "2", "3", "4", "5イ", "6", "9イ", "16イ", "16の2", "16の3"];
// 令36条2項2号（延べ1000㎡以上で消防長等が指定したら有資格者）
const DESIGNATED = ["5ロ", "7", "8", "9ロ", "10", "11", "12", "13", "14", "15", "16ロ", "17", "18"];
// 令4条の2の2・令36条2項3号の特定用途（避難階以外の階）
const UPPER_USES = ["1", "2", "3", "4", "5イ", "6", "9イ"];
// 令4条の2の2（防火対象物点検の対象用途）
const FIRE_INSPECTION_USES = ["1", "2", "3", "4", "5イ", "6", "9イ", "16イ", "16の2"];

/** 特定用途の部分が避難階以外の階にあり、直通階段が1つか。true / false / null */
function upperSingleStair(f: FilingFacts): { hit: boolean | null; missing: string[] } {
  const o = f.occupancy!;
  const upper = occupancyIn(o, UPPER_USES) === true || (occupancyIn(o, ["16イ"]) === true && f.specific_use_upper !== false);
  if (!upper) return { hit: false, missing: [] };
  const onUpper = f.specific_use_upper === true || (f.floor !== undefined ? f.floor >= 3 || f.floor < 0 : f.floors_above !== undefined && f.floors_above <= 2 && !f.floors_below ? false : null);
  if (onUpper === false) return { hit: false, missing: [] };
  if (f.direct_stairs !== undefined && f.direct_stairs >= 2) return { hit: false, missing: [] };
  if (onUpper === true && f.direct_stairs === 1) return { hit: true, missing: [] };
  const missing: string[] = [];
  if (onUpper === null) missing.push("floor");
  if (f.direct_stairs === undefined) missing.push("direct_stairs");
  return { hit: null, missing };
}

export function equipmentInspection(f: FilingFacts): FilingVerdict[] {
  const base = {
    procedure: "setsubi-tenken",
    title: "消防用設備等の点検結果報告",
    target: TARGET,
    form: "消防庁長官が定める点検結果報告書（点検票を添付）",
    basis: "消防法 第十七条の三の三、消防法施行令 第三十六条、消防法施行規則 第三十一条の六",
  };
  const o = f.occupancy;
  if (!o) return [v({ ...base, result: "conditional", reason: "消防用設備等が設置されている建物は、用途に応じて定期に点検して報告する（報告の周期は用途で1年に1回か3年に1回）", missing: ["occupancy"] })];
  if (occupancyIn(o, ["20"]) === true) return [v({ ...base, result: "not_required", reason: "令別表第一(20)項（舟車）は点検を要しない（消防法施行令 第三十六条第一項）" })];
  const yearly = occupancyIn(o, YEARLY) === true;
  const caveats = ["点検は機器点検を6か月に1回、総合点検を1年に1回（平成16年消防庁告示第9号）", "点検結果は維持台帳に記録する（消防法施行規則 第三十一条の六第三項）", "設置されている消防用設備等がない建物は点検・報告の対象がない"];
  // 誰が点検するか（令36条2項）
  let who: string;
  const missing: string[] = [];
  const big = f.total_area !== undefined ? f.total_area >= 1000 : null;
  const stair = upperSingleStair(f);
  if (yearly && occupancyIn(o, ["16の3"]) !== true && big === true) who = `延べ面積${f.total_area}㎡（1000㎡以上）の特定用途の建物なので、消防設備士又は消防設備点検資格者に点検させる（令第三十六条第二項第一号）`;
  else if (occupancyIn(o, ["16の3"]) === true && big === true) who = "延べ1000㎡以上の地下街と一体の地下道なので、消防設備士又は消防設備点検資格者に点検させる（令第三十六条第二項第一号）";
  else if (stair.hit === true) who = "特定用途の部分が避難階以外の階にあり直通階段が1つなので、消防設備士又は消防設備点検資格者に点検させる（令第三十六条第二項第三号）";
  else if (occupancyIn(o, DESIGNATED) === true && big === true) who = "延べ1000㎡以上の非特定用途は、消防長・消防署長の指定を受けていれば消防設備士又は消防設備点検資格者に点検させ、指定がなければ関係者が自ら点検できる（令第三十六条第二項第二号）";
  else if (big === null || stair.hit === null) {
    who = "延べ1000㎡以上か、特定用途の部分が上の階にあり直通階段が1つなら、消防設備士又は消防設備点検資格者に点検させる。それ以外は関係者が自ら点検できる（令第三十六条第二項）";
    if (big === null) missing.push("total_area");
    missing.push(...stair.missing);
  } else who = "消防設備士でなくても、関係者が自ら点検できる（令第三十六条第二項の対象外）";
  return [
    v({
      ...base,
      result: "required",
      deadline: yearly ? "1年に1回報告（特定用途の防火対象物）" : "3年に1回報告（非特定用途の防火対象物）",
      reason: `${yearly ? "特定用途" : "非特定用途"}の防火対象物は、設置されている消防用設備等を定期に点検し、${yearly ? "1年に1回" : "3年に1回"}報告する。${who}`,
      caveats,
      missing: [...new Set(missing)],
    }),
  ];
}

export function fireSafetyInspection(f: FilingFacts): FilingVerdict[] {
  const base = {
    procedure: "boka-tenken",
    title: "防火対象物定期点検報告",
    target: TARGET,
    deadline: "1年に1回点検して報告",
    form: "消防庁長官が定める点検結果報告書",
    basis: "消防法 第八条の二の二、消防法施行令 第四条の二の二、消防法施行規則 第四条の二の四",
  };
  const caveats = ["点検は防火対象物点検資格者が行う（消防法施行規則 第四条の二の四第四項）", "3年間継続して法令を守っているなどで消防長・消防署長の特例認定を受けると、点検・報告が免除される（消防法 第八条の二の三）"];
  const o = f.occupancy;
  if (!o) return [v({ ...base, result: "conditional", reason: "特定用途（飲食店・物販店・ホテル・病院など）で収容人員300人以上などの建物が対象", missing: ["occupancy"] })];
  const use = occupancyIn(o, FIRE_INSPECTION_USES);
  if (use === false) return [v({ ...base, result: "not_required", reason: "防火対象物点検の対象は特定用途の防火対象物だけ（消防法施行令 第四条の二の二）" })];
  if (use === null) return [v({ ...base, result: "conditional", reason: "用途の細分が分からない", missing: ["occupancy"] })];
  if (f.capacity !== undefined && f.capacity >= 300) return [v({ ...base, result: "required", reason: `特定用途の防火対象物で収容人員${f.capacity}人（300人以上、令第四条の二の二第一号）`, caveats })];
  const stair = upperSingleStair(f);
  if (stair.hit === true) return [v({ ...base, result: "required", reason: "特定用途の部分が避難階以外の階（3階以上又は地階）にあり、直通階段が1つ（令第四条の二の二第二号。屋外階段・避難上有効な構造なら除く）", caveats })];
  const missing = [...(f.capacity === undefined ? ["capacity"] : []), ...stair.missing];
  if (missing.length) return [v({ ...base, result: "conditional", reason: "収容人員300人以上か、特定用途の部分が3階以上又は地階にあり直通階段が1つなら対象（令第四条の二の二）", missing, caveats })];
  return [v({ ...base, result: "not_required", reason: `収容人員${f.capacity}人（300人未満）で、特定用途の部分が上の階で直通階段1つの建物にも当たらない` })];
}

/** 点検報告の判定。点検を聞いているときに足す */
export function inspectionFilings(f: FilingFacts, latest: string): FilingVerdict[] {
  if (!asksInspection(latest)) return [];
  const t = latest.normalize("NFKC");
  const onlyFire = /防火対象物(定期)?点検|防火セイフティマーク|特例認定/.test(t) && !/設備/.test(t);
  const onlyEquip = /設備/.test(t) && /点検/.test(t) && !/防火対象物(定期)?点検/.test(t);
  return [...(onlyFire ? [] : equipmentInspection(f)), ...(onlyEquip ? [] : fireSafetyInspection(f))];
}
