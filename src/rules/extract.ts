// 相談文から物件条件と場面を読み取り、判定結果をモデルに渡す「判定メモ」を作る。
// 読み取りは正規表現だけで行う（LLMに条件を推測させない）。読み取れなかった項目は判定側が「条件次第」にする。

import { EQUIPMENT_LABEL, judge, occupancyIn, type Equipment, type Facts, type Verdict } from "./install.ts";
import { judgeFilings, type FilingFacts, type FilingVerdict, type Jurisdiction, type Scene } from "./filings.ts";
import { asksEquipmentWork, asksFireManagement, nationalFilings } from "./national.ts";
import { asksInspection } from "./inspection.ts";
import { MINPAKU, topicFilings } from "./topics.ts";

// 用途の言い換え → 令別表第一の項。曖昧なもの（診療所・老人ホームなど）は細分を決めずに入れない
const OCCUPANCY_WORDS: [RegExp, string][] = [
  [/劇場|映画館|演芸場/, "1イ"],
  [/公会堂|集会場/, "1ロ"],
  [/キャバレー|ナイトクラブ/, "2イ"],
  [/遊技場|ゲームセンター|ダンスホール/, "2ロ"],
  [/カラオケ|ネットカフェ|インターネットカフェ|漫画喫茶|マンガ喫茶|個室ビデオ/, "2ニ"],
  [/飲食店|レストラン|居酒屋|カフェ|喫茶店|ラーメン店|焼肉店|定食屋|食堂|バー(?!ベキュー)/, "3ロ"],
  [/百貨店|物品販売|物販|小売店|コンビニ|スーパー|ドラッグストア|アパレル|雑貨店/, "4"],
  [/ホテル|旅館|簡易宿所|民泊|ゲストハウス/, "5イ"],
  [/共同住宅|マンション|アパート|寄宿舎|下宿|シェアハウス/, "5ロ"],
  [/保育所|保育園|児童発達支援|放課後等デイサービス/, "6ハ"],
  [/幼稚園|特別支援学校/, "6ニ"],
  [/サウナ風呂|蒸気浴場|熱気浴場/, "9イ"],
  [/銭湯|公衆浴場/, "9ロ"],
  [/小学校|中学校|高等学校|大学|専修学校|各種学校/, "7"],
  [/図書館|博物館|美術館/, "8"],
  [/車両の停車場|駅舎/, "10"],
  [/神社|寺院|教会/, "11"],
  [/工場|作業場/, "12イ"],
  [/スタジオ/, "12ロ"],
  [/駐車場|車庫/, "13イ"],
  [/倉庫/, "14"],
  [/事務所|オフィス|会社|営業所/, "15"],
];

// 用途の変更（「物販店として使っていた店舗を飲食店に変えて」）。1つ目のグループは変更後の用途の部分
const USE_CHANGE = /(?:使って|使用して|営業して)いた[^。]{0,20}?を([^。]{1,20}?)(?:に|へ)(?:変えて|変え(?:ます|る)|変更(?:して|します|する)|転用)/;
// 厨房設備の設置（「業務用ガスコンロを3台新しく設置」）。調理に使うだけの文（「ガスコンロを使って調理」）は含めない
const KITCHEN_INSTALL = /厨房設備|厨房機器|フライヤー|業務用[^。]{0,4}コンロ|コンロ[^。]{0,12}(?:設置|新設|増設|入れ替|増や|追加|取り?付け)/;
// 種類を言わないガスの設備（「ガスの設備について届出は必要？」）。飲食の相談なら厨房設備として読む
const GAS_EQUIPMENT = /ガスの?(?:設備|器具|機器)/;
const ASKS_FILING = /届出|届け出|届けで|手続/;
const FOOD_CONTEXT = /飲食|焼肉|焼き肉|居酒屋|レストラン|カフェ|ラーメン|食堂|厨房|調理/;
// 管理について権原を有する者が複数（統括防火管理者。消防法 第八条の二）
export const MULTI_TITLE = /管理者が(?:別|異な|違)|管理権原(?:者)?が(?:分かれ|複数|別)|テナントごとに(?:管理|経営|オーナー)|オーナーが(?:別|異な)|統括防火管理/;

