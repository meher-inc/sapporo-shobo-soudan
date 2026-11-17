import type { AnswerActions } from "./api";

/** 回答の本文から、画面のボタン・選択肢と重なる行（「[届出書類を作る]」「- 10人未満」など）を除く。モデルが指示に反して書き出したときの保険 */
// 作成ツールの名前とボタン名。ボタンが出ない回答でも、本文に「[トドケデ 書類作成]」のように書かれたら消す
const TOOL_LABELS = ["トドケデ 書類作成", "トドケデ 消防計画", "届出書類を自分で作る", "届出書類を作る", "消防計画を作る"];

// 画面に選択肢が出る回答では、本文の質問（「〜ですか？」「〜を教えてください」）を消し、質問を選択肢の上の1つだけにする。
// 作成ツールのボタンが出る回答では「最終的な判断は所轄の消防署が行います」も消す（締めくくりの一文で案内している）。
// ただし「〜でご確認ください」のように確認・相談を促す文は残す
const QUESTION = /[？?]\s*$|(?:教えて|お知らせ|お聞かせ)(?:ください|下さい)/;
const FINAL_SAY = /最終的な(?:判断|確認)は.{0,15}消防(?:署|本部|局)/;
// 所轄の消防署での確認・相談を促す文は消さない（F-28 の締めくくりの1文。F-26 で作成ツールのボタンがほぼすべての回答に出るため。fixrules R5）
const ASKS_CHECK = /確認|相談|問い合わせ|問合せ/;
function trimSentences(line: string, a: AnswerActions): string | null {
  const hasLink = a.buttons.some((b) => "kind" in b && b.kind === "link");
  if (!line.trim() || (!a.question && !hasLink)) return line;
  const [, pre, body] = line.match(/^(\s*(?:(?:[-*・•]|\d+[.)])\s+)?)(.*)$/)!;
  const sentences = body.match(/[^。？?！!]*[。？?！!]+|[^。？?！!]+$/g) ?? [body];
  const kept = sentences.filter((t) => !(a.question && QUESTION.test(t)) && !(hasLink && FINAL_SAY.test(t) && !ASKS_CHECK.test(t)));
  if (kept.length === sentences.length) return line;
  const rest = kept.join("").trim();
  return rest ? pre + rest : null;
}

// 選択肢を JSON で書いたコードブロック（「"choices": [...]」など）。画面に選択肢が出るので本文からは消す
const CHOICE_JSON = /```[a-z]*\s*\{[\s\S]*?"(?:choices|options|action)"[\s\S]*?(?:```|$)/gi;
// 「（選択肢ボタン：飲食店／物販）」のように、前置きを付けて選択肢・ボタン名を並べた行
const LABEL_PREFIX = /^\s*[（(【[]?\s*(?:選択肢(?:ボタン)?|ボタン)\s*[：:]\s*(.*?)\s*[）)】\]]?\s*$/;

export function stripEchoes(text: string, a: AnswerActions = { buttons: [] }): string {
  const labels = new Set([...TOOL_LABELS, ...a.buttons.flatMap((b) => [b.label, ...("sub" in b && b.sub ? [b.sub] : [])]), ...(a.question ? [a.question.text, ...a.question.options.map((o) => o.label)] : [])]);
  const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alt = [...labels].sort((a, b) => b.length - a.length).map(escape).join("|");
  // 行の中身が、ボタン名・選択肢（括弧や箇条書きの記号、区切りを含む）だけでできていれば消す
  const onlyLabels = new RegExp(`^(?:\\s*(?:[-*・•]|\\d+[.)])?\\s*[[「【(（]?\\s*(?:${alt})\\s*[\\]」】)）]?\\s*[、,/／|｜]?)+\\s*$`);
  return text
    .replace(CHOICE_JSON, "")
    .split("\n")
    // モデルがボタンを <button> タグで書いたときは、タグを外してから判定する
    .map((line) => line.replace(/<\/?button[^>]*>/gi, ""))
    // 太字の記号（** __）で囲んだ行も、記号を外して判定する
    .filter((line) => {
      const bare = line.replace(/\*\*|__/g, "");
      return !(bare.trim() && onlyLabels.test(bare));
    })
    .filter((line) => {
      const m = line.replace(/\*\*|__/g, "").match(LABEL_PREFIX);
      return !(m && m[1].trim() && onlyLabels.test(m[1]));
    })
    // ボタン・選択肢を並べる代わりにモデルが書く、改行タグだけの行も消す
    .filter((line) => !/^\s*(?:<br\s*\/?>\s*)+$/i.test(line))
    // 区切りや強調の記号だけの行（「***」「---」「**」）も消す
    .filter((line) => !/^\s*(?:\*{2,}|-{3,}|_{3,})\s*$/.test(line))
    // 作成ツールのボタンが出ている回答では「確認先：…」の行を出さない（確認は締めくくりの一文で案内している）
    .filter((line) => !a.buttons.some((b) => "kind" in b && b.kind === "link") || !/^\s*(?:[-*・•]\s*)?\**確認先\**\s*[:：]/.test(line))
    // 作成ツールのボタンが出ていない回答では、作成ツールへの案内の行を消す
    .filter((line) => a.buttons.some((b) => !("kind" in b) || b.kind === "link") || !/作成ツール/.test(line))
    .map((line) => trimSentences(line, a))
    .filter((line): line is string => line !== null)
    // 質問の文を消したあとに残る太字の記号だけの行（「**建物は何に使いますか？**」の残り）も消す
    .filter((line) => !/^\s*(?:\*{2,}|_{2,})\s*$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

// 作成ツールのボタンが出る回答で、締めくくり（所轄の消防署で確認する一文）が抜けていたら補う。
// 回答が出そろってから stripEchoes のあとに使う（2026-11-17 の初見10問で、問7・問8の締めくくりが抜けた）
const CLOSING = /消防(?:署|本部|局)[^。\n]{0,15}(?:確認|相談)/;
export const CLOSING_TEXT = "下のボタンからトドケデで書類を作り、出す前に所轄の消防署で確認してください。";
export function withClosing(text: string, a: AnswerActions = { buttons: [] }): string {
  const hasLink = a.buttons.some((b) => "kind" in b && b.kind === "link");
  if (!hasLink || !text.trim() || CLOSING.test(text)) return text;
  return `${text.trimEnd()}\n\n${CLOSING_TEXT}`;
}
