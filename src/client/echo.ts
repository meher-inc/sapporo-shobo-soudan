import type { AnswerActions } from "./api";

/** 回答の本文から、画面のボタン・選択肢と重なる行（「[届出書類を作る]」「- 10人未満」など）を除く。モデルが指示に反して書き出したときの保険 */
export function stripEchoes(text: string, a: AnswerActions): string {
  const labels = new Set([...a.buttons.map((b) => b.label), ...(a.question ? [a.question.text, ...a.question.options.map((o) => o.label)] : [])]);
  if (!labels.size) return text;
  const bare = (line: string) => line.trim().replace(/^(?:[-*・•]|\d+[.)])\s*/, "").replace(/^[[「【(（]\s*|\s*[\]」】)）]$/g, "").trim();
  return text
    .split("\n")
    .filter((line) => !(line.trim() && labels.has(bare(line))))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}
