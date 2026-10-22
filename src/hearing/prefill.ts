// 相談の中ですでに聞いていることを、ヒアリングの欄に先に入れておく（同じことを2回聞かない）。
// 判定のルール（src/rules）を使うので、サーバーだけが読む。画面の束に判定のコードを入れない。

import { extractFacts } from "../rules/extract.ts";
import { guessType, type HearingType } from "./hearing.ts";

const fmtArea = (n: number) => `${n.toLocaleString("ja-JP")}㎡`;

export function prefill(userTexts: string[]): { type: HearingType; values: Record<string, string> } {
  const text = userTexts.join("\n");
  const f = extractFacts(text);
  const values: Record<string, string> = {};
  if (f.total_area !== undefined) values.total_area = fmtArea(f.total_area);
  const floors = [f.floors_above ? `地上${f.floors_above}階` : "", f.floors_below ? `地下${f.floors_below}階` : ""].filter(Boolean).join("・");
  if (floors) values.floors = floors;
  const useWord = text.normalize("NFKC").match(/飲食店|レストラン|居酒屋|カフェ|事務所|オフィス|物販店|ホテル|旅館|民泊|保育園|介護施設|老人ホーム|クリニック|診療所|工場|倉庫|共同住宅|マンション|ジム|サウナ/);
  if (useWord) values.use = useWord[0];
  const type = guessType(text);
  if (type === "tenant_plan" && f.floor !== undefined) {
    values.tp_area = [`${f.floor < 0 ? `地下${-f.floor}` : f.floor}階`, f.floor_area ? fmtArea(f.floor_area) : ""].filter(Boolean).join(" ");
  }
  return { type, values };
}

