// 福岡市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認）
//   福岡市火災予防条例（昭和37年条例第28号）第43条〜第46条（第6章 雑則）
//     https://www.city.fukuoka.lg.jp/d1w_reiki/reiki_honbun/q003RG00000988.html
//   福岡市火災予防規則（昭和50年規則第43号、令和8年4月1日施行の版）第5条・第11条〜第14条
//     https://www.city.fukuoka.lg.jp/d1w_reiki/reiki_honbun/q003RG00000990.html
//   消防訓練の通報: 条例に定めがないので消防法施行規則 第3条第10項・第11項
// 届出書はいずれも2部提出（規則第11条〜第14条）。
import { drillNational, hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "福岡市火災予防条例";
const KI = "福岡市火災予防規則";
const target = "消防署長";
const three = "行為を行う日の3日前まで（規則第13条第2項）";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start":
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target, result: "required", deadline: "使用開始の日の7日前まで", form: "防火対象物使用開始届出書（様式第6号）2部", basis: `${JO} 第43条、${KI} 第11条`, reason: "令別表第一の防火対象物（(19)項・(20)項を除く）を使用する場合は規模にかかわらず必要。用途を変えたり大規模な増築・改築等をした後に使う場合も同じ", caveats: ["使用を中止し、又は撤去するときは、あらかじめ防火対象物撤去等届出書（様式第6号の2）を出す（条例第43条第2項）"] })];
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target, result: "conditional", basis: `${JO} 第43条・第43条の2、${KI} 第11条・第11条の2`, reason: "福岡市の条例には工事計画そのものの届出はない。用途の変更や大規模な増築・改築等をした後に使うなら使用開始届（7日前）が要る", caveats: ["条例第43条の2の防火対象物で消防用設備等を設置したときは、工事が完了した日から4日以内に設置の届出をする（規則第11条の2）"] })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物開催届", target, result: "conditional", deadline: three, form: "催物開催届出書（様式第13号）2部", basis: `${JO} 第45条第3号、${KI} 第13条`, reason: "劇場等以外の建築物その他の工作物で演劇・映画その他の催物を開く場合に必要。物品販売だけなら対象か所轄に確認する" })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "設置の工事に着手する日の7日前まで", basis: `${JO} 第44条、${KI} 第12条` };
      const f7 = "炉・厨房設備・温風暖房機・ボイラー・給湯湯沸設備・乾燥設備・簡易サウナ設備・一般サウナ設備・ヒートポンプ冷暖房機・火花を生ずる設備・放電加工機設置廃止届出書（様式第7号）2部";
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置の届出（厨房設備）";
        if (f.kitchen_kw === undefined) return [v({ ...b, title: t, result: "conditional", reason: "同一厨房室内の厨房設備の入力の合計が350kW以上のものが対象（第44条第1項第3号の2）", missing: ["kitchen_kw"] })];
        const req = f.kitchen_kw >= 350;
        return [v({ ...b, title: t, result: req ? "required" : "not_required", form: req ? f7 : undefined, reason: `同一厨房室内の入力の合計${f.kitchen_kw}kW（350kW${req ? "以上" : "未満"}）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置の届出（サウナ設備）";
        if (f.residence === true && f.personal_use === true) return [v({ ...b, title: t, result: "not_required", reason: "個人が設ける簡易サウナ設備、個人の住居に設ける一般サウナ設備は対象外（第44条第1項第6号の2・第7号）" })];
        if (f.residence === false) return [v({ ...b, title: t, result: "required", form: f7, reason: "個人の住居以外に設けるサウナ設備（第44条第1項第6号の2・第7号）" })];
        return [v({ ...b, title: t, result: "conditional", reason: "簡易サウナ設備は個人が設けるもの以外、一般サウナ設備は個人の住居以外に設けるものが対象", missing: ["residence", "personal_use"] })];
      }
      if (f.facility === "battery") {
        const t = "火を使用する設備等の設置の届出（蓄電池設備）";
        const f8 = "変電設備・急速充電設備・燃料電池発電設備・発電設備・蓄電池設備設置廃止届出書（様式第8号）2部";
        if (f.battery_kwh === undefined) return [v({ ...b, title: t, result: "conditional", reason: "蓄電池容量20kWh以下のものは対象外（第44条第1項第13号）", missing: ["battery_kwh"] })];
        const req = f.battery_kwh > 20;
        return [v({ ...b, title: t, result: req ? "required" : "not_required", form: req ? f8 : undefined, reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${req ? "超" : "以下は対象外"}）` })];
      }
      if (f.facility === "boiler") {
        const t = "火を使用する設備等の設置の届出（ボイラー）";
        if (f.residence) return [v({ ...b, title: t, result: "not_required", reason: "個人の住居に設けるボイラーは対象外（第44条第1項第5号）" })];
        return [v({ ...b, title: t, result: f.residence === false ? "required" : "conditional", form: f.residence === false ? f7 : undefined, reason: "ボイラー（個人の住居に設けるもの、労働安全衛生法施行令第1条第3号のものを除く）", missing: f.residence === undefined ? ["residence"] : [] })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置の届出", result: "conditional", reason: "設備の種類と規模で決まる（第44条第1項各号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第46条`) ?? [v({ procedure: "shoryo-kikenbutsu", title: "少量危険物・指定可燃物等の貯蔵・取扱いの届出", target, result: "required", deadline: "貯蔵又は取扱いを開始する日（設備の設置の工事を伴うものは工事に着手する日）の7日前まで", form: "少量危険物・指定可燃物等貯蔵取扱廃止届出書（様式第16号）2部", basis: `${JO} 第46条、${KI} 第14条`, reason: "指定数量の5分の1以上（個人の住居では2分の1以上）指定数量未満の危険物、又は別表第7の数量の5倍以上の指定可燃物等を貯蔵し、又は取り扱う", caveats: ["廃止したときは速やかに届け出る（規則第14条第2項）"] })];
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target, deadline: three, form: "露店等の開設届出書（様式第15号の2の2）2部", basis: `${JO} 第45条第7号、${KI} 第13条` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", form: undefined, reason: "対象火気器具等を使わない露店は第7号の対象外" })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日・花火大会・展示会など多数の者の集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [] })];
    }
    case "drill":
      return drillNational(f, "消防署長");
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第45条`, target, "市長がたき火・喫煙を制限した区域内で工事などのために火気を使う場合は、3日前までに火気使用届出書（様式第3号）2部を出す（規則第5条）");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災とまぎらわしい煙又は火炎を発するおそれのある行為の届出", target, result: "required", deadline: three, form: "火災とまぎらわしい煙又は火炎を発するおそれのある行為届出書（様式第11号）2部", basis: `${JO} 第45条第1号、${KI} 第13条`, reason: "たき火を含む、火災とまぎらわしい煙又は火炎を発するおそれのある行為", caveats: ["やむを得ない場合に限り口頭でよい（規則第13条第1項ただし書）"] })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道断・減水の届出", target, result: "required", deadline: three, form: "水道断、減水届出書（様式第14号）2部", basis: `${JO} 第45条第4号、${KI} 第13条`, reason: "水道の断水又は減水", caveats: ["やむを得ない場合に限り口頭でよい（規則第13条第1項ただし書）"] })];
  }
}
