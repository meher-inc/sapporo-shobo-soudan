// 火災予防条例・規則による届出の要否・期限・提出先を、条文どおりに決定的に判定する（要件定義書 5章 F3）。
// 根拠（2026-10-20 確認）
//   京都市: 京都市火災予防条例 第55条〜第58条、京都市火災予防規則 第10条〜第15条（京都市例規集）
//   東京都: 火災予防条例 第56条〜第60条（東京都例規集）。適用は東京消防庁管内（島しょ・稲城市を除く）
//   名古屋市: 名古屋市火災予防条例 第66条〜第70条（令和8年版PDF）、消防法等施行細則 第10条〜第15条（様式）
//   大阪市: 大阪市火災予防条例 第56条〜第60条、同施行規則 第5条〜第8条（大阪市例規データベース 令和8年8月1日現在）
//   横浜市: 横浜市火災予防条例 第73条〜第76条、横浜市火災予防規則 第29条〜第32条・第35条（横浜市例規集）
//   消防訓練の通報: 消防法施行規則 第3条第10項・第11項（e-Gov）
// 届出書の作成・提出の代行は行政書士の業務（行政書士法第19条）なので lane は gyosei にする。

import { EQUIPMENT_LABEL, judge, occupancyIn, type Equipment, type Facts } from "./install.ts";
import { drillNational, hazmatGate, inUses, noProvision, SPECIFIC_KITCHEN_USES, v, type FilingFacts, type FilingVerdict, type Scene } from "./filing-base.ts";
import { CITY_FILINGS, type CityJurisdiction } from "./cities/index.ts";

export type { Facility, FilingFacts, FilingVerdict, Scene } from "./filing-base.ts";

export type Jurisdiction = "general" | "kyoto-city" | "tokyo-tfd" | "nagoya-city" | "osaka-city" | "yokohama-city" | CityJurisdiction;

const K_JO = "京都市火災予防条例";
const K_KI = "京都市火災予防規則";
const T_JO = "火災予防条例（東京都）";

// ---- 京都市 ----

