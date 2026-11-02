// 検索流入用の解説ページ（/soudan）の中身。ルートは guide.ts。よくある相談の条件をルール判定（src/rules）に通し、結論をそのまま載せる。
// AI の生成を通さないので、内容は相談画面の判定と同じく条文どおりになる。判定のルールを直せばページも変わる。
import { SERVICE } from "../config/service.ts";
import { EQUIPMENT_LABEL, type Verdict } from "../rules/install.ts";
import { runRules, type RulesResult } from "../rules/extract.ts";
import type { FilingVerdict } from "../rules/filing-base.ts";

/** 判定する管轄（scripts/gen-city.py が都市ごとに置き換える） */
const JURISDICTION = "sapporo-city";

export type Scenario = { slug: string; title: string; text: string; lead: string };

// よくある相談。text は相談画面に入力される書き方にそろえる（ルール判定がそのまま読める）
export const SCENARIOS: Scenario[] = [
  { slug: "inshokuten-kaigyo-80", title: "飲食店（延べ80㎡・火を使う）を開業するときの消防の届出と設備", lead: "延べ面積80㎡、1階、収容人員30人、ガスコンロを使う飲食店", text: "飲食店を開業します。延べ面積80㎡、1階、収容人員30人、ガスコンロを使います。" },
  { slug: "inshokuten-kaigyo-250", title: "飲食店（延べ250㎡・2階建て）を開業するときの消防の届出と設備", lead: "延べ面積250㎡、2階建て、収容人員60人、ガスコンロを使う飲食店", text: "飲食店を開業します。延べ面積250㎡、2階建て、収容人員60人、ガスコンロを使います。" },
  { slug: "inshokuten-kaigyo-400", title: "飲食店（延べ400㎡・3階建て）を開業するときの消防の届出と設備", lead: "延べ面積400㎡、3階建て、収容人員150人、ガスコンロを使う飲食店", text: "飲食店を開業します。延べ面積400㎡、3階建て、収容人員150人、ガスコンロを使います。" },
  { slug: "jimusho-kaisetsu-200", title: "事務所（延べ200㎡）を開設するときの消防の届出と設備", lead: "延べ面積200㎡、2階建て、従業員20人の事務所", text: "事務所を開設します。延べ面積200㎡、2階建て、収容人員20人です。" },
  { slug: "jimusho-kaisetsu-600", title: "事務所（延べ600㎡）を開設するときの消防の届出と設備", lead: "延べ面積600㎡、5階建て、従業員60人の事務所", text: "事務所を開設します。延べ面積600㎡、5階建て、収容人員60人です。" },
  { slug: "buppan-kaigyo-300", title: "物販店（延べ300㎡・平屋）を開業するときの消防の届出と設備", lead: "延べ面積300㎡、平屋、収容人員50人の物品販売店舗", text: "物販店を開業します。延べ面積300㎡、平屋、収容人員50人です。" },
  { slug: "hotel-kaigyo-200", title: "ホテル・旅館（延べ200㎡）を開業するときの消防の届出と設備", lead: "延べ面積200㎡、2階建て、収容人員20人のホテル・旅館", text: "ホテルを開業します。延べ面積200㎡、2階建て、収容人員20人です。" },
  { slug: "hoikusho-250", title: "保育所（延べ250㎡）を開設するときの消防の届出と設備", lead: "延べ面積250㎡、平屋、収容人員60人の保育所", text: "保育所を開設します。延べ面積250㎡、平屋、収容人員60人です。" },
  { slug: "naisou-koji-inshokuten", title: "飲食店（延べ150㎡）の内装工事をするときの消防の届出", lead: "延べ面積150㎡の飲食店の内装工事", text: "飲食店（延べ面積150㎡、収容人員40人）の内装工事をします。" },
  { slug: "jika-hochi-secchi-koji", title: "自動火災報知設備を新設する工事の着工届と設置届", lead: "延べ面積350㎡、3階建て、収容人員40人の飲食店に自動火災報知設備を新設する工事", text: "飲食店（延べ面積350㎡、3階建て、収容人員40人）に自動火災報知設備を新設する工事をします。" },
  { slug: "shoryo-kikenbutsu-toyu", title: "灯油を300リットル保管するときの少量危険物の届出", lead: "工場で灯油を300リットル保管する場合（指定数量1,000リットルの0.3倍）", text: "工場で灯油を300リットル保管します。" },
  { slug: "shobo-kunren-inshokuten", title: "飲食店で消防訓練をするときの通報", lead: "収容人員60人の飲食店で消防訓練をする場合", text: "飲食店（延べ面積250㎡、収容人員60人）で消防訓練をします。" },
];

