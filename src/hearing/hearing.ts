// 行政書士に依頼する前のヒアリング。届出の種類ごとに、最初の1回で必要なことを全部聞く。
// 項目は過去の代行案件（約70件）と問い合わせフォーム86件から作った（ヒアリング項目表、2026-10-22）。
// 往復が増えた原因は4つ: 資料を顧客以外が持っている／後から少しずつ聞く／添付要件の確認が後回し／言葉の取り違え。
// それぞれ、資料の持ち主を聞く・全部を一度に聞く・消防署に確認する事項を切り出す・選択肢と例を添える、で減らす。
// このファイルは画面とサーバーの両方が読む。src/rules と同じく、すべての都市版で同じ内容にする。

export type HearingType = "tenant_plan" | "building_plan" | "equipment_work" | "booth" | "other";

export type Holder = "self" | "kanri" | "owner" | "design" | "dept" | "maker" | "tenant" | "unknown";

export const HOLDER_LABEL: Record<Holder, string> = {
  self: "手元にある",
  kanri: "管理会社",
  owner: "ビルのオーナー",
  design: "設計者・施工者",
  dept: "社内の別部署",
  maker: "メーカー・販売店",
  tenant: "テナント",
  unknown: "分からない",
};

/** 第三者に頼む資料の宛先。手元にある・分からないは依頼文を作らない */
export const THIRD_PARTY: readonly Holder[] = ["kanri", "owner", "design", "dept", "maker", "tenant"];

export interface Item {
  id: string;
  label: string;
  /** text: 書いてもらう、date: 日付、choice: 選んでもらう、doc: 資料（持ち主を聞く） */
  kind: "text" | "date" | "choice" | "doc";
  options?: readonly string[];
  /** 取り違えが多い言葉には例を添える */
  hint?: string;
  placeholder?: string;
  required?: boolean;
}

export interface Section {
  title: string;
  items: readonly Item[];
}

export interface HearingDef {
  type: HearingType;
  label: string;
  /** 種類を選ぶ画面での補足 */
  sub: string;
  /** 第三者あての依頼文で使う言い方（例：「消防計画の届出」） */
  purpose: string;
  sections: readonly Section[];
}

/** 「分からない」と答えた項目は、こちらで消防署や関係者に確認する事項に回す */
export const UNKNOWN = "分からない";

const COMMON_HEAD: Section = {
  title: "建物と時期",
  items: [
    { id: "address", label: "所在地・建物名", kind: "text", required: true, placeholder: "例：○○市○○区○○町1-2 ○○ビル" },
    { id: "station", label: "所轄の消防署（分かれば）", kind: "text", placeholder: "例：○○消防署" },
    { id: "use", label: "用途・業種", kind: "text", placeholder: "例：飲食店、事務所、介護施設" },
    { id: "total_area", label: "建物の延べ面積", kind: "text", placeholder: "例：1,200㎡" },
    { id: "floors", label: "階数", kind: "text", placeholder: "例：地上5階・地下1階" },
    { id: "mixed", label: "建物の使われ方", kind: "choice", options: ["自社だけで使う建物", "テナントが入る建物（複合用途）", UNKNOWN] },
    { id: "trigger", label: "きっかけ", kind: "choice", options: ["開業・移転", "改装・工事", "消防署の立入検査で指摘", "管理会社・貸主から求められた", "社内の点検・監査", "そのほか"] },
    { id: "start_date", label: "工事日・使用開始日・オープン日", kind: "date", required: true },
    { id: "started", label: "工事や使用はもう始まっていますか", kind: "choice", options: ["まだ", "もう始まっている"] },
    { id: "fd_deadline", label: "消防署から期限を言われていますか", kind: "choice", options: ["言われていない", "言われている"] },
    { id: "fd_consulted", label: "消防署に相談しましたか", kind: "choice", options: ["まだ", "相談した"], hint: "相談した場合は、担当者名を次の画面の補足欄に書いてください。" },
  ],
};

