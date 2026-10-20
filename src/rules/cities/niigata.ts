// 新潟市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認、新潟市例規集 Reiki-Base、内容現在 令和8年4月1日）
//   新潟市火災予防条例（昭和37年条例第12号、令和8年条例第3号まで）第48条〜第51条
//   新潟市火災予防条例施行規則（昭和37年規則第25号）第5条〜第9条
//   新潟市火災予防条例の規定に基づく届出等の事務取扱いに関する規程（昭和37年消防本部訓令第10号）第2条〜第7条
//   例規集: https://www.city.niigata.lg.jp/shisei/jorei/reiki/reiki.html （検索システム https://kre402.legal-square.com/HAS-Shohin/page/SJSrbLogin.jsf）
//   消防訓練の通報: 新潟市の条例に定めはないので、消防法施行規則 第3条第10項・第11項（drillNational）
// 名古屋市との主な違い: 条例上の届出先は「消防長」。届出書は訓令で所轄消防署長に2部出す扱い。
// 規則は設備・行為ごとの様式番号を範囲（第5号〜第8号、第9号〜第15号）でしか定めていないため、form は範囲で書く。
// 工事計画届・溶接の届出・消防訓練の届出の条はない。確認できなかった項目は cities/niigata/notes.md。
import { drillNational, hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "新潟市火災予防条例";
const KI = "新潟市火災予防条例施行規則";
const KUN = "届出等の事務取扱いに関する規程";
const target = "消防長（届出書は所轄消防署長に提出）";
const station = "所轄消防署長";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start":
      return [
        v({
          procedure: "shiyo-kaishi",
          title: "防火対象物使用開始届",
          target,
          result: "required",
          deadline: "使用開始の日の7日前まで",
          form: "別記様式第3号（同一敷地内に2以上の棟があるときは別記様式第4号も）",
          basis: `${JO} 第48条、${KI} 第5条、${KUN} 第2条`,
          reason: "令別表第1の防火対象物（(19)項・(20)項を除く）を使用する場合は規模にかかわらず必要",
          inspection: "届出書を受理した署長が査察を行い、適合と認めたものに届出済印を押して1部を返す（規程第2条第2項）。電子届出のときは電子メール等で到達を通知する",
        }),
      ];
    case "renovation":
      return [
        v({
          procedure: "koji",
          title: "工事に関する届出",
          target,
          result: "conditional",
          basis: `${JO} 第48条・第49条`,
          reason: "新潟市の条例には工事計画そのものの届出はない。用途を変えて使い始めるなら使用開始届（7日前まで）、火を使用する設備等を設けるなら設置届（あらかじめ）が要る",
          caveats: ["使用開始届の内容を変える場合の手続は条例に明記がないので、所轄消防署に確認する", "建築確認が必要な工事は消防同意の対象", "消防用設備等の工事は消防法の着工届（10日前）・設置届（4日以内）"],
        }),
      ];
    case "temp_use":
    case "event":
      return [
        v({
          procedure: "saimono",
          title: "催物開催届",
          target,
          result: "conditional",
          deadline: "あらかじめ",
          form: "別記様式第9号〜第15号のうち催物開催届出書",
          basis: `${JO} 第50条第4号、${KI} 第7条、${KUN} 第4条`,
          reason: "劇場等以外の建築物その他の工作物で演劇・映画などの催物を開く場合に必要。一時的な物品販売だけなら対象か所轄に確認する",
          caveats: ["指定催しで火災予防上必要な業務に関する計画を出した場合は不要（条例第50条ただし書）"],
        }),
      ];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "あらかじめ", basis: `${JO} 第49条、${KI} 第6条、${KUN} 第3条` };
      const form = "別記様式第5号〜第8号のうち該当する設置届出書";
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置届（厨房設備）";
        const bb = { ...b, basis: `${JO} 第49条第3号の2、${KI} 第6条、${KUN} 第3条` };
        if (f.kitchen_kw === undefined) return [v({ ...bb, title: t, result: "conditional", reason: "同一厨房室内の厨房設備の入力の合計が350kW以上なら対象（第49条第3号の2）", missing: ["kitchen_kw"] })];
        if (f.kitchen_kw >= 350) return [v({ ...bb, title: t, result: "required", form, reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW以上）` })];
        return [v({ ...bb, title: t, result: "not_required", reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW未満）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置届（サウナ設備）";
        const bb = { ...b, basis: `${JO} 第49条第6号の2・第7号、${KI} 第6条、${KUN} 第3条` };
        if (f.personal_use === true) return [v({ ...bb, title: t, result: "not_required", reason: "個人が設ける簡易サウナ設備、個人の住居に設ける一般サウナ設備は対象外" })];
        if (f.residence === false) return [v({ ...bb, title: t, result: "required", form, reason: "事業所などに設けるサウナ設備" })];
        return [v({ ...bb, title: t, result: "conditional", reason: "簡易サウナ設備は個人が設けるもの、一般サウナ設備は個人の住居に設けるものが対象外。それ以外は対象", missing: ["residence", "personal_use"] })];
      }
      if (f.facility === "battery") {
        const t = "火を使用する設備等の設置届（蓄電池設備）";
        const bb = { ...b, basis: `${JO} 第49条第13号、${KI} 第6条、${KUN} 第3条` };
        if (f.battery_kwh === undefined) return [v({ ...bb, title: t, result: "conditional", reason: "蓄電池容量が20kWhを超えるものが対象（第49条第13号）", missing: ["battery_kwh"] })];
        if (f.battery_kwh > 20) return [v({ ...bb, title: t, result: "required", form, reason: `蓄電池容量${f.battery_kwh}kWh（20kWh超）` })];
        return [v({ ...bb, title: t, result: "not_required", reason: `蓄電池容量${f.battery_kwh}kWh（20kWh以下は対象外）` })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第49条第1号〜第15号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return (
        hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第51条`) ?? [
          v({
            procedure: "shoryo-kikenbutsu",
            title: "少量危険物・指定可燃物貯蔵取扱届",
            target,
            result: "required",
            deadline: "あらかじめ",
            form: "別記様式第17号",
            basis: `${JO} 第51条第1項、${KI} 第9条第1項、${KUN} 第6条`,
            reason: "指定数量の5分の1以上（個人の住居では2分の1以上）指定数量未満の危険物、又は別表第8の数量の5倍以上などの指定可燃物を貯蔵し、又は取り扱う",
            caveats: ["廃止するときも届け出る（条例第51条第2項、規則第9条第2項の別記様式第18号）"],
          }),
        ]
      );
    case "stall": {
      const b = { procedure: "roten", title: "露店等開設届", target, deadline: "あらかじめ", form: "別記様式第9号〜第15号のうち露店等開設届出書", basis: `${JO} 第50条第7号、${KI} 第7条、${KUN} 第4条` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", form: undefined, reason: "対象火気器具等を使わない露店は第7号の対象外", caveats: ["道路に露店などを出して消火活動に支障を及ぼすおそれがある場合は第6号の届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日・花火大会・展示会など多数の者の集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [], caveats: ["指定催しで火災予防上必要な業務に関する計画を出した場合は不要（条例第50条ただし書）"] })];
    }
    case "drill":
      return drillNational(f, "消防署長");
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第50条`, station, "溶接作業等は可燃性の物品の付近でしてはならない（条例第28条）。防火管理者の火気管理も別途必要");
    case "bonfire":
      return [
        v({
          procedure: "kaen",
          title: "火災とまぎらわしい煙又は火炎を発するおそれのある行為の届出",
          target,
          result: "required",
          deadline: "あらかじめ",
          form: "別記様式第9号〜第15号のうち該当する届出書",
          basis: `${JO} 第50条第1号、${KI} 第7条、${KUN} 第4条`,
          reason: "たき火を含む、火災とまぎらわしい煙又は火炎を発するおそれのある行為",
          caveats: ["軽易なものは口頭で届け出てよい（規程第4条第1項）"],
        }),
      ];
    case "water_outage":
      return [
        v({
          procedure: "dansui",
          title: "水道断水・減水の届出",
          target,
          result: "required",
          deadline: "あらかじめ",
          form: "別記様式第9号〜第15号のうち水道断・減水届出書",
          basis: `${JO} 第50条第5号、${KI} 第7条、${KUN} 第4条`,
          reason: "水道の断水又は減水",
          caveats: ["軽易なものは口頭で届け出てよい（規程第4条第1項）"],
        }),
      ];
  }
}
