// 堺市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認、堺市例規集 Reiki-Base）
//   堺市火災予防条例（平成20年条例第25号、令和8年3月27日条例第1号まで）第84条〜第91条
//     https://www.city.sakai.lg.jp/reiki/reiki_honbun/s000RG00000999.html
//   堺市火災予防条例施行規則（平成20年規則第109号）第6条〜第10条・第13条
//     https://www.city.sakai.lg.jp/reiki/reiki_honbun/s000RG00001052.html
//   消防訓練の通報: 堺市の条例に定めはないので、消防法施行規則 第3条第10項・第11項（drillNational）
// 適用区域: 堺市消防局は高石市・大阪狭山市の消防事務も受託しており、両市の区域にもこの条例が適用される
//   （条例附則第2項・第9項〜第16項、高石消防署・大阪狭山消防署の所管業務）。詳しくは cities/sakai/notes.md。
import { drillNational, hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "堺市火災予防条例";
const KI = "堺市火災予防条例施行規則";
const target = "消防署長";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start":
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target: "消防長又は消防署長", result: "required", deadline: "使用開始の日の7日前まで", form: "様式第3号（棟数が2を超えるときは様式第4号）", basis: `${JO} 第84条、${KI} 第6条`, reason: "令別表第一の防火対象物（(17)項・(19)項・(20)項を除く）を使用する場合は規模にかかわらず必要。届出の内容を変更するときも同様", inspection: "条例第5章と消防法施行令第2章第3節により消防用設備等を設置しなければならない防火対象物は、使用開始の前に消防長又は消防署長の検査を受ける（条例第84条第2項）" })];
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target: "消防長又は消防署長", result: "conditional", basis: `${JO} 第84条・第86条第6号・第91条、${KI} 第8条第6項・第13条`, reason: "堺市の条例には工事計画そのものの届出はない。消防用設備等の設置工事をするなら工事設計書を着手の10日前までに（様式第23号）、工事の現場事務所等を設けるなら使用開始の3日前までに（様式第14号）届け出る", caveats: ["消火器・簡易消火用具・誘導標識などは工事設計書の対象外（条例第91条第1項）", "用途が変わるなら使用開始届の変更（条例第84条第1項後段）が要る"] })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物の開催の届出", target, result: "conditional", deadline: "催物を開催する日の前日まで", form: "様式第11号", basis: `${JO} 第86条第3号、${KI} 第8条第3項`, reason: "劇場等以外の建築物その他の工作物で演劇・映画などの催物を開く場合に必要。物品販売だけなら対象か所轄に確認する" })];
    case "fire_equipment": {
      const heat = { procedure: "kaki-setsubi", target, deadline: "設置又は変更の日の5日前まで", form: "様式第5号", basis: `${JO} 第85条、${KI} 第7条第1項` };
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置届（厨房設備）";
        if (f.kitchen_kw === undefined) return [v({ ...heat, title: t, result: "conditional", reason: "同一厨房室の入力の合計350kW以上が対象（第85条第3号）", missing: ["kitchen_kw"] })];
        return [v({ ...heat, title: t, result: f.kitchen_kw >= 350 ? "required" : "not_required", reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW${f.kitchen_kw >= 350 ? "以上" : "未満"}）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置届（サウナ設備）";
        if (f.residence || f.personal_use) return [v({ ...heat, title: t, result: "not_required", reason: "専ら個人が使用する目的で設ける簡易サウナ設備、個人の住居に設ける一般サウナ設備は対象外（第85条第6号・第7号）" })];
        if (f.residence === false) return [v({ ...heat, title: t, result: "required", reason: "個人の住居以外に設けるサウナ設備（第85条第6号・第7号）" })];
        return [v({ ...heat, title: t, result: "conditional", reason: "事業所などに設けるものは対象", missing: ["residence"] })];
      }
      if (f.facility === "boiler") return [v({ ...heat, title: "火を使用する設備等の設置届（ボイラー）", result: f.residence ? "not_required" : "conditional", reason: f.residence ? "個人の住居に設けるものは対象外（第85条第4号）" : "ボイラー、又は入力70kW以上の給湯湯沸設備が対象（第85条第4号。労働安全衛生法施行令第1条第3号のボイラーを除く）", missing: f.residence ? [] : ["residence"] })];
      if (f.facility === "battery") {
        const b = { ...heat, form: "様式第6号", basis: `${JO} 第85条第15号、${KI} 第7条第2項` };
        const t = "火を使用する設備等の設置届（蓄電池設備）";
        if (f.battery_kwh === undefined) return [v({ ...b, title: t, result: "conditional", reason: "蓄電池容量20kWh超が対象（第85条第15号）", missing: ["battery_kwh"] })];
        return [v({ ...b, title: t, result: f.battery_kwh > 20 ? "required" : "not_required", reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${f.battery_kwh > 20 ? "超" : "以下は対象外"}）` })];
      }
      return [v({ ...heat, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第85条各号）。水素ガスを充塡する気球だけは3日前まで（規則第7条第4項）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return (
        hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第88条`) ?? [
          v({ procedure: "shoryo-kikenbutsu", title: "少量危険物・指定可燃物の貯蔵・取扱いの届出", target, result: "required", deadline: "貯蔵等を行う日の5日前まで", form: "様式第16号", basis: `${JO} 第88条、${KI} 第10条`, reason: "少量危険物（個人の住居では指定数量の2分の1以上）又は届出の対象量以上の指定可燃物を貯蔵し、又は取り扱う", caveats: ["廃止したときは遅滞なく様式第17号で届け出る（規則第10条第2項）"] }),
        ]
      );
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target, deadline: "露店等を開設する日の3日前まで", form: "様式第14号の2", basis: `${JO} 第86条第7号、${KI} 第8条第7項` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", reason: "対象火気器具等を使わない露店は第7号の対象外", caveats: ["消防隊の通行などに支障を及ぼすおそれのある道路工事は第5号の届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日・花火大会・展示会など多数の者の集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [], caveats: ["指定催し（第83条の2第1項）は第7号の対象外"] })];
    }
    case "drill":
      return drillNational(f, target).map((r) => ({ ...r, caveats: [...r.caveats, "堺市消防局は「自衛消防訓練等実施通知書」を管轄消防署の警防課で受け付けている"] }));
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第86条`, target, "溶接作業等の防火管理（条例第38条）は守る必要がある");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災とまぎらわしい煙等を発するおそれのある行為の届出", target, result: "required", deadline: "行為を行う日の前日まで", form: "様式第9号", basis: `${JO} 第86条第1号、${KI} 第8条第1項`, reason: "たき火を含む、火災とまぎらわしい煙又は火炎を発するおそれのある行為" })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道の断水・減水の届出", target, result: "required", deadline: "行為を行う日の前日まで", form: "様式第12号", basis: `${JO} 第86条第4号、${KI} 第8条第4項`, reason: "水道の断水又は減水" })];
  }
}