const num = (s: string) => Number(s.replace(/[,，]/g, "").normalize("NFKC"));

export function extractFacts(text: string): FilingFacts {
  const t = text.normalize("NFKC");
  const f: FilingFacts = {};
  // 「物販店として使っていた店舗を飲食店に変えて」: 変更後の用途で判定する（前の用途の語で複合用途にしない）
  const change = t.match(USE_CHANGE);
  const useText = change ? change[1] : t;
  if (change) f.use_change = true;
  const explicit = t.match(/(?<!第\s*)[（(]?(\d{1,2}(?:の[23])?)[)）]?項\s*([イロハニ])?(?:\s*[（(](\d)[)）])?/);
  if (explicit) f.occupancy = `${explicit[1]}${explicit[2] ?? ""}${explicit[3] ? `(${explicit[3]})` : ""}`;
  else {
    const hits = OCCUPANCY_WORDS.filter(([re]) => re.test(useText)).map(([, o]) => o);
    const uniq = [...new Set(hits)];
    if (uniq.length === 1) f.occupancy = uniq[0];
    else if (uniq.length > 1) f.occupancy = "16イ"; // 用途が複数 → 複合用途として判定し「条件次第」に倒す
  }
  // 特定の階についての記述（「7階の収容人員は35人」「地下1階の床面積1,200㎡」）。建物全体の値として読まない
  const floorAt = t.match(/(?<![地上\d]\s*)(\d{1,2})\s*階(?!建|以上|以下|部分|段)(?=\s*(?:の|を|で|に|は|が|、))/);
  const basementAt = t.match(/地下\s*(\d)\s*階(?!建|以上|以下|部分|段)(?=\s*(?:の|を|で|に|は|が|、))/);
  if (basementAt) f.floor = -num(basementAt[1]);
  else if (floorAt) f.floor = num(floorAt[1]);
  let rest = t;
  const floorCap = t.match(/(?:その階|(?:地下\s*)?\d{1,2}\s*階(?!建))\s*[の、,]?\s*(?:収容人員|人数|在館者|利用者)\s*(?:は|が)?\s*(?:約)?\s*([\d,]+)\s*(?:人|名)/);
  if (floorCap && f.floor !== undefined) {
    f.floor_capacity = num(floorCap[1]);
    rest = rest.replace(floorCap[0], "");
  }
  const floorArea = t.match(/(?:その階|(?:地下\s*)?\d{1,2}\s*階(?!建))\s*[の、,]?\s*(?:床面積|面積)?\s*(?:は|が)?\s*(?:約)?\s*([\d,]+(?:\.\d+)?)\s*(?:㎡|m2|m²|平米|平方メートル)/);
  if (floorArea && f.floor !== undefined) {
    f.floor_area = num(floorArea[1]);
    rest = rest.replace(floorArea[0], "");
  }
  const area = rest.match(/(?:延べ|延床|延べ床|床面積)?\s*(?:面積)?\s*(?:が|は)?\s*([\d,]+(?:\.\d+)?)\s*(?:㎡|m2|m²|平米|平方メートル)(\s*未満)?/);
  // 「150㎡未満」は境目の手前（149㎡）として判定する
  if (area) f.total_area = num(area[1]) - (area[2] ? 1 : 0);
  const tsubo = !area && t.match(/([\d,]+(?:\.\d+)?)\s*坪/);
  if (tsubo) f.total_area = Math.round(num(tsubo[1]) * 3.30578);
  // 収容人員の明記がなく、席数と従業員数の両方があれば足す（飲食店などは従業者の数＋固定いす席の数。消防法施行規則 第一条の三）
  const capStated = /(?:収容人員|定員)\s*(?:は|が)?\s*(?:約)?\s*\d/.test(rest);
  const seats = rest.match(/([\d,]+)\s*席/);
  const staff = rest.match(/(?:従業員|従業者|スタッフ)\s*(?:は|が)?\s*(?:約)?\s*([\d,]+)\s*(?:人|名)/);
  const cap = rest.match(/(?:収容人員|定員|従業員|席数|客席)?\s*(?:が|は)?\s*([\d,]+)\s*(?:人|名|席)(\s*未満)?/);
  if (!capStated && seats && staff) {
    f.capacity = num(seats[1]) + num(staff[1]);
    f.capacity_label = `${f.capacity}人（席${num(seats[1])}＋従業員${num(staff[1])}）`;
  } else if (cap) {
    f.capacity = num(cap[1]) - (cap[2] ? 1 : 0);
    // 「100人未満」は判定では99人として扱うが、メモには相談者の言い方で出す
    if (cap[2]) f.capacity_below = num(cap[1]);
  }
  if (/平屋/.test(t)) f.floors_above = 1;
  const floors = t.match(/(?:地上)?\s*(\d{1,2})\s*階建/);
  if (floors) f.floors_above = num(floors[1]);
  const below = t.match(/地下\s*(\d)\s*階(?:建|、|・|\s*地上)/);
  if (below) f.floors_below = num(below[1]);
  const kw = t.match(/([\d,]+(?:\.\d+)?)\s*(?:kW|キロワット)(?!h|時)/i);
  if (kw) f.kitchen_kw = num(kw[1]);
  const kwh = t.match(/([\d,]+(?:\.\d+)?)\s*(?:kWh|キロワット時)/i);
  if (kwh) f.battery_kwh = num(kwh[1]);
  if (/下方(に|へ)?排気|立ち下が/.test(t)) f.exhaust_down = true;
  if (/上方(に|へ)?排気/.test(t)) f.exhaust_down = false;
  if (/(コンロ|フライヤー|ガス|火を使|調理|厨房|かまど|グリル)/.test(t)) f.fire_use = true;
  if (/火を使わない|IHのみ|電気調理のみ/.test(t)) f.fire_use = false;
  if (KITCHEN_INSTALL.test(t) || (GAS_EQUIPMENT.test(t) && FOOD_CONTEXT.test(t))) f.facility = "kitchen";
  else if (/サウナ設備|サウナを設置|サウナを置|テントサウナ/.test(t)) f.facility = "sauna";
  else if (/蓄電池/.test(t)) f.facility = "battery";
  else if (/ボイラー/.test(t)) f.facility = "boiler";
  if (/発電機|発電設備/.test(t)) f.generator = true;
  if (/自宅|個人の住居|住宅に/.test(t)) f.residence = true;
  if (/事業所|店舗|施設|会社/.test(t) && f.residence === undefined) f.residence = false;
  if (/建築確認(を|は|が|の)?(受け(ない|ません|ず)|要らない|いらない|不要|必要(が|は)?(ない|ありません)|要しない|なし|無し)|確認申請(は|を|が)?(しない|しません|不要|出さない|要らない|いらない|必要(が|は)?(ない|ありません))/.test(t)) f.building_permit = false;
  else if (/建築確認|確認申請/.test(t)) f.building_permit = true;
  if (/露店|屋台|出店/.test(t)) f.stall_fire = /コンロ|火|ガス|炭|鉄板|発電機|焼き|焼く|焼いて|揚げ|炒め|煮る|煮て|茹で|ゆで|炊く|炊いて|フライヤー|調理/.test(t) ? true : undefined;
  if (/展示場|観覧場|イベントホール|展示会場/.test(t)) f.exhibition_hall = true;
  if (/排気ダクト|排気用ダクト|ダクト付き|ダクトがある|フード/.test(t)) f.has_duct = true;
  if (/ダクトなし|ダクトはない|ダクトがない/.test(t)) f.has_duct = false;
  if (/家族だけ|自分たちだけ|個人的(に|な)?(使|利用)|自分で使う|プライベート/.test(t)) f.personal_use = true;
  if (/お客|客に|貸し出|有料|営業/.test(t) && f.personal_use === undefined) f.personal_use = false;
  // 危険物の数量（リットル）→ 指定数量の倍数（危険物の規制に関する政令 別表第三）。品名の違う危険物は倍数を足す（消防法 第十条第二項）
  const ratio = hazmatRatio(t);
  if (ratio !== undefined) f.hazmat_ratio = ratio;
  if (MULTI_TITLE.test(t)) f.multi_title = true;
  const pub = t.match(/客席(?:部分)?の?(?:床)?面積(?:は|が)?\s*(?:約)?\s*([\d,]+(?:\.\d+)?)\s*(?:㎡|m2|m²|平米|平方メートル)/);
  if (pub) {
    f.public_area = num(pub[1]);
    // 客席の面積だけが書かれているときは、延べ面積として読まない
    if (area && area.index !== undefined && pub.index !== undefined && Math.abs(area.index - pub.index) <= pub[0].length) delete f.total_area;
  }
  if (/[2２二]つの区|複数の区|区をまたが|2以上の区/.test(t)) f.multi_ward = true;
  if (/準耐火建築物/.test(t)) f.building_class = "quasi_fireproof";
  else if (/耐火建築物/.test(t)) f.building_class = "fireproof";
  const height = t.match(/高さ(?:が|は)?\s*([\d.]+)\s*(?:m|メートル)/);
  if (height) f.height = num(height[1]);
  const stairs = t.match(/階段(?:が|は)?\s*(\d|一|二|1つ|2つ|ひとつ|ふたつ)/);
  if (stairs) f.direct_stairs = /^(1|一|1つ|ひとつ)$/.test(stairs[1]) ? 1 : 2;
  return f;
}

