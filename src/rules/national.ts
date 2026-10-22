// 国の法令による届出（全国共通。火災予防条例の届出とは別に判定する）。
// 根拠（2026-10-22 e-Gov 法令API で条文本文を確認）
//   防火管理者の選任届: 消防法 第八条第二項（遅滞なく）、消防法施行規則 第三条の二（別記様式第一号の二の二、資格を証する書面を添付）
//   消防計画の届出:     消防法施行規則 第三条第一項（別記様式第一号の二。変更するときも同様。届出の期限の日数は定めなし）
//   着工届:             消防法 第十七条の十四（甲種消防設備士が、着手しようとする日の十日前まで）、消防法施行令 第三十六条の二第一項（対象の設備）、
//                       消防法 第十七条の五（設置しなければならない消防用設備等の工事に限る）、消防法施行規則 第三十三条の十八（別記様式第一号の七、平面図・系統図・計算書の写し）
//   設置届:             消防法 第十七条の三の二、消防法施行令 第三十五条（対象の防火対象物、簡易消火用具・非常警報器具を除く）、
//                       消防法施行規則 第三十一条の三（工事が完了した日から四日以内、別記様式第一号の二の三）
import { EQUIPMENT_LABEL, judge, occupancyIn, type Equipment, type Facts, type Verdict } from "./install.ts";
import { v, type FilingFacts, type FilingVerdict, type Scene } from "./filing-base.ts";

const TARGET = "所轄の消防長又は消防署長";

/** 防火管理者の選任届と消防計画の届出を出す場面か（開業・入居、または防火管理者・消防計画を聞いている） */
export function asksFireManagement(text: string): boolean {
  return /防火管理者|消防計画|選任届/.test(text.normalize("NFKC"));
}

/** 消防用設備等の設置工事の場面か */
export function asksEquipmentWork(text: string): boolean {
  const t = text.normalize("NFKC");
  return /着工届|設置届|(消防用?設備|消火栓|スプリンクラー|自動火災報知|自火報|感知器|火災報知|避難はしご|救助袋|緩降機|消火器|誘導灯|非常ベル|放送設備)[^。？?]{0,20}(設置|新設|増設|移設|工事|付け)|(設置|新設|増設|移設)[^。？?]{0,10}(工事)/.test(t);
}

export function fireManagementFilings(f: FilingFacts): FilingVerdict[] {
  const appoint = {
    procedure: "boka-kanrisha",
    title: "防火管理者選任届",
    target: TARGET,
    deadline: "防火管理者を定めたら遅滞なく（解任したときも届け出る）",
    form: "別記様式第1号の2の2（防火管理者の資格を証する書面を添付）",
    basis: "消防法 第八条第二項、消防法施行規則 第三条の二",
  };
  const plan = {
    procedure: "shobo-keikaku",
    title: "消防計画作成（変更）届",
    target: TARGET,
    deadline: "防火管理者が消防計画を作成・変更したとき（日数の定めはない）",
    form: "別記様式第1号の2",
    basis: "消防法施行規則 第三条第一項",
  };
  if (!f.occupancy)
    return [
      v({ ...appoint, result: "conditional", reason: "防火管理者の選任が必要な防火対象物なら、選任したときに届け出る", missing: ["occupancy"] }),
      v({ ...plan, result: "conditional", reason: "防火管理者の選任が必要な防火対象物なら、防火管理者が消防計画を作成して届け出る", missing: ["occupancy"] }),
    ];
  const fm = judge("fire_manager", f as Facts);
  if (fm.result === "required")
    return [
      v({ ...appoint, result: "required", reason: `防火管理者の選任が必要（${fm.reason}）` }),
      v({ ...plan, result: "required", reason: "防火管理者は、管理について権原を有する者の指示を受けて消防計画を作成し、届け出る" }),
    ];
  if (fm.result === "conditional")
    return [
      v({ ...appoint, result: "conditional", reason: `防火管理者の選任が必要なら届け出る（${fm.reason}）`, missing: fm.missing }),
      v({ ...plan, result: "conditional", reason: "防火管理者の選任が必要なら、消防計画も作成して届け出る", missing: fm.missing }),
    ];
  return [
    v({ ...appoint, result: "not_required", reason: `防火管理者の選任が必要ない（${fm.reason}）` }),
    v({ ...plan, result: "not_required", reason: "防火管理者の選任が必要ないので、国の規則による消防計画の届出もない" }),
  ];
}

// 令36条の2第1項（消防設備士でなければ行ってはならない工事）のうち、判定で扱う設備
const CHAKKO: Partial<Record<Equipment, string>> = {
  indoor_hydrant: "屋内消火栓設備",
  sprinkler: "スプリンクラー設備",
  outdoor_hydrant: "屋外消火栓設備",
  auto_alarm: "自動火災報知設備",
  fire_report: "消防機関へ通報する火災報知設備",
};

