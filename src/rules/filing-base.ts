// 届出の判定で全管轄が共有する型と部品。都市ごとの判定は ./cities/<都市>.ts に置く。
import { occupancyIn, type Facts } from "./install.ts";

export type Scene =
  | "use_start" // 使用開始（開業・入居）
  | "renovation" // 工事（建築・修繕・模様替え・用途変更）
  | "temp_use" // 一時的に不特定の者が出入りする店舗等として使う
  | "fire_equipment" // 火を使う設備等の設置
  | "small_hazmat" // 少量危険物・指定可燃物の貯蔵・取扱い
  | "stall" // 祭礼・縁日などの露店
  | "event" // 催し（展示場・観覧場など）
  | "drill" // 消防訓練
  | "hot_work" // 溶接・溶断の作業
  | "bonfire" // たき火など火災と紛らわしい煙・火炎を出す行為
  | "water_outage"; // 水道の断水・減水

export type Facility = "kitchen" | "sauna" | "battery" | "boiler" | "other";

export type FilingFacts = Partial<Facts> & {
  facility?: Facility;
  kitchen_kw?: number; // 同一厨房室の厨房設備の入力の合計（kW）
  exhaust_down?: boolean; // 排気取入口から下方に排気する（排気ダクトが立ち下がる）
  small_specific_complex?: boolean; // 小規模特定用途複合防火対象物（規則13条1項2号）
  battery_kwh?: number;
  residence?: boolean; // 個人の住居に設ける
  building_permit?: boolean; // 建築確認を受ける（東京都 56条ただし書）
  stall_fire?: boolean; // 露店で火気使用器具等を使う
  exhibition_hall?: boolean; // 観覧場・展示場で行う催し（東京都 59条の3）
  has_duct?: boolean; // 厨房設備に排気用ダクト等がある（名古屋市 68条2号の3）
  personal_use?: boolean; // 設ける人が個人的に使う（横浜市 74条5号の2 など）
  hazmat_ratio?: number; // 危険物の数量が指定数量の何倍か
  multi_ward?: boolean; // 断水の区域が2以上の消防署の管轄にわたる（横浜市 75条ただし書）
};

export type FilingVerdict = {
  procedure: string;
  title: string;
  result: "required" | "not_required" | "conditional";
  deadline?: string;
  form?: string;
  target: string;
  basis: string;
  reason: string;
  inspection?: string;
  caveats: string[];
  missing: string[];
  lane: "gyosei";
};

export function v(p: Omit<FilingVerdict, "caveats" | "missing" | "lane"> & Partial<Pick<FilingVerdict, "caveats" | "missing">>): FilingVerdict {
  return { caveats: [], missing: [], lane: "gyosei", ...p };
}

export const SPECIFIC_KITCHEN_USES = ["1", "2", "3", "4", "5イ", "6", "9イ", "16イ", "16の2", "16の3"];

export const inUses = (occupancy: string | undefined, list: string[]) => (occupancy ? occupancyIn(occupancy, list) : null);

export function hazmatGate(f: FilingFacts, threshold: number | null, basis: string): FilingVerdict[] | null {
  if (f.hazmat_ratio === undefined) return null;
  const title = "少量危険物等の貯蔵・取扱いの届出";
  if (f.hazmat_ratio >= 1)
    return [v({ procedure: "shoryo-kikenbutsu", title, target: "消防署長", result: "not_required", basis: "消防法 第十条・第十一条", reason: `指定数量の${f.hazmat_ratio}倍で指定数量以上。条例の届出ではなく、危険物施設として消防法の許可が要る` })];
  if (threshold === null) {
    if (f.hazmat_ratio >= 0.5) return null;
    return [v({ procedure: "shoryo-kikenbutsu", title, target: "消防署長", result: "conditional", basis, reason: "個人の住居では、届出の対象になる量の下限が事業所と違う場合がある", missing: [] })];
  }
  if (f.hazmat_ratio < threshold)
    return [v({ procedure: "shoryo-kikenbutsu", title, target: "消防署長", result: "not_required", basis, reason: `指定数量の${f.hazmat_ratio}倍で、届出の対象（${threshold === 0.5 ? "2分の1" : "5分の1"}以上）に達しない` })];
  return null;
}

// 消防訓練の通報は国の規則（消防法施行規則第3条第10項・第11項）。特定用途の防火管理者が対象
export function drillNational(f: FilingFacts, target: string): FilingVerdict[] {
  const base = { procedure: "kunren", title: "消防訓練の通報", target, basis: "消防法施行規則 第三条第十項・第十一項" };
  const sp = f.occupancy ? occupancyIn(f.occupancy, ["1", "2", "3", "4", "5イ", "6", "9イ", "16イ", "16の2"]) : null;
  if (sp === true) return [v({ ...base, result: "required", deadline: "あらかじめ", reason: "特定用途の防火対象物の防火管理者は、消火訓練・避難訓練（年2回以上）をあらかじめ消防機関に通報する" })];
  if (sp === false) return [v({ ...base, result: "not_required", reason: "国の規則で事前の通報が義務になるのは特定用途の防火対象物だけ", caveats: ["所轄の消防署が通報を求めている場合がある"] })];
  return [v({ ...base, result: "conditional", reason: "特定用途（飲食店・物販店・ホテル・病院など）の防火対象物なら、あらかじめ消防機関に通報する", missing: ["occupancy"] })];
}

export function noProvision(title: string, procedure: string, basis: string, target: string, note: string): FilingVerdict[] {
  return [v({ procedure, title, target, result: "not_required", basis, reason: "火災予防条例の届出の条（根拠欄の条）に、この行為の届出の定めはない", caveats: [note] })];
}