export function detectScenes(text: string): Scene[] {
  const t = text.normalize("NFKC");
  const s: Scene[] = [];
  if (/使用開始|開業|開店|開設|開所|開園|オープン|入居|使い始め|営業を始め|テナントに入/.test(t) || USE_CHANGE.test(t)) s.push("use_start");
  if (/模様替|改装|内装工事|改修|リフォーム|用途変更|間取り|増築/.test(t)) s.push("renovation");
  if (/ポップアップ|一時的|期間限定|短期間/.test(t) && !/展示場|観覧場/.test(t)) s.push("temp_use");
  if (KITCHEN_INSTALL.test(t) || GAS_EQUIPMENT.test(t) || /サウナ設備|サウナを設置|サウナを置|蓄電池|ボイラー|発電機|発電設備|火気使用設備|火を使う設備/.test(t)) s.push("fire_equipment");
  if (/少量危険物|指定可燃物|危険物を?(貯蔵|保管|置|ため)|危険物を取り?扱/.test(t) || hazmatRatio(t) !== undefined) s.push("small_hazmat");
  if (/露店|屋台|出店/.test(t)) s.push("stall");
  if (/催し|催物|イベント|展示会|コンサート/.test(t) && !s.includes("stall")) s.push("event");
  if (/消防訓練|避難訓練|消火訓練|通報訓練/.test(t)) s.push("drill");
  if (/溶接|溶断|ガス切断/.test(t)) s.push("hot_work");
  if (/たき火|焚き火|野焼き|火災と紛らわしい|煙が出る/.test(t)) s.push("bonfire");
  if (/断水|減水/.test(t)) s.push("water_outage");
  return s;
}

