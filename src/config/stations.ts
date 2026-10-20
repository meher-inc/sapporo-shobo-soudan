/**
 * 札幌市消防局の各消防署（本署）。
 * 出典: 札幌市消防局「消防局・消防署（所）一覧」（2026-04-07 更新、2026-10-20 確認）
 * https://www.city.sapporo.jp/shobo/shokai/about/renraku/renrakul.html
 * 住所・電話番号は同ページの各署「予防課」の行を写した（住所は丁目までの掲載）。受付時間は平日8時45分〜17時15分と掲載されている。
 * 管轄はページに書かれていないため、署名と同じ区とした。札幌市は10区10署で、届出の案内ページ（防火対象物使用開始届など）は
 * 「建物が所在する区の消防署」に出すよう案内している（cities/sapporo/notes.md）。
 */
export type Station = { name: string; ward: string; address: string; tel: string };

export const STATIONS_SOURCE = "https://www.city.sapporo.jp/shobo/shokai/about/renraku/renrakul.html";

export const STATIONS: readonly Station[] = [
  { name: "中央消防署", ward: "中央区", address: "札幌市中央区南4条西10丁目", tel: "011-215-2120" },
  { name: "北消防署", ward: "北区", address: "札幌市北区北24条西8丁目", tel: "011-737-2100" },
  { name: "東消防署", ward: "東区", address: "札幌市東区北24条東17丁目", tel: "011-781-2100" },
  { name: "白石消防署", ward: "白石区", address: "札幌市白石区南郷通6丁目北", tel: "011-861-2100" },
  { name: "厚別消防署", ward: "厚別区", address: "札幌市厚別区厚別中央1条5丁目", tel: "011-892-2100" },
  { name: "豊平消防署", ward: "豊平区", address: "札幌市豊平区月寒東1条8丁目", tel: "011-852-2100" },
  { name: "清田消防署", ward: "清田区", address: "札幌市清田区平岡1条1丁目", tel: "011-883-2100" },
  { name: "南消防署", ward: "南区", address: "札幌市南区真駒内上町5丁目", tel: "011-581-2100" },
  { name: "西消防署", ward: "西区", address: "札幌市西区発寒10条4丁目", tel: "011-667-2100" },
  { name: "手稲消防署", ward: "手稲区", address: "札幌市手稲区手稲本町2条5丁目", tel: "011-681-2100" },
];
