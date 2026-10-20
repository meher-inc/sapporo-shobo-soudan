// 政令指定都市（2026-10-20 追加分）の届出の判定。都市ごとに1ファイル。
// 京都市・東京都・名古屋市・大阪市・横浜市は ../filings.ts にある。
import type { FilingFacts, FilingVerdict, Scene } from "../filing-base.ts";
import { filings as sapporo } from "./sapporo.ts";
import { filings as sendai } from "./sendai.ts";
import { filings as saitama } from "./saitama.ts";
import { filings as chiba } from "./chiba.ts";
import { filings as kawasaki } from "./kawasaki.ts";
import { filings as sagamihara } from "./sagamihara.ts";
import { filings as niigata } from "./niigata.ts";
import { filings as shizuoka } from "./shizuoka.ts";
import { filings as hamamatsu } from "./hamamatsu.ts";
import { filings as sakai } from "./sakai.ts";
import { filings as kobe } from "./kobe.ts";
import { filings as okayama } from "./okayama.ts";
import { filings as hiroshima } from "./hiroshima.ts";
import { filings as kitakyushu } from "./kitakyushu.ts";
import { filings as fukuoka } from "./fukuoka.ts";
import { filings as kumamoto } from "./kumamoto.ts";

export type CityJurisdiction = "sapporo-city" | "sendai-city" | "saitama-city" | "chiba-city" | "kawasaki-city" | "sagamihara-city" | "niigata-city" | "shizuoka-city" | "hamamatsu-city" | "sakai-city" | "kobe-city" | "okayama-city" | "hiroshima-city" | "kitakyushu-city" | "fukuoka-city" | "kumamoto-city";

export const CITY_FILINGS: Record<CityJurisdiction, (scene: Scene, f: FilingFacts) => FilingVerdict[]> = {
  "sapporo-city": sapporo,
  "sendai-city": sendai,
  "saitama-city": saitama,
  "chiba-city": chiba,
  "kawasaki-city": kawasaki,
  "sagamihara-city": sagamihara,
  "niigata-city": niigata,
  "shizuoka-city": shizuoka,
  "hamamatsu-city": hamamatsu,
  "sakai-city": sakai,
  "kobe-city": kobe,
  "okayama-city": okayama,
  "hiroshima-city": hiroshima,
  "kitakyushu-city": kitakyushu,
  "fukuoka-city": fukuoka,
  "kumamoto-city": kumamoto,
};
