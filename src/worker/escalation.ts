/**
 * Detects consultations that must be handed to a licensed professional instead of being answered by the AI.
 *
 * - gyosei: the user asks for a document to be made, filled in, corrected or submitted for them.
 *   Under the Gyoseishoshi Act (art. 19, as amended 2026-01-01) only a gyoseishoshi may do this for a fee,
 *   so the AI explains requirements only and offers a hand-off to a partner gyoseishoshi.
 * - setsubi: the user asks for an inspection or installation to be arranged (licensed fire equipment work).
 * - bengoshi: enforcement or a dispute (violation notices, orders, appeals, lawsuits). Pointed to a lawyer, no hand-off.
 *
 * Rules are deliberately broad: a false positive only adds a hand-off card, a miss lets the AI drift into drafting.
 */

export type Lane = "gyosei" | "setsubi" | "bengoshi";

export interface Detection {
  lane: Lane;
  reasons: string[];
}

const DOC =
  "(?:届出書|届出|届け出|届|申請書|申請|様式|書類|書面|消防計画|計画書|報告書|結果報告|図面|平面図|配置図|添付書類|選任届|解任届)";
const PLEASE = "(?:ほしい|欲しい|もらえ|もらい|いただけ|頂け|いただき|頂き|ください|下さい|くれ|お願い|頼み|頼め|依頼)";

const RULES: { lane: Lane; reason: string; re: RegExp }[] = [
  // --- bengoshi: enforcement and disputes ---
  { lane: "bengoshi", reason: "違反処理・命令", re: /違反処理|違反通知|警告書|命令書|是正命令|措置命令|使用停止命令|使用禁止命令|除去命令|告発/ },
  { lane: "bengoshi", reason: "不服申立て・紛争", re: /不服申立|不服申し立て|審査請求|訴訟|裁判|損害賠償|弁護士/ },

  // --- gyosei: making or submitting a document for the user ---
  { lane: "gyosei", reason: "提出・申請の代行", re: new RegExp(`代わりに(?:提出|出し|出す|申請|届け|作)|(?:提出|申請|届出|届け出|手続き?|作成)(?:の|を)?(?:代行|代理)|代行(?:して|を|は|で|でき|料|費|サービス|業者)|${DOC}を?(?:出して|提出して|申請して)${PLEASE}`) },
  { lane: "gyosei", reason: "書類の作成・記入", re: new RegExp(`${DOC}[^。？?！!\\n]{0,24}(?:(?:作って|作成して|つくって|書いて|記入して|埋めて|下書きして|起案して)${PLEASE}|作れ(?:ます|る)(?:か|[?？]))`) },
  { lane: "gyosei", reason: "書類の作成・記入", re: new RegExp(`(?:作成|記入|代筆|下書き|起案)(?:を|は)?${PLEASE}|(?:作成|記入|代筆)(?:して|でき)(?:もらえ|ますか|ませんか|る[?？])`) },
  { lane: "gyosei", reason: "書類の添削・修正", re: new RegExp(`${DOC}[^。？?！!\\n]{0,16}(?:添削して|直して|修正して|チェックして)${PLEASE}|添削`) },
  { lane: "gyosei", reason: "記入例・文例の要求", re: new RegExp(`(?:この|うちの|当社の|弊社の|私の|自分の|今回の)[^。？?！!\\n]{0,30}(?:記入例|文例|例文|ひな形|雛形|テンプレート)`) },
  { lane: "gyosei", reason: "行政書士への依頼", re: /行政書士/ },

  // --- setsubi: arranging inspection or installation work ---
  { lane: "setsubi", reason: "点検・工事の手配", re: new RegExp(`(?:点検|工事|設置|改修|交換|取り付け|取付|整備)(?:を|は|の)?(?:${PLEASE}|して${PLEASE}|でき(?:る|ます)(?:業者|会社|人)|業者|会社|見積|費用|料金)`) },
  { lane: "setsubi", reason: "設備業者の紹介", re: /(?:業者|消防設備士)(?:を|の)?(?:紹介|探して|知りたい|教えて)/ },
];

const ORDER: Lane[] = ["bengoshi", "gyosei", "setsubi"];

export function detectEscalation(text: string): Detection | null {
  const t = text.normalize("NFKC").replace(/\s+/g, "");
  const hits = new Map<Lane, Set<string>>();
  for (const r of RULES) {
    if (r.re.test(t)) {
      if (!hits.has(r.lane)) hits.set(r.lane, new Set());
      hits.get(r.lane)!.add(r.reason);
    }
  }
  const lane = ORDER.find((l) => hits.has(l));
  return lane ? { lane, reasons: [...hits.get(lane)!] } : null;
}

/** Appended to the system prompt for the turn; keeps the model on the information side of the line. */
export function laneRules(lane: Lane): string {
  switch (lane) {
    case "gyosei":
      return `# この相談の扱い（行政書士の業務に当たる依頼）
- 相談者は、書類の作成・記入・添削・提出の代行を求めています。官公署に出す書類を報酬を得て作成することは、原則として行政書士の業務です（行政書士法第19条）。
- 届出の要否の考え方、必要な書類の名前、期限、提出先、記載事項の一般的な説明まではしてかまいません。
- 相談者の建物や事業の情報を当てはめた記入内容・記入例・文例・添削結果は書きません。書類を作成・提出するとも言いません。
- 回答の最後に「書類の作成・提出は、トドケデ提携の行政書士にご依頼いただけます（下のボタンから）。ご自身で作る場合は、届出書類は https://docs.todokede.jp/ 、消防計画は https://plan.todokede.jp/ で作れます。」と添えます。`;
    case "setsubi":
      return `# この相談の扱い（点検・工事の手配）
- 相談者は、消防用設備等の点検・工事の手配を求めています。これらは消防設備士・点検資格者が行う業務です。
- 必要性、頻度、流れ、費用が変わる要因の一般的な説明まではしてかまいません。具体的な金額や業者名は書きません。
- 回答の最後に「点検・工事の手配は、トドケデにご相談いただけます（下のボタンから）。」と1文だけ添えます。`;
    case "bengoshi":
      return `# この相談の扱い（違反処理・命令・紛争）
- 違反処理、命令、不服申立て、損害賠償などの紛争性がある内容です。
- 制度の一般的な仕組みの説明にとどめ、個別の対応方針、反論や主張の組み立て、見通しの判断はしません。
- 回答の最後に「個別の対応は、弁護士へのご相談をおすすめします。」と1文だけ添えます。`;
  }
}

/** The hand-off a lane offers. bengoshi has none: lawyers are recommended, not referred. */
export const handoffLanes: readonly Lane[] = ["gyosei", "setsubi"];