function kyoto(scene: Scene, f: FilingFacts): FilingVerdict[] | null {
  const target = "所轄消防署長";
  switch (scene) {
    case "use_start": {
      const title = "防火対象物使用開始届";
      const base = { procedure: "shiyo-kaishi", title, target, deadline: "使用開始の日の7日前まで", form: "防火対象物使用・変更届出書（第5号様式）", basis: `${K_JO} 第55条、${K_KI} 第10条`, inspection: "署長が必要に応じて検査する（規則第10条第3項）" };
      if (!f.occupancy) return [v({ ...base, result: "conditional", reason: "防火管理者の選任が必要か、消防用設備等の設置が必要な防火対象物だけが対象", missing: ["occupancy"] })];
      const facts = f as Facts;
      const fm = judge("fire_manager", facts);
      // 規則第10条第1項第2号: 法第17条第1項又は条例第5章で設置が必要な消防用設備等（非常警報器具・避難器具・誘導灯・誘導標識を除く）
      const eqs = (["extinguisher", "indoor_hydrant", "sprinkler", "auto_alarm", "leak_alarm", "emergency_alarm", "standpipe", "emergency_outlet"] as const).map((e) => judge(e, facts, "kyoto-city"));
      const hits = [fm, ...eqs.filter((x) => !(x.equipment === "emergency_alarm" && x.detail === "非常警報器具"))].filter((x) => x.result === "required");
      if (hits.length)
        return [v({ ...base, result: "required", reason: `${hits.map((h) => (h.equipment === "fire_manager" ? "防火管理者の選任" : `${labelOf(h.equipment)}の設置`)).join("・")}が必要な防火対象物に当たる` })];
      // 漏電火災警報器は壁の造りと契約電流でしか決まらないことが多いので、注意書きに回す
      const leakOnly = (x: { equipment: string; missing: string[] }) => x.equipment === "leak_alarm" && x.missing.every((m) => m === "lath_wall");
      const unknown = [fm, ...eqs].filter((x) => x.result === "conditional" && !leakOnly(x));
      if (unknown.length)
        return [v({ ...base, result: "conditional", reason: "防火管理者の選任か、消防用設備等の設置が必要なら対象", missing: [...new Set(unknown.flatMap((x) => x.missing))] })];
      return [v({ ...base, result: "not_required", reason: "防火管理者の選任も、届出の対象になる消防用設備等の設置も必要ない規模", caveats: ["ラスモルタル造などで漏電火災警報器が必要な建物なら対象になる", "地階・無窓階・3階以上の階がある場合は階ごとの基準も確認する"] })];
    }
    case "fire_equipment": {
      const base = { target, deadline: "設置工事に着手する日の5日前まで", basis: `${K_JO} 第56条、${K_KI} 第11条`, inspection: "工事が完了したら署長が必要に応じて検査する（規則第11条第2項）" };
      if (f.facility === "kitchen") {
        const b = { ...base, procedure: "kaki-setsubi", title: "厨房設備設置届", form: "炉・厨房設備等設置届出書（第7号様式）", basis: `${K_JO} 第56条第4号・第3条の4第1項第2号エ、${K_KI} 第11条` };
        if (f.residence) return [v({ ...b, result: "not_required", reason: "個人の住居に設けるものは対象外" })];
        if (f.exhaust_down === true) return [v({ ...b, result: "required", reason: "排気取入口から排気ダクトが立ち下がっている" })];
        if (f.kitchen_kw !== undefined && f.kitchen_kw >= 350) return [v({ ...b, result: "required", reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW以上）` })];
        const uses = inUses(f.occupancy, SPECIFIC_KITCHEN_USES);
        if (uses && f.total_area !== undefined && f.total_area >= 1000) {
          if (f.small_specific_complex === true) return kitchenRest(b, f, "小規模特定用途複合防火対象物は延べ面積の基準から除かれる");
          if (f.small_specific_complex === undefined && f.occupancy?.startsWith("16"))
            return [v({ ...b, result: "conditional", reason: "延べ1,000㎡以上の特定用途の建物は対象。ただし小規模特定用途複合防火対象物は除かれる", missing: ["small_specific_complex"] })];
          return [v({ ...b, result: "required", reason: `特定用途の防火対象物で延べ面積${f.total_area}㎡（1,000㎡以上）` })];
        }
        if (uses === null || f.total_area === undefined)
          return [v({ ...b, result: "conditional", reason: "延べ1,000㎡以上の特定用途の建物、同一厨房室の入力合計350kW以上、又は排気ダクトが立ち下がるものが対象", missing: [...(f.occupancy ? [] : ["occupancy"]), ...(f.total_area === undefined ? ["total_area"] : []), ...(f.kitchen_kw === undefined ? ["kitchen_kw"] : []), ...(f.exhaust_down === undefined ? ["exhaust_down"] : [])] })];
        return kitchenRest(b, f, uses ? `延べ面積${f.total_area}㎡（1,000㎡未満）` : "延べ面積の基準の対象用途ではない");
      }
      if (f.facility === "sauna") {
        const b = { ...base, procedure: "kaki-setsubi", title: "サウナ設備設置届", form: "炉・厨房設備等設置届出書（第7号様式）", basis: `${K_JO} 第56条第9号・第10号、${K_KI} 第11条` };
        if (f.residence) return [v({ ...b, result: "not_required", reason: "個人の住居に設ける一般サウナ・個人が設ける簡易サウナは対象外" })];
        if (f.residence === undefined) return [v({ ...b, result: "conditional", reason: "事業所などに設けるものは対象（個人の住居・個人が設ける簡易サウナは除く）", missing: ["residence"] })];
        return [v({ ...b, result: "required", reason: "個人の住居以外に設けるサウナ設備" })];
      }
      if (f.facility === "battery") {
        const b = { ...base, procedure: "kaki-setsubi", title: "蓄電池設備設置届", form: "燃料電池発電設備・変電設備等設置届出書（第8号様式）", basis: `${K_JO} 第56条第18号、${K_KI} 第11条` };
        if (f.battery_kwh === undefined) return [v({ ...b, result: "conditional", reason: "蓄電池容量20kWh超が対象", missing: ["battery_kwh"] })];
        return [v({ ...b, result: f.battery_kwh > 20 ? "required" : "not_required", reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${f.battery_kwh > 20 ? "超" : "以下"}）` })];
      }
      return [v({ ...base, procedure: "kaki-setsubi", title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（条例第56条第1号〜第20号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return hazmatGate(f, 0.2, K_JO + " 第58条") ?? [v({ procedure: "shoryo-kikenbutsu", title: "少量危険物等貯蔵・取扱届", target, result: "required", deadline: "貯蔵し、又は取り扱う場所を設ける日の7日前まで", form: "少量危険物等貯蔵・取扱届出書（第13号様式）", basis: `${K_JO} 第58条、${K_KI} 第15条`, reason: "指定数量の5分の1以上、指定数量未満の危険物を貯蔵・取扱う場合", caveats: ["量が指定数量の5分の1未満なら不要、指定数量以上なら消防法の許可が必要", "変更・廃止のときも届出が要る"] })];
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target, deadline: "実施する日の5日前まで", basis: `${K_JO} 第57条第9号、${K_KI} 第13条` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", reason: "対象火気器具等を使わない露店は第9号の対象外", caveats: ["消防隊の通行など消火活動に支障を及ぼすおそれがある場合は第6号の届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日など多数の者が集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [], caveats: ["指定催しで露店等管理者の管理の下に開設する場合は不要", "署長が事前に状況を把握して指導したものは口頭でよい"] })];
    }
    case "temp_use":
      return [v({ procedure: "ichiji-shiyo", title: "一時的な使用の届出", target, result: "conditional", basis: `${K_JO} 第55条・第57条第3号`, reason: "京都市の条例には一時的な店舗使用の届出の規定はない。使用開始届（7日前）の対象か、劇場・展示場などの用途なら催物の届出（5日前）かを所轄に確認する", missing: [] })];
    case "event":
      return [v({ procedure: "saimono", title: "催物開催届", target, result: "required", deadline: "実施する日の5日前まで", basis: `${K_JO} 第57条第3号、${K_KI} 第13条`, reason: "防火対象物を一時的に劇場等・ディスコ等・展示場の用途に使う催物" })];
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target, result: "conditional", basis: `${K_JO} 第55条第3項・第56条`, reason: "京都市の条例には工事計画そのものの届出はない。用途や使用形態が変わる場合は使用の変更届（7日前）、火を使う設備を設ける場合は設置届（5日前）が要る", caveats: ["建築確認が必要な工事は消防同意の対象", "消防用設備等の工事は消防法の着工届（10日前）・設置届（4日以内）"] })];
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災と紛らわしい煙等を発するおそれのある行為の届出", target, result: "required", deadline: "実施する日の前日まで", basis: `${K_JO} 第57条第1号、${K_KI} 第13条`, reason: "火災と紛らわしい煙又は火炎を発するおそれのある行為", caveats: ["口頭で届け出ることもできる（規則第13条ただし書）"] })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "断水・減水の届出", target, result: "required", deadline: "実施する日の3日前まで", basis: `${K_JO} 第57条第5号、${K_KI} 第13条`, reason: "水道の断水又は減水" })];
    default:
      return null;
  }
}

