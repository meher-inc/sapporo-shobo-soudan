// 岡山市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認、岡山市例規集 Reiki-Base 内容現在 令和8年8月31日）
//   岡山市火災予防条例（昭和37年市条例第16号、令和8年3月19日条例第27号まで）第53条〜第57条の3
//   岡山市火災予防規則（昭和59年市規則第69号）第9条〜第13条の4
//     例規集: https://krq800.legal-square.com/HAS-Shohin/page/SJSrbLogin.jsf（検索語「火災予防条例」「火災予防規則」）
//     入口: https://www.city.okayama.jp/shisei/0000015564.html
//   消防訓練の通報: 岡山市の条例に定めはないので、消防法施行規則 第3条第10項・第11項（drillNational）
// 名古屋市との主な違い: 使用開始届は規則第9条の用途・規模の防火対象物だけが対象（規模を問わず必要ではない）。
//   規則で期限が日数で決まっている（設備5日前、催物・露店4日前、断水2日前、たき火前日、少量危険物7日前）。
//   工事計画届・溶接の届出・消防訓練の届出の条はない。
// 岡山市消防局は加賀郡吉備中央町の消防事務を受託している（西消防署が管轄）。cities/okayama/notes.md を参照。
import { drillNational, hazmatGate, inUses, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "岡山市火災予防条例";
const KI = "岡山市火災予防規則";
const target = "所轄消防署長";

// 規則第9条第1項第1号: 規模にかかわらず届出が要る用途
const ALWAYS = ["1イ", "2", "5イ", "6ロ", "16の2", "16の3", "17", "18"];
// 第2号: 延べ150㎡以上又は収容人員30人以上
const G150_30 = ["1ロ", "3", "4", "6", "9イ"];
// 第3号: 延べ150㎡以上又は収容人員50人以上
const G150_50 = ["5ロ", "9ロ", "12", "13", "14"];
// 第4号: 延べ300㎡以上又は収容人員50人以上
const G300_50 = ["7", "8", "10", "11", "15"];

function useStart(f: FilingFacts): FilingVerdict[] {
  const base = {
    procedure: "shiyo-kaishi",
    title: "防火対象物使用開始（変更）届",
    target,
    deadline: "使用を開始する日の7日前まで",
    form: "防火対象物使用開始（変更）届出書（様式第3号）",
    basis: `${JO} 第53条、${KI} 第9条`,
    caveats: ["消防法施行規則第31条の3の設置届が要る建物以外は、建物の位置・構造・規模と消防用設備等の図書を添える（規則第9条第2項）", "休止していた建物を再び使うときも対象。休止・廃止のときは様式第3号の2（規則第9条第3項）"],
  };
  const o = f.occupancy;
  if (!o) return [v({ ...base, result: "conditional", reason: "規則第9条の用途と規模（延べ面積・収容人員）に当たる防火対象物が対象", missing: ["occupancy", "total_area", "capacity"] })];
  if (inUses(o, ALWAYS) === true) return [v({ ...base, result: "required", reason: "規則第9条第1項第1号の用途（劇場等・遊技場等・旅館等・病院等の一部・地下街など）は規模にかかわらず対象" })];
  if (inUses(o, ["3"]) === true && f.fire_use === true) return [v({ ...base, result: "required", reason: "火を使用する設備又は器具を設けた飲食店等（規則第9条第1項第1号イ）" })];
  if (inUses(o, ["6イ", "6ハ"]) === true && f.overnight === true) return [v({ ...base, result: "required", reason: "利用者を入居させ、又は宿泊させる(6)項イ・ハの施設（規則第9条第1項第1号ウ）" })];
  if (inUses(o, ["16イ"]) === true)
    return [v({ ...base, result: "conditional", reason: "(16)項イは、含む用途によって第1号エ（規模を問わない）か第2号（延べ150㎡以上又は収容人員30人以上）になる", missing: [] })];
  let area = 0;
  let cap = 0;
  let why = "";
  if (inUses(o, G150_30) === true) [area, cap, why] = [150, 30, "第2号"];
  else if (inUses(o, G150_50) === true) [area, cap, why] = [150, 50, "第3号"];
  else if (inUses(o, ["16ロ"]) === true) [area, cap, why] = [150, 50, "第3号（複合する用途が全て(7)(8)(10)(11)(15)項だけなら延べ300㎡以上又は収容人員50人以上）"];
  else if (inUses(o, G300_50) === true) [area, cap, why] = [300, 50, "第4号"];
  else return [v({ ...base, result: "conditional", reason: "用途の区分が読み取れない。規則第9条第1項各号で確認する", missing: ["occupancy"] })];
  const sizeHit = (f.total_area !== undefined && f.total_area >= area) || (f.capacity !== undefined && f.capacity >= cap);
  if (sizeHit) return [v({ ...base, result: "required", reason: `規則第9条第1項${why}: 延べ${area}㎡以上又は収容人員${cap}人以上に当たる` })];
  // 第1号イ・ウに当たるかが分からないときは断定しない
  if (inUses(o, ["3"]) === true && f.fire_use === undefined)
    return [v({ ...base, result: "conditional", reason: "火を使用する設備又は器具を設けた飲食店等は規模にかかわらず対象（規則第9条第1項第1号イ）。設けないなら延べ150㎡以上又は収容人員30人以上が対象", missing: ["fire_use"] })];
  if (inUses(o, ["6イ", "6ハ"]) === true && f.overnight === undefined)
    return [v({ ...base, result: "conditional", reason: "利用者を入居・宿泊させる施設は規模にかかわらず対象（規則第9条第1項第1号ウ）。そうでなければ延べ150㎡以上又は収容人員30人以上が対象", missing: ["overnight"] })];
  if (f.total_area === undefined || f.capacity === undefined)
    return [v({ ...base, result: "conditional", reason: `規則第9条第1項${why}: 延べ${area}㎡以上又は収容人員${cap}人以上なら対象`, missing: [...(f.total_area === undefined ? ["total_area"] : []), ...(f.capacity === undefined ? ["capacity"] : [])] })];
  // 第5号（地階・無窓階・3階以上の階の床面積50㎡以上）と第6号（避難階以外の階の特定用途と直通階段）
  const low = f.floors_above !== undefined && f.floors_above <= 2 && (f.floors_below ?? 0) === 0;
  if (!low) return [v({ ...base, result: "conditional", reason: `延べ${f.total_area}㎡・収容人員${f.capacity}人で${why}の規模に達しない。地階・無窓階・3階以上の階の床面積が50㎡以上なら第5号で対象`, missing: [...(f.floors_above === undefined ? ["floors_above"] : []), ...(f.floors_below === undefined ? ["floors_below"] : [])] })];
  return [v({ ...base, result: "not_required", reason: `延べ${f.total_area}㎡・収容人員${f.capacity}人で規則第9条第1項${why}の規模に達しない`, caveats: ["無窓階の床面積が50㎡以上なら第5号で対象", "飲食店・物販店などの部分が避難階以外の階にあり、直通階段が2以上ない場合は第6号で対象"] })];
}

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start":
      return useStart(f);
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target, result: "conditional", basis: `${JO} 第57条の2・第57条の3、${KI} 第13条の3・第13条の4`, reason: "岡山市の条例には工事計画そのものの届出はない。建築確認の申請等をする建築主は消防用設備等の設置計画（様式第23号）を出し、消防用設備等や簡易自動消火装置の設置工事は着手の10日前までに工事設計書（様式第23号の2）を出す", caveats: ["用途や使用内容が変わるなら使用開始（変更）届（7日前）が要る場合がある（条例第53条、規則第9条）"] })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物開催届", target, result: "conditional", deadline: "開催する日の4日前まで", form: "催物開催届出書（様式第12号）", basis: `${JO} 第55条第1項第3号、${KI} 第11条第3号`, reason: "劇場等以外の建築物その他の工作物で演劇・映画などの催物を開く場合に必要。物品販売だけなら対象か所轄に確認する" })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "着工する日の5日前まで", basis: `${JO} 第54条、${KI} 第10条`, caveats: ["第1号〜第13号の設備を屋外に設けるものは対象外（条例第54条第1項ただし書）", "変更・廃止のときも届け出る（規則第10条、様式第7号の2）"] };
      const f5 = "火を使用する設備等の設置届出書（様式第5号）";
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置届（厨房設備）";
        const kb = { ...b, title: t, basis: `${JO} 第54条第1項第3号の2、${KI} 第10条` };
        if (f.kitchen_kw === undefined) return [v({ ...kb, result: "conditional", reason: "同一厨房室の入力の合計350kW以上が対象", missing: ["kitchen_kw"] })];
        return [v({ ...kb, result: f.kitchen_kw >= 350 ? "required" : "not_required", form: f.kitchen_kw >= 350 ? f5 : undefined, reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW${f.kitchen_kw >= 350 ? "以上" : "未満"}）` })];
      }
      if (f.facility === "sauna") {
        const sb = { ...b, title: "火を使用する設備等の設置届（サウナ設備）", basis: `${JO} 第54条第1項第6号の2・第7号、${KI} 第10条` };
        if (f.personal_use === true || f.residence === true) return [v({ ...sb, result: "not_required", reason: "個人が設ける簡易サウナ設備、一般の住宅に設ける一般サウナ設備は対象外" })];
        if (f.residence === false) return [v({ ...sb, result: "required", form: f5, reason: "事業所などに設けるサウナ設備" })];
        return [v({ ...sb, result: "conditional", reason: "事業所などに設けるものは対象（個人が設ける簡易サウナ、一般の住宅の一般サウナは除く）", missing: ["residence"] })];
      }
      if (f.facility === "battery") {
        const bb = { ...b, title: "火を使用する設備等の設置届（蓄電池設備）", basis: `${JO} 第54条第1項第13号、${KI} 第10条` };
        if (f.battery_kwh === undefined) return [v({ ...bb, result: "conditional", reason: "蓄電池容量20kWh超が対象（第54条第1項第13号）", missing: ["battery_kwh"] })];
        return [v({ ...bb, result: f.battery_kwh > 20 ? "required" : "not_required", form: f.battery_kwh > 20 ? "発電・変電・蓄電池設備設置届出書（様式第6号）" : undefined, reason: `蓄電池容量${f.battery_kwh}kWh（20kWh${f.battery_kwh > 20 ? "超" : "以下は対象外"}）` })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第54条第1項各号）。水素ガスを充填する気球は掲揚する日の3日前まで", missing: ["facility"] })];
    }
    case "small_hazmat":
      return (
        hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第56条`) ?? [
          v({
            procedure: "shoryo-kikenbutsu",
            title: "少量危険物・指定可燃物の貯蔵・取扱いの届出",
            target,
            result: "required",
            deadline: "貯蔵し、又は取り扱う日の7日前まで",
            form: "少量危険物・指定可燃物 貯蔵・取扱い届出書（様式第16号）2通",
            basis: `${JO} 第56条、${KI} 第12条`,
            reason: "指定数量の5分の1以上（一般の住宅では2分の1以上）指定数量未満の危険物、又は届出の数量以上の指定可燃物を貯蔵し、又は取り扱う",
            caveats: ["変更・廃止のときも届け出る（規則第12条、様式第17号・第18号）"],
          }),
        ]
      );
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target, deadline: "開設する日の4日前まで", form: "露店等の開設届出書（様式第14号の2）", basis: `${JO} 第55条第1項第6号、${KI} 第11条第5号` };
      if (f.stall_fire === false) return [v({ ...b, form: undefined, result: "not_required", reason: "対象火気器具等を使わない露店は第6号の対象外", caveats: ["消火活動に支障を及ぼすおそれのある道路の工事・占用は第5号の届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日など多数の者の集合する催しで、対象火気器具等を使う露店", missing: f.stall_fire === undefined ? ["stall_fire"] : [] })];
    }
    case "drill":
      return drillNational(f, "消防署長");
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第55条`, target, "可燃性の物品の付近での溶接作業等の禁止と、火花の飛散防止などの措置は必要（条例第29条）");
    case "bonfire":
      return [v({ procedure: "kaen", title: "火災とまぎらわしい煙又は火炎を発するおそれのある行為（たき火を含む）の届出", target, result: "required", deadline: "実施する日の前日まで", form: "様式第10号", basis: `${JO} 第55条第1項第1号、${KI} 第11条第1号`, reason: "たき火を含む、火災とまぎらわしい煙又は火炎を発するおそれのある行為", caveats: ["やむを得ない場合に限り口頭でよい（規則第11条ただし書）"] })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道断水・減水の届出", target, result: "required", deadline: "実施する日の2日前まで", form: "水道断水・減水届出書（様式第13号）", basis: `${JO} 第55条第1項第4号、${KI} 第11条第4号`, reason: "水道の断水又は減水", caveats: ["やむを得ない場合に限り口頭でよい（規則第11条ただし書）"] })];
  }
}
