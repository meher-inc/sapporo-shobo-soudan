// 広島市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認、広島市例規集。いずれも令和8年4月1日施行版）
//   広島市火災予防条例（昭和37年条例第15号）第55条〜第60条
//     https://www.city.hiroshima.lg.jp/kikaku/houki/reiki_int/reiki_honbun/r500RG00000792.html
//   広島市火災予防規則（昭和37年規則第46号）第3条・第11条〜第15条・第18条
//     https://www.city.hiroshima.lg.jp/kikaku/houki/reiki_int/reiki_honbun/r500RG00000793.html
//   消防訓練の通報: 広島市の条例に定めはないので、消防法施行規則 第3条第10項・第11項（drillNational）
// 名古屋市との主な違い: 様式に番号がない（届出書は2部、規則第3条）。設備の届出は工事の7日前まで、
//   催物・断水・露店は3日前まで、たき火は1日前まで（規則第12条・第13条）。工事計画届・溶接の届出・消防訓練の届出の条はない。
// 広島市消防局は安芸郡海田町・坂町・熊野町、山県郡安芸太田町、廿日市市吉和の消防事務を受託している（cities/hiroshima/notes.md）。
import { drillNational, hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";
import { judge, type Facts } from "../install.ts";

const JO = "広島市火災予防条例";
const KI = "広島市火災予防規則";
const target = "所轄消防署長";
const TWO = "届出書は2部（電子申請は1部）（規則第3条）";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start": {
      // 条例第55条第2項・第3項: 令第10条第1項又は令第22条第1項の防火対象物は、図書の提出と使用開始前の検査
      let insp = "消火器具（令第10条第1項）か漏電火災警報器（令第22条第1項）が必要な防火対象物なら、消防用設備等の図書を添え、所轄消防署長の検査を受けてから使用を開始する（条例第55条第2項・第3項）";
      if (f.occupancy) {
        const ex = judge("extinguisher", f as Facts);
        if (ex.result === "required") insp = "消火器具が必要な防火対象物（令第10条第1項）なので、消防用設備等の図書を添え、所轄消防署長の検査を受けてから使用を開始する（条例第55条第2項・第3項）";
      }
      return [
        v({
          procedure: "shiyo-kaishi",
          title: "防火対象物使用開始届",
          target,
          result: "required",
          deadline: "使用開始の日の7日前まで",
          form: "防火対象物使用開始届出書（様式番号なし）",
          basis: `${JO} 第55条、${KI} 第11条`,
          reason: "令別表第1の防火対象物（(19)項・(20)項を除く）を使用する場合は規模にかかわらず必要。使用内容を変更するときも同じ",
          inspection: insp,
          caveats: [TWO],
        }),
      ];
    }
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target: "消防長又は所轄消防署長", result: "conditional", basis: `${JO} 第60条、${KI} 第18条`, reason: "広島市の条例には工事計画そのものの届出はない。建築工事（新築・増築・改築・移転・修繕・模様替・用途変更）で消防用設備等（消火器・簡易消火用具・非常警報器具・誘導標識を除く）を設置・変更するなら、工事に着手する前に設置等計画を届け出る", caveats: ["建築確認を要する工事で(16の2)項など消防長が定める防火対象物は消防長、それ以外は所轄消防署長に出す（規則第18条）", "使用内容が変わるなら使用開始届（7日前）も要る（条例第55条第1項）"] })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物開催届", target, result: "conditional", deadline: "実施する日の3日前まで", form: "催物開催届出書（様式番号なし）", basis: `${JO} 第57条第3号、${KI} 第13条`, reason: "劇場等以外の建築物その他の工作物で演劇・映画などの催物を開く場合に必要。物品販売だけなら対象か所轄に確認する", caveats: [TWO] })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "設置等の工事の7日前まで", basis: `${JO} 第56条、${KI} 第12条`, inspection: "使用開始前に所轄消防署長の検査を受ける（条例第56条第2項）", caveats: [TWO] };
      const fk = "炉・厨房設備等の設備届出書（様式番号なし）";
      if (f.facility === "kitchen") {
        const kb = { ...b, title: "火を使用する設備の設置届（厨房設備）", basis: `${JO} 第56条第1項第3号の2、${KI} 第12条` };
        if (f.kitchen_kw === undefined) return [v({ ...kb, result: "conditional", reason: "同一厨房室の入力の合計350kW以上が対象", missing: ["kitchen_kw"] })];
        return [v({ ...kb, result: f.kitchen_kw >= 350 ? "required" : "not_required", form: f.kitchen_kw >= 350 ? fk : undefined, reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW${f.kitchen_kw >= 350 ? "以上" : "未満"}）` })];
      }
      if (f.facility === "sauna") {
        const sb = { ...b, title: "火を使用する設備の設置届（サウナ設備）", basis: `${JO} 第56条第1項第6号の2・第7号、${KI} 第12条` };
        if (f.personal_use === true || f.residence === true) return [v({ ...sb, result: "not_required", reason: "専ら自己の使用に供する簡易サウナ設備、個人の住居に設ける一般サウナ設備は対象外" })];
        if (f.residence === false) return [v({ ...sb, result: "required", form: fk, reason: "事業所などに設けるサウナ設備" })];
        return [v({ ...sb, result: "conditional", reason: "事業所などに設けるものは対象（自分だけで使う簡易サウナ、個人の住居の一般サウナは除く）", missing: ["residence"] })];
      }
      if (f.facility === "battery") {
        const bb = { ...b, title: "火を使用する設備の設置届（蓄電池設備）", basis: `${JO} 第56条第1項第13号、${KI} 第12条` };
        if (f.battery_kwh === undefined) return [v({ ...bb, result: "conditional", reason: "蓄電池容量20kWh超が対象", missing: ["battery_kwh"] })];
        return [v({ ...bb, result: f.battery_kwh > 20 ? "required" : "not_required", form: f.battery_kwh > 20 ? "急速充電設備・燃料電池発電設備・発電設備・変電設備・蓄電池設備 設置届出書（様式番号なし）" : undefined, reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${f.battery_kwh > 20 ? "超" : "以下は対象外"}）` })];
      }
      return [v({ ...b, title: "火を使用する設備の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第56条第1項第1号〜第15号）。水素ガスを充塡する気球は工事の3日前まで", missing: ["facility"] })];
    }
    case "small_hazmat":
      return (
        hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第58条`) ?? [
          v({
            procedure: "shoryo-kikenbutsu",
            title: "少量危険物・指定可燃物の貯蔵・取扱いの届出",
            target,
            result: "required",
            deadline: "貯蔵し、又は取り扱う場所を設ける日の7日前まで",
            form: "少量危険物・指定可燃物貯蔵/取扱い届出書（様式番号なし）",
            basis: `${JO} 第58条、${KI} 第15条`,
            reason: "指定数量の5分の1以上（個人の住居では2分の1以上）指定数量未満の危険物、又は届出の数量以上の指定可燃物を貯蔵し、又は取り扱う",
            caveats: [TWO, "廃止するときは速やかに届け出る（条例第58条第2項、規則第15条第2項）"],
          }),
        ]
      );
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target, deadline: "実施する日の3日前まで", form: "露店等の開設届出書（様式番号なし）", basis: `${JO} 第57条第6号、${KI} 第13条` };
      if (f.stall_fire === false) return [v({ ...b, form: undefined, result: "not_required", reason: "対象火気器具等を使わない露店は第6号の対象外", caveats: ["消火活動に支障を及ぼすおそれのある道路の工事・占用は第5号の届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日など多数の者の集合する催しで、対象火気器具等を使う露店・屋台", missing: f.stall_fire === undefined ? ["stall_fire"] : [], caveats: ["催しの主催者などが出店者に代わって届け出ることができる（条例第57条ただし書）", TWO] })];
    }
    case "drill":
      return drillNational(f, "消防署長");
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第57条`, target, "引火性又は爆発性の物品の付近での溶接作業等の禁止と、火花の飛散防止などの措置は必要（条例第29条）");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災と紛らわしい煙又は火炎を発するおそれのある行為の届出", target, result: "required", deadline: "実施する日の1日前まで", form: "火災と紛らわしい煙又は火炎を発するおそれのある行為の届出書（様式番号なし）", basis: `${JO} 第57条第1号、${KI} 第13条`, reason: "たき火を含む、火災と紛らわしい煙又は火炎を発するおそれのある行為", caveats: ["届出書に代えて口頭でもよい（規則第13条ただし書）"] })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道断水・減水の届出", target, result: "required", deadline: "実施する日の3日前まで", form: "水道断（減）水届出書（様式番号なし）", basis: `${JO} 第57条第4号、${KI} 第13条`, reason: "水道の断水又は減水", caveats: ["届出書に代えて口頭でもよい（規則第13条ただし書）"] })];
  }
}
