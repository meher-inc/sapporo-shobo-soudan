import type { AnswerActions } from "./api";

/** 回答の本文から、画面のボタン・選択肢と重なる行（「[届出書類を作る]」「- 10人未満」など）を除く。モデルが指示に反して書き出したときの保険 */
// 作成ツールの名前とボタン名。ボタンが出ない回答でも、本文に「[トドケデ 書類作成]」のように書かれたら消す
const TOOL_LABELS = ["トドケデ 書類作成", "トドケデ 消防計画", "届出書類を作る", "消防計画を作る"];

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
    // 作成ツールのボタンが出ていない回答では、作成ツールへの案内の行を消す
    .filter((line) => a.buttons.some((b) => !("kind" in b) || b.kind === "link") || !/作成ツール/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}