const INSTALL_FOR_NOTE: Equipment[] = ["fire_manager", "extinguisher", "indoor_hydrant", "sprinkler", "auto_alarm", "emergency_alarm", "guide_light"];
// 大規模な建物で必要になる設備。聞かれていなければ「必要」のときだけ判定メモに載せる
const INSTALL_LARGE: Equipment[] = ["fire_report", "outdoor_hydrant", "fire_water", "smoke_control", "standpipe", "emergency_outlet"];

// 相談者がどの設備について聞いているか
const ASK_WORDS: [Equipment, RegExp][] = [
  ["fire_manager", /防火管理者/],
  ["fire_report", /通報する火災報知|火災通報装置/],
  ["auto_alarm", /自動火災報知|自火報|感知器/],
  ["extinguisher", /消火器/],
  ["indoor_hydrant", /屋内消火栓/],
  ["outdoor_hydrant", /屋外消火栓/],
  ["sprinkler", /スプリンクラー/],
  ["leak_alarm", /漏電火災警報器|漏電/],
  ["emergency_alarm", /非常警報|非常ベル|放送設備|自動式サイレン/],
  ["evac_device", /避難器具|避難はしご|救助袋|緩降機/],
  ["guide_light", /誘導灯|誘導標識/],
  ["fire_water", /消防用水/],
  ["smoke_control", /排煙/],
  ["standpipe", /連結送水管/],
  ["emergency_outlet", /非常コンセント/],
];

export function askedEquipment(text: string): Equipment[] {
  const t = text.normalize("NFKC");
  return ASK_WORDS.filter(([, re]) => re.test(t)).map(([e]) => e);
}

