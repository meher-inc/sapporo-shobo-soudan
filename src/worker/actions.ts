// 回答の下に出すボタンと選択肢（LINE のクイックリプライのような操作）。
// 文章のリンクを読ませず、押すだけで次に進めるようにする。中身はルール判定と相談文から機械的に決める（モデルに作らせない）。

import { STATIONS } from "../config/stations.ts";
import type { RulesResult } from "../rules/extract.ts";
import type { Lane } from "./escalation.ts";

/** 押すと開くボタン。kind=tel は電話をかける */
export type ActionButton = { kind: "link" | "tel"; label: string; href: string; sub?: string };
/** 押すとその文を送る選択肢。text が空のものは入力欄を開く（「その他」） */
export type ReplyChip = { label: string; text: string };
export type Actions = { buttons: ActionButton[]; question?: { text: string; options: ReplyChip[] } };

const UTM = "utm_source=todokede_ai&utm_medium=answer_button";
export const DOCS_URL = `https://docs.todokede.jp/?${UTM}`;
export const PLAN_URL = `https://plan.todokede.jp/?${UTM}`;

// 「わからない」の文には項目名を入れる。同じ質問を繰り返さないために、答えられなかった項目をこの文で見分ける
const unknown = (topic: string): ReplyChip => ({ label: "わからない", text: `${topic}はわかりません。調べ方を教えてください。` });
const TOPIC: Record<string, string> = { total_area: "延べ面積", capacity: "収容人員", floors_above: "階数", fire_use: "火を使うか" };
const OTHER: ReplyChip = { label: "その他（入力する）", text: "" };

// 選択肢の文は src/rules/extract.ts がそのまま読み取れる書き方にする。
// 範囲の選択肢は、判定の境目（面積 150・300・500・1000㎡、人数 10・30・50・300人）に合わせ、読み取られる数値が区分の下限（最下段は境目の1つ手前）になるようにしている。
const QUESTIONS: Record<string, { text: string; options: ReplyChip[] }> = {
  occupancy: {
    text: "建物は何に使いますか？",
    options: [
      { label: "飲食店", text: "飲食店です。" },
      { label: "お店（物販）", text: "物販店です。" },
      { label: "事務所", text: "事務所です。" },
      { label: "マンション・アパート", text: "共同住宅です。" },
      { label: "ホテル・民泊", text: "ホテル・旅館・民泊です。" },
      { label: "保育園", text: "保育所です。" },
      OTHER,
    ],
  },
  total_area: {
    text: "建物全体の広さ（延べ面積）は？",
    options: [
      { label: "150㎡未満", text: "延べ面積は149㎡以下です。" },
      { label: "150〜299㎡", text: "延べ面積は150㎡以上300㎡未満です。" },
      { label: "300〜499㎡", text: "延べ面積は300㎡以上500㎡未満です。" },
      { label: "500〜999㎡", text: "延べ面積は500㎡以上1000㎡未満です。" },
      { label: "1000㎡以上", text: "延べ面積は1000㎡以上です。" },
      unknown(TOPIC.total_area),
    ],
  },
  capacity: {
    text: "お客さんと従業員、あわせて最大で何人いますか？",
    options: [
      { label: "10人未満", text: "収容人員は9人以下です。" },
      { label: "10〜29人", text: "収容人員は10人以上30人未満です。" },
      { label: "30〜49人", text: "収容人員は30人以上50人未満です。" },
      { label: "50〜299人", text: "収容人員は50人以上300人未満です。" },
      { label: "300人以上", text: "収容人員は300人以上です。" },
      unknown(TOPIC.capacity),
    ],
  },
  floors_above: {
    text: "建物は何階建てですか？",
    options: [
      { label: "平屋", text: "平屋です。" },
      { label: "2階建て", text: "2階建てです。" },
      { label: "3〜5階建て", text: "3階建て以上5階建て以下です。" },
      { label: "6〜10階建て", text: "6階建て以上10階建て以下です。" },
      { label: "11階建て以上", text: "11階建て以上です。" },
      unknown(TOPIC.floors_above),
    ],
  },
  fire_use: {
    text: "コンロなど、火を使いますか？",
    options: [
      { label: "火を使う", text: "コンロなど火を使う器具を使います。" },
      { label: "使わない（IHだけ）", text: "火を使う器具はありません。IHのみです。" },
      unknown(TOPIC.fire_use),
    ],
  },
};
const ORDER = ["occupancy", "total_area", "capacity", "floors_above", "fire_use"] as const;

