// 浜松市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認、浜松市例規集 g-reiki）
//   浜松市火災予防条例（昭和37年浜松市条例第17号、令和8年3月31日施行版）第43条〜第46条
//     https://www1.g-reiki.net/hamamatsu/reiki_honbun/o700RG00000615.html
//   浜松市火災予防規則（昭和61年浜松市規則第51号、令和8年4月1日施行版）第14条〜第18条・第20条
//     https://www1.g-reiki.net/hamamatsu/reiki_honbun/o700RG00000616.html
//   消防訓練の通報: 浜松市の条例に定めはないので、消防法施行規則 第3条第10項・第11項（drillNational）
import { drillNational, hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "浜松市火災予防条例";
const KI = "浜松市火災予防規則";
const target = "消防署長";
const three = "行為を行おうとする日の3日前まで（規則第16条）";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start":
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target, result: "required", deadline: "使用開始の日の7日前まで", form: "第3号様式（正本1部・副本1部、規則第20条）", basis: `${JO} 第43条、${KI} 第14条・第20条`, reason: "令別表第一の防火対象物（(19)項・(20)項を除く）を使用する場合は規模にかかわらず必要", caveats: ["付近見取図・配置図・各階平面図・立面図・仕様書・室内仕上表と、消防用設備等の設計図書を添付する（規則第14条第2項）"] })];
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target, result: "conditional", basis: `${JO} 第43条〜第46条`, reason: "浜松市の条例には工事計画そのものの届出の定めはない。工事で火を使用する設備等を設けるなら第44条の届出が要る", caveats: ["消防同意が必要な建物で消防用設備等の設置を計画している場合、消防局は「消防用設備等計画書」の提出を求めている（中央区は消防局予防課、浜名区・天竜区は浜北消防署）", "用途を変える場合に使用開始届を出し直すかは要確認（第43条に変更の定めはない）"] })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物開催届", target, result: "conditional", deadline: three, form: "第10号様式（使用する防火対象物の略図を添付）", basis: `${JO} 第45条第3号、${KI} 第16条`, reason: "劇場等以外の建築物その他の工作物で演劇・映画などの催物を開く場合に必要。物品販売だけなら対象か所轄に確認する", caveats: ["第42条の2第1項の指定催しに係る行為は第45条の届出の対象外（同条ただし書）"] })];
    case "fire_equipment": {
      const heat = { procedure: "kaki-setsubi", target, deadline: "設置工事を開始しようとする日の7日前まで（規則第15条第3項第1号）", form: "第4号様式（正本1部・副本1部）", basis: `${JO} 第44条、${KI} 第15条・第20条` };
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置届（厨房設備）";
        if (f.kitchen_kw === undefined) return [v({ ...heat, title: t, result: "conditional", reason: "同一厨房室の入力の合計350kW以上が対象（第44条第3号の2）", missing: ["kitchen_kw"] })];
        return [v({ ...heat, title: t, result: f.kitchen_kw >= 350 ? "required" : "not_required", reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW${f.kitchen_kw >= 350 ? "以上" : "未満"}）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置届（サウナ設備）";
        if (f.residence || f.personal_use) return [v({ ...heat, title: t, result: "not_required", reason: "個人が設ける簡易サウナ設備、個人の住居に設ける一般サウナ設備は対象外（第44条第6号の2・第7号）" })];
        if (f.residence === false) return [v({ ...heat, title: t, result: "required", reason: "個人の住居以外に設けるサウナ設備（第44条第6号の2・第7号）" })];
        return [v({ ...heat, title: t, result: "conditional", reason: "事業所などに設けるものは対象", missing: ["residence"] })];
      }
      if (f.facility === "boiler") return [v({ ...heat, title: "火を使用する設備等の設置届（ボイラー）", result: f.residence ? "not_required" : "conditional", reason: f.residence ? "個人の住居に設けるものは対象外（第44条第5号）" : "ボイラー、又は入力70kW以上の給湯湯沸設備が対象（第44条第5号。労働安全衛生法施行令第1条第3号のボイラーを除く）", missing: f.residence ? [] : ["residence"] })];
      if (f.facility === "battery") {
        const b = { ...heat, deadline: "設置工事を開始しようとする日の3日前まで（規則第15条第3項第2号）", form: "第5号様式（正本1部・副本1部）" };
        const t = "火を使用する設備等の設置届（蓄電池設備）";
        if (f.battery_kwh === undefined) return [v({ ...b, title: t, result: "conditional", reason: "蓄電池容量20kWh超が対象（第44条第13号）", missing: ["battery_kwh"] })];
        return [v({ ...b, title: t, result: f.battery_kwh > 20 ? "required" : "not_required", reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${f.battery_kwh > 20 ? "超" : "以下は対象外"}）` })];
      }
      return [v({ ...heat, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第44条各号）。炉・厨房設備・ボイラーなどは7日前、変電設備・蓄電池設備などは3日前", missing: ["facility"] })];
    }
    case "small_hazmat":
      return (
        hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第46条`) ?? [
          v({ procedure: "shoryo-kikenbutsu", title: "少量危険物・指定可燃物の貯蔵・取扱いの届出", target, result: "required", deadline: "あらかじめ", form: "第14号様式（貯蔵・取扱いの場所の見取図と構造設備の概要図を添付、正本1部・副本1部）", basis: `${JO} 第46条、${KI} 第18条・第20条`, reason: "指定数量の5分の1（個人の住居では2分の1）以上指定数量未満の危険物、又は届出の対象量以上の指定可燃物を貯蔵し、又は取り扱う", caveats: ["廃止するときも届け出る（条例第46条第2項、規則第18条第2項・第15号様式）", "規則に提出期限の日数の定めはない（「あらかじめ」）"] }),
        ]
      );
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target, deadline: three, form: "第12号様式の2（開設場所と消火器の設置場所の略図を添付）", basis: `${JO} 第45条第6号、${KI} 第16条` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", reason: "対象火気器具等を使わない露店は第6号の対象外" })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日・花火大会・展示会など多数の者の集合する屋外での催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [], caveats: ["指定催し（第42条の2第1項）に際して行う露店等は第45条の届出の対象外"] })];
    }
    case "drill":
      return drillNational(f, target).map((r) => ({ ...r, caveats: [...r.caveats, "浜松市の電子申請（スマート申請）に「消防訓練計画通報」「避難訓練計画通報」がある"] }));
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第45条`, target, "溶接作業等の火災予防の基準（条例第28条）は守る必要がある");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災とまぎらわしい煙等を発するおそれのある行為の届出", target, result: "required", deadline: three, form: "第8号様式", basis: `${JO} 第45条第1号、${KI} 第16条`, reason: "たき火を含む、火災とまぎらわしい煙又は火炎を発するおそれのある行為", caveats: ["電話又は口頭でもよい（規則第16条第1項ただし書）"] })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道の断水・減水の届出", target, result: "required", deadline: three, form: "第11号様式（断水区域又は減水区域の略図を添付）", basis: `${JO} 第45条第4号、${KI} 第16条`, reason: "水道の断水又は減水" })];
  }
}
