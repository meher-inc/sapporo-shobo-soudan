// 届出の場面（Scene）に当てはまらない相談の判定。管轄を限って、条文・所管の案内を確認したものだけを置く。
// 根拠（2026-11-13 確認。~/00_master/10_仕事/02_案件/Kindle本/資料/第3章_裏取り結果.md）
//   東京都 裸火・危険物品の持込み: 火災予防条例（東京都）第二十三条。東京消防庁「禁止行為」
//     https://www.tfd.metro.tokyo.lg.jp/lfe/office_adv/kakisiyoukisei/kinsi.html （条例本文は未読、所管の説明で確認）
//   京都市 民泊の消防法令適合通知書: https://www.city.kyoto.lg.jp/shobo/page/0000185126.html 、消防予第330号（平成29年10月27日）
//   統括防火管理者: 消防法 第八条の二、消防法施行令 第三条の三（e-Gov 法令API で第2号を確認）
import { occupancyIn } from "./install.ts";
import { v, type FilingFacts, type FilingVerdict } from "./filing-base.ts";
import type { Jurisdiction } from "./filings.ts";

const CANDLE = /キャンドル|ろうそく|ロウソク|蝋燭/;
const ALCOHOL_LAMP = /アルコールランプ|アルコール燃料|オイルランプ/;
const OPEN_FLAME = /裸火|固形燃料|ランタン/;
export const MINPAKU = /民泊|住宅宿泊/;

function tokyoOpenFlame(t: string, f: FilingFacts): FilingVerdict[] {
  const candle = CANDLE.test(t);
  const lamp = ALCOHOL_LAMP.test(t);
  if (!candle && !lamp && !OPEN_FLAME.test(t)) return [];
  const basis = "火災予防条例（東京都） 第二十三条（東京消防庁「禁止行為」の説明で確認）";
  const target = "所轄の消防署長";
  const area = f.public_area ?? f.total_area;
  const stage = "飲食店の客席（舞台を除く）は裸火の使用を禁止する場所ではない。舞台（バーを除く）では裸火の使用も禁止";
  const out: FilingVerdict[] = [];
  if (candle)
    out.push(
      v({
        procedure: "kinshi-kaijo",
        title: "キャンドルについての禁止行為の解除承認",
        target,
        result: "not_required",
        basis,
        reason: `${stage}。客席など公衆の出入りする部分が100㎡以上の店では危険物品の持込みが禁止されるが、飲食店で従業員の監視の下にキャンドル（可燃性固体類に限る）を使うために持ち込むことは除かれる`,
        caveats: ["従業員の監視の下で使うことが条件"],
      }),
    );
  if (lamp) {
    const b = { procedure: "kinshi-kaijo", title: "アルコールランプについての禁止行為の解除承認", target, basis, deadline: "使う前に承認を受ける" };
    const fuel = "アルコールランプの燃料（アルコール類＝消防法の危険物）は、キャンドル・料理用固形燃料のような持込み禁止の除外に当たらない";
    if (area === undefined)
      out.push(v({ ...b, result: "conditional", reason: `客席など公衆の出入りする部分の床面積が100㎡以上なら危険物品の持込みが禁止され、${fuel}。使うには禁止行為の解除承認が要る`, missing: ["public_area"] }));
    else if (area >= 100)
      out.push(v({ ...b, result: "required", reason: `客席の床面積${area}㎡（100㎡以上）で危険物品の持込みが禁止される。${fuel}。使うには禁止行為の解除承認が要る` }));
    else out.push(v({ ...b, result: "not_required", reason: `客席の床面積${area}㎡（100㎡未満）で、危険物品の持込みの禁止の対象外` }));
  }
  if (!candle && !lamp)
    out.push(v({ procedure: "kinshi-kaijo", title: "裸火・危険物品についての禁止行為の解除承認", target, result: "conditional", basis, reason: `${stage}。公衆の出入りする部分が100㎡以上なら危険物品の持込みが禁止され、燃料の種類によっては解除承認が要る（キャンドル・料理用固形燃料を従業員の監視の下で使う場合は除く）`, missing: ["facility"] }));
  return out;
}