const COMMON_TAIL: Section = {
  title: "届出者と請求先",
  items: [
    { id: "requester", label: "ご依頼者の立場", kind: "choice", options: ["建物の所有者", "テナント（入居者）", "管理会社", "設計・施工の会社", "設備業者", "そのほか"] },
    { id: "filer", label: "届出者になる方（法人名・代表者）", kind: "text", placeholder: "例：株式会社○○ 代表取締役 ○○", hint: "届出書に名前が載る方です。ご依頼者と違うことがあります。" },
    { id: "billing", label: "請求先", kind: "choice", options: ["届出者と同じ", "届出者と違う"], hint: "違う場合は、請求先の会社名を次の画面の補足欄に書いてください。" },
  ],
};

const DEFS: readonly HearingDef[] = [
  {
    type: "tenant_plan",
    label: "消防計画（テナント・事務所の移転）",
    sub: "ビルの一部を借りて使う場合",
    purpose: "消防計画の届出",
    sections: [
      {
        title: "使う区画",
        items: [
          { id: "tp_area", label: "使う階・区画・面積", kind: "text", placeholder: "例：7階の一部 320㎡" },
          { id: "tp_people", label: "最大でいる人数（従業員と来客）", kind: "text", placeholder: "例：従業員40人・来客10人" },
          { id: "tp_unified", label: "ビル側で統括防火管理をしていますか", kind: "choice", options: ["している", "していない", UNKNOWN], hint: "ビル全体の消防計画があり、テナント用のひな形を指定されることがあります。" },
          { id: "tp_center", label: "ビルに防災センターがありますか", kind: "choice", options: ["ある", "ない", UNKNOWN] },
          { id: "tp_manager", label: "防火管理者になる方と資格", kind: "choice", options: ["甲種の講習を受けた人がいる", "乙種の講習を受けた人がいる", "これから講習を受ける", UNKNOWN] },
          { id: "tp_brigade", label: "自衛消防隊", kind: "choice", options: ["ビルの編成に入る", "自社で組む", UNKNOWN] },
          { id: "tp_drill", label: "訓練", kind: "choice", options: ["ビル全体の訓練に参加", "自社で行う", UNKNOWN] },
        ],
      },
      {
        title: "資料",
        items: [
          { id: "tp_plan_doc", label: "平面図・避難経路図", kind: "doc" },
          { id: "tp_unified_doc", label: "統括防火管理者の氏名・連絡先、管理権原者の一覧", kind: "doc" },
          { id: "tp_template_doc", label: "テナント用消防計画のひな形（指定があれば）", kind: "doc" },
          { id: "tp_equip_doc", label: "消防設備の配置図か直近の点検報告書", kind: "doc" },
          { id: "tp_prev_doc", label: "以前に出した届出の控え", kind: "doc" },
        ],
      },
    ],
  },
  {
    type: "building_plan",
    label: "消防計画（建物全体・統括防火管理）",
    sub: "テナントが入る建物の全体、または自社の建物全体",
    purpose: "消防計画の届出",
    sections: [
      {
        title: "体制",
        items: [
          { id: "bp_tenants", label: "テナントの数", kind: "text", placeholder: "例：8テナント" },
          { id: "bp_manager", label: "統括防火管理者・防火管理者になる方と資格", kind: "choice", options: ["甲種の講習を受けた人がいる", "乙種の講習を受けた人がいる", "これから講習を受ける", UNKNOWN] },
          { id: "bp_outsource", label: "警備・防災センターの委託", kind: "choice", options: ["委託していない", "一部を委託", "全部を委託", UNKNOWN] },
          { id: "bp_shift", label: "平日・休日・夜間で体制が違いますか", kind: "choice", options: ["同じ", "違う", UNKNOWN] },
          { id: "bp_roster", label: "名簿の書き方", kind: "choice", options: ["実名で書く", "役職名で書き、名簿は別紙", "まだ決めていない"] },
        ],
      },
      {
        title: "資料",
        items: [
          { id: "bp_tenant_doc", label: "テナント一覧（名称・区画・管理権原者・用途）", kind: "doc" },
          { id: "bp_boundary_doc", label: "管理の範囲が分かる資料（工事区分表、賃貸借契約書）", kind: "doc" },
          { id: "bp_tenant_staff_doc", label: "各テナントの責任者・常駐人数（日中と夜間）・定員", kind: "doc" },
          { id: "bp_install_doc", label: "消防用設備等設置届の控え・収容人員の算定資料", kind: "doc" },
          { id: "bp_inspect_doc", label: "立入検査の結果通知書・改修（計画）報告", kind: "doc" },
          { id: "bp_drawing_doc", label: "竣工図・各階平面図", kind: "doc" },
        ],
      },
    ],
  },
  {
    type: "equipment_work",
    label: "設置届・着工届（消防用設備の工事）",
    sub: "消火器・誘導灯・自動火災報知設備などの設置や更新",
    purpose: "消防用設備の工事の届出",
    sections: [
      {
        title: "工事",
        items: [
          {
            id: "ew_licensed",
            label: "工事をする消防設備士（甲種）はいますか",
            kind: "choice",
            options: ["いる", "いない", UNKNOWN],
            hint: "着工届は、工事をする甲種消防設備士が届け出ます（消防法第17条の14）。",
          },
          { id: "ew_scope", label: "工事の範囲（更新か増設か、台数、どの部屋か）", kind: "text", placeholder: "例：誘導灯3台を更新、2階事務室" },
          { id: "ew_existing", label: "今ある設備（受信機・配線など）に手を加えますか", kind: "choice", options: ["加えない", "加える", UNKNOWN], hint: "既設の自動火災報知設備につなぐ場合など。既設の施工業者が別のことがあります。" },
          { id: "ew_model", label: "機器のメーカー・型式", kind: "text", placeholder: "例：○○社 FA-1234" },
          { id: "ew_finish", label: "工事の完成予定日", kind: "date" },
          { id: "ew_contractor", label: "施工者（会社名）", kind: "text" },
        ],
      },
      {
        title: "資料",
        items: [
          { id: "ew_drawing_doc", label: "平面図・系統図・機器の配置図", kind: "doc" },
          { id: "ew_spec_doc", label: "機器の仕様書", kind: "doc" },
          { id: "ew_prev_doc", label: "以前の設置届の控え・直近の点検報告書", kind: "doc" },
        ],
      },
    ],
  },
  {
    type: "booth",
    label: "可動式ブースの特例適用申請",
    sub: "個室ブース・電話ボックスの設置",
    purpose: "特例適用の申請",
    sections: [
      {
        title: "設置先と使い方",
        items: [
          { id: "bo_count", label: "設置する台数と設置予定日", kind: "text", placeholder: "例：3台、12月10日" },
          { id: "bo_floor", label: "設置する階と、その階の在籍人数", kind: "text", placeholder: "例：5階、60人" },
          { id: "bo_equip", label: "その階の消防設備", kind: "choice", options: ["スプリンクラーがある", "スプリンクラーはない", UNKNOWN], hint: "自動火災報知設備・非常放送・排煙の有無は、次の画面の補足欄に書いてください。" },
          { id: "bo_usage", label: "ブースの使い方", kind: "choice", options: ["会議・電話", "仮眠など寝る使い方もある", "そのほか"] },
          { id: "bo_fire", label: "ブースの中で火気を使いますか", kind: "choice", options: ["使わない", "使う", UNKNOWN], hint: "電気ケトルや電子レンジなど、電気で加熱する機器も「使う」に入ります。" },
          { id: "bo_fixed", label: "床や壁に固定しますか", kind: "choice", options: ["固定しない", "固定する", UNKNOWN] },
        ],
      },
      {
        title: "資料",
        items: [
          { id: "bo_spec_doc", label: "ブースの仕様書・図面、不燃材料の認定、消防庁通知への適合資料", kind: "doc" },
          { id: "bo_floor_doc", label: "フロア図面（ブースの位置、感知器・スピーカーの位置、天井高）", kind: "doc" },
        ],
      },
    ],
  },
  {
    type: "other",
    label: "そのほかの届出",
    sub: "使用開始届・防火管理者選任届・危険物など",
    purpose: "消防署への届出",
    sections: [
      {
        title: "内容",
        items: [
          { id: "ot_filing", label: "届出の名前（分かれば）", kind: "text", placeholder: "例：防火対象物使用開始届" },
          { id: "ot_target", label: "対象の階・区画・面積・用途", kind: "text", placeholder: "例：1階 85㎡ 飲食店" },
        ],
      },
      {
        title: "資料",
        items: [{ id: "ot_drawing_doc", label: "平面図・配置図", kind: "doc" }],
      },
    ],
  },
];

