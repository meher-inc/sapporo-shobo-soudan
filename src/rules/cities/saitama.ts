// さいたま市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認）
//   さいたま市火災予防条例（平成13年条例第281号）第63条〜第67条
//   さいたま市火災予防規則（平成13年規則第244号）第8条〜第12条
//   さいたま市例規集（Reiki-Base）
//     条例 https://www1.g-reiki.net/saitamat/reiki_honbun/r375RG00000866.html
//     規則 https://www1.g-reiki.net/saitamat/reiki_honbun/r375RG00000867.html
// 条例の届出先はすべて「消防長」。窓口は、使用開始・火を使用する設備・少量危険物が所在区の消防署の管理指導課、
// 火災とまぎらわしい行為・催物・断水・露店などが所在区の消防署（消防1・2課）又は出張所（さいたま市消防局の様式ページ）。
// 条例・規則に「○日前」の定めがあるのは使用開始届（7日前）だけで、ほかは「あらかじめ」。
// 消防訓練の届出は条例・規則にない（条例本文に「消防訓練」の語がない）ので、国の規則（消防法施行規則第3条）による。
import { drillNational, hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "さいたま市火災予防条例";
const KI = "さいたま市火災予防規則";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  const target = "消防長（窓口は所在区の消防署 管理指導課）";
  const target65 = "消防長（窓口は所在区の消防署又は出張所）";
  switch (scene) {
    case "use_start":
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target, result: "required", deadline: "使用開始の日の7日前まで", form: "防火対象物使用開始(変更)届出書（様式第4号）と防火対象物棟別概要追加書（様式第5号）", basis: `${JO} 第63条、${KI} 第8条`, reason: "令別表第1の防火対象物（(19)項・(20)項を除く）を使用する場合は規模にかかわらず必要", caveats: ["届け出た事項を変更するときも届け出る（条例第63条第2項）", "届出をしない・虚偽の届出は5万円以下の過料（条例第73条）"] })];
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target, result: "conditional", basis: `${JO} 第63条第2項・第64条`, reason: "さいたま市の条例には工事計画そのものの届出はない。用途など届け出た事項が変わるなら使用開始届の変更（7日前）、火を使用する設備等を設けるならその設置届（あらかじめ）が要る", caveats: ["消防用設備等の着工届（消防法第17条の14）・設置届（同法第17条の3の2）は別途"] })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物開催届", target: target65, result: "conditional", deadline: "あらかじめ", form: "様式第10号〜第14号の2のうち該当するもの（催物開催届出書）", basis: `${JO} 第65条第3号、${KI} 第10条`, reason: "劇場等以外の建築物その他の工作物で演劇・映画などの催物を開く場合に必要。一時的な物品販売だけなら対象か所轄に確認する", caveats: ["さいたま市の条例には一時使用の届出の規定はない", "様式番号の対応（第10号〜第14号の2のどれか）は様式ページで要確認"] })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "あらかじめ", form: "様式第6号〜第9号のうち該当するもの", basis: `${JO} 第64条、${KI} 第9条` };
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等設置届（厨房設備）";
        const kb = { ...b, title: t, form: "火を使用する設備等設置届出書（様式第6号）", basis: `${JO} 第64条第4号、${KI} 第9条` };
        if (f.kitchen_kw === undefined) return [v({ ...kb, result: "conditional", reason: "同一厨房室内の厨房設備の入力の合計が350kW以上のものが対象（第64条第4号）", missing: ["kitchen_kw"] })];
        return [v({ ...kb, result: f.kitchen_kw >= 350 ? "required" : "not_required", reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW${f.kitchen_kw >= 350 ? "以上" : "未満は対象外"}）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等設置届（サウナ設備）";
        const sb = { ...b, title: t, basis: `${JO} 第64条第7号の2・第8号、${KI} 第9条` };
        if (f.personal_use === true || f.residence === true) return [v({ ...sb, result: "not_required", reason: "個人が設ける簡易サウナ設備、個人の住居に設ける一般サウナ設備は対象外" })];
        if (f.residence === false) return [v({ ...sb, result: "required", reason: "個人の住居以外に設けるサウナ設備" })];
        return [v({ ...sb, result: "conditional", reason: "事業所などに設けるもの、個人以外が設ける簡易サウナ設備は対象", missing: ["residence", "personal_use"] })];
      }
      if (f.facility === "battery") {
        const t = "急速充電設備・燃料電池発電設備・変電設備・発電設備・蓄電池設備設置届（蓄電池設備）";
        const eb = { ...b, title: t, basis: `${JO} 第64条第16号、${KI} 第9条` };
        if (f.battery_kwh === undefined) return [v({ ...eb, result: "conditional", reason: "蓄電池容量20kWh超が対象（第64条第16号）", missing: ["battery_kwh"] })];
        return [v({ ...eb, result: f.battery_kwh > 20 ? "required" : "not_required", reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${f.battery_kwh > 20 ? "超" : "以下は対象外"}）` })];
      }
      return [v({ ...b, title: "火を使用する設備等設置届", result: "conditional", reason: "設備の種類と規模で決まる（条例第64条第1号〜第18号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return (
        hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第67条`) ?? [
          v({ procedure: "shoryo-kikenbutsu", title: "少量危険物・指定可燃物の貯蔵・取扱いの届出", target, result: "required", deadline: "あらかじめ", form: "少量危険物・指定可燃物の貯蔵・取扱い届出書（様式第16号）", basis: `${JO} 第67条、${KI} 第12条`, reason: "指定数量の5分の1以上（個人の住居では2分の1以上）指定数量未満の危険物、又は別表第8の数量の5倍以上の指定可燃物を貯蔵・取扱う", caveats: ["廃止するときも届け出る（条例第67条第2項、規則第12条第2項・様式第17号）"] }),
        ]
      );
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target: target65, deadline: "あらかじめ", form: "様式第10号〜第14号の2のうち該当するもの（露店等の開設届出書）", basis: `${JO} 第65条第6号、${KI} 第10条` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", reason: "対象火気器具等を使わない露店は第6号の対象外" })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日・花火大会・展示会など多数の者の集合する催しで、対象火気器具等を使う露店等", missing: f.stall_fire === undefined ? ["stall_fire"] : [], caveats: ["指定催しなどで火災予防上必要な業務に関する計画が出された場合は不要（条例第65条第6号ただし書）"] })];
    }
    case "drill": {
      const r = drillNational(f, "消防署長（窓口は所在区の消防署・出張所）");
      return r.map((x) => ({ ...x, caveats: [...x.caveats, "さいたま市消防局は「消防訓練実施書」の様式と電子申請を案内している（建物がある区の消防署・出張所）"] }));
    }
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第63条〜第67条`, target65, "防火管理者の火気管理や、工事中の防火管理は別途必要");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災とまぎらわしい煙等を発するおそれのある行為の届出", target: target65, result: "required", deadline: "あらかじめ", form: "様式第10号〜第14号の2のうち該当するもの", basis: `${JO} 第65条第1号、${KI} 第10条`, reason: "火災とまぎらわしい煙又は火炎を発するおそれのある行為", caveats: ["軽易なものは口頭で届け出ることができる（規則第10条ただし書）"] })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "断水・減水の届出", target: target65, result: "required", deadline: "あらかじめ", form: "様式第10号〜第14号の2のうち該当するもの（水道の断減水届出書）", basis: `${JO} 第65条第4号、${KI} 第10条`, reason: "水道の断水又は減水", caveats: ["軽易なものは口頭で届け出ることができる（規則第10条ただし書）"] })];
  }
}
