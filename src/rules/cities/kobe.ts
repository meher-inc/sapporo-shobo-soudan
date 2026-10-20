// 神戸市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認、神戸市例規集）
//   神戸市火災予防条例（昭和37年4月条例第6号、令8条例67まで）第51条の4・第52条〜第56条の3
//     https://www1.g-reiki.net/city.kobe/reiki_honbun/k302RG00001158.html
//   神戸市火災予防規則（昭和37年規則第34号、令和8年4月1日施行版）第12条〜第14条（様式）
//     https://www1.g-reiki.net/city.kobe/reiki_honbun/k302RG00001159.html
//   消防訓練の通報: 消防法施行規則 第3条第10項・第11項（drillNational）。条例第51条の4は統括防火管理者の全体訓練だけ
// 名古屋市との主な違い: 規則に届出の期限（○日前）の定めがなく、条文の期限は使用開始届の「7日前」以外は「あらかじめ」。
//   使用開始届・火を使用する設備等の届出の提出先は消防長（窓口は管轄の消防署の査察係）。溶接の届出・工事計画届の条はない。
//   少量危険物の届出の下限は個人の住居でも指定数量の5分の1（住居の2分の1の定めがない）。
// 確認できなかった項目は cities/kobe/notes.md。
import { drillNational, hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "神戸市火災予防条例";
const KI = "神戸市火災予防規則";
const chief = "消防長（窓口は管轄の消防署の査察係）";
const station = "所轄消防署長";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start":
      return [
        v({
          procedure: "shiyo-kaishi",
          title: "防火対象物使用開始届",
          target: chief,
          result: "required",
          deadline: "使用開始の日の7日前まで",
          form: "防火対象物使用開始届出書（様式第9号）",
          basis: `${JO} 第52条第2項、${KI} 第12条第1項第9号・第14条第2項`,
          reason: "令別表第1に掲げる防火対象物（又はその部分）を新築・増築・改築・移転・修繕・模様替え・用途の変更をして使用する場合に必要。神戸市消防局は、既存の建物をテナントとして使い始める場合も届け出て検査を受けるよう案内している",
          inspection: "使用開始前に消防長の検査を受ける（条例第52条第2項。消防法第17条の3の2の検査を受ける消防用設備等を除く）",
          caveats: ["付近見取図・配置図・立面図・断面図・区画を記載した各階平面図・内装仕様書・消防用設備等の設計書を添える（規則第14条第2項）", "工事を伴わない既存建物の使い始めが条文上の対象かは、管轄の消防署で確認する"],
        }),
      ];
    case "renovation":
      return [
        v({
          procedure: "koji",
          title: "工事に関する届出",
          target: chief,
          result: "conditional",
          basis: `${JO} 第52条第1項・第56条の2・第56条の3、${KI} 第12条第1項第8号・第27号・第28号`,
          reason: "神戸市の条例には工事計画そのものの届出はない。新築等で消防長が指定する天井裏の配管部分や令第8条の区画などが完成したら部分完成届（様式第8号）を出して検査を受け、消防用設備等を設けるなら建築確認の申請の際に設置計画届（様式第27号）、設置工事は着手の10日前までに工事計画書（様式第28号）を出す",
          caveats: ["新築等をして使うときは、使用開始の日の7日前までに使用開始届が要る（条例第52条第2項）"],
        }),
      ];
    case "temp_use":
    case "event":
      return [
        v({
          procedure: "saimono",
          title: "催物開催届",
          target: station,
          result: "conditional",
          deadline: "あらかじめ",
          form: "催物開催届出書（様式第17号）",
          basis: `${JO} 第54条第1項第3号・第2項、${KI} 第12条第1項第17号・第3項`,
          reason: "劇場等以外の建築物その他の工作物で演劇・映画などの催物を開く場合に必要。物品販売だけなら対象か所轄に確認する",
          caveats: ["建物の管理権原者と協議して定めた避難に関する計画書を添える（条例第54条第2項）", "学校その他公共団体の催物は、所轄消防署長が認めれば口頭でよい（規則第12条第3項）"],
        }),
      ];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target: chief, deadline: "あらかじめ", basis: `${JO} 第53条、${KI} 第12条第1項` };
      const f10 = "炉・厨房設備等設置届出書（様式第10号）";
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置届（厨房設備）";
        const kb = { ...b, title: t, basis: `${JO} 第53条第4号、${KI} 第12条第1項第10号` };
        if (f.kitchen_kw === undefined) return [v({ ...kb, result: "conditional", reason: "同一厨房室の入力の合計350kW以上が対象（第53条第4号）", missing: ["kitchen_kw"] })];
        return [v({ ...kb, result: f.kitchen_kw >= 350 ? "required" : "not_required", form: f.kitchen_kw >= 350 ? f10 : undefined, reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW${f.kitchen_kw >= 350 ? "以上" : "未満"}）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置届（サウナ設備）";
        const sb = { ...b, title: t, basis: `${JO} 第53条第7号の2・第8号、${KI} 第12条第1項第10号` };
        if (f.personal_use === true || f.residence === true) return [v({ ...sb, result: "not_required", reason: "個人が設ける簡易サウナ設備、個人の住居に設ける一般サウナ設備は対象外" })];
        if (f.residence === false) return [v({ ...sb, result: "required", form: f10, reason: "事業所などに設けるサウナ設備" })];
        return [v({ ...sb, result: "conditional", reason: "事業所などに設けるものは対象（個人が設ける簡易サウナ、個人の住居の一般サウナは除く）", missing: ["residence"] })];
      }
      if (f.facility === "battery") {
        const t = "火を使用する設備等の設置届（蓄電池設備）";
        const bb = { ...b, title: t, basis: `${JO} 第53条第16号、${KI} 第12条第1項第12号` };
        if (f.battery_kwh === undefined) return [v({ ...bb, result: "conditional", reason: "蓄電池容量20kWh超が対象（第53条第16号）", missing: ["battery_kwh"] })];
        return [v({ ...bb, result: f.battery_kwh > 20 ? "required" : "not_required", form: f.battery_kwh > 20 ? "変電設備・急速充電設備・発電設備・燃料電池発電設備・蓄電池設備設置届出書（様式第12号）" : undefined, reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${f.battery_kwh > 20 ? "超" : "以下は対象外"}）` })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第53条第1号〜第18号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return (
        hazmatGate(f, 0.2, `${JO} 第31条の2・第55条`) ?? [
          v({
            procedure: "shoryo-kikenbutsu",
            title: "少量危険物・指定可燃物等の貯蔵・取扱いの届出",
            target: station,
            result: "required",
            deadline: "あらかじめ",
            form: "少量危険物・指定可燃物等貯蔵・取扱設置(変更)届出書（様式第21号）",
            basis: `${JO} 第55条、${KI} 第12条第1項第21号・第13条`,
            reason: "指定数量の5分の1以上指定数量未満の危険物（少量危険物）又は指定可燃物等を貯蔵し、又は取り扱う。個人の住居でも下限は5分の1",
            caveats: ["届出書は正副各1通（規則第13条第1項）", "廃止するときも届け出る（条例第55条第3項、様式第22号）", "消防長が指定する区域で10日以内に限り屋外で貯蔵するときは不要（条例第55条第2項）"],
          }),
        ]
      );
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target: station, deadline: "あらかじめ", form: "露店等の開設届出書（様式第20号の2）", basis: `${JO} 第54条第1項第7号、${KI} 第12条第1項第20号の2` };
      if (f.stall_fire === false) return [v({ ...b, form: undefined, result: "not_required", reason: "対象火気器具等を使わない露店は第7号の対象外", caveats: ["消防隊の通行など消防活動に支障を及ぼすおそれのある道路使用などは第6号の届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日など多数の者の集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [] })];
    }
    case "drill":
      return [
        ...drillNational(f, "消防署長"),
        v({
          procedure: "kunren-tokatsu",
          title: "自衛消防訓練届（統括防火管理者の全体訓練）",
          target: station,
          result: "conditional",
          deadline: "あらかじめ",
          form: "自衛消防訓練届出書（様式第5号）",
          basis: `${JO} 第50条の6・第51条の4、${KI} 第12条第1項第5号`,
          reason: "統括防火管理者を置く防火対象物で、建物全体の消火・通報・避難の訓練（年2回以上）を行うときは、統括防火管理者が訓練計画を届け出る",
        }),
      ];
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第54条`, station, "可燃物のある場所での溶接作業は火災予防上必要な措置が要る（条例第29条第3項）");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災とまぎらわしい煙等を発するおそれのある行為の届出", target: station, result: "required", deadline: "あらかじめ", form: "火災とまぎらわしい煙又は火炎を発するおそれのある行為の届出書（様式第15号）", basis: `${JO} 第54条第1項第1号、${KI} 第12条第1項第15号・第2項`, reason: "火災とまぎらわしい煙又は火炎を発するおそれのある行為", caveats: ["口頭で届け出ることもできる（規則第12条第2項）"] })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道断水・減水の届出", target: station, result: "required", deadline: "あらかじめ", form: "水道断水・減水届出書（様式第19号）", basis: `${JO} 第54条第1項第5号、${KI} 第12条第1項第19号`, reason: "水道の断水又は減水" })];
  }
}