export const HEARING_TYPES: readonly HearingType[] = DEFS.map((d) => d.type);

export function hearingDef(type: HearingType): HearingDef {
  return DEFS.find((d) => d.type === type) ?? DEFS[DEFS.length - 1];
}

export function hearingDefs(): readonly HearingDef[] {
  return DEFS;
}

/** 画面に出す順のセクション（共通の前半 → 種類ごと → 共通の後半） */
export function sectionsOf(type: HearingType): Section[] {
  return [COMMON_HEAD, ...hearingDef(type).sections, COMMON_TAIL];
}

export function itemsOf(type: HearingType): Item[] {
  return sectionsOf(type).flatMap((s) => [...s.items]);
}

export interface DocAnswer {
  holder: Holder;
  /** いつ頃もらえるか（任意） */
  when?: string;
}

export interface HearingAnswers {
  type: HearingType;
  values: Record<string, string>;
  docs: Record<string, DocAnswer>;
}

/** 相談の文面から種類を推す。決めきれなければ other */
export function guessType(text: string): HearingType {
  const t = text.normalize("NFKC");
  if (/ブース|個室ブース|テレキューブ|電話ボックス|ワークポッド/.test(t)) return "booth";
  if (/着工届|設置届|消火器|誘導灯|自動火災報知|自火報|スプリンクラー|感知器|受信機|消防設備の(?:工事|更新|設置)|ダンパー/.test(t) && !/消防計画/.test(t)) return "equipment_work";
  if (/消防計画/.test(t) || /防火管理/.test(t)) {
    if (/統括|建物全体|全体の消防計画|全館|オーナー|ビル全体|複数のテナント|テナントが\d+/.test(t)) return "building_plan";
    return "tenant_plan";
  }
  return "other";
}

