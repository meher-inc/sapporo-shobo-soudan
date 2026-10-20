// 仙台市の火災予防条例・規則による届出の判定。
// 根拠（2026-10-20 確認、仙台市例規集 Reiki-Base、内容現在 令和8年7月8日）
//   仙台市火災予防条例（昭和48年条例第4号）第55条〜第58条
//   仙台市火災予防規則（昭和48年規則第27号、令和8年3月改正まで）第10条・第11条
//   例規集: https://www.city.sendai.jp/bunsho/shise/reki/reki/index.html （検索システム https://kra600.legal-square.com/HAS-Shohin/page/SJSrbLogin.jsf）
//   消防訓練の通報: 仙台市の条例に定めはないので、消防法施行規則 第3条第10項・第11項（drillNational）
// 名古屋市との主な違い: 使用開始届は規則第10条で定める防火対象物だけが対象（用途ごとに面積・収容人員の基準がある）。
// 工事計画届・溶接の届出・消防訓練の届出の条はない。確認できなかった項目は cities/sendai/notes.md。
import { occupancyIn } from "../install.ts";
import { drillNational, hazmatGate, noProvision, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "仙台市火災予防条例";
const KI = "仙台市火災予防規則";
const target = "所轄消防署長";

const inList = (o: string | undefined, list: string[]) => (o ? occupancyIn(o, list) : null);

// 規則第10条第1号: 規模にかかわらず対象
const ALWAYS = ["1イ", "2", "5イ", "6イ(1)", "6イ(2)", "6イ(3)", "6ロ", "16の2", "16の3", "17", "18"];
// 規則第10条第2号〜第5号: 用途ごとの延べ面積・収容人員の基準（(16)項は部分の用途で決まるので別扱い）
const TIERS: { uses: string[]; area: number; cap: number; no: string }[] = [
  { uses: ["1ロ", "3", "4", "6イ(4)", "6ハ", "6ニ", "9イ"], area: 150, cap: 30, no: "第3号" },
  { uses: ["5ロ", "9ロ", "12", "13", "14"], area: 150, cap: 50, no: "第4号" },
  { uses: ["7", "8", "10", "11", "15"], area: 300, cap: 50, no: "第5号" },
];

function useStartTarget(f: FilingFacts): { hit: true; why: string } | { hit: false; why: string } | { hit: null; why: string; missing: string[] } {
  const o = f.occupancy;
  if (!o) return { hit: null, why: "規則第10条で定める防火対象物（用途と延べ面積・収容人員で決まる）だけが対象", missing: ["occupancy"] };
  const a = inList(o, ALWAYS);
  if (a === true) return { hit: true, why: "規模にかかわらず届出の対象になる用途（規則第10条第1号）" };
  if (inList(o, ["6ハ"]) === true && f.overnight === true) return { hit: true, why: "利用者を入居させ、又は宿泊させる(6)項ハ（規則第10条第1号ロ）" };
  const sixteen = inList(o, ["16イ", "16ロ"]);
  const tier = TIERS.find((t) => inList(o, t.uses) === true);
  const area = f.total_area;
  const cap = f.capacity;
  if (tier) {
    if ((area !== undefined && area >= tier.area) || (cap !== undefined && cap >= tier.cap))
      return { hit: true, why: `延べ面積${tier.area}㎡以上又は収容人員${tier.cap}人以上（規則第10条${tier.no}）` };
    // (3)項は、階の床面積100㎡以上でも対象（第2号）。平屋で地階がなければ延べ面積を階の床面積として読む
    if (inList(o, ["3"]) === true && area !== undefined && area >= 100) {
      if (f.floors_above === 1 && f.floors_below === 0) return { hit: true, why: "(3)項で、階の床面積が100㎡以上（規則第10条第2号）" };
      return { hit: null, why: "(3)項は、階の床面積が100㎡以上なら対象（規則第10条第2号）", missing: ["floor_area"] };
    }
    const miss = [...(area === undefined ? ["total_area"] : []), ...(cap === undefined ? ["capacity"] : [])];
    if (miss.length) return { hit: null, why: `延べ面積${tier.area}㎡以上又は収容人員${tier.cap}人以上なら対象（規則第10条${tier.no}）`, missing: miss };
    const why = `延べ面積${area}㎡・収容人員${cap}人で規則第10条${tier.no}の基準に達しない`;
    // 第6号（地階・無窓階・3階以上の階で床面積50㎡以上）と第7号（(1)(3)(4)(6)(9)イの部分が避難階以外の階にあり、直通階段が2ない）
    const seven = inList(o, ["1", "3", "4", "6", "9イ"]) === true;
    if (inList(o, ["6ハ"]) === true && f.overnight === undefined)
      return { hit: null, why: `${why}。ただし利用者を入居・宿泊させる(6)項ハは規模にかかわらず対象（第1号ロ）`, missing: ["overnight"] };
    if (f.floors_below === 0 && f.floors_above !== undefined && (f.floors_above === 1 || (f.floors_above === 2 && !seven)))
      return { hit: false, why: `${why}。地階・3階以上の階はなく、第7号にも当たらない` };
    return { hit: null, why: `${why}。ただし地階・無窓階・3階以上の階で床面積50㎡以上のもの（第6号）、避難階以外の階に飲食店などがあり直通階段が2ない建物（第7号）は対象`, missing: ["floors_above", "floors_below"] };
  }
  if (sixteen === true) {
    if (inList(o, ["16イ"]) === true && ((area !== undefined && area >= 150) || (cap !== undefined && cap >= 30)))
      return { hit: true, why: "(16)項イで延べ面積150㎡以上又は収容人員30人以上（規則第10条第3号）" };
    return { hit: null, why: "(16)項は、含まれる用途と部分の床面積・収容人員で決まる（規則第10条第1号ハ・第2号〜第5号）", missing: ["occupancy", "total_area", "capacity"] };
  }
  if (a === null) return { hit: null, why: "用途の細分（(6)項イの(1)〜(4)など）で対象かどうかが変わる", missing: ["occupancy"] };
  return { hit: null, why: "規則第10条第1号〜第5号の用途に当たらない。地階・無窓階・3階以上の階で床面積50㎡以上のもの（第6号）なら対象", missing: ["floor"] };
}

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  switch (scene) {
    case "use_start": {
      const base = { procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target, deadline: "使用開始の日の7日前まで", form: "別記様式第3号（届け出た事項の変更は別記様式第4号）", basis: `${JO} 第55条、${KI} 第10条・第11条第1号` };
      const r = useStartTarget(f);
      if (r.hit === true) return [v({ ...base, result: "required", reason: r.why })];
      if (r.hit === false) return [v({ ...base, result: "not_required", reason: r.why, caveats: ["無窓階で床面積50㎡以上の階があれば対象（規則第10条第6号）", "用途や規模を変えたら、改めて対象か確認する"] })];
      return [v({ ...base, result: "conditional", reason: r.why, missing: r.missing, caveats: ["対象かどうかは所轄消防署の予防課に確認する"] })];
    }
    case "renovation":
      return [
        v({
          procedure: "koji",
          title: "工事に関する届出",
          target,
          result: "conditional",
          basis: `${JO} 第55条後段・第56条`,
          reason: "仙台市の条例には工事計画そのものの届出はない。使用開始届で届け出た事項を変えるなら変更の届出（7日前まで、別記様式第4号）、火を使用する設備等を設けるなら設置届（あらかじめ）が要る",
          caveats: ["建築確認が必要な工事は消防同意の対象", "消防用設備等の工事は消防法の着工届（10日前）・設置届（4日以内）"],
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
          form: "別記様式第11号",
          basis: `${JO} 第57条第3号、${KI} 第11条第9号`,
          reason: "劇場等以外の建築物その他の工作物で演劇・映画などの催物を開く場合に必要。一時的な物品販売だけなら対象か所轄に確認する",
          caveats: ["客席を設ける場合は、客席・避難通路・消防用設備等の配置図も添える（仙台市消防局の案内）"],
        }),
      ];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target, deadline: "あらかじめ", basis: `${JO} 第56条、${KI} 第11条` };
      if (f.facility === "kitchen") {
        const t = "火を使用する設備等の設置届（厨房設備）";
        const bb = { ...b, basis: `${JO} 第56条第7号の2、${KI} 第11条第3号` };
        if (f.kitchen_kw === undefined) return [v({ ...bb, title: t, result: "conditional", reason: "同一ちゅう房室内の厨房設備の入力の合計が350kW以上なら対象（第56条第7号の2）", missing: ["kitchen_kw"] })];
        if (f.kitchen_kw >= 350) return [v({ ...bb, title: t, result: "required", form: "別記様式第5号", reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW以上）` })];
        return [v({ ...bb, title: t, result: "not_required", reason: `同一厨房室の入力の合計${f.kitchen_kw}kW（350kW未満）` })];
      }
      if (f.facility === "sauna") {
        const t = "火を使用する設備等の設置届（サウナ設備）";
        const bb = { ...b, basis: `${JO} 第56条第6号の2・第7号、${KI} 第11条第3号` };
        if (f.personal_use === true) return [v({ ...bb, title: t, result: "not_required", reason: "個人が設ける簡易サウナ設備、個人の住居に設ける一般サウナ設備は対象外" })];
        if (f.residence === false) return [v({ ...bb, title: t, result: "required", form: "別記様式第5号", reason: "事業所などに設けるサウナ設備" })];
        return [v({ ...bb, title: t, result: "conditional", reason: "簡易サウナ設備は個人が設けるもの、一般サウナ設備は個人の住居に設けるものが対象外。それ以外は対象", missing: ["residence", "personal_use"] })];
      }
      if (f.facility === "battery") {
        const t = "火を使用する設備等の設置届（蓄電池設備）";
        const bb = { ...b, basis: `${JO} 第56条第13号、${KI} 第11条第4号` };
        if (f.battery_kwh === undefined) return [v({ ...bb, title: t, result: "conditional", reason: "蓄電池容量が20kWhを超えるものが対象（第56条第13号）", missing: ["battery_kwh"] })];
        if (f.battery_kwh > 20) return [v({ ...bb, title: t, result: "required", form: "別記様式第6号", reason: `蓄電池容量${f.battery_kwh}kWh（20kWh超）` })];
        return [v({ ...bb, title: t, result: "not_required", reason: `蓄電池容量${f.battery_kwh}kWh（20kWh以下は対象外）` })];
      }
      return [v({ ...b, title: "火を使用する設備等の設置届", result: "conditional", reason: "設備の種類と規模で決まる（第56条第1号〜第15号）", missing: ["facility"], caveats: ["届け出た事項を変えるときも届け出る（第56条後段）"] })];
    }
    case "small_hazmat":
      return (
        hazmatGate(f, f.residence === undefined ? null : f.residence ? 0.5 : 0.2, `${JO} 第58条`) ?? [
          v({
            procedure: "shoryo-kikenbutsu",
            title: "少量危険物・指定可燃物の貯蔵・取扱いの届出",
            target,
            result: "required",
            deadline: "あらかじめ",
            form: "危険物は別記様式第16号、指定可燃物は別記様式第17号",
            basis: `${JO} 第58条、${KI} 第11条第14号・第15号`,
            reason: "指定数量の5分の1以上（個人の住居では2分の1以上）指定数量未満の危険物、又は別表第三の数量の5倍以上などの指定可燃物を貯蔵し、又は取り扱う",
            caveats: ["届け出た事項を変えるときも届け出る（条例第58条第1項後段、様式第18号・第19号）", "廃止したときは遅滞なく届け出る（条例第58条第2項、様式第20号・第21号）"],
          }),
        ]
      );
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target, deadline: "あらかじめ", form: "別記様式第14号", basis: `${JO} 第57条第6号、${KI} 第11条第12号` };
      if (f.stall_fire === false) return [v({ ...b, result: "not_required", form: undefined, reason: "対象火気器具等を使わない露店は第6号の対象外", caveats: ["消防隊の通行など消火活動に支障を及ぼすおそれのある道路工事は第5号の届出が要る"] })];
      return [v({ ...b, result: f.stall_fire ? "required" : "conditional", reason: "祭礼・縁日・花火大会・展示会など多数の者の集合する催しで、対象火気器具等を使う露店・屋台", missing: f.stall_fire === undefined ? ["stall_fire"] : [] })];
    }
    case "drill":
      return drillNational(f, "消防署長");
    case "hot_work":
      return noProvision("溶接・溶断作業の届出", "yosetsu", `${JO} 第57条`, target, "溶接作業等は引火性・爆発性・可燃性の物品の付近でしてはならない（条例第30条）。防火管理者の火気管理も別途必要");
    case "bonfire":
      return [
        v({
          procedure: "kaen",
          title: "火災とまぎらわしい煙等を発するおそれのある行為の届出",
          target,
          result: "required",
          deadline: "あらかじめ",
          form: "別記様式第9号",
          basis: `${JO} 第57条第1号、${KI} 第11条第7号`,
          reason: "たき火を含む、火災とまぎらわしい煙又は火炎を発するおそれのある行為",
          caveats: ["文書で届け出るいとまがないときは口頭でよい（規則第11条ただし書）"],
        }),
      ];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道供給の停止・制限の届出", target, result: "required", deadline: "あらかじめ", form: "別記様式第12号", basis: `${JO} 第57条第4号、${KI} 第11条第10号`, reason: "水道供給の停止又は制限" })];
  }
}
