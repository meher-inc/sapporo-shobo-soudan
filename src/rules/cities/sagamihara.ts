// 相模原市の火災予防条例による届出の判定。
// 根拠（2026-10-20 確認）
//   相模原市消防局の申請書ページ「4 火災予防条例に関する書類」「2 訓練に関する書類」「3 消防設備等に関する書類」
//     https://www.city.sagamihara.kanagawa.jp/shinseisho_menu/syoubo/1011914/index.html
//     https://www.city.sagamihara.kanagawa.jp/shinseisho_menu/syoubo/1011988/index.html
//     https://www.city.sagamihara.kanagawa.jp/shinseisho_menu/syoubo/1011903/index.html
//   各ページに書かれた「根拠法令」（相模原市火災予防条例の条・号）と「届出等の時期」を使っている。
//   サウナ設備: 相模原市消防局「サウナ設備の基準等の変更について」（令和8年2月6日更新）
//     https://www.city.sagamihara.kanagawa.jp/kurashi/1026529/shobo/kasaiyobo/1008907/1034668.html
// 未確認: 条例本文と施行規則（相模原市例規集は検索フォーム経由でしか開けず、本文を読めなかった）。
//   そのため、厨房設備の入力・蓄電池の容量など号ごとの規模の下限、少量危険物の数量の下限、
//   届出先の長（消防長か消防署長か）、様式番号、溶接作業の届出の有無は「要確認」として conditional にする（cities/sagamihara/notes.md）。
// 窓口: 使用開始・設備・少量危険物は管轄消防署の査察指導課（津久井消防署は警備課査察指導班）、
//   火煙・催物・断水・露店は市内の各消防署の本署・分署・消防出張所（申請書ページの「受付窓口」）。
import { drillNational, v, type FilingFacts, type FilingVerdict, type Scene } from "../filing-base.ts";

const JO = "相模原市火災予防条例";
const UNVERIFIED = "条例本文・施行規則は未確認（相模原市消防局の申請書ページで根拠条と時期を確認）";