function kitchenRest(b: Omit<FilingVerdict, "result" | "reason" | "caveats" | "missing" | "lane">, f: FilingFacts, why: string): FilingVerdict[] {
  if (f.kitchen_kw === undefined || f.exhaust_down === undefined)
    return [v({ ...b, result: "conditional", reason: `${why}。同一厨房室の入力合計350kW以上、又は排気ダクトが立ち下がるものなら対象`, missing: [...(f.kitchen_kw === undefined ? ["kitchen_kw"] : []), ...(f.exhaust_down === undefined ? ["exhaust_down"] : [])] })];
  return [v({ ...b, result: "not_required", reason: `${why}。入力合計${f.kitchen_kw}kW（350kW未満）で、排気ダクトは立ち下がらない` })];
}

const labelOf = (e: string) => EQUIPMENT_LABEL[e as Equipment] ?? e;

// ---- 東京都（東京消防庁管内）----

function tokyo(scene: Scene, f: FilingFacts): FilingVerdict[] | null {
  const target = "消防署長";
  const designated = () => {
    // 指定防火対象物等: 令10条1項各号、令21条1項1号（(13)項ロを除く）・3号・7号に当たるもの
    if (!f.occupancy) return null;
    const facts = f as Facts;
    const ex = judge("extinguisher", facts);
    const aa = judge("auto_alarm", facts);
    const aaHit = aa.result === "required" && /第一号|第三号|第七号/.test(aa.basis) && !/^13ロ/.test(f.occupancy.normalize("NFKC"));
    if (ex.result === "required" || aaHit) return true;
    if (ex.result === "conditional" || aa.result === "conditional") return null;
    return false;
  };
  switch (scene) {
    case "use_start": {
      const d = designated();
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target, result: "required", deadline: "使用を開始する日の7日前まで", basis: `${T_JO} 第五十六条の二`, reason: "令別表第一の防火対象物（(19)項・(20)項を除く）を使用する場合は規模にかかわらず必要", inspection: d === true ? "指定防火対象物等に当たるため、使用開始前に消防署長の検査を受ける（同条第3項）" : d === null ? "指定防火対象物等に当たれば使用開始前に検査を受ける（同条第3項）" : undefined })];
    }
    case "renovation": {
      const b = { procedure: "koji-keikaku", title: "防火対象物工事等計画届", target, deadline: "工事に着手する日の7日前まで", basis: `${T_JO} 第五十六条` };
      if (f.building_permit === true) return [v({ ...b, result: "not_required", reason: "建築確認を受ける工事は対象外（同条ただし書）" })];
      const d = designated();
      if (d === false) return [v({ ...b, result: "not_required", reason: "指定防火対象物等に当たらない" })];
      const miss = [...(f.building_permit === undefined ? ["building_permit"] : []), ...(d === null ? ["occupancy", "total_area"] : [])];
      return [v({ ...b, result: miss.length ? "conditional" : "required", reason: "指定防火対象物等の修繕・模様替え・用途変更など（建築確認を受けるものを除く）", missing: [...new Set(miss)] })];
    }
    case "temp_use":
      return [v({ procedure: "ichiji-shiyo", title: "防火対象物一時使用届", target, result: "required", deadline: "一時的な使用を開始する日の7日前まで", basis: `${T_JO} 第五十六条の三`, reason: "防火対象物を一時的に不特定の者が出入りする店舗等として使う", inspection: "指定防火対象物等なら使用開始前に検査を受ける（同条第3項）" })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "工事に着手する日の7日前まで", basis: `${T_JO} 第五十七条`, inspection: "使用開始前に消防署長の検査を受ける（同条第4項）" };
      if (f.facility === "kitchen") {
        if (f.exhaust_down === true) return [v({ ...b, title: "火気使用設備等設置届（厨房設備）", result: "required", reason: "排気取入口から下方に排気する方式は入力にかかわらず対象" })];
        if (f.kitchen_kw === undefined) return [v({ ...b, title: "火気使用設備等設置届（厨房設備）", result: "conditional", reason: "入力の合計120kW以上、又は下方排気方式なら対象", missing: ["kitchen_kw", ...(f.exhaust_down === undefined ? ["exhaust_down"] : [])] })];
        if (f.kitchen_kw >= 120) return [v({ ...b, title: "火気使用設備等設置届（厨房設備）", result: "required", reason: `入力の合計${f.kitchen_kw}kW（120kW以上）` })];
        if (f.exhaust_down === undefined) return [v({ ...b, title: "火気使用設備等設置届（厨房設備）", result: "conditional", reason: `入力の合計${f.kitchen_kw}kW（120kW未満）。下方排気方式なら対象`, missing: ["exhaust_down"] })];
        return [v({ ...b, title: "火気使用設備等設置届（厨房設備）", result: "not_required", reason: `入力の合計${f.kitchen_kw}kW（120kW未満）で、下方排気方式ではない` })];
      }
      if (f.facility === "sauna") return [v({ ...b, title: "火気使用設備等設置届（サウナ設備）", result: "required", reason: "サウナ設備は規模にかかわらず対象（第8号）" })];
      if (f.facility === "battery") {
        if (f.battery_kwh === undefined) return [v({ ...b, title: "火気使用設備等設置届（蓄電池設備）", result: "conditional", reason: "蓄電池容量20kWh超が対象（第16号）", missing: ["battery_kwh"] })];
        return [v({ ...b, title: "火気使用設備等設置届（蓄電池設備）", result: f.battery_kwh > 20 ? "required" : "not_required", reason: `蓄電池容量${f.battery_kwh}kWh` })];
      }
      return [v({ ...b, title: "火気使用設備等設置届", result: "conditional", reason: "設備の種類と規模で決まる（同条第1項第1号〜第18号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return hazmatGate(f, f.residence ? null : 0.2, T_JO + " 第五十八条") ?? [v({ procedure: "shoryo-kikenbutsu", title: "少量危険物貯蔵取扱所設置届", target, result: "required", deadline: "設置する日（工事を伴う場合は工事に着手する日）の10日前まで", basis: `${T_JO} 第五十八条`, reason: "少量危険物貯蔵取扱所を設置する", inspection: "貯蔵・取扱いを始める前に消防署長の検査を受ける（同条第4項）", caveats: ["廃止したときは遅滞なく届け出る（同条第5項）"] })];
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target, deadline: "あらかじめ", basis: `${T_JO} 第六十条第五号` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", reason: "火気使用器具等を使わない露店は第5号の対象外", caveats: ["消防隊の通行など消火活動に支障を及ぼすおそれがある露店は第4号で届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日など多数の者の集合する催しで、火気使用器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [] })];
    }
    case "event": {
      const b = { procedure: "saimono", title: "催物開催届", target, deadline: "催しを行う日の3日前まで", basis: `${T_JO} 第五十九条の三` };
      if (f.exhibition_hall === false) return [v({ ...b, result: "not_required", reason: "観覧場・展示場以外での催しは第59条の3の対象外", caveats: ["一時的に不特定の者が出入りする店舗等として使う場合は一時使用届（7日前）"] })];
      return [v({ ...b, result: f.exhibition_hall ? "required" : "conditional", reason: "観覧場・展示場で多数の者を収容して行う催し", missing: f.exhibition_hall === undefined ? ["exhibition_hall"] : [], caveats: ["一時使用届を出した場合は不要"] })];
    }
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災と紛らわしい煙等を発するおそれのある行為の届出", target, result: "required", deadline: "あらかじめ", basis: `${T_JO} 第六十条第一号`, reason: "火災と紛らわしい煙又は火炎を発するおそれのある行為" })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "断水・減水の届出", target, result: "required", deadline: "あらかじめ", basis: `${T_JO} 第六十条第三号`, reason: "水道の断水又は減水" })];
    default:
      return null;
  }
}