const MAX_VALUE = 300;

/** 実在する日付（YYYY-MM-DD）だけを通す */
export function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 画面から来た回答を、定義にある項目と選択肢だけに絞る */
export function sanitize(input: unknown): HearingAnswers | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as { type?: unknown; values?: unknown; docs?: unknown };
  const clean = (v: string, max: number) => v.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
  if (typeof raw.type !== "string" || !HEARING_TYPES.includes(raw.type as HearingType)) return null;
  const type = raw.type as HearingType;
  const values: Record<string, string> = {};
  const docs: Record<string, DocAnswer> = {};
  const src = (raw.values && typeof raw.values === "object" ? raw.values : {}) as Record<string, unknown>;
  const dsrc = (raw.docs && typeof raw.docs === "object" ? raw.docs : {}) as Record<string, unknown>;
  for (const item of itemsOf(type)) {
    if (item.kind === "doc") {
      const d = dsrc[item.id] as { holder?: unknown; when?: unknown } | undefined;
      if (!d || typeof d.holder !== "string" || !Object.hasOwn(HOLDER_LABEL, d.holder)) continue;
      const when = typeof d.when === "string" && THIRD_PARTY.includes(d.holder as Holder) ? clean(d.when, 60) : "";
      docs[item.id] = { holder: d.holder as Holder, ...(when ? { when } : {}) };
      continue;
    }
    const v = src[item.id];
    if (typeof v !== "string") continue;
    const s = clean(v, MAX_VALUE);
    if (!s) continue;
    if (item.kind === "choice" && !item.options?.includes(s)) continue;
    if (item.kind === "date" && !isDate(s)) continue;
    values[item.id] = s;
  }
  return { type, values, docs };
}

/** 必須の項目のうち、まだ答えていないもの */
export function missingRequired(a: HearingAnswers): string[] {
  return itemsOf(a.type)
    .filter((i) => i.required && !a.values[i.id])
    .map((i) => i.label);
}

const DAY = 86_400_000;

/** 日本時間の今日から期限までの日数（期限当日は0） */
export function daysUntil(date: string, now: number): number {
  const today = new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
}

export interface HearingSummary {
  type: HearingType;
  label: string;
  /** 「項目: 答え」の行（未回答は入れない） */
  lines: { section: string; label: string; value: string }[];
  /** 持ち主ごとの資料 */
  byHolder: { holder: Holder; docs: { label: string; when?: string }[] }[];
  /** 分からない・未回答の資料で、こちらで確認する事項 */
  toConfirm: string[];
  /** 急ぎ・事後の注意 */
  alerts: string[];
}