const RESULT_JA = { required: "必要", not_required: "不要", conditional: "条件次第" } as const;

const MISSING_JA: Record<string, string> = {
  occupancy: "用途（何に使う建物か）",
  total_area: "延べ面積",
  capacity: "収容人員（従業員と客の合計）",
  floors_above: "地上の階数",
  floors_below: "地階の有無",
  fire_use: "火を使う設備・器具の有無",
  structure: "建物の構造（耐火構造か、内装の仕上げ）",
  overnight: "入居・宿泊させるか",
  lath_wall: "ラスモルタル造などの壁か",
  direct_stairs: "直通階段の数",
  specific_use_upper: "店舗・飲食店などが2階以上にあるか",
  floor: "どの階か",
  floor_capacity: "その階の収容人員",
  floor_area: "その階の床面積",
  kitchen_kw: "同じ厨房室の厨房設備の入力の合計（kW）",
  exhaust_down: "排気が下向き（排気ダクトが立ち下がる）か",
  small_specific_complex: "小規模特定用途複合防火対象物か",
  battery_kwh: "蓄電池容量（kWh）",
  residence: "個人の住居に設けるか",
  building_permit: "建築確認を受ける工事か",
  stall_fire: "露店で火気を使うか",
  exhibition_hall: "観覧場・展示場で行うか",
  has_duct: "厨房設備に排気用ダクトがあるか",
  building_class: "耐火建築物か準耐火建築物か",
  lower_floors_area: "1階と2階の床面積の合計",
  site_area: "敷地面積",
  height: "建物の高さ",
  personal_use: "個人的な使用か（人に使わせるか）",
  facility: "設ける設備の種類",
  public_area: "客席など公衆の出入りする部分の床面積",
};

const line = (label: string, r: Verdict | FilingVerdict, extra = "") =>
  `- ${label}: ${RESULT_JA[r.result]}${"assertive" in r && !r.assertive && r.result === "required" ? "（原則）" : ""}${extra}。理由: ${r.reason}。根拠: ${r.basis}${
    r.missing.length ? `。足りない情報: ${[...new Set(r.missing)].map((m) => MISSING_JA[m] ?? m).join("、")}` : ""
  }${"assertive" in r && !r.assertive && r.result === "required" && r.caveats.length ? `。除外・例外（「原則として必要」と書き、これに触れる）: ${r.caveats[0]}` : ""}`;

export type RulesResult = { facts: FilingFacts; scenes: Scene[]; install: Verdict[]; filings: FilingVerdict[]; asked: Equipment[]; notes: string[] };

/** 会話中の利用者の発言（古い順）から判定する。後の発言の値を優先する */
export function runRules(jurisdiction: Jurisdiction, userTexts: string[]): RulesResult | null {
  const facts: FilingFacts = {};
  for (const t of userTexts) Object.assign(facts, Object.fromEntries(Object.entries(extractFacts(t)).filter(([, v]) => v !== undefined)));
  const latest = userTexts.at(-1) ?? "";
  const scenes = detectScenes(latest).length ? detectScenes(latest) : detectScenes(userTexts.join("\n"));
  const topical = facts.multi_title || MINPAKU.test(latest.normalize("NFKC")) || facts.public_area !== undefined;
  if (!facts.occupancy && !scenes.length && !topical && !asksFireManagement(latest) && !asksEquipmentWork(latest) && !asksInspection(latest)) return null;
  const below = facts.capacity_below;
  if (below === undefined) return judgeAll(jurisdiction, facts, scenes, latest, userTexts);
  // 「100人未満」: 0〜99人のどこでも結論が同じ項目はそのまま、変わる項目は収容人員を不明として判定し直す
  const hi = judgeAll(jurisdiction, facts, scenes, latest, userTexts);
  const lo = judgeAll(jurisdiction, { ...facts, capacity: 1 }, scenes, latest, userTexts);
  const un = judgeAll(jurisdiction, { ...facts, capacity: undefined }, scenes, latest, userTexts);
  const keyI = (x: Verdict) => x.equipment;
  const keyF = (x: FilingVerdict) => `${x.procedure}:${x.title}`;
  const pick = <T extends Verdict | FilingVerdict>(x: T, los: T[], uns: T[], key: (y: T) => string): T => {
    const l = los.find((y) => key(y) === key(x));
    if (l && l.result === x.result) return x;
    return uns.find((y) => key(y) === key(x)) ?? { ...x, result: "conditional", missing: [...x.missing, "capacity"] };
  };
  return {
    ...hi,
    install: hi.install.map((x) => pick(x, lo.install, un.install, keyI)),
    filings: hi.filings.map((x) => pick(x, lo.filings, un.filings, keyF)),
  };
}