// 指定数量に対する割合で、少量危険物の届出の対象かを決める（threshold: 5分の1なら0.2、null は不明）
// ---- 名古屋市 ----

function nagoya(scene: Scene, f: FilingFacts): FilingVerdict[] {
  const target = "消防署長";
  const JO = "名古屋市火災予防条例";
  const SA = "消防法等施行細則";
  switch (scene) {
    case "use_start":
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target, result: "required", deadline: "使用開始の日の7日前まで", form: "別記第6の様式", basis: `${JO} 第66条、${SA} 第10条`, reason: "令別表第一の防火対象物（(19)項・(20)項を除く）を使用する場合は規模にかかわらず必要" })];
    case "renovation":
      return [v({ procedure: "koji-keikaku", title: "防火対象物工事計画届", target, result: "required", deadline: "工事に着手する前", form: "別記第7の様式（関係図面を添付）", basis: `${JO} 第66条の2、${SA} 第11条`, reason: "新築・増築・改築・移転・修繕・模様替え・用途変更の工事（建築確認の有無を問わない）" })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物の開催の届出", target, result: "conditional", deadline: "あらかじめ", basis: `${JO} 第69条第4号`, reason: "劇場等以外の場所での演劇・映画などの催物は届出が要る。一時的な物品販売だけなら対象か所轄に確認する" })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "あらかじめ", form: "別記第9の様式（関係図面と届出書の写し1部を添付）", basis: `${JO} 第68条、${SA} 第13条` };
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置届（厨房設備）";
        if (f.residence) return [v({ ...b, title: t, result: "not_required", reason: "個人の住居に設けるものは対象外" })];
        if (f.has_duct === false) return [v({ ...b, title: t, result: "not_required", reason: "排気用ダクト等のない厨房設備は第68条第2号の3の対象外" })];
        if (f.has_duct === undefined) return [v({ ...b, title: t, result: "conditional", reason: "排気用ダクト等を有する厨房設備は入力にかかわらず対象", missing: ["has_duct"] })];
        return [v({ ...b, title: t, result: "required", reason: "排気用ダクト等を有する厨房設備（入力の大小を問わない）", basis: `${JO} 第68条第2号の3、${SA} 第13条` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置届（サウナ設備）";
        if (f.residence) return [v({ ...b, title: t, result: "not_required", reason: "個人の住居に設ける一般サウナ・個人が設ける簡易サウナは対象外" })];
        if (f.residence === undefined) return [v({ ...b, title: t, result: "conditional", reason: "事業所などに設けるものは対象", missing: ["residence"] })];
        return [v({ ...b, title: t, result: "required", reason: "個人の住居以外に設けるサウナ設備（第68条第4号の2・第4号の3）" })];
      }
      if (f.facility === "battery") {
        const t = "火を使用する設備等の設置届（蓄電池設備）";
        if (f.battery_kwh === undefined) return [v({ ...b, title: t, result: "conditional", reason: "蓄電池容量20kWh超が対象（第68条第10号）", missing: ["battery_kwh"] })];
        return [v({ ...b, title: t, result: f.battery_kwh > 20 ? "required" : "not_required", reason: `蓄電池容量${f.battery_kwh}kWh` })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第68条各号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return hazmatGate(f, f.residence ? null : 0.2, `${JO} 第70条`) ?? [v({ procedure: "shoryo-kikenbutsu", title: "少量危険物等の貯蔵・取扱いの届出", target, result: "required", deadline: "あらかじめ", basis: `${JO} 第70条、${SA} 第15条`, reason: "少量危険物又は指定可燃物等を貯蔵し、又は取り扱う", caveats: ["関係図面と届出書の写し1部を添える（細則第15条）", "やめたときは速やかに届け出る（条例第70条第2項）"] })];
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target, deadline: "あらかじめ", basis: `${JO} 第69条第6号` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", reason: "対象火気器具等を使わない露店は第6号の対象外" })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日など多数の者の集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [] })];
    }
    case "drill":
      return [v({ procedure: "kunren", title: "消防訓練の届出", target, result: "required", deadline: "実施の3日前まで", form: "消防吏員の協力を求めるときは別記第8の様式、それ以外は適宜の方法", basis: `${JO} 第67条、${SA} 第12条`, reason: "防火管理者（防災管理者）が消防訓練を実施する場合" })];
    case "hot_work":
      return [v({ procedure: "yosetsu", title: "溶接・溶断作業の届出", target, result: "required", deadline: "あらかじめ", form: "別記第14の2の様式", basis: `${JO} 第69条第3号、${SA} 第14条`, reason: "溶接又は溶断の作業" })];
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災とまぎらわしい煙等を発するおそれのある行為の届出", target, result: "required", deadline: "あらかじめ", basis: `${JO} 第69条第1号`, reason: "火災とまぎらわしい煙又は火炎を発するおそれのある行為" })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "断水・減水の届出", target, result: "required", deadline: "あらかじめ", basis: `${JO} 第69条第7号`, reason: "水道の断水又は減水" })];
  }
}

// ---- 大阪市 ----

function osaka(scene: Scene, f: FilingFacts): FilingVerdict[] {
  const JO = "大阪市火災予防条例";
  const KI = "大阪市火災予防条例施行規則";
  const viaChief = "所轄消防署長を経て消防長";
  const station = "所轄消防署長";
  switch (scene) {
    case "use_start": {
      const facts = f as Facts;
      const eq = f.occupancy ? (["extinguisher", "indoor_hydrant", "sprinkler", "auto_alarm", "emergency_alarm", "guide_light"] as const).map((e) => judge(e, facts)) : [];
      const insp = eq.some((x) => x.result === "required") ? "消防用設備等の設置が必要な防火対象物なので、使用開始前に消防署長の検査を受ける（条例第56条第2項）" : "消防用設備等の設置が必要なら、使用開始前に消防署長の検査を受ける（条例第56条第2項）";
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target: viaChief, result: "required", deadline: "使用開始の日の7日前まで", form: "第3号様式（階数10以上又は2棟以上は第4号様式も）", basis: `${JO} 第56条、${KI} 第5条`, reason: "令別表第一の防火対象物を使用する場合は規模にかかわらず必要", inspection: insp })];
    }
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target: viaChief, result: "conditional", basis: `${JO} 第61条の2、${KI} 第9条の2`, reason: "大阪市の条例には工事計画そのものの届出はない。消防用設備等の工事をするなら工事設計書を着手の10日前までに届け出る", caveats: ["用途が変わるなら使用開始届の変更（条例第56条）が要る"] })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催し物の開催の届出", target: station, result: "conditional", deadline: "実施する日の3日前まで", basis: `${JO} 第58条第3号、${KI} 第7条`, reason: "劇場等以外の建築物などで演劇・映画などの催し物を開く場合に必要。物品販売だけなら対象か所轄に確認する" })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target: viaChief, deadline: "設置又は変更の日の5日前まで", form: "第5号様式〜第8号様式", basis: `${JO} 第57条、${KI} 第6条` };
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置届（厨房設備）";
        if (f.kitchen_kw === undefined) return [v({ ...b, title: t, result: "conditional", reason: "同一厨房室の入力の合計350kW以上が対象（第57条第3号の2）", missing: ["kitchen_kw"] })];
        return [v({ ...b, title: t, result: f.kitchen_kw >= 350 ? "required" : "not_required", reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW${f.kitchen_kw >= 350 ? "以上" : "未満"}）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置届（サウナ設備）";
        if (f.residence) return [v({ ...b, title: t, result: "not_required", reason: "個人の住居に設ける一般サウナ・個人が設ける簡易サウナは対象外" })];
        if (f.residence === undefined) return [v({ ...b, title: t, result: "conditional", reason: "事業所などに設けるものは対象", missing: ["residence"] })];
        return [v({ ...b, title: t, result: "required", reason: "個人の住居以外に設けるサウナ設備（第57条第6号・第6号の2）" })];
      }
      if (f.facility === "battery") {
        const t = "火を使用する設備等の設置届（蓄電池設備）";
        if (f.battery_kwh === undefined) return [v({ ...b, title: t, result: "conditional", reason: "蓄電池容量20kWh超が対象（第57条第10号）", missing: ["battery_kwh"] })];
        return [v({ ...b, title: t, result: f.battery_kwh > 20 ? "required" : "not_required", reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${f.battery_kwh > 20 ? "超" : "以下は対象外"}）` })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第57条各号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return hazmatGate(f, f.residence ? null : 0.2, `${JO} 第60条`) ?? [v({ procedure: "shoryo-kikenbutsu", title: "少量危険物等の貯蔵・取扱いの届出", target: station, result: "required", deadline: "貯蔵・取扱いを開始する日の7日前まで", form: "第14号様式", basis: `${JO} 第60条、${KI} 第8条`, reason: "少量危険物又は指定可燃物等を貯蔵し、又は取り扱う", caveats: ["廃止したときは遅滞なく届け出る（規則第8条）"] })];
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target: station, deadline: "実施する日の3日前まで", basis: `${JO} 第58条第6号、${KI} 第7条` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", reason: "火を使用する器具等を使わない露店は第6号の対象外", caveats: ["消防隊の活動を困難にするおそれがある場合は第4号の届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日など多数の者の集合する催しで、火を使用する器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [] })];
    }
    case "drill":
      return drillNational(f, "消防署長");
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第58条`, station, "防火管理者の火気管理や、工事中の防火管理は別途必要");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災とまぎらわしい煙等を発するおそれのある行為の届出", target: station, result: "required", deadline: "実施する日の前日まで", basis: `${JO} 第58条第1号、${KI} 第7条`, reason: "たき火を含む、火災とまぎらわしい煙又は火炎を発するおそれのある行為", caveats: ["やむをえない場合に限り口頭でよい（規則第7条ただし書）"] })];
    case "water_outage":
      return noProvision("断水・減水の届出", "dansui", `${JO} 第58条`, station, "道路工事などで消防隊の活動を困難にするおそれがある場合は第58条第4号の届出が要る");
  }
}

// ---- 横浜市 ----

function yokohama(scene: Scene, f: FilingFacts): FilingVerdict[] {
  const JO = "横浜市火災予防条例";
  const KI = "横浜市火災予防規則";
  const target = "消防署長";
  const five = "実施する日の5日前まで（規則第35条）";
  switch (scene) {
    case "use_start":
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target, result: "required", deadline: "使用開始日の7日前まで", form: "防火対象物使用開始(変更)届出書（第8号様式）", basis: `${JO} 第73条、${KI} 第29条`, reason: "令別表第一の防火対象物（(19)項・(20)項を除く）を使用する場合は規模にかかわらず必要", inspection: "消火器・簡易消火用具・非常警報器具・誘導標識以外の消防用設備等があれば、使用開始前に消防署長の検査を受ける（条例第73条第2項）" })];
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target, result: "conditional", basis: `${JO} 第73条第3項・第78条、${KI} 第34条`, reason: "横浜市の条例には工事計画そのものの届出はない。用途・構造・消防用設備等を変えるなら使用開始届の変更（7日前）、5階以上・3,000㎡超などの建物で消防用設備等を設けるなら設置等計画届が要る" })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物開催届", target, result: "conditional", deadline: five, form: "催物開催届出書（第14号様式）", basis: `${JO} 第75条第3号・第4号、${KI} 第31条`, reason: "劇場等以外での演劇・映画などの催物、又は劇場等を一時的に観覧等に使う場合に必要。物品販売だけなら対象か所轄に確認する" })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "あらかじめ（規則第35条により5日前まで）", basis: `${JO} 第74条、${KI} 第30条・第35条`, inspection: "届け出て確認を受け、使用開始前に消防署長の検査を受ける（条例第74条第2項）" };
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置届（厨房設備）";
        if (f.residence) return [v({ ...b, title: t, result: "not_required", reason: "個人の住居に設けるものは対象外" })];
        if (f.kitchen_kw === undefined) return [v({ ...b, title: t, result: "conditional", reason: "同一厨房室の入力の合計350kW以上が対象（第74条第3号の2）", missing: ["kitchen_kw"] })];
        return [v({ ...b, title: t, result: f.kitchen_kw >= 350 ? "required" : "not_required", form: "火を使用する設備等の設置(変更)届出書（第9号様式）", reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW${f.kitchen_kw >= 350 ? "以上" : "未満"}）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置届（サウナ設備）";
        if (f.personal_use === true) return [v({ ...b, title: t, result: "not_required", reason: "個人的な使用のための簡易サウナ、個人の住居の一般サウナは対象外（第74条第1項・第5号の2）" })];
        if (f.residence === false) return [v({ ...b, title: t, result: "required", form: "火を使用する設備等の設置(変更)届出書（第9号様式）", reason: "事業所などに設けるサウナ設備" })];
        return [v({ ...b, title: t, result: "conditional", reason: "事業所などに設けるもの、個人の住居でも人に使わせる簡易サウナは対象", missing: ["residence", "personal_use"] })];
      }
      if (f.facility === "battery") {
        const t = "電気設備設置届（蓄電池設備）";
        if (f.residence) return [v({ ...b, title: t, result: "not_required", reason: "個人の住居に設けるものは対象外" })];
        if (f.battery_kwh === undefined) return [v({ ...b, title: t, result: "conditional", reason: "蓄電池容量20kWh超が対象（第74条第11号）", missing: ["battery_kwh"] })];
        return [v({ ...b, title: t, result: f.battery_kwh > 20 ? "required" : "not_required", form: "電気設備設置(変更)届出書（第10号様式）", reason: `蓄電池容量${f.battery_kwh}kWh` })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第74条各号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第76条`) ?? [v({ procedure: "shoryo-kikenbutsu", title: "少量危険物・指定可燃物貯蔵・取扱届", target, result: "required", deadline: "あらかじめ（規則第35条により5日前まで）", form: "第17号様式", basis: `${JO} 第76条、${KI} 第32条・第35条`, reason: "少量危険物（個人の住居では指定数量の2分の1以上）又は指定可燃物を貯蔵し、又は取り扱う", caveats: ["変更・廃止のときも届け出る（条例第76条第2項）"] })];
    case "stall": {
      const b = { procedure: "roten", title: "露店等開設届", target, deadline: five, form: "露店等開設届出書（第16号様式の2）", basis: `${JO} 第75条第7号、${KI} 第31条・第35条` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", reason: "対象火気器具等を使わない露店は第7号の対象外" })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日など多数の者の集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [] })];
    }
    case "drill":
      return drillNational(f, "消防署長");
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第75条`, target, "防火管理者の火気管理や、工事中の防火管理は別途必要");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火煙発生届", target, result: "required", deadline: five, form: "火煙発生届出書（第12号様式）", basis: `${JO} 第75条第1号、${KI} 第31条・第35条`, reason: "たき火等を含む、火災と紛らわしい煙又は火炎を発するおそれのある行為" })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道断水・減水届", target: f.multi_ward ? "消防長" : f.multi_ward === false ? "消防署長" : "消防署長（区域が2以上の消防署の管轄にわたるときは消防長）", result: "required", deadline: five, form: "水道断水・減水届出書（第15号様式）", basis: `${JO} 第75条第5号、${KI} 第31条・第35条`, reason: "水道の断水又は減水", caveats: ["消防長に出すときの部数は、断水区域がわたる消防署の管轄区域の数（規則第31条第2項）"] })];
  }
}

