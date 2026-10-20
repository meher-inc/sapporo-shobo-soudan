# トドケデ AI（札幌市）（meher-inc/service-template から作成）

MeHer株式会社が新しい Web サービスを作るときの土台。東京の消防相談（meher-inc/shobo-soudan）の UI と基盤を、どのサービスでも使える形に切り出したもの。

## このリポジトリで守ること

作業を始める前に、この節と `docs/DESIGN.md` を読む。ここに書いたことは、依頼文に書かれていなくても前提として守る。依頼がこの節と食い違う場合は、作業を止めて依頼者に確認する。

### 変えてはいけないこと（UI・体験）

1. **開いた瞬間に相談できる。** 最初の画面は入力欄にフォーカスした状態で表示する。ログイン・説明・同意画面を相談の前に挟まない。
2. **全画面スケルトンを最初の HTML に入れる。** JS の読み込み前から `index.html` の `#boot` が画面全体を覆い、アプリの描画後にクロスフェードで消える。画面の構成を変えたら、スケルトンの形も合わせる。
3. **キャッチコピーを書かない。** 最初の画面に出してよい文字は、サービスの短い名前・質問の候補・注意書き1行・入力欄のプレースホルダーだけ。見出し（h1/h2）・説明文・宣伝文句・「〜しよう」のような呼びかけは置かない。テストが検査している。
4. **白ベースの Liquid Glass。** 背景は白。面は `.glass`（半透明の白・`backdrop-filter: blur(22px) saturate(180%)`・内側のハイライト・ポインタ追従の光）で作る。色は `src/config/service.ts` の `theme` だけで変える。
5. **アニメーションをふんだんに使う。** 出現はスプリング（`--spring`）、退場は `--ease-out`。メッセージ・候補・シート・トースト・ボタンの押下・送信時の光沢・背景の光の移動はすべて動かす。`prefers-reduced-motion: reduce` では止める。
6. **モバイルファースト。** 幅 393px（iPhone 15）で最初に確認する。横スクロールを出さない。セーフエリアを守る。入力欄は画面下、操作は親指の届く位置。
7. **ログインは Google のみ。** メールとパスワードのフォームは作らない。ログインは、履歴を別の端末で見たいとき、または有料のプランを使うときだけ求める。
8. **相談は無料（1日の回数制限のみ）。** 有料は、過去の相談事例を読める会員（準備中）と、事業者向けのトドケデ AI プロ（非公開価格・問い合わせ型）。課金の開始と終了はサーバーで判定する（クライアントの時計を使わない）。決済は Stripe Checkout、解約とカード変更は Customer Portal。

### 変えてはいけないこと（基盤）

- 実行基盤は Cloudflare（Workers・Static Assets・D1・Workers AI・Rate Limiting）。別のクラウドや外部 DB を足す前に依頼者に確認する。
- AI は Workers AI を使う。モデルは `wrangler.jsonc` の `AI_MODEL`。変えるときは最初の文字までの時間と全体の時間を実測し、README の「技術選定の理由」を更新する。
- 依存を足すときは、その理由を README の表に1行で書く。UI ライブラリ・CSS フレームワーク・アニメーションライブラリは入れない（CSS と View Transitions API で足りている）。
- `/auth/test-login` と `/api/test/*` は `E2E_MODE=1` かつ localhost のときだけ動く。本番の設定に `E2E_MODE` と `AI_MOCK` を入れない。

### 完了の条件

変更を「できた」と報告してよいのは、次がすべて通ったときだけ。

```bash
pnpm run typecheck
pnpm run test:unit
pnpm run test:e2e        # Chromium と WebKit（Pixel 7・iPhone 15・デスクトップ）
```

- Playwright のブラウザを取得できない環境では `CHROMIUM_PATH=<chromium の実行ファイル> pnpm run test:e2e` で Chromium だけを動かし、WebKit は GitHub Actions の結果で確認する。どちらで確認したかを報告に書く。
- 画面を変えたら `pnpm screenshots` で `docs/screenshots/` を更新し、変わった画像を見て確認する。
- 新しい機能には E2E を足す。消したテストがあれば理由を報告に書く。

## サービスごとに差し替える場所

| ファイル | 中身 |
|---|---|
| `src/config/service.ts` | 名前、検索向けの説明、入力欄の文言、質問の候補、注意書き、匿名利用の上限、色、販売事業者 |
| `src/config/prompt.ts` | AI の役割・境界・基礎知識 |
| `src/assets/icon.svg` | アイコン（色は `%ACCENT%` `%ACCENT2%` が theme に置き換わる） |
| `wrangler.jsonc` の「差し替え」 | Worker 名、D1、レート制限の namespace、公開URL。`node scripts/setup-cloudflare.mjs` が書き換える |

これ以外のファイルを変えるのは、サービス固有の機能を足すときだけ。

## 拡張（サービス固有の機能を足すとき）

- **根拠つき回答（RAG）:** `src/worker/chat.ts` の `runModel` でシステムプロンプトに参照資料を足す。東京の消防相談（meher-inc/shobo-soudan の `src/worker/rag.ts`・`src/ingest/`）が、e-Gov 法令API と例規集を D1 FTS5 と Vectorize で検索する実装例。回答中の `[1]` は `markdown.ts` が根拠番号のバッジにする。
- **専門家への引き継ぎ:** 同じく shobo-soudan の `src/worker/escalation.ts`（判定）と `escalations.ts`（同意つきの依頼受付）。
- **検索流入用のページ:** shobo-soudan の `src/worker/seo/`（Workflow で毎日生成、公開前の自動チェックつき）。
- 足した機能も「変えてはいけないこと」に従う。最初の画面に要素を増やさず、回答の下やシートの中に置く。

## 構成

```
src/config/   サービスごとの値（service.ts, prompt.ts）
src/client/   Preact の画面（App.tsx が相談画面、Legal.tsx が規約など）
src/worker/   Hono の API（auth: Google OAuth, billing: Stripe の解約・Webhook, chat: Workers AI, session: セッション）
src/assets/   ビルド時に service.ts の値を入れて出力するファイル（icon.svg, offline.html）
migrations/   D1 のスキーマ
tests/e2e/    Playwright（相談・無料での継続・解約の入口・認証・デザイン基準・PWA）
tests/unit/   node:test（Markdown、設定値の検査、アクセント色のコントラスト）
docs/         DESIGN.md とスクリーンショット
```