export function summarize(a: HearingAnswers, now: number): HearingSummary {
  const lines: HearingSummary["lines"] = [];
  const toConfirm: string[] = [];
  const holderMap = new Map<Holder, { label: string; when?: string }[]>();
  for (const s of sectionsOf(a.type)) {
    for (const item of s.items) {
      if (item.kind === "doc") {
        const d = a.docs[item.id];
        if (!d || d.holder === "unknown") {
          toConfirm.push(`${item.label}（持ち主が分からない）`);
          continue;
        }
        if (!holderMap.has(d.holder)) holderMap.set(d.holder, []);
        holderMap.get(d.holder)!.push({ label: item.label, ...(d.when ? { when: d.when } : {}) });
        continue;
      }
      const v = a.values[item.id];
      if (!v) continue;
      if (v === UNKNOWN) toConfirm.push(item.label);
      lines.push({ section: s.title, label: item.label, value: v });
    }
  }
  const alerts: string[] = [];
  const start = a.values.start_date;
  if (a.values.started === "もう始まっている") alerts.push("工事や使用がすでに始まっています（事後の届出になります）。");
  else if (start) {
    const d = daysUntil(start, now);
    if (d < 0) alerts.push(`予定日（${start}）を過ぎています。`);
    else if (d <= 30) alerts.push(`予定日（${start}）まで${d}日です。`);
  }
  if (a.values.fd_deadline === "言われている") alerts.push("消防署から期限を言われています（補足を確認してください）。");
  if (a.type === "equipment_work" && a.values.ew_licensed && a.values.ew_licensed !== "いる") {
    alerts.push("工事をする甲種消防設備士が決まっていません。着工届は消防設備士が届け出るため、設備業者の手配が先に要ります。");
  }
  const order = Object.keys(HOLDER_LABEL) as Holder[];
  const byHolder = order.filter((h) => holderMap.has(h)).map((holder) => ({ holder, docs: holderMap.get(holder)! }));
  return { type: a.type, label: hearingDef(a.type).label, lines, byHolder, toConfirm, alerts };
}

/** 顧客以外が持っている資料について、その相手に送る依頼文の下書き */
export function requestDraft(holder: Holder, docs: { label: string }[], a: HearingAnswers): string {
  const building = a.values.address || "（建物名）";
  const purpose = a.type === "other" && a.values.ot_filing ? a.values.ot_filing : hearingDef(a.type).purpose;
  const to = holder === "dept" ? "（部署名）ご担当者さま" : `（${HOLDER_LABEL[holder]}の名称）ご担当者さま`;
  const when = a.values.start_date ? `${a.values.start_date.replace(/-/g, "/")}に予定があるため、` : "";
  return [
    to,
    "",
    `${building}について、消防署への${purpose}を準備しています。`,
    "準備のため、次の資料をお送りいただけないでしょうか。",
    "",
    ...docs.map((d) => `・${d.label}`),
    "",
    `${when}お持ちの範囲でお送りいただけますと助かります。お送りいただける時期の目安もお知らせください。`,
    "どうぞよろしくお願いいたします。",
    "",
    "（お名前・ご連絡先）",
  ].join("\n");
}

/** 行政書士に届ける案件シート（メール本文の一部） */
export function caseSheet(a: HearingAnswers, now: number): string {
  const s = summarize(a, now);
  const out: string[] = [`■ ヒアリング（${s.label}）`];
  if (s.alerts.length) out.push(...s.alerts.map((x) => `！ ${x}`), "");
  let section = "";
  for (const l of s.lines) {
    if (l.section !== section) {
      section = l.section;
      out.push(`［${section}］`);
    }
    out.push(`${l.label}: ${l.value}`);
  }
  out.push("", "■ 資料と持ち主");
  if (!s.byHolder.length) out.push("（回答なし）");
  for (const g of s.byHolder) {
    out.push(`［${HOLDER_LABEL[g.holder]}］`, ...g.docs.map((d) => `・${d.label}${d.when ? `（${d.when}）` : ""}`));
  }
  out.push("", "■ こちらで確認する事項（消防署・関係者）");
  out.push(...(s.toConfirm.length ? s.toConfirm.map((x) => `・${x}`) : ["（なし）"]));
  return out.join("\n");
}