// 区が確かな消防署だけを使う（管轄区域を確認できていない署は ward が「要確認…」になっている）。同じ区は1つにまとめる
export const WARD_STATIONS = STATIONS.filter((s, i, all) => /^[^（(\s]+区$/.test(s.ward) && all.findIndex((x) => x.ward === s.ward) === i);

/** 相談文に出てくる区（長い名前から照合し、別の区の名前を含む区を取り違えない） */
export function findStation(texts: string[]) {
  const t = texts.join("\n").normalize("NFKC");
  return [...WARD_STATIONS].sort((a, b) => b.ward.length - a.ward.length).find((s) => t.includes(s.ward)) ?? null;
}

const DOC_WORDS = /届出|届け出|届|申請|書類|様式|選任|使用開始|設置届|点検結果|報告書/;
const PLAN_WORDS = /消防計画|防火管理/;
const MAKE_WORDS = /作り方|作成|書き方|書けば|自分で|作りたい|作る/;

export function buildActions(input: { userTexts: string[]; rules: RulesResult | null; lane?: Lane | null; emergency?: boolean }): Actions {
  const { userTexts, rules, lane } = input;
  const latest = (userTexts.at(-1) ?? "").normalize("NFKC");
  if (input.emergency) return { buttons: [{ kind: "tel", label: "119番に電話する", href: "tel:119" }] };
  // 違反処理・紛争は弁護士の案内だけにする（作成ツールや質問を出さない）
  if (lane === "bengoshi") return { buttons: [] };

  const buttons: ActionButton[] = [];
  const filings = rules?.filings.filter((f) => f.result !== "not_required") ?? [];
  const fireManager = rules?.install.find((v) => v.equipment === "fire_manager" && v.result === "required");
  const wantsMake = MAKE_WORDS.test(latest) || lane === "gyosei";
  if (filings.length || (wantsMake && DOC_WORDS.test(latest)) || lane === "gyosei")
    buttons.push({ kind: "link", label: "届出書類を作る", href: DOCS_URL, sub: "トドケデ 書類作成" });
  if (fireManager || PLAN_WORDS.test(latest))
    buttons.push({ kind: "link", label: "消防計画を作る", href: PLAN_URL, sub: "トドケデ 消防計画" });
  const station = findStation(userTexts);
  if (station) buttons.push({ kind: "tel", label: `${station.name}に電話する`, href: `tel:${station.tel.replace(/[^\d]/g, "")}`, sub: station.tel });

  // 次に聞くことは1つだけ。判定に足りない項目のうち、選択肢で答えられるものを優先順に選ぶ
  const missing = new Set<string>([...(rules?.install ?? []), ...(rules?.filings ?? [])].flatMap((v) => v.missing));
  if (!rules?.facts.occupancy) missing.add("occupancy");
  const answered = userTexts.join("\n");
  const key = lane === "setsubi" ? undefined : ORDER.find((k) => missing.has(k) && !(TOPIC[k] && answered.includes(`${TOPIC[k]}はわかりません`)));
  if (key) return { buttons, question: QUESTIONS[key] };
  // 用途まで分かっていて区が分からないときは、提出先の消防署を決めるために区を聞く
  if (WARD_STATIONS.length && !station && (filings.length || rules?.install.length))
    return {
      buttons,
      question: {
        text: "建物はどの区にありますか？",
        options: WARD_STATIONS.map((s) => ({ label: s.ward, text: `建物は${s.ward}にあります。` })),
      },
    };
  return { buttons };
}

/** モデルに渡す、画面に出るボタンの説明。URL・電話番号を本文に重ねて書かせない */
export function actionsNote(a: Actions): string {
  const out = ["# 画面のボタン（本文の書き方に反映する）"];
  out.push("URL は本文に書かないでください。トドケデの作成ツールや消防署の電話は、回答の下にボタンで表示されます。");
  if (a.buttons.length) out.push(`この回答の下に表示されるボタン: ${a.buttons.map((b) => `「${b.label}」`).join("")}。案内するときは「下のボタンから」と書くだけにし、ボタンの名前・URL・電話番号を本文に書き出さないでください。`);
  if (a.question)
    out.push(`この回答の下に「${a.question.text}」の選択肢（${a.question.options.map((o) => o.label).join("／")}）が表示されます。相談者への質問はこの1つだけにし、回答の最後に1文で短く聞いてください。選択肢は画面に出るので、本文に並べないでください。ほかの質問はしないでください。`);
  else out.push("情報が足りないときの質問は1つだけにしてください。");
  out.push("むずかしい言葉は避け、中学生にも分かる言葉で、短く書いてください。");
  return out.join("\n");
}

