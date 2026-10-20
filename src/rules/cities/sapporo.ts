// 札幌市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認、札幌市例規集）
//   札幌市火災予防条例（昭和48年条例第34号、令和8年条例第7号まで）第64条〜第71条
//     https://www.city.sapporo.jp/ncms/reiki/d1w_reiki_nonframe/H348901010034/H348901010034_j.html
//   札幌市火災予防規則（昭和48年規則第64号、令和8年規則第18号まで）第16条〜第18条
//     https://www.city.sapporo.jp/ncms/reiki/d1w_reiki_nonframe/H348902100064/H348902100064_j.html
//   消防訓練の通報: 札幌市の条例に定めはないので、消防法施行規則 第3条第10項・第11項（drillNational）
// 名古屋市との主な違い: 使用開始届の期限が「4日前まで」、工事計画届・溶接の届出・消防訓練の届出の条がない。
// 確認できなかった項目は cities/sapporo/notes.md。
import { drillNational, hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "札幌市火災予防条例";
const KI = "札幌市火災予防規則";
const target = "所轄消防署長";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start":
      return [
        v({
          procedure: "shiyo-kaishi",
          title: "防火対象物使用開始届",
          target,
          result: "required",
          deadline: "使用開始の日の4日前まで",
          form: "防火対象物使用開始（内容変更）届出書（様式9）",
          basis: `${JO} 第64条、${KI} 第16条第3号・第17条`,
          reason: "令別表第1に掲げる防火対象物を使用する場合は規模にかかわらず必要。内容を変更するときも同じ",
          inspection: "条例第5章と令第2章第3節により消防用設備等を設置したもの（消防法第17条の3の2の検査を受けるものを除く）は、所轄消防署長の検査を受ける（条例第64条第2項）。この場合は設置した消防用設備等の図書を添え、届出書を2部出す（条例第64条第4項、規則第17条第1項第2号）",
        }),
      ];
    case "renovation":
      return [
        v({
          procedure: "koji",
          title: "工事に関する届出",
          target,
          result: "conditional",
          basis: `${JO} 第64条・第66条`,
          reason: "札幌市の条例には工事計画そのものの届出はない。用途などの内容を変えるなら使用開始届の内容変更（4日前まで）、火を使用する設備等を設けるなら設置届（あらかじめ）が要る",
          caveats: ["建築確認が必要な工事は消防同意の対象", "消防用設備等の工事は消防法の着工届（10日前）・設置届（4日以内）"],
        }),
      ];
    case "temp_use":
    case "event":
      return [
        v({
          procedure: "saimono",
          title: "催物開催・臨時客席等設置の届出",
          target,
          result: "conditional",
          deadline: "あらかじめ",
          form: "催物開催・臨時客席等設置届出書（様式17）",
          basis: `${JO} 第67条第3号・第4号、${KI} 第16条第10号`,
          reason: "劇場等以外の建築物などで演劇・映画などの催物を開く場合、又は劇場等に臨時に客席・舞台を設ける場合に必要。一時的な物品販売だけなら対象か所轄に確認する",
        }),
      ];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "あらかじめ", basis: `${JO} 第66条、${KI} 第16条` };
      const heat = "炉・厨房設備・温風暖房機・ボイラー・給湯湯沸設備・乾燥設備・簡易サウナ設備・一般サウナ設備・ヒートポンプ冷暖房機・火花を生ずる設備・放電加工機設置（変更）届出書（様式11）";
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置届（厨房設備）";
        const bb = { ...b, basis: `${JO} 第66条第1項第3号の2、${KI} 第16条第4号` };
        if (f.kitchen_kw === undefined) return [v({ ...bb, title: t, result: "conditional", reason: "同一厨房室内の厨房設備の入力の合計が350kW以上なら対象（第66条第1項第3号の2）", missing: ["kitchen_kw"] })];
        if (f.kitchen_kw >= 350) return [v({ ...bb, title: t, result: "required", form: heat, reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW以上）` })];
        return [v({ ...bb, title: t, result: "not_required", reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW未満）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置届（サウナ設備）";
        const bb = { ...b, basis: `${JO} 第66条第1項第6号の2・第7号、${KI} 第16条第4号` };
        if (f.residence) return [v({ ...bb, title: t, result: "not_required", reason: "個人の住居に設ける簡易サウナ設備・一般サウナ設備は対象外" })];
        if (f.residence === undefined) return [v({ ...bb, title: t, result: "conditional", reason: "個人の住居以外に設ける簡易サウナ設備・一般サウナ設備は対象", missing: ["residence"] })];
        return [v({ ...bb, title: t, result: "required", form: heat, reason: "個人の住居以外に設けるサウナ設備" })];
      }
      if (f.facility === "battery") {
        const t = "火を使用する設備等の設置届（蓄電池設備）";
        const bb = { ...b, basis: `${JO} 第66条第1項第13号、${KI} 第16条第5号` };
        if (f.battery_kwh === undefined) return [v({ ...bb, title: t, result: "conditional", reason: "蓄電池容量が20kWhを超えるものが対象（第66条第1項第13号）", missing: ["battery_kwh"] })];
        if (f.battery_kwh > 20) return [v({ ...bb, title: t, result: "required", form: "変電設備・急速充電設備・燃料電池発電設備・発電設備・蓄電池設備設置（変更）届出書（様式12）", reason: `蓄電池容量${f.battery_kwh}kWh（20kWh超）` })];
        return [v({ ...bb, title: t, result: "not_required", reason: `蓄電池容量${f.battery_kwh}kWh（20kWh以下は対象外）` })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第66条第1項第1号〜第15号）", missing: ["facility"], caveats: ["位置や構造を変えるときも届け出る（第66条第2項）"] })];
    }
    case "small_hazmat":
      return (
        hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第71条`) ?? [
          v({
            procedure: "shoryo-kikenbutsu",
            title: "少量危険物・指定可燃物貯蔵取扱所設置届",
            target,
            result: "required",
            deadline: "あらかじめ",
            form: "少量危険物貯蔵取扱所設置（廃止）届出書（様式24）、指定可燃物は様式24の2",
            basis: `${JO} 第71条第1項、${KI} 第16条第18号・第19号`,
            reason: "指定数量の5分の1以上（個人の住居では2分の1以上）指定数量未満の危険物、又は指定可燃物（別表第5の数量の5倍以上など）を貯蔵し、又は取り扱う",
            caveats: ["廃止するときも届け出る（条例第71条第1項後段）", "指定数量未満の灯油を販売する者は主たる取扱者を届け出る（条例第71条第3項、様式26）"],
          }),
        ]
      );
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target, deadline: "あらかじめ", form: "露店等の開設届出書（様式19の2）", basis: `${JO} 第67条第7号、${KI} 第16条第12号の2` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", form: undefined, reason: "対象火気器具等を使わない露店は第7号の対象外", caveats: ["消防隊の通行など消火活動に支障を及ぼすおそれがある道路工事は第6号の届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日・花火大会など多数の者の集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [], caveats: ["指定催しで、主催者が火災予防上必要な業務に関する計画を出す場合は不要（第67条第7号かっこ書、第63条の4第2項）"] })];
    }
    case "drill":
      return drillNational(f, "消防署長");
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第67条`, target, "溶接作業等は可燃性の物品の付近でしてはならず、監視のもとで行う（条例第33条）。防火管理者の火気管理も別途必要");
    case "bonfire":
      return [
        v({
          procedure: "kaen",
          title: "揚煙等の行為の届出",
          target,
          result: "required",
          deadline: "あらかじめ",
          form: "揚煙等の行為の届出書（様式15）",
          basis: `${JO} 第67条第1号、${KI} 第16条第8号`,
          reason: "たき火その他の火災と紛らわしい煙又は火炎を発するおそれのある行為",
          caveats: ["電話又は口頭で届け出ることもできる（規則第16条ただし書）"],
        }),
      ];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道断水減水の届出", target, result: "required", deadline: "あらかじめ", form: "水道断水減水届出書（様式18）", basis: `${JO} 第67条第5号、${KI} 第16条第11号`, reason: "水道の断水又は減水" })];
  }
}