function judgeAll(jurisdiction: Jurisdiction, facts: FilingFacts, scenes: Scene[], latest: string, userTexts: string[]): RulesResult {
  const asked = askedEquipment(latest);
  const j = (e: Equipment) => judge(e, facts as Facts, jurisdiction);
  const install = facts.occupancy
    ? [
        ...asked.map(j),
        ...INSTALL_FOR_NOTE.filter((e) => !asked.includes(e)).map(j),
        ...(facts.floor !== undefined && !asked.includes("evac_device") ? [j("evac_device")] : []),
        ...INSTALL_LARGE.filter((e) => !asked.includes(e)).map(j).filter((v) => v.result === "required"),
      ]
    : [];
  const filings = [...scenes.flatMap((s) => judgeFilings(jurisdiction, s, facts)), ...nationalFilings(scenes, facts, install, latest, asked), ...topicFilings(jurisdiction, latest, facts)];
  const notes = notesFor(facts, userTexts);
  // 届出を聞かれたのに場面を判定できなかったとき、モデルが要否を創作しないようにする（2026-11-17 の初見10問の問5）
  if (!filings.length && ASKS_FILING.test(latest.normalize("NFKC")))
    notes.push("相談者は届出を聞いているが、相談文からはどの届出の場面かを判定できなかった。届出の要否を「必要」「不要」と言い切らず、設備の種類や規模などの条件で決まることを伝え、足りない情報を1つだけ質問する");
  return { facts, scenes, install, filings, asked: facts.occupancy ? asked : [], notes };
}

// 結論を左右する前提を、モデルが言い換えたり別の値で書いたりしないように明記する
function notesFor(f: FilingFacts, userTexts: string[]): string[] {
  const notes: string[] = [];
  const items = userTexts.flatMap((t) => hazmatItems(t));
  if (items.length && f.hazmat_ratio !== undefined) {
    const calc = items.map((x) => `${x.name}${x.liters.toLocaleString("ja-JP")}L ÷ 指定数量${x.unit.toLocaleString("ja-JP")}L`).join(" ＋ ");
    const r = f.hazmat_ratio;
    const exact = r === 0.2 ? "。ちょうど5分の1は「5分の1以上」に含まれる" : r === 0.5 ? "。ちょうど2分の1は「2分の1以上」に含まれる" : "";
    notes.push(`危険物の量: ${calc} ＝ 指定数量の${r}倍${exact}（危険物の規制に関する政令 別表第三）。指定数量はこの値で書き、別の値を書かない。届出の要否は上の判定のとおり`);
  }
  if (f.use_change && f.occupancy && occupancyIn(f.occupancy, ["1", "2", "3", "4", "5イ", "6", "9イ", "16イ", "16の2", "16の3"]) === true)
    notes.push("用途を変えて特定用途（飲食店・物品販売店舗など）として使う場合、消防用設備等は変更後の用途の基準がすべて適用され、前の用途のときの基準のままにする特例は使えない（消防法 第十七条の三第二項第四号）。使用開始（変更）の届出も要る");
  if (f.capacity_label) notes.push(`収容人員は ${f.capacity_label} として判定した（従業者の数＋固定いす席の数。消防法施行規則 第一条の三）`);
  return notes;
}

/**
 * 選択肢で聞く項目の候補（判定に足りない項目）。相談者が聞いた設備の不足を先に、無ければ届出の不足、どちらも無ければ全体の不足を返す。
 * 聞かれた内容に関係なく延べ面積を聞いていた（2026-11-17 の初見10問）ため、聞かれた項目の判定に要るものから聞く。
 * 聞かれた設備の不足は判定の条文の順（消火器なら火を使うかが先）。届出・全体の不足は、これまでどおり用途→延べ面積→収容人員→階数→火を使うかの順。
 * 用途が不明なら用途を最初に聞く。返した項目に選択肢で答えられるものが無ければ、画面の選択肢は出さず、モデルが文で1つ聞く
 */
