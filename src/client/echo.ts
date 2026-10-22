import type { AnswerActions } from "./api";

/** 回答の本文から、画面のボタン・選択肢と重なる行（「[届出書類を作る]」「- 10人未満」など）を除く。モデルが指示に反して書き出したときの保険 */
// 作成ツールの名前とボタン名。ボタンが出ない回答でも、本文に「[トドケデ 書類作成]」のように書かれたら消す
const TOOL_LABELS = ["トドケデ 書類作成", "トドケデ 消防計画", "届出書類を作る", "消防計画を作る"];

// 画面に選択肢が出る回答では、本文の質問（「〜ですか？」「〜を教えてください」）を消し、質問を選択肢の上の1つだけにする。
// 作成ツールのボタンが出る回答では「最終的な判断は所轄の消防署が行います」も消す（締めくくりの一文で案内している）
const QUESTION = /[？?]\s*$|(?:教えて|お知らせ|お聞かせ)(?:ください|下さい)/;
const FINAL_SAY = /最終的な(?:判断|確認)は.{0,15}消防(?:署|本部|局)/;
function trimSentences(line: string, a: AnswerActions): string | null {
  const hasLink = a.buttons.some((b) => "kind" in b && b.kind === "link");
  if (!line.trim() || (!a.question && !hasLink)) return line;
  const [, pre, body] = line.match(/^(\s*(?:(?:[-*・•]|\d+[.)])\s+)?)(.*)$/)!;
  const sentences = body.match(/[^。？?！!]*[。？?！!]+|[^。？?！!]+$/g) ?? [body];
  const kept = sentences.filter((t) => !(a.question && QUESTION.test(t)) && !(hasLink && FINAL_SAY.test(t)));
  if (kept.length === sentences.length) return line;
  const rest = kept.join("").trim();
  return rest ? pre + rest : null;
}

export function stripEchoes(text: string, a: AnswerActions = { buttons: [] }): string {
  const labels = new Set([...TOOL_LABELS, ...a.buttons.flatMap((b) => [b.label, ...("sub" in b && b.sub ? [b.sub] : [])]), ...(a.question ? [a.question.text, ...a.question.options.map((o) => o.label)] : [])]);
  const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alt = [...labels].sort((a, b) => b.length - a.length).map(escape).join("|");
  // 行の中身が、ボタン名・選択肢（括弧や箇条書きの記号、区切りを含む）だけでできていれば消す
  const onlyLabels = new RegExp(`^(?:\\s*(?:[-*・•]|\\d+[.)])?\\s*[[「【(（]?\\s*(?:${alt})\\s*[\\]」】)）]?\\s*[、,/／|｜]?)+\\s*$`);
  return text
    .split("\n")
    .filter((line) => !(line.trim() && onlyLabels.test(line)))
    // ボタン・選択肢を並べる代わりにモデルが書く、改行タグだけの行も消す
    .filter((line) => !/^\s*(?:<br\s*\/?>\s*)+$/i.test(line))
    // 作成ツールのボタンが出ている回答では「確認先：…」の行を出さない（確認は締めくくりの一文で案内している）
    .filter((line) => !a.buttons.some((b) => "kind" in b && b.kind === "link") || !/^\s*(?:[-*・•]\s*)?\**確認先\**\s*[:：]/.test(line))
    // 作成ツールのボタンが出ていない回答では、作成ツールへの案内の行を消す
    .filter((line) => a.buttons.some((b) => !("kind" in b) || b.kind === "link") || !/作成ツール/.test(line))
    .map((line) => trimSentences(line, a))
    .filter((line): line is string => line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}