/** 令35条1項の防火対象物か。true / false / null（用途の細分・指定・階段が分からない） */
export function inspectionBuilding(f: FilingFacts): { hit: boolean | null; reason: string; missing: string[] } {
  const o = f.occupancy;
  if (!o) return { hit: null, reason: "用途が分からない", missing: ["occupancy"] };
  const is = (list: string[]) => occupancyIn(o, list);
  // 1号イ・ロ（面積を問わない）
  if (is(["2ニ", "5イ", "6イ(1)", "6イ(2)", "6イ(3)", "6ロ"]) === true) return { hit: true, reason: "カラオケボックス等・旅館ホテル・病院・老人ホーム等は延べ面積にかかわらず対象（令第35条第1項第1号）", missing: [] };
  if (is(["6ハ"]) === true) {
    if (f.overnight === true) return { hit: true, reason: "入居・宿泊させる令別表第一(6)項ハは延べ面積にかかわらず対象（令第35条第1項第1号ロ）", missing: [] };
    if (f.overnight === undefined) return { hit: null, reason: "(6)項ハは、入居・宿泊させるなら面積にかかわらず対象、そうでなければ延べ300㎡以上で対象", missing: ["overnight"] };
  }
  // 2号（特定用途で延べ300㎡以上）
  const special = is(["1", "2イ", "2ロ", "2ハ", "3", "4", "6イ(4)", "6ハ", "6ニ", "9イ", "16イ", "16の2", "16の3"]);
  // 3号（非特定用途で延べ300㎡以上・消防長等の指定）
  const designated = is(["5ロ", "7", "8", "9ロ", "10", "11", "12", "13", "14", "15", "16ロ", "17", "18"]);
  if (f.total_area !== undefined && f.total_area >= 300) {
    if (special === true) return { hit: true, reason: `特定用途の防火対象物で延べ面積${f.total_area}㎡（300㎡以上、令第35条第1項第2号）`, missing: [] };
    if (designated === true) return { hit: null, reason: "延べ300㎡以上の非特定用途は、消防長・消防署長が指定したものだけ対象（令第35条第1項第3号）", missing: [] };
  }
  // 4号（特定用途が避難階以外の階にあり、直通階段が1つ）
  const upper = is(["1", "2", "3", "4", "5イ", "6", "9イ"]);
  // 相談の階が分かればその階で、分からなければ2階建て以上なら「階による」とする（避難階は通常1階）
  const onUpperFloor = f.specific_use_upper === true || (f.floor !== undefined ? f.floor !== 1 : f.floors_above !== undefined && f.floors_above >= 2 ? null : false);
  if (upper === true && onUpperFloor === true && f.direct_stairs === 1)
    return { hit: true, reason: "特定用途の部分が避難階以外の階にあり、避難階・地上に直通する階段が1つ（令第35条第1項第4号。屋外階段・避難上有効な構造なら除く）", missing: [] };
  const missing: string[] = [];
  if (upper === true && onUpperFloor === null && f.direct_stairs === 1) missing.push("floor");
  if (f.total_area === undefined && (special !== false || designated !== false)) missing.push("total_area");
  if (upper === true && onUpperFloor !== false && f.direct_stairs === undefined) missing.push("direct_stairs");
  if (special === null || upper === null) missing.push("occupancy");
  if (missing.length) return { hit: null, reason: "用途・延べ面積・直通階段の数で決まる（令第35条第1項）", missing };
  return { hit: false, reason: "令第35条第1項の防火対象物（特定用途で延べ300㎡以上など）に当たらない", missing: [] };
}

