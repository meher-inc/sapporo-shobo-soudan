-- 行政書士に依頼する前のヒアリング（届出の種類ごとの回答と資料の持ち主）。src/hearing/hearing.ts の HearingAnswers を JSON で入れる。
-- 相談者が同意して依頼を送ったときだけ書く。0006（流入元の記録）とは独立しているので、どちらが先に当たってもよい。
ALTER TABLE escalations ADD COLUMN hearing TEXT;
