// 北九州市の火災予防条例による届出の判定。
// 根拠（2026-10-20 確認）
//   北九州市火災予防条例（昭和48年条例第49号）第65条〜第72条（第8章 雑則）
//   北九州市火災予防規則（昭和49年規則第4号）: 届出の様式・期限の定めはない（第22条で消防長に委任）
//   例規集: 北九州市 Reiki-Base 検索システム（内容現在 令和8年8月31日）
//     https://krq002.legal-square.com/HAS-Shohin/page/SJSrbLogin.jsf
//     （市の案内ページ https://www.city.kitakyushu.lg.jp/shoubou/file_0260_00003.html から移動）
//   消防訓練の通報: 条例に定めがないので消防法施行規則 第3条第10項・第11項
// 規則に期限・様式番号の定めがないため、期限は条例の「あらかじめ」のまま返し、様式番号は入れない。
import { drillNational, hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "北九州市火災予防条例";
const target = "所轄消防署長";
const NO_DAYS = "規則に提出期限の日数の定めはない。何日前までに出すかは所轄の消防署予防課に確認する";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start":
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target, result: "required", deadline: "使用開始の日の7日前まで", basis: `${JO} 第65条`, reason: "令別表第一の防火対象物（(19)項・(20)項を除く）を新築・改築等によりそれぞれの用途に使用する場合に必要", caveats: ["条文は「新築、改築等によりそれぞれの用途に使用しようとする者」。既存の建物に入居する場合の扱いは所轄の消防署予防課に確認する", "窓口に出す場合は2部（消防局の様式ページの案内）。電子申請もできる"] })];
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target: "消防長（消防用設備等の工事計画書）／所轄消防署長（使用開始届）", result: "conditional", deadline: "消防用設備等の工事計画書は工事に着手しようとする日の10日前まで", basis: `${JO} 第65条・第71条`, reason: "北九州市の条例には工事計画そのものの届出はない。消防用設備等（消火器・簡易消火用具・非常警報器具・誘導標識などを除く）の設置工事をするなら工事計画書を着手の10日前までに消防長へ、改築等の後に使い始めるなら使用開始届（7日前）が要る", caveats: ["消防用設備等を設置したときは消防長に届け出て検査を受ける（条例第71条第2項）"] })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物の開催の届出", target, result: "conditional", deadline: "あらかじめ", basis: `${JO} 第72条第1項第3号`, reason: "劇場等以外の建築物その他の工作物で演劇・映画その他の催物を開く場合に必要。物品販売だけなら対象か所轄に確認する", caveats: [NO_DAYS] })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "あらかじめ", basis: `${JO} 第67条` };
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置の届出（厨房設備）";
        if (f.kitchen_kw === undefined) return [v({ ...b, title: t, result: "conditional", reason: "同一厨房室内の厨房設備の入力の合計が350kW以上のものが対象（第67条第3号の2）", missing: ["kitchen_kw"] })];
        return [v({ ...b, title: t, basis: `${JO} 第67条第3号の2`, result: f.kitchen_kw >= 350 ? "required" : "not_required", reason: `同一厨房室内の入力の合計${f.kitchen_kw}kW（350kW${f.kitchen_kw >= 350 ? "以上" : "未満"}）`, caveats: [NO_DAYS] })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置の届出（サウナ設備）";
        const basis = `${JO} 第67条第7号・第7号の2`;
        if (f.residence === true && f.personal_use === true) return [v({ ...b, title: t, basis, result: "not_required", reason: "個人が設ける簡易サウナ設備、個人の住居に設ける一般サウナ設備は対象外" })];
        if (f.residence === false) return [v({ ...b, title: t, basis, result: "required", reason: "個人の住居以外に設けるサウナ設備", caveats: [NO_DAYS] })];
        return [v({ ...b, title: t, basis, result: "conditional", reason: "簡易サウナ設備は個人が設けるもの以外、一般サウナ設備は個人の住居以外に設けるものが対象", missing: ["residence", "personal_use"] })];
      }
      if (f.facility === "battery") {
        const t = "火を使用する設備等の設置の届出（蓄電池設備）";
        const basis = `${JO} 第67条第13号`;
        if (f.battery_kwh === undefined) return [v({ ...b, title: t, basis, result: "conditional", reason: "蓄電池容量20kWh以下のものは対象外", missing: ["battery_kwh"] })];
        return [v({ ...b, title: t, basis, result: f.battery_kwh > 20 ? "required" : "not_required", reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${f.battery_kwh > 20 ? "超" : "以下は対象外"}）` })];
      }
      if (f.facility === "boiler") {
        const t = "火を使用する設備等の設置の届出（ボイラー）";
        const basis = `${JO} 第67条第5号`;
        if (f.residence) return [v({ ...b, title: t, basis, result: "not_required", reason: "個人の住居に設けるボイラーは対象外" })];
        return [v({ ...b, title: t, basis, result: f.residence === false ? "required" : "conditional", reason: "ボイラー（個人の住居に設けるもの、労働安全衛生法施行令第1条第3号のものを除く）", missing: f.residence === undefined ? ["residence"] : [] })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置の届出", result: "conditional", reason: "設備の種類と規模で決まる（第67条第1号〜第15号）", missing: ["facility"] })];
    }
    case "small_hazmat":
      return hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第69条`) ?? [v({ procedure: "shoryo-kikenbutsu", title: "少量危険物・指定可燃物の貯蔵・取扱いの届出", target, result: "required", deadline: "あらかじめ", basis: `${JO} 第69条`, reason: "指定数量の5分の1以上（個人の住居では2分の1以上）指定数量未満の危険物、又は別表第3の数量の5倍以上の指定可燃物を貯蔵し、又は取り扱う", caveats: ["変更・廃止のときも届け出る（条例第69条第2項）", NO_DAYS] })];
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設の届出", target, deadline: "あらかじめ", basis: `${JO} 第72条第1項第8号` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", reason: "対象火気器具等を使わない露店は第8号の対象外", caveats: ["消防隊の通行その他消火活動に支障を及ぼすおそれのある露店の開設は第5号で届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日・花火大会・展示会など多数の者の集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [], caveats: ["指定催しで主催者が火災予防上必要な事項に関する計画を出していれば、露店ごとの届出は要らない（条例第72条第2項）", NO_DAYS] })];
    }
    case "drill":
      return drillNational(f, "所轄消防署長");
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第72条`, target, "消火活動上必要な施設・非常用の進入口・非常用エレベーターの使用に支障を及ぼすおそれのある工事は第72条第1項第7号で届出が要る");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災と紛らわしい煙又は火炎を発生させるおそれのある行為の届出", target, result: "required", deadline: "あらかじめ", basis: `${JO} 第72条第1項第1号`, reason: "たき火を含む、火災と紛らわしい煙又は火炎を発生させるおそれのある行為", caveats: [NO_DAYS] })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道の断水・減水の届出", target, result: "required", deadline: "あらかじめ", basis: `${JO} 第72条第1項第4号`, reason: "水道の断水又は減水", caveats: [NO_DAYS] })];
  }
}