const AREA: string = SERVICE.area;
const RESULT = { required: "必要", not_required: "不要", conditional: "条件次第" } as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const NOT_OFFICIAL = `${AREA === "全国" ? "国・市町村" : AREA}・消防本部の公式サービスではありません。運営: ${SERVICE.seller.name}`;

/** シナリオの判定結果。届出か設備のどちらかで「必要」が出ないシナリオは載せない */
export function judgeScenario(s: Scenario): RulesResult | null {
  const r = runRules(JURISDICTION, [s.text]);
  if (!r) return null;
  const hit = r.filings.some((x) => x.result !== "not_required") || r.install.some((x) => x.result === "required");
  return hit ? r : null;
}

const filingRow = (x: FilingVerdict) =>
  `<tr><th scope="row">${esc(x.title)}</th><td class="r-${x.result}">${RESULT[x.result]}</td><td>${esc(x.reason)}${x.deadline ? `<div class="sub">期限: ${esc(x.deadline)}</div>` : ""}<div class="sub">提出先: ${esc(x.target)}${x.form ? ` / 様式: ${esc(x.form)}` : ""}</div><div class="sub basis">根拠: ${esc(x.basis)}</div>${x.caveats.length ? `<ul class="cv">${x.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}</td></tr>`;

const installRow = (x: Verdict) =>
  `<tr><th scope="row">${esc(EQUIPMENT_LABEL[x.equipment])}</th><td class="r-${x.result}">${RESULT[x.result]}${!x.assertive && x.result === "required" ? "（原則）" : ""}</td><td>${esc(x.reason)}<div class="sub basis">根拠: ${esc(x.basis)}</div></td></tr>`;

const CSS = `:root{--a:${SERVICE.theme.accent};--fg:#1f2937;--mut:#6b7280;--line:#e5e7eb}*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--fg);font:16px/1.75 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}main{max-width:760px;margin:0 auto;padding:24px 16px 64px}a{color:var(--a)}h1{font-size:1.4rem;line-height:1.5;margin:.5rem 0 1rem}h2{font-size:1.1rem;margin:2rem 0 .5rem;border-left:4px solid var(--a);padding-left:.6rem}.crumb{font-size:.85rem;color:var(--mut)}.lead{background:#f9fafb;border:1px solid var(--line);border-radius:12px;padding:12px 14px}table{width:100%;border-collapse:collapse;font-size:.95rem}th,td{border-bottom:1px solid var(--line);padding:10px 6px;vertical-align:top;text-align:left}th{width:30%}td:nth-child(2){width:5.5em;font-weight:700;white-space:nowrap}.r-required{color:var(--a)}.r-conditional{color:#b45309}.r-not_required{color:var(--mut)}.sub{font-size:.85rem;color:var(--mut)}.basis{font-size:.8rem}.cv{margin:.3rem 0 0;padding-left:1.1rem;font-size:.85rem;color:var(--mut)}.cta{display:inline-block;margin-top:1.5rem;background:var(--a);color:#fff;text-decoration:none;border-radius:999px;padding:.75rem 1.4rem;font-weight:700}.note{font-size:.8rem;color:var(--mut);margin-top:2.5rem}ul.idx{padding-left:1.1rem}ul.idx li{margin:.4rem 0}@media (max-width:560px){th{width:auto;display:block;border-bottom:none;padding-bottom:0}td{display:inline-block;border-bottom:none}tr{display:block;border-bottom:1px solid var(--line);padding-bottom:6px}td:nth-child(3){display:block}}`;

function layout(origin: string, path: string, title: string, description: string, body: string, jsonLd: object[], gsc?: string) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}｜${esc(SERVICE.name)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${origin}${path}"><link rel="icon" href="/icon.svg">${gsc ? `<meta name="google-site-verification" content="${esc(gsc)}">` : ""}<style>${CSS}</style>${jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("")}</head><body><main>${body}<p class="note">${esc(NOT_OFFICIAL)}。この結果は、上の条件を消防法令と${esc(AREA === "全国" ? "条文を確認済みの政令指定都市などの火災予防条例" : `${AREA}の火災予防条例`)}に当てはめた目安です。総務省令の除外・特例は含まず、最終的な判断は所轄の消防署が行います。</p></main></body></html>`;
}