const QUESTION_ORDER = ["occupancy", "total_area", "capacity", "floors_above", "fire_use"]; // src/worker/actions.ts の ORDER と同じ順
export function missingForQuestion(r: RulesResult | null): string[] {
  const head = r?.facts.occupancy ? [] : ["occupancy"];
  if (!r) return head;
  const asked = r.install.filter((v) => r.asked.includes(v.equipment)).flatMap((v) => v.missing);
  if (asked.length) return [...new Set([...head, ...asked])];
  const rest = (r.filings.some((v) => v.missing.length) ? r.filings : [...r.install, ...r.filings]).flatMap((v) => v.missing);
  const rank = (k: string) => (QUESTION_ORDER.includes(k) ? QUESTION_ORDER.indexOf(k) : QUESTION_ORDER.length);
  return [...new Set([...head, ...[...new Set(rest)].sort((a, b) => rank(a) - rank(b))])];
}

export function rulesNote(r: RulesResult): string {
  const out = ["# ルールによる判定結果（この回答の結論はこれに従う）"];
  out.push("相談文から読み取った条件を条文にあてはめて、機械的に判定した目安です。結論の区分（必要／不要／条件次第）と期限・提出先・様式はこのとおりに書き、逆の結論や別の区分にしないでください。それぞれの結論に根拠の条文を添えてください。");
  out.push("「条件次第」の項目は断定せず、足りない情報は1つだけ質問してください（画面に選択肢が出るときはそれに合わせる）。面積や人数は、相談者が書いた言い方（「150㎡未満」など）のまま書き、読み取った数値に言い換えないでください。読み取った条件が相談内容と違う場合は、そのことを伝えて確認してください。");
  out.push("答え方: 相談者が聞いた設備・届出の結論と根拠を最初に書きます。結論は「〜にあたるため、◯◯が必要になる目安です」「〜にあたらないため、◯◯は不要となる目安です」の形で書き、「必ず必要です」「確実に不要です」のような言い切りの語は使わないでください。条文の条件（「地階・無窓階」は地階又は無窓階）を言い換えないでください。聞かれていない項目は「必要」のものを一文ずつ、「条件次第」のものはまとめて一文で触れ、「不要」の項目は省きます。回答の最後に「最終的な要否は、所轄の消防署でご確認ください」という趣旨の文を1文入れてください（締めくくりの1文に含めてもかまいません）。このメモの見出しや箇条書きをそのまま写さず、相談者に向けた文章にしてください。");
  const f = r.facts;
  const cond = [
    f.occupancy && `用途 令別表第一${f.occupancy.replace(/^(\d{1,2}(?:の[23])?)(.*)$/, "($1)項$2")}`,
    f.total_area !== undefined && `延べ面積 ${f.total_area}㎡`,
    f.capacity_below !== undefined ? `収容人員 ${f.capacity_below}人未満` : f.capacity !== undefined && `収容人員 ${f.capacity}人`,
    f.floors_above !== undefined && `地上${f.floors_above}階`,
    f.floor !== undefined && `相談の階 ${f.floor < 0 ? `地下${-f.floor}` : f.floor}階${f.floor_capacity !== undefined ? `（収容人員${f.floor_capacity}人）` : ""}${f.floor_area !== undefined ? `（床面積${f.floor_area}㎡）` : ""}`,
    f.kitchen_kw !== undefined && `厨房設備の入力 ${f.kitchen_kw}kW`,
  ].filter(Boolean);
  if (cond.length) out.push(`読み取った条件: ${cond.join("、")}`);
  if (r.notes.length) {
    out.push("## 判定の前提（このとおりに書く）");
    for (const n of r.notes) out.push(`- ${n}`);
  }
  if (r.filings.length) {
    out.push("## 届出");
    for (const x of r.filings)
      out.push(line(x.title, x, x.result !== "not_required" && x.deadline ? `（期限: ${x.deadline}、提出先: ${x.target}${x.form ? `、様式: ${x.form}` : ""}）` : "") + (x.inspection ? `。検査: ${x.inspection}` : "") + (x.caveats.length ? `。注意: ${x.caveats.join(" / ")}` : ""));
    out.push("届出書の作成・提出の代行は行政書士の業務です。記入内容や記入例は書かず、必要なら行政書士への依頼を案内してください。");
  }
  if (r.install.length) {
    const fmt = (x: Verdict) => line(EQUIPMENT_LABEL[x.equipment], x, x.detail ? `（${x.detail}）` : x.scope ? `（${x.scope}）` : "");
    const asked = r.install.filter((x) => r.asked.includes(x.equipment));
    const others = r.install.filter((x) => !r.asked.includes(x.equipment));
    if (asked.length) {
      out.push("## 相談者が聞いている設備（この結論を最初に書く）");
      for (const x of asked) out.push(fmt(x));
      if (others.length) out.push("## そのほかの設備・防火管理者（必要なものを短く添える）");
    } else out.push("## 消防用設備等・防火管理者（消防法施行令と条例）");
    for (const x of others) out.push(fmt(x));
    out.push("総務省令の除外・令第32条の特例はこの判定に含まれていません（条例の上乗せは、判定に入っている管轄だけ根拠欄に条例を示しています）。最終的な判断は所轄の消防署が行う旨は、締めくくりの一文（トドケデで作り、出す前に消防署で確認）に含めれば足ります。");
  }
  const text = out.join("\n");
  // 「100人未満」を99人と書かせない
  return f.capacity_below !== undefined ? text.replaceAll(`収容人員${f.capacity_below - 1}人`, `収容人員${f.capacity_below}人未満`) : text;
}

