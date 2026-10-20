// 静岡市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認、静岡市例規集 Reiki-Base 令和8年7月14日内容現在）
//   静岡市火災予防条例（平成15年条例第286号）第62条〜第64条・第66条（令和8年条例第8号による改正後）
//   静岡市火災予防条例施行規則（平成15年規則第253号）第6条〜第8条・第10条（令和8年規則第29号による改正後）
//   例規集: https://krr001.legal-square.com/HAS-Shohin/page/SJSrbLogin.jsf（静岡市公式「静岡市例規集」 https://www.city.shizuoka.lg.jp/p000306.html から）
//   提出先は消防署長（条例の各条）。条例には工事計画・消防訓練・溶接作業の届出の定めはない。
//   静岡市消防局は島田市・牧之原市・吉田町・川根本町の消防事務も受託している（2016-04-01〜）。
import { drillNational, hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "静岡市火災予防条例";
const KI = "静岡市火災予防条例施行規則";
const target = "消防署長";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start":
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target, result: "required", deadline: "使用開始の日の7日前まで", form: "防火対象物使用開始届出書（様式第3号）", basis: `${JO} 第62条、${KI} 第6条`, reason: "令別表第一の防火対象物（(19)項・(20)項を除く）を使用する場合は規模にかかわらず必要", caveats: ["防火対象物の図面と、設置が必要な消火・警報・避難設備等の設計書を添える（規則第6条第2項）"] })];
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target, result: "conditional", basis: `${JO} 第62条・第63条`, reason: "静岡市の条例には工事計画そのものの届出はない。用途を変えて使い始めるなら使用開始届（7日前）、火を使う設備を設けるなら設置届（あらかじめ）を確認する", caveats: ["消防用設備等の工事は消防法の着工届（10日前）・設置届（4日以内）", "建築確認が必要な工事は消防同意の対象"] })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物の開催届", target, result: "conditional", deadline: "あらかじめ", form: "催物の開催届出書（様式第10号、使用する防火対象物の略図を添付）", basis: `${JO} 第64条第1項第3号、${KI} 第8条`, reason: "劇場等以外の建築物などで演劇・映画その他の催物を開く場合に必要。物品販売だけなら対象か所轄に確認する" })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "あらかじめ", basis: `${JO} 第63条、${KI} 第7条` };
      const form4 = "設置届出書（様式第4号、設備の位置・構造・設備の図面を添付）";
      if (f.facility === "kitchen") {
        const kb = { ...b, title: "火を使用する設備等の設置届（厨房設備）", basis: `${JO} 第63条第4号、${KI} 第7条第1項第1号` };
        if (f.kitchen_kw === undefined) return [v({ ...kb, result: "conditional", reason: "同一厨房室の入力の合計350kW以上が対象（第63条第4号）", missing: ["kitchen_kw"] })];
        return [v({ ...kb, result: f.kitchen_kw >= 350 ? "required" : "not_required", form: f.kitchen_kw >= 350 ? form4 : undefined, reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW${f.kitchen_kw >= 350 ? "以上" : "未満"}）` })];
      }
      if (f.facility === "sauna") {
        const sb = { ...b, title: "火を使用する設備等の設置届（サウナ設備）", basis: `${JO} 第63条第8号・第8号の2、${KI} 第7条第1項第1号` };
        if (f.residence === true && f.personal_use === true) return [v({ ...sb, result: "not_required", reason: "個人が設ける簡易サウナ設備、個人の住居に設ける一般サウナ設備は対象外" })];
        if (f.residence === false) return [v({ ...sb, result: "required", form: form4, reason: "個人の住居以外に設けるサウナ設備" })];
        return [v({ ...sb, result: "conditional", reason: "簡易サウナ設備は個人が設けるもの、一般サウナ設備は個人の住居に設けるものを除き対象（簡易サウナ設備の届出は2026-03-31施行）", missing: ["residence", "personal_use"] })];
      }
      if (f.facility === "battery") {
        const bb = { ...b, title: "火を使用する設備等の設置届（蓄電池設備）", basis: `${JO} 第63条第16号、${KI} 第7条第1項第2号` };
        if (f.battery_kwh === undefined) return [v({ ...bb, result: "conditional", reason: "蓄電池容量20kWh超が対象（第63条第16号）", missing: ["battery_kwh"] })];
        return [v({ ...bb, result: f.battery_kwh > 20 ? "required" : "not_required", form: f.battery_kwh > 20 ? "設備の設置届出書（様式第5号）" : undefined, reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${f.battery_kwh > 20 ? "超" : "以下は対象外"}）` })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第63条第1号〜第18号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return (
        hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第66条`) ?? [
          v({ procedure: "shoryo-kikenbutsu", title: "少量危険物・指定可燃物の貯蔵・取扱いの届出", target, result: "required", deadline: "あらかじめ", form: "様式第14号（場所の位置・構造・設備の図面を添付）", basis: `${JO} 第66条、${KI} 第10条`, reason: "指定数量の5分の1以上（個人の住居では2分の1以上）指定数量未満の危険物、又は一定量以上の指定可燃物を貯蔵し、又は取り扱う", caveats: ["廃止するときは様式第15号で届け出る（条例第66条第2項、規則第10条第3項）", "届出事項を変えるときも届け出る（規則第13条）"] }),
        ]
      );
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target, deadline: "あらかじめ", form: "露店等の開設届出書（様式第12号の2、開設場所と消火器の設置場所の略図を添付）", basis: `${JO} 第64条第1項第6号、${KI} 第8条` };
      if (f.stall_fire === false) return [v({ ...b, form: undefined, result: "not_required", reason: "対象火気器具等を使わない露店は第6号の対象外", caveats: ["消火活動に支障を及ぼすおそれのある道路工事は第5号の届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日など多数の者の集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [], caveats: ["近親者だけのバーベキューなど、互いに面識のある人だけの催しは届出の対象外（消防局の案内）。消火の準備は要る"] })];
    }
    case "drill":
      return drillNational(f, "所轄消防署").map((r) => ({ ...r, caveats: [...r.caveats, "静岡市消防局は、事業所で消防訓練等を行うときの「自衛消防訓練等通知書」を管轄の消防署に出すよう案内している（電子申請可、期限は「随時」）"] }));
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第64条`, target, "溶接作業等は可燃物の付近で行わず、火花の飛散防止などの措置をとる（条例第37条）");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災と紛らわしい煙又は火炎を発するおそれのある行為の届出", target, result: "required", deadline: "あらかじめ", form: "様式第8号", basis: `${JO} 第64条第1項第1号、${KI} 第8条第1項第1号`, reason: "たき火を含む、火災と紛らわしい煙又は火炎を発するおそれのある行為", caveats: ["特定の場所で定期的に行うものや小規模なたき火等は、口頭又は電話連絡でもよい（規則第8条第1項第1号ただし書）", "消防署長が届出の対象となる期間・区域を指定することがある（条例第64条第2項）"] })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道の断水・減水の届出", target, result: "required", deadline: "あらかじめ", form: "様式第11号（断・減水区域の略図を添付）", basis: `${JO} 第64条第1項第4号、${KI} 第8条`, reason: "水道の断水又は減水" })];
  }
}