function kyotoMinpaku(t: string): FilingVerdict[] {
  if (!MINPAKU.test(t)) return [];
  return [
    v({
      procedure: "tekigo-tsuchi",
      title: "消防法令適合通知書の交付申請",
      target: "所轄消防署長",
      result: "required",
      deadline: "住宅宿泊事業の届出の前に（届出には交付から3か月以内の通知書を使う）",
      basis: "京都市消防局「消防法令適合通知書」の案内、消防予第330号",
      reason: "京都市では住宅宿泊事業の届出の前に、所轄消防署へ消防法令適合通知書を申請し、立入検査を受けて交付を受ける（手数料なし、検査後1週間程度）",
      inspection: "申請後に消防署の立入検査がある",
      caveats: [
        "家主が不在になる届出住宅は令別表第一(5)項イ（旅館・ホテル等）として扱う。家主が住み、宿泊室の床面積の合計が50㎡以下なら住宅として扱う（消防予第330号）",
        "設備は(5)項イの基準で確認する（自動火災報知設備・誘導灯など）",
      ],
    }),
  ];
}

// 令第三条の三第二号の用途（(六)項ロを含む(十六)項イは第三号で別に扱うが、ここでは区別しない）
const TOUKATSU_USES = ["1", "2", "3", "4", "5イ", "6イ", "6ハ", "6ニ", "9イ", "16イ"];

export function multiTitleFilings(f: FilingFacts): FilingVerdict[] {
  if (!f.multi_title) return [];
  const b = {
    procedure: "toukatsu",
    title: "統括防火管理者の選任届（建物全体）",
    target: "所轄の消防長又は消防署長",
    deadline: "管理権原者が協議して統括防火管理者を定めたら遅滞なく",
    basis: "消防法 第八条の二、消防法施行令 第三条の三",
    caveats: ["統括防火管理者は建物全体の消防計画を作って届け出る。各テナントの防火管理者・消防計画は、全体の消防計画に合わせる", "高さ31mを超える高層建築物は規模にかかわらず対象（令第三条の三第一号）"],
  };
  const sp = f.occupancy ? occupancyIn(f.occupancy, TOUKATSU_USES) : null;
  if (sp !== true)
    return [v({ ...b, result: "conditional", reason: "管理について権原が分かれている建物で、用途・階数・収容人員が令第三条の三の基準に当たれば必要（店舗・飲食店などの特定用途を含むなら、地階を除く階数3以上かつ収容人員30人以上）", missing: f.occupancy ? [] : ["occupancy"] })];
  const missing = [...(f.floors_above === undefined ? ["floors_above"] : []), ...(f.capacity === undefined ? ["capacity"] : [])];
  if (missing.length) return [v({ ...b, result: "conditional", reason: "管理について権原が分かれ、特定用途を含む建物は、地階を除く階数3以上かつ収容人員30人以上で必要（令第三条の三第二号）", missing })];
  const hit = f.floors_above! >= 3 && f.capacity! >= 30;
  return [
    v({
      ...b,
      result: hit ? "required" : "not_required",
      reason: hit
        ? `管理について権原が分かれ、特定用途を含む地上${f.floors_above}階・収容人員${f.capacity}人の建物（地階を除く階数3以上かつ30人以上。令第三条の三第二号）`
        : `地上${f.floors_above}階・収容人員${f.capacity}人で、令第三条の三第二号（地階を除く階数3以上かつ30人以上）に当たらない`,
    }),
  ];
}

/** 場面（Scene）とは別に判定する相談。届出の判定結果の後ろに足す */
export function topicFilings(jurisdiction: Jurisdiction, latest: string, f: FilingFacts): FilingVerdict[] {
  const t = latest.normalize("NFKC");
  const out: FilingVerdict[] = [];
  if (jurisdiction === "tokyo-tfd") out.push(...tokyoOpenFlame(t, f));
  if (jurisdiction === "kyoto-city") out.push(...kyotoMinpaku(t));
  out.push(...multiTitleFilings(f));
  return out;
}