// 危険物の規制に関する政令 別表第三の指定数量（リットル）。品名の判断が分かれる物（シンナー・潤滑油など）は入れない
const HAZMAT_LITERS: [RegExp, number][] = [
  [/ガソリン/, 200], // 第一石油類（非水溶性）
  [/トルエン|ベンゼン/, 200], // 第一石油類（非水溶性）
  [/アセトン/, 400], // 第一石油類（水溶性）
  [/エタノール|メタノール|アルコール/, 400], // アルコール類
  [/灯油|軽油|キシレン/, 1000], // 第二石油類（非水溶性）
  [/重油/, 2000], // 第三石油類（非水溶性）
  [/動植物油|食用油|サラダ油|天ぷら油|てんぷら油|揚げ油/, 10000], // 動植物油類
];
const CONTAINER_L: Record<string, number> = { ドラム缶: 200, 一斗缶: 18 };

/** 文中の危険物の量を指定数量の倍数にして合計する。量が読めなければ undefined */
export function hazmatRatio(text: string): number | undefined {
  const items = hazmatItems(text);
  if (!items.length) return undefined;
  return Math.round(items.reduce((s, x) => s + x.liters / x.unit, 0) * 1000) / 1000;
}

/** 文中の危険物（品名・リットル・指定数量） */
export function hazmatItems(text: string): { name: string; liters: number; unit: number }[] {
  const t = text.normalize("NFKC").replace(/,/g, "");
  const names = HAZMAT_LITERS.map(([re]) => re.source).join("|");
  const amount = "(\\d+(?:\\.\\d+)?)\\s*(?:L|ℓ|リットル)";
  const container = "(ドラム缶|一斗缶)\\s*(\\d+)\\s*(?:本|缶|個)";
  const re = new RegExp(`(${names})[^\\d。、]{0,8}(?:${amount}|${container})|${amount}の?(${names})|(${names})の(ドラム缶|一斗缶)\\s*(\\d+)\\s*(?:本|缶|個)`, "gi");
  const items: { name: string; liters: number; unit: number }[] = [];
  for (const m of t.matchAll(re)) {
    const name = m[1] ?? m[6] ?? m[7];
    const liters = m[2] ? Number(m[2]) : m[3] ? CONTAINER_L[m[3]] * Number(m[4]) : m[5] ? Number(m[5]) : CONTAINER_L[m[8]] * Number(m[9]);
    const unit = HAZMAT_LITERS.find(([r]) => r.test(name))?.[1];
    if (!unit || !Number.isFinite(liters)) continue;
    items.push({ name, liters, unit });
  }
  return items;
}
