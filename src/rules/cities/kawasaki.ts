// 川崎市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認、川崎市例規集 令和8年6月1日現在）
//   川崎市火災予防条例（昭和48年条例第36号）第58条・第59条・第62条〜第64条
//     https://reiki.city.kawasaki.jp/kawasaki/d1w_reiki/H348901010036/H348901010036_j.html
//   川崎市火災予防規則（昭和48年規則第69号）第14条〜第16条・第18条〜第20条
//     https://reiki.city.kawasaki.jp/kawasaki/d1w_reiki/H348902100069/H348902100069_j.html
//   届出書等は正本・副本各1部を、所轄消防署長を経由して消防長へ出す（規則第14条第1項）。
//   条例に消防訓練の届出の定めはないため、国の規則（消防法施行規則第3条）で判定する。
import { drillNational, hazmatGate, inUses, noProvision, SPECIFIC_KITCHEN_USES, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "川崎市火災予防条例";
const KI = "川崎市火災予防規則";
const target = "所轄消防署長を経由して消防長";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start":
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target, result: "required", deadline: "使用開始の日の7日前まで", form: "防火対象物使用開始届（第7号様式）", basis: `${JO} 第58条、${KI} 第15条・第14条`, reason: "令別表第一の防火対象物（(19)項・(20)項を除く）を使用する場合は規模にかかわらず必要", caveats: ["令第10条第1項各号の防火対象物は、設置する消防用設備等の図書を添える（条例第58条第2項、規則第15条第2項）"] })];
    case "renovation": {
      // 条例第59条: 特定用途の防火対象物で、火気又は危険物を使用する改装工事
      const b = { procedure: "kaiso-koji", title: "改装工事等届", target, deadline: "工事開始の日の5日前まで", form: "改装工事等届（第8号様式）", basis: `${JO} 第59条、${KI} 第16条・第14条` };
      const sp = inUses(f.occupancy, SPECIFIC_KITCHEN_USES);
      if (sp === false) return [v({ ...b, result: "not_required", reason: "条例第59条の対象は(1)項〜(4)項・(5)項イ・(6)項・(9)項イ・(16)項イ・(16の2)項・(16の3)項の防火対象物だけ", caveats: ["消防用設備等の設置工事は着手の10日前までに工事計画届（条例第67条）", "用途が変わる場合は使用開始届（条例第58条）を確認する"] })];
      return [v({ ...b, result: "conditional", reason: sp ? "特定用途の防火対象物で、修繕・模様替えなどの改装工事に火気又は危険物を使うなら必要" : "特定用途の防火対象物で、改装工事に火気又は危険物を使うなら必要", missing: sp === null ? ["occupancy"] : [], caveats: ["可燃物から3m以内に無い場所での軽易な溶接・火気工事や、指定数量の10分の1未満の危険物を使う工事などは不要（規則第16条第2項）", "消防用設備等の設置工事は着手の10日前までに工事計画届（条例第67条）"] })];
    }
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物開催届", target, result: "conditional", deadline: "あらかじめ", form: "催物開催届（第16号様式）", basis: `${JO} 第63条第3号、${KI} 第19条・第14条`, reason: "劇場等以外の建築物などで演劇・映画その他の催物を開く場合に必要。物品販売だけなら対象か所轄に確認する" })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "あらかじめ", basis: `${JO} 第62条、${KI} 第18条・第14条` };
      const form10 = "火を使用する設備等の設置届（第10号様式）";
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置届（厨房設備）";
        const kb = { ...b, title: t, basis: `${JO} 第62条第3号の2、${KI} 第18条・第14条` };
        if (f.kitchen_kw === undefined) return [v({ ...kb, result: "conditional", reason: "同一厨房室の入力の合計350kW以上が対象（第62条第3号の2）", missing: ["kitchen_kw"] })];
        return [v({ ...kb, result: f.kitchen_kw >= 350 ? "required" : "not_required", form: f.kitchen_kw >= 350 ? form10 : undefined, reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW${f.kitchen_kw >= 350 ? "以上" : "未満"}）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置届（サウナ設備）";
        const sb = { ...b, title: t, basis: `${JO} 第62条第6号の2・第7号、${KI} 第18条・第14条` };
        if (f.residence === true && f.personal_use === true) return [v({ ...sb, result: "not_required", reason: "個人が設ける簡易サウナ設備、個人の住居に設ける一般サウナ設備は対象外" })];
        if (f.residence === false) return [v({ ...sb, result: "required", form: form10, reason: "個人の住居以外に設けるサウナ設備" })];
        return [v({ ...sb, result: "conditional", reason: "簡易サウナ設備は個人が設けるもの、一般サウナ設備は個人の住居に設けるものを除き対象", missing: ["residence", "personal_use"] })];
      }
      if (f.facility === "battery") {
        const t = "電気設備設置届（蓄電池設備）";
        const bb = { ...b, title: t, basis: `${JO} 第62条第11号、${KI} 第18条第2号・第14条` };
        if (f.battery_kwh === undefined) return [v({ ...bb, result: "conditional", reason: "蓄電池容量20kWh超が対象（第62条第11号）", missing: ["battery_kwh"] })];
        return [v({ ...bb, result: f.battery_kwh > 20 ? "required" : "not_required", form: f.battery_kwh > 20 ? "電気設備設置届（第11号様式）" : undefined, reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${f.battery_kwh > 20 ? "超" : "以下は対象外"}）` })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第62条第1号〜第13号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return (
        hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第64条`) ?? [
          v({ procedure: "shoryo-kikenbutsu", title: "少量危険物等の貯蔵又は取扱届", target, result: "required", deadline: "あらかじめ", form: "少量危険物等の貯蔵又は取扱届（第20号様式）", basis: `${JO} 第64条、${KI} 第20条・第14条`, reason: "指定数量の5分の1以上（個人の住居では2分の1以上）指定数量未満の危険物、又は一定量以上の指定可燃物を貯蔵し、又は取り扱う", caveats: ["廃止するときは少量危険物等の廃止届（第20号様式の2）を出す（条例第64条第2項、規則第20条第2項）"] }),
        ]
      );
    case "stall": {
      const b = { procedure: "roten", title: "露店等開設届", target, deadline: "あらかじめ", form: "露店等開設届（第19号様式）", basis: `${JO} 第63条第6号、${KI} 第19条・第14条` };
      if (f.stall_fire === false) return [v({ ...b, form: undefined, result: "not_required", reason: "対象火気器具等を使わない露店は第6号の対象外", caveats: ["消防隊の通行など消火活動に支障を及ぼすおそれがある道路使用は第5号の届出（道路工事及び露店開設等届、第18号様式）が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日など多数の者の集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [] })];
    }
    case "drill":
      return drillNational(f, "所轄消防署").map((r) => ({ ...r, caveats: [...r.caveats, "川崎市消防局は、消防訓練実施計画報告書を訓練の前に所轄消防署の警防課へ出すよう案内している（根拠は川崎市防火管理等に関する規程。期限は要確認）"] }));
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第63条`, target, "特定用途の防火対象物の改装工事で溶接などの火気を使う場合は、改装工事等届（条例第59条、工事開始の5日前）を確認する");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災と紛らわしい煙又は火炎を発するおそれのある行為届", target, result: "required", deadline: "あらかじめ", form: "第14号様式", basis: `${JO} 第63条第1号、${KI} 第19条第1号・第14条`, reason: "火災と紛らわしい煙又は火炎を発するおそれのある行為", caveats: ["電話又は口頭でもよい（規則第19条ただし書）"] })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道の断水及び減水届", target, result: "required", deadline: "あらかじめ", form: "第17号様式", basis: `${JO} 第63条第4号、${KI} 第19条第4号・第14条`, reason: "水道の断水又は減水" })];
  }
}
