// 熊本市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認）
//   熊本市火災予防条例（昭和37年条例第11号）第43条〜第46条（第6章 雑則）
//   熊本市火災予防規則（昭和63年規則第16号）第5条・第13条〜第17条・第19条
//   例規集: 熊本市例規集 Reiki-Base（https://krq402.legal-square.com/HAS-Shohin/page/SJSrbLogin.jsf）
//     （市の案内ページ https://www.city.kumamoto.jp/kiji0033879/index.html から移動）
//   様式番号: 規則第19条で市長が別に定める。番号は消防局「申請・届出書 _ 条例関係」で確認
//     https://www.city.kumamoto.jp/kiji0031569/index.html（2023-04-01 更新）
//   消防訓練の通報: 条例に定めがないので消防法施行規則 第3条第10項・第11項
// 熊本市消防局は上益城郡益城町・阿蘇郡西原村の常備消防も受託しており（益城西原消防署）、
// この条例は両町村の区域にも適用される（条例附則第6項・第7項、消防本部及び消防署の設置等に関する条例 別表）。
import { drillNational, hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "熊本市火災予防条例";
const KI = "熊本市火災予防規則";
const target = "所轄消防署長";
const NO_DAYS = "規則に提出期限の日数の定めはない。何日前までに出すかは所轄の消防署指導課に確認する";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start":
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target, result: "required", deadline: "使用開始の日の7日前まで", form: "防火対象物使用開始届出書（様式第15号（その1））", basis: `${JO} 第43条、${KI} 第13条`, reason: "令別表第一の防火対象物（(19)項・(20)項を除く）をそれぞれの用途に使用する場合は規模にかかわらず必要", caveats: ["管轄する消防署の指導課予防班へ1部。案内図・平面図・立面図を添える（消防局の案内ページ）"] })];
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target, result: "conditional", basis: `${JO} 第43条`, reason: "熊本市の条例には工事計画そのものの届出はない。工事の後に新しい用途で使い始めるなら使用開始届（7日前）が要る", caveats: ["増改築や用途の変更は、消防用設備等の設置が新たに必要になることがあるので計画段階で管轄の消防署に相談するよう消防局が案内している"] })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物開催届", target, result: "conditional", deadline: "あらかじめ", form: "催物開催届出書（様式第22号）", basis: `${JO} 第45条第3号、${KI} 第15条`, reason: "劇場等以外の建築物その他の工作物で演劇・映画その他の催物を開く場合に必要。物品販売だけなら対象か所轄に確認する", caveats: [NO_DAYS] })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "設置工事に着手する日の7日前まで", basis: `${JO} 第44条、${KI} 第14条` };
      const f16 = "炉・厨房設備・温風暖房機・ボイラー・給湯湯沸設備・乾燥設備・サウナ設備・ヒートポンプ冷暖房機・火花を生ずる設備・放電加工機 設置届出書（様式第16号）";
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置の届出（厨房設備）";
        if (f.kitchen_kw === undefined) return [v({ ...b, title: t, result: "conditional", reason: "同一厨房室内の厨房設備の入力の合計が350kW以上のものが対象（第44条第3号の2）", missing: ["kitchen_kw"] })];
        const req = f.kitchen_kw >= 350;
        return [v({ ...b, title: t, result: req ? "required" : "not_required", form: req ? f16 : undefined, reason: `同一厨房室内の入力の合計${f.kitchen_kw}kW（350kW${req ? "以上" : "未満"}）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置の届出（サウナ設備）";
        if (f.residence === true && f.personal_use === true) return [v({ ...b, title: t, result: "not_required", reason: "個人が設ける簡易サウナ設備、個人の住居に設ける一般サウナ設備は対象外（第44条第6号の2・第7号）" })];
        if (f.residence === false) return [v({ ...b, title: t, result: "required", form: f16, reason: "個人の住居以外に設けるサウナ設備（第44条第6号の2・第7号）" })];
        return [v({ ...b, title: t, result: "conditional", reason: "簡易サウナ設備は個人が設けるもの以外、一般サウナ設備は個人の住居以外に設けるものが対象", missing: ["residence", "personal_use"] })];
      }
      if (f.facility === "battery") {
        const t = "火を使用する設備等の設置の届出（蓄電池設備）";
        const f17 = "急速充電設備・燃料電池発電設備・変電設備・発電設備・蓄電池設備 設置届出書（様式第17号）";
        if (f.battery_kwh === undefined) return [v({ ...b, title: t, result: "conditional", reason: "蓄電池容量20kWh以下のものは対象外（第44条第13号）", missing: ["battery_kwh"] })];
        const req = f.battery_kwh > 20;
        return [v({ ...b, title: t, result: req ? "required" : "not_required", form: req ? f17 : undefined, reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${req ? "超" : "以下は対象外"}）` })];
      }
      if (f.facility === "boiler") {
        const t = "火を使用する設備等の設置の届出（ボイラー）";
        if (f.residence) return [v({ ...b, title: t, result: "not_required", reason: "個人の住居に設けるボイラーは対象外（第44条第5号）" })];
        return [v({ ...b, title: t, result: f.residence === false ? "required" : "conditional", form: f.residence === false ? f16 : undefined, reason: "ボイラー（個人の住居に設けるもの、労働安全衛生法施行令第1条第3号のものを除く）", missing: f.residence === undefined ? ["residence"] : [] })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置の届出", result: "conditional", reason: "設備の種類と規模で決まる（第44条各号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第46条`) ?? [v({ procedure: "shoryo-kikenbutsu", title: "少量危険物・指定可燃物の貯蔵・取扱いの届出", target, result: "required", deadline: "あらかじめ", form: "少量危険物・指定可燃物 貯蔵・取扱届出書（様式第27号）", basis: `${JO} 第46条、${KI} 第17条`, reason: "指定数量の5分の1以上（個人の住居では2分の1以上）指定数量未満の危険物、又は別表第8の数量の5倍以上の指定可燃物を貯蔵し、又は取り扱う", caveats: ["廃止するときも届け出る（条例第46条第2項、規則第17条第2項。様式第28号）", NO_DAYS] })];
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target, deadline: "あらかじめ", form: "露店等の開設届出書（様式第25号）", basis: `${JO} 第45条第6号、${KI} 第15条` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", form: undefined, reason: "対象火気器具等を使わない露店は第6号の対象外" })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日・花火大会・展示会など多数の者の集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [], caveats: [NO_DAYS] })];
    }
    case "drill":
      return drillNational(f, "所轄消防署長");
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第45条`, target, "市長がたき火・喫煙を制限した区域内で工事などのために火気を使う場合は、3日前までに火気使用届出書（様式第2号）を出す（規則第5条）");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災と紛らわしい煙又は火炎を発するおそれのある行為の届出", target, result: "required", deadline: "あらかじめ", form: "火災とまぎらわしい煙又は火炎を発するおそれのある行為の届出書（様式第20号）", basis: `${JO} 第45条第1号、${KI} 第15条`, reason: "たき火を含む、火災と紛らわしい煙又は火炎を発するおそれのある行為", caveats: ["やむを得ない場合に限り口頭・電話等でよい（規則第15条第1項ただし書）", NO_DAYS] })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道断・減水の届出", target, result: "required", deadline: "あらかじめ", form: "水道断・減水届出書（様式第23号）", basis: `${JO} 第45条第4号、${KI} 第15条`, reason: "水道の断水又は減水", caveats: ["やむを得ない場合に限り口頭・電話等でよい（規則第15条第1項ただし書）", NO_DAYS] })];
  }
}
