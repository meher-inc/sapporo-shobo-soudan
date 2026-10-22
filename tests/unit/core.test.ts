import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../../src/client/markdown.ts";
import { SERVICE } from "../../src/config/service.ts";

test("markdown escapes HTML before formatting", () => {
  const html = renderMarkdown('<script>alert(1)</script>\n**太字** [1]');
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("<strong>太字</strong>"));
  assert.ok(html.includes('class="cite"'));
});

test("markdown renders headings and both list kinds", () => {
  const html = renderMarkdown("### 見出し\n- a\n- b\n\n1. x\n2. y");
  assert.equal(html, "<h3>見出し</h3><ul><li>a</li><li>b</li></ul><ol><li>x</li><li>y</li></ol>");
});

test("service config follows the UI rules in CLAUDE.md", () => {
  assert.match(SERVICE.id, /^[a-z][a-z0-9-]*$/, "id: lowercase letters, digits and hyphens");
  assert.ok([...SERVICE.shortName].length <= 8, "shortName fits the header on one line");
  assert.ok([...SERVICE.area].length <= 6, "area fits next to the name");
  assert.equal(SERVICE.suggestions.length, 4, "four suggestions");
  for (const s of SERVICE.suggestions) assert.ok([...s].length <= 12, `suggestion too long: ${s}`);
  assert.ok(!SERVICE.notice.includes("\n"), "notice is one line");
  // 相談は無料。無料期間・月額料金の設定は廃止した（再び足すときは CLAUDE.md の 8 と利用規約を合わせて直す）
  assert.ok(!("price" in SERVICE) && !("trialHours" in SERVICE), "no price or free-period settings");
  for (const c of [SERVICE.theme.accent, SERVICE.theme.accent2, ...SERVICE.theme.ambient]) assert.match(c, /^#[0-9a-f]{6}$/i);
});

test("accent colour is readable on white (WCAG AA, 4.5:1)", () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = 1.05 / (lum(SERVICE.theme.accent) + 0.05);
  assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)} < 4.5`);
});

test("fire stations: every station has a name, an area, an address and a phone number, and is in the prompt", async () => {
  const { STATIONS } = await import("../../src/config/stations.ts");
  const { SYSTEM_PROMPT } = await import("../../src/config/prompt.ts");
  const { SERVICE } = await import("../../src/config/service.ts");
  // 一般版（全国）は消防署の一覧を持たず、所在地の消防本部を案内する
  if (SERVICE.areaServed === "日本") assert.equal(STATIONS.length, 0, "the nationwide version has no station list");
  else assert.ok(STATIONS.length > 0, "at least one station");
  assert.equal(new Set(STATIONS.map((s) => s.name)).size, STATIONS.length, "station names are unique");
  for (const s of STATIONS) {
    assert.ok(s.name.endsWith("消防署") || s.name.includes("消防"), `${s.name}: is a fire station`);
    assert.ok(s.ward.length > 0 && s.address.length > 0, `${s.name}: area and address`);
    assert.match(s.tel, /^0\d{1,4}-\d{1,4}-\d{4}$/, `${s.name}: ${s.tel}`);
    assert.ok(SYSTEM_PROMPT.includes(`${s.name}（${s.ward}）${s.tel}`), `${s.name} is in the prompt`);
  }
});