export function judgeFilings(jurisdiction: Jurisdiction, scene: Scene, facts: FilingFacts): FilingVerdict[] {
  switch (jurisdiction) {
    case "kyoto-city":
      return kyoto(scene, facts) ?? commonKyotoTokyo(scene, facts, "所轄消防署長", K_JO);
    case "tokyo-tfd":
      return tokyo(scene, facts) ?? commonKyotoTokyo(scene, facts, "消防署長", T_JO);
    case "nagoya-city":
      return nagoya(scene, facts);
    case "osaka-city":
      return osaka(scene, facts);
    case "yokohama-city":
      return yokohama(scene, facts);
    case "general":
      return generalFilings(scene, facts);
    default:
      return CITY_FILINGS[jurisdiction](scene, facts);
  }
}

function commonKyotoTokyo(scene: Scene, f: FilingFacts, target: string, jo: string): FilingVerdict[] {
  if (scene === "drill") return drillNational(f, target);
  if (scene === "hot_work") return noProvision("溶接・溶断作業の届出", "yosetsu", jo, target, "防火管理者の火気管理や、工事中の防火管理は別途必要");
  return [v({ procedure: scene, title: "届出", target, result: "conditional", basis: jo, reason: "この場面の届出は個別に確認が必要" })];
}


// ---- 一般版（条例を確認していない地域） ----
// 火災予防条例の届出は市町村ごとに定めるため、所在地の条例は判定できない。
// 代わりに、条文を確認済みの管轄（下の VERIFIED）で同じ条件を判定し、結論と期限の分かれ方をそのまま示す。
// 管轄の結論がすべて一致したときだけその結論を使い、分かれたときは「条件次第」にする。期限は断定しない。
// 消防訓練の通報は国の規則なので drillNational をそのまま使う。

