function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return escape(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(\d{1,2})\]/g, '<span class="cite" aria-label="根拠$1">$1</span>');
}

/** Minimal Markdown for assistant replies: ### headings, lists, bold, paragraphs. Input is escaped first. */
export function renderMarkdown(src: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of src.split("\n")) {
    const line = raw.trimEnd();
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const bullet = line.match(/^\s*[-*・]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (heading) {
      flushPara();
      closeList();
      out.push(`<h3>${inline(heading[1])}</h3>`);
    } else if (bullet || ordered) {
      flushPara();
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet ?? ordered)![1])}</li>`);
    } else if (!line.trim()) {
      flushPara();
      closeList();
    } else {
      closeList();
      para.push(line);
    }
  }
  flushPara();
  closeList();
  return out.join("");
}