export function equipmentWorkFilings(f: FilingFacts, install: Verdict[], explicitWork: boolean, asked: Equipment[] = []): FilingVerdict[] {
  const required = install.filter((x) => x.result === "required");
  const out: FilingVerdict[] = [];

  // 着工届（法17条の14）
  const chakko = {
    procedure: "chakko",
    title: "工事整備対象設備等着工届",
    target: "消防長又は消防署長",
    deadline: "工事に着手しようとする日の10日前まで",
    form: "別記様式第1号の7（工事の設計に関する平面図・系統図・計算書の写しを添付）",
    basis: "消防法 第十七条の十四、消防法施行令 第三十六条の二第一項、消防法施行規則 第三十三条の十八",
    caveats: ["届け出るのは工事をする甲種消防設備士", "電源・水源・配管だけの工事は対象外（令第36条の2第1項）", "固定式の金属製避難はしご・救助袋・緩降機、ガス漏れ火災警報設備、泡・ガス系の消火設備の工事も対象"],
  };
  const isChakko = (e: Equipment) => e in CHAKKO;
  const askedChakko = install.filter((x) => asked.includes(x.equipment) && isChakko(x.equipment));
  const chakkoHits = required.filter((x) => isChakko(x.equipment)).map((x) => CHAKKO[x.equipment]!);
  if (explicitWork && askedChakko.length) {
    // 工事する設備が分かっている。設置義務のある設備の工事だけが対象（法第17条の5）
    const r = askedChakko.some((x) => x.result === "required") ? "required" : askedChakko.some((x) => x.result === "conditional") ? "conditional" : "not_required";
    const names = askedChakko.map((x) => CHAKKO[x.equipment]!).join("・");
    out.push(
      v({
        ...chakko,
        result: r,
        reason: r === "required" ? `${names}は設置が必要な設備で、その設置工事は着工届の対象` : r === "conditional" ? `${names}の設置が必要かどうかで決まる（設置義務のある設備の工事だけが対象）` : `${names}はこの建物では設置が必要ない。自主的に設ける設備の工事は着工届の対象外（消防法 第十七条の五）`,
        missing: r === "conditional" ? [...new Set(askedChakko.flatMap((x) => x.missing))] : [],
      }),
    );
  } else if (explicitWork && asked.length)
    out.push(v({ ...chakko, result: "not_required", reason: "工事する設備が着工届の対象（屋内消火栓設備・スプリンクラー設備・自動火災報知設備など）に当たらない" }));
  else if (chakkoHits.length)
    out.push(v({ ...chakko, result: "conditional", reason: `${chakkoHits.join("・")}の設置が必要。これらを新しく設置する工事をするなら対象（すでに設置済みなら不要）` }));
  else if (explicitWork)
    out.push(v({ ...chakko, result: "conditional", reason: "設置する設備が着工届の対象（屋内消火栓設備・スプリンクラー設備・自動火災報知設備など）なら必要", missing: f.occupancy ? [] : ["occupancy"] }));

  // 設置届（法17条の3の2）
  const setchi = {
    procedure: "setchi",
    title: "消防用設備等設置届",
    target: "消防長又は消防署長",
    deadline: "設置の工事が完了した日から4日以内",
    form: "別記様式第1号の2の3（設備の図書・試験結果報告書などを添付）",
    basis: "消防法 第十七条の三の二、消防法施行令 第三十五条、消防法施行規則 第三十一条の三",
    inspection: "届け出たあと、消防長又は消防署長の検査を受ける（消防法 第十七条の三の二）",
  };
  const countable = required.filter((x) => x.equipment !== "fire_manager" && !(x.equipment === "emergency_alarm" && x.detail === "非常警報器具"));
  if (!countable.length && !explicitWork) return out;
  const b = inspectionBuilding(f);
  const labels = [...new Set(countable.map((x) => EQUIPMENT_LABEL[x.equipment]))];
  const what = labels.length ? `消防用設備等（${labels.slice(0, 3).join("・")}${labels.length > 3 ? "など" : ""}）` : "消防用設備等";
  if (b.hit === false)
    out.push(v({ ...setchi, result: "not_required", reason: b.reason, caveats: ["延べ300㎡以上の非特定用途は、消防長・消防署長の指定があれば対象", "火災予防条例で別の届出を求める市町村がある"] }));
  else if (b.hit === true)
    out.push(v({ ...setchi, result: explicitWork ? "required" : "conditional", reason: `${b.reason}。${explicitWork ? `${what}を設置したら届け出て検査を受ける` : `${what}を新しく設置する工事をしたら必要（すでに設置済みなら不要）`}`, caveats: ["簡易消火用具・非常警報器具だけの設置は対象外（令第35条第2項）"] }));
  else out.push(v({ ...setchi, result: "conditional", reason: b.reason, missing: b.missing, caveats: ["簡易消火用具・非常警報器具だけの設置は対象外（令第35条第2項）"] }));
  return out;
}

/** 国の法令による届出。条例の届出（judgeFilings）の後ろに足す */
export function nationalFilings(scenes: Scene[], f: FilingFacts, install: Verdict[], latest: string, asked: Equipment[] = []): FilingVerdict[] {
  const out: FilingVerdict[] = [];
  if (scenes.includes("use_start") || asksFireManagement(latest)) out.push(...fireManagementFilings(f));
  const explicitWork = asksEquipmentWork(latest);
  if (f.occupancy && (explicitWork || scenes.includes("use_start") || scenes.includes("renovation"))) out.push(...equipmentWorkFilings(f, install, explicitWork, asked));
  return out;
}