export const VERIFIED: Exclude<Jurisdiction, "general">[] = [
  "sapporo-city", "sendai-city", "saitama-city", "chiba-city", "tokyo-tfd", "yokohama-city", "kawasaki-city", "sagamihara-city",
  "niigata-city", "shizuoka-city", "hamamatsu-city", "nagoya-city", "kyoto-city", "osaka-city", "sakai-city", "kobe-city",
  "okayama-city", "hiroshima-city", "kitakyushu-city", "fukuoka-city", "kumamoto-city",
];

const RESULT_LABEL = { required: "必要", not_required: "不要", conditional: "条件次第" } as const;

/** 期限の書き方を比べられる形にそろえる（「あらかじめ（規則により5日前まで）」は5日前に数える） */
export function deadlineKind(d: string | undefined): string {
  if (!d) return "定めなし";
  if (/前日|1日前/.test(d)) return "前日まで";
  const m = d.match(/(\d+)日前/);
  if (m) return `${m[1]}日前まで`;
  if (/あらかじめ|前/.test(d)) return "あらかじめ（日数の定めなし）";
  return "その他";
}

const tally = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export function generalFilings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  const target = "所在地の消防署（消防本部）";
  const basis = "建物や催しの所在地の市町村の火災予防条例";
  if (scene === "drill")
    return drillNational(f, "所轄の消防機関").map((x) => ({
      ...x,
      caveats: [...x.caveats, "市町村の条例で、別に届出の期限や様式を定めている場合がある（確認済みの管轄では名古屋市・千葉市が3日前まで）"],
    }));
  const per = VERIFIED.map((j) => judgeFilings(j, scene, f)[0]).filter((x): x is FilingVerdict => !!x);
  if (!per.length) return [];
  const n = per.length;
  const results = tally(per.map((x) => x.result));
  const unanimous = results.length === 1;
  const result = unanimous ? per[0].result : "conditional";
  const title = tally(per.map((x) => x.title))[0][0];
  const resultSummary = results.map(([r, c]) => `${RESULT_LABEL[r as keyof typeof RESULT_LABEL]}${c}`).join("・");
  const withDeadline = per.filter((x) => x.result !== "not_required");
  const deadlines = tally(withDeadline.map((x) => deadlineKind(x.deadline)));
  const deadline = withDeadline.length
    ? `所在地の条例で確認（確認済みの${withDeadline.length}管轄では ${deadlines.map(([k, c]) => `${k}${c}`).join("、")}）`
    : undefined;
  const missing = result === "conditional" ? [...new Set(per.flatMap((x) => x.missing))] : [];
  const reason = unanimous
    ? `条文を確認済みの${n}管轄（政令指定都市など）では、この条件ならすべて「${RESULT_LABEL[result]}」。所在地の市町村の条例は未確認`
    : `条文を確認済みの${n}管轄でも結論が分かれる（${resultSummary}）。所在地の市町村の条例で決まる`;
  return [
    v({
      procedure: per[0].procedure,
      title,
      target,
      result,
      deadline,
      basis,
      reason,
      missing,
      caveats: [
        "期限・様式・提出先・対象の範囲は市町村の火災予防条例で決まる。所在地の消防本部で確認する",
        "消防庁が市町村向けに火災予防条例（例）を示しているが、各市町村の条例は内容や条番号が違うことがある",
      ],
    }),
  ];
}
