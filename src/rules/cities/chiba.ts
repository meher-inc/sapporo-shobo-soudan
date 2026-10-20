// 千葉市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認）
//   千葉市火災予防条例（昭和37年条例第4号）第43条〜第47条の2
//   千葉市火災予防規則（昭和56年規則第49号）第31条〜第37条
//   千葉市例規集 Reiki-Base インターネット版（内容現在 令和8年7月1日）
//     条例 https://www1.g-reiki.net/chiba/reiki_honbun/g002RG00000705.html
//     規則 https://www1.g-reiki.net/chiba/reiki_honbun/g002RG00000706.html
//   千葉市火災予防条例運用指針（消防局予防課）https://www.city.chiba.jp/shobo/yobo/yobo/zyourei/unyoushishin/shishin.html
// 届出先は条文の「消防長又は消防署長」「消防署長」。窓口は建物の所在区の消防署（予防課）・出張所。
import { hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "千葉市火災予防条例";
const KI = "千葉市火災予防規則";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  const chief = "消防長又は消防署長";
  const station = "消防署長";
  const three = "当該行為を行う日の3日前まで（急を要するときは当日まで。規則第34条）";
  switch (scene) {
    case "use_start":
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target: chief, result: "required", deadline: "使用開始の日の7日前まで", form: "防火対象物使用開始(変更)届出書（様式第2号）", basis: `${JO} 第43条、${KI} 第31条`, reason: "令別表第1の防火対象物（(19)項・(20)項を除く）を使用する場合は規模にかかわらず必要", caveats: ["使用内容を変更するときも同じ様式で届け出る（規則第31条）"] })];
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target: chief, result: "conditional", basis: `${JO} 第43条・第43条の3・第47条の2、${KI} 第31条・第32条の2・第37条`, reason: "千葉市の条例には工事計画そのものの届出はない。使用内容が変わるなら使用開始(変更)届（7日前）、消防用設備等の設置工事なら工事計画書（着手の10日前。着工届の対象設備・消火器等は除く）が要る", caveats: ["防火管理者は、工事中の消防計画を作成したら遅滞なく届け出る（条例第43条の3）", "消防用設備等の着工届（消防法第17条の14）・設置届（同法第17条の3の2）は別途"] })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物開催届", target: station, result: "conditional", deadline: three, form: "催物開催届出書（様式第11号）", basis: `${JO} 第45条第3号、${KI} 第34条`, reason: "劇場等以外の建築物その他の工作物で演劇・映画などの催物を開く場合に必要。一時的な物品販売だけなら対象か所轄に確認する", caveats: ["千葉市の条例には一時使用の届出の規定はない", "第42条の7第1項・第42条の8第1項の計画を出した場合は不要（条例第45条ただし書）"] })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target: station, deadline: "設置工事開始の7日前まで（規則第33条）", basis: `${JO} 第44条、${KI} 第33条`, inspection: "使用開始前に消防署長の検査を受ける（条例第44条第2項）" };
      const form4 = "火を使用する設備等の設置(変更)届出書（様式第4号）";
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置届（厨房設備）";
        const kb = { ...b, title: t, form: form4, basis: `${JO} 第44条第1項第5号、${KI} 第33条` };
        if (f.kitchen_kw === undefined) return [v({ ...kb, result: "conditional", reason: "入力の合計が117kW以上の厨房設備が対象（第44条第1項第5号）", missing: ["kitchen_kw"] })];
        return [v({ ...kb, result: f.kitchen_kw >= 117 ? "required" : "not_required", reason: `入力の合計${f.kitchen_kw}kW（117kW${f.kitchen_kw >= 117 ? "以上" : "未満は対象外"}）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置届（サウナ設備）";
        const sb = { ...b, title: t, form: form4, basis: `${JO} 第44条第1項第7号の2・第8号、${KI} 第33条` };
        if (f.personal_use === true || f.residence === true) return [v({ ...sb, result: "not_required", reason: "個人が設ける簡易サウナ設備（業として設けるものを除く）、個人の住居に設ける一般サウナ設備は対象外" })];
        if (f.residence === false) return [v({ ...sb, result: "required", reason: "個人の住居以外に設けるサウナ設備" })];
        return [v({ ...sb, result: "conditional", reason: "事業所などに設けるもの、業として設ける簡易サウナ設備は対象", missing: ["residence", "personal_use"] })];
      }
      if (f.facility === "battery") {
        const t = "電気設備設置届（蓄電池設備）";
        const eb = { ...b, title: t, form: "電気設備設置(変更)届出書（様式第5号）", basis: `${JO} 第44条第1項第16号、${KI} 第33条` };
        if (f.battery_kwh === undefined) return [v({ ...eb, result: "conditional", reason: "蓄電池容量20kWh超が対象（第44条第1項第16号）", missing: ["battery_kwh"] })];
        return [v({ ...eb, result: f.battery_kwh > 20 ? "required" : "not_required", reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${f.battery_kwh > 20 ? "超" : "以下は対象外"}）` })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（条例第44条第1項第1号〜第18号）", missing: ["facility"], caveats: ["水素ガスを充塡する気球は設置開始の3日前まで（規則第33条）"] })];
    }
    case "small_hazmat":
      return (
        hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第46条`) ?? [
          v({ procedure: "shoryo-kikenbutsu", title: "少量危険物・指定可燃物の貯蔵・取扱いの届出", target: chief, result: "required", deadline: "あらかじめ", form: "少量危険物は様式第13号、指定可燃物は様式第14号", basis: `${JO} 第46条、${KI} 第35条`, reason: "指定数量の5分の1以上（個人の住居では2分の1以上）指定数量未満の危険物、又は別表第3の数量の5倍以上の指定可燃物を貯蔵・取扱う", caveats: ["内容を変更するときも届け出る（条例第46条第1項）", "廃止するときも届け出る（条例第46条第2項、様式第15号・第16号）"] }),
        ]
      );
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target: station, deadline: three, form: "露店等の開設届出書（様式第11号の3）", basis: `${JO} 第45条第6号、${KI} 第34条` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", reason: "対象火気器具等を使わない露店は第6号の対象外", caveats: ["消火活動に支障を及ぼすおそれのある道路工事などは第5号の届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日・花火大会・展示会など多数の者の集合する催しで、対象火気器具等を使う露店等", missing: f.stall_fire === undefined ? ["stall_fire"] : [], caveats: ["第42条の7第1項・第42条の8第1項の計画を出した場合は不要（条例第45条ただし書）"] })];
    }
    case "drill":
      return [v({ procedure: "kunren", title: "消防訓練の届出", target: station, result: "required", deadline: "実施の3日前まで", form: "消防訓練実施届出書（様式第3号）", basis: `${JO} 第43条の2、${KI} 第32条`, reason: "防火管理者（防災管理者）が消防訓練を実施する場合", caveats: ["国の規則（消防法施行規則第3条第10項・第11項）の通報もこの届出で行う運用か所轄に確認する"] })];
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第43条〜第47条の2`, station, "防火管理者の火気管理や、工事中の消防計画（条例第43条の3）は別途必要");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災とまぎらわしい煙等を発するおそれのある行為の届出", target: station, result: "required", deadline: three, form: "火災とまぎらわしい煙又は火炎を発するおそれのある行為の届出書（様式第9号）", basis: `${JO} 第45条第1号、${KI} 第34条`, reason: "火災とまぎらわしい煙又は火炎を発するおそれのある行為" })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "断水・減水の届出", target: station, result: "required", deadline: three, form: "消防活動上支障ある行為等の届出書（様式第11号の2）", basis: `${JO} 第45条第4号、${KI} 第34条`, reason: "水道の断水又は減水" })];
  }
}