export function filings(scene: Scene, f: FilingFacts): FilingVerdict[] {
  const sasatsu = "管轄する消防署の査察指導課（津久井消防署は警備課査察指導班）";
  const station = "市内の消防署の本署・分署・消防出張所";
  switch (scene) {
    case "use_start":
      return [v({ procedure: "shiyo-kaishi", title: "防火対象物使用開始届", target: sasatsu, result: "required", deadline: "使用を開始する日の7日前まで", basis: `${JO} 第45条`, reason: "防火対象物を令別表第一に掲げる用途に使用する場合（相模原市消防局の申請書ページ）", caveats: ["配置図・各階平面図に消防用設備等の設置場所を記入して添付する", "電子申請・郵送でも出せる", UNVERIFIED] })];
    case "renovation":
      return [v({ procedure: "koji", title: "工事に関する届出", target: sasatsu, result: "conditional", basis: `${JO} 第45条`, reason: "工事計画そのものの届出が条例にあるかは要確認。用途が変わるなら使用開始届、動力消防ポンプ・誘導灯・非常警報設備などの消防用設備等の工事なら消防用設備等工事計画書（工事に着手しようとする10日前まで）を出す", caveats: ["消防用設備等工事計画書の根拠条は申請書ページに書かれていない（要確認）", "着工届（消防法第17条の14、10日前）・設置届（同法第17条の3の2、完了から4日以内）は別途", UNVERIFIED] })];
    case "temp_use":
    case "event":
      return [v({ procedure: "saimono", title: "催物開催届", target: station, result: "conditional", deadline: "催物を行う3日前まで", basis: `${JO} 第47条第3号`, reason: "劇場等以外の場所で催物を開く場合に必要。一時的な物品販売だけなら対象か所轄に確認する", caveats: ["一時使用の届出の規定があるかは要確認", UNVERIFIED] })];
    case "fire_equipment": {
      const b = { procedure: "kaki-setsubi", target: sasatsu, deadline: "設備を設ける3日前" };
      if (f.facility === "kitchen")
        return [v({ ...b, title: "火を使用する設備等の設置届（厨房設備）", basis: `${JO} 第46条（第1号〜第11号のいずれか）`, result: "conditional", reason: "厨房設備が届出の対象になる入力の下限は要確認（条例本文を確認できていない）", missing: ["kitchen_kw"], caveats: ["消防同意の確認事項では、業務用の厨房設備（概ね21kWを超えるもの）は機器表を明示するよう求めている", UNVERIFIED] })];
      if (f.facility === "sauna") {
        const sb = { ...b, title: "火を使用する設備等の設置届（サウナ設備）", basis: `${JO} 第46条（第1号〜第11号のいずれか）` };
        if (f.personal_use === true) return [v({ ...sb, result: "not_required", reason: "個人が自宅の庭などで本人や家族が使うために設ける簡易サウナ設備は届出不要（相模原市消防局「サウナ設備の基準等の変更について」）" })];
        return [v({ ...sb, result: "conditional", reason: "他者に利用させるため事業者等が設ける簡易サウナ設備は事前の届出が要る。建物内の一般サウナ設備の届出の範囲は要確認", missing: f.personal_use === undefined ? ["personal_use"] : [], caveats: ["簡易サウナ設備は屋外等に設けるテント型・バレル型で、サウナストーブの定格出力6kW以下・熱源が薪又は電気のもの（令和8年3月31日施行）", UNVERIFIED] })];
      }
      if (f.facility === "battery")
        return [v({ ...b, title: "急速充電設備・燃料電池発電設備・変電設備・発電設備・蓄電池設備設置届（蓄電池設備）", basis: `${JO} 第46条第12号〜第16号`, result: "conditional", reason: "蓄電池設備が届出の対象になる容量の下限は要確認（条例本文を確認できていない）", missing: ["battery_kwh"], caveats: [UNVERIFIED] })];
      return [v({ ...b, title: "火を使用する設備等の設置届", basis: `${JO} 第46条`, result: "conditional", reason: "設備の種類と規模で決まる（火を使用する設備等は第1号〜第11号、電気設備等は第12号〜第16号、ネオン管灯設備は第17号、水素ガス気球は第18号）", missing: ["facility"], caveats: [UNVERIFIED] })];
    }
    case "small_hazmat": {
      const title = "少量危険物・指定可燃物の貯蔵・取扱いの届出";
      if (f.hazmat_ratio !== undefined && f.hazmat_ratio >= 1)
        return [v({ procedure: "shoryo-kikenbutsu", title, target: "消防署長", result: "not_required", basis: "消防法 第十条・第十一条", reason: `指定数量の${f.hazmat_ratio}倍で指定数量以上。条例の届出ではなく、危険物施設として消防法の許可が要る` })];
      if (f.hazmat_ratio !== undefined)
        return [v({ procedure: "shoryo-kikenbutsu", title, target: sasatsu, result: "conditional", deadline: "あらかじめ", basis: `${JO} 第48条`, reason: `指定数量の${f.hazmat_ratio}倍。届出の対象になる量の下限（指定数量の何分の1以上か、個人の住居での扱い）は要確認`, caveats: [UNVERIFIED] })];
      return [v({ procedure: "shoryo-kikenbutsu", title, target: sasatsu, result: "required", deadline: "あらかじめ", basis: `${JO} 第48条`, reason: "少量危険物又は指定可燃物を貯蔵し、又は取り扱う", caveats: ["廃止するときも同じ様式（開始（廃止）届出書）で届け出る", "届出の対象になる量の下限は要確認", UNVERIFIED] })];
    }
    case "stall": {
      const b = { procedure: "roten", title: "露店等の開設届", target: station, deadline: "開設を行う日の3日前まで", basis: `${JO} 第47条第6号` };
      if (f.stall_fire === true) return [v({ ...b, result: "required", reason: "祭礼・縁日などで火気器具等を使う露店等を開設する", caveats: ["開設位置と消火器の準備位置を記入した略図を添付する", UNVERIFIED] })];
      return [v({ ...b, result: "conditional", reason: "露店等の開設は届出が要る。火気器具等を使わない露店も対象かは要確認", missing: f.stall_fire === undefined ? ["stall_fire"] : [], caveats: [UNVERIFIED] })];
    }
    case "drill": {
      const r = drillNational(f, "管轄する消防署（本署・分署・消防出張所又は査察指導課）");
      return r.map((x) => ({ ...x, form: "消防訓練通報書（消防職員の派遣なし）、消防訓練指導申請書（派遣あり）", caveats: [...x.caveats, "相模原市消防局の申請書ページでも根拠は消防法施行規則第3条第11項（届出の時期はあらかじめ）"] }));
    }
    case "hot_work":
      return [v({ procedure: "yosetsu", title: "溶接・溶断作業の届出", target: station, result: "conditional", basis: `${JO}（第45条〜第48条）`, reason: "相模原市消防局の申請書一覧に溶接・溶断作業の届出はない。条例に定めがないかは本文で要確認", caveats: ["防火管理者の火気管理や、工事中の防火管理は別途必要", UNVERIFIED] })];
    case "bonfire":
      return [v({ procedure: "kaen", title: "火煙発生届", target: station, result: "required", deadline: "実施日の3日前", basis: `${JO} 第47条第1号`, reason: "火災とまぎらわしい煙又は火炎を発するおそれのある行為", caveats: ["緊急の場合は電話又は口頭でも受け付ける", "廃棄物（紙ごみ等）の焼却は原則として禁止されている", UNVERIFIED] })];
    case "water_outage":
      return [v({ procedure: "dansui", title: "水道断減水届", target: station, result: "required", deadline: "工事を行う3日前まで", basis: `${JO} 第47条第4号`, reason: "水道の断水又は減水", caveats: ["緊急やむを得ない場合は電話又は口頭でもよい", UNVERIFIED] })];
  }
}