export function renderScenario(origin: string, s: Scenario, r: RulesResult, gsc?: string) {
  const area = AREA === "全国" ? "" : AREA;
  const title = `${area}${area ? "で" : ""}${s.title}`;
  const filings = r.filings.filter((x) => x.result !== "not_required");
  const install = r.install.filter((x) => x.result === "required");
  const description = `${s.lead}の場合に必要な消防の届出${filings.length ? `（${filings.slice(0, 3).map((x) => x.title).join("・")}など）` : ""}と消防用設備等を、条文に当てはめて整理しました。`;
  const others = SCENARIOS.filter((x) => x.slug !== s.slug).slice(0, 5);
  const body = `<p class="crumb"><a href="/">${esc(SERVICE.shortName)}</a> › <a href="/soudan">よくある相談</a></p><h1>${esc(title)}</h1><p class="lead">条件: ${esc(s.lead)}</p>${
    filings.length ? `<h2>届出</h2><table>${filings.map(filingRow).join("")}</table>` : ""
  }${install.length ? `<h2>消防用設備等・防火管理者</h2><table>${install.map(installRow).join("")}</table>` : ""}<a class="cta" href="/?utm_source=guide&amp;utm_content=${esc(s.slug)}">条件を変えて相談する</a><h2>ほかの相談</h2><ul class="idx">${others.map((o) => `<li><a href="/soudan/${o.slug}">${esc(o.title)}</a></li>`).join("")}</ul>`;
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "Article", headline: title, description, inLanguage: "ja", mainEntityOfPage: `${origin}/soudan/${s.slug}`, publisher: { "@type": "Organization", name: SERVICE.seller.name, url: "https://meher-inc.co.jp/" } },
  ];
  return layout(origin, `/soudan/${s.slug}`, title, description, body, jsonLd, gsc);
}

export function renderIndex(origin: string, list: Scenario[], gsc?: string) {
  const title = `${AREA === "全国" ? "" : `${AREA}の`}消防の届出・設備 よくある相談`;
  const body = `<p class="crumb"><a href="/">${esc(SERVICE.shortName)}</a></p><h1>${esc(title)}</h1><ul class="idx">${list.map((s) => `<li><a href="/soudan/${s.slug}">${esc(s.title)}</a></li>`).join("")}</ul><a class="cta" href="/?utm_source=guide&amp;utm_content=index">相談する</a>`;
  return layout(origin, "/soudan", title, "よくある条件で、必要な消防の届出と消防用設備等を条文に当てはめて整理しました。", body, [], gsc);
}

/** 載せるシナリオ（判定で「必要」が出るものだけ） */
export const publishedScenarios = () => SCENARIOS.filter((s) => judgeScenario(s));

