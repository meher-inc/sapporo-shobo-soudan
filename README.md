# トドケデ AI（札幌市）

札幌市内の事業所向けに、消防の届出・防火管理・消防用設備等・危険物などの相談へAIが答える、モバイルファーストのWebサービスです。[meher-inc/service-template](https://github.com/meher-inc/service-template)（東京の消防相談 [meher-inc/shobo-soudan](https://github.com/meher-inc/shobo-soudan) の UI と基盤）から作りました。

- 白ベースの Liquid Glass、スプリングのアニメーション、全画面スケルトン
- ログインなしで即相談。相談は無料（1人あたり日本時間の1日に20件まで。ほかに短時間の連続送信の制限と、ログインなしで同じ回線から始められる数の上限）
- ログインは Google のみ
- Cloudflare Workers・D1・Workers AI で動く
- 実ブラウザの E2E（Chromium・WebKit、Pixel 7・iPhone 15・デスクトップ）でデザイン基準まで検査

守るべき基準は [CLAUDE.md](CLAUDE.md)、見た目の数値は [docs/DESIGN.md](docs/DESIGN.md) にあります。

## 札幌市版で差し替えた内容

| ファイル | 内容 |
|---|---|
| `src/config/service.ts` | 名前、質問の候補、注意書き、色（accent `#c2410c`、白背景でのコントラスト比 5.2）、対象地域 |
| `src/config/prompt.ts` | 札幌市の消防局の公式ページで確認した事実だけを、出典URLと確認日つきで記載 |
| `src/config/stations.ts` | 16消防署の所在地・電話番号と出典URL。プロンプトの確認先に使う |
| `src/assets/icon.svg` | 吹き出しに炎のアイコン |
| `wrangler.jsonc` | Worker 名・D1 名・レート制限の namespace（`setup-cloudflare.mjs` で生成） |

技術選定はテンプレートから変えていません（下の表）。札幌市の情報は、法令や窓口が変わったら `prompt.ts` と `stations.ts` を一次情報で確認し直して更新します。

## 構成

```
Cloudflare Worker (Hono)
├─ Static Assets  … Vite でビルドした Preact SPA（dist/）
├─ D1             … users / sessions / conversations / messages / stripe_events
├─ Workers AI     … ストリーミング回答（モデルは wrangler.jsonc の AI_MODEL）
└─ Rate Limiting  … 利用者ごとに 20回/分（D1 の user_daily_usage で1人1日20件まで）
外部: Google OAuth 2.0（PKCE）/ Stripe Customer Portal・Webhook（以前の月額プランの解約とカード変更）
```

## 技術選定の理由

| 対象 | 採用 | 理由 |
|---|---|---|
| 実行基盤 | Cloudflare Workers + Static Assets | 画面と API を1つの Worker で配信するので、デプロイが1回で済み CORS も要らない。HTML を返すときにログイン状態を埋め込むため、最初の表示で追加の通信が発生しない |
| API | Hono | Workers 向けに作られた軽いルーター。Cookie・ルーティング・型つきの Bindings を標準で扱え、依存が小さい |
| DB | D1 | Workers から同じネットワーク内で読める。利用者・セッション・相談履歴のような小さな関係データに向く。外部キーの CASCADE で履歴の削除が単純になる |
| AI | Workers AI `gemma-4-26b-a4b-it`（思考モード無効） | Cloudflare の中で完結し、鍵の管理が要らない。東京の消防相談で実測（2026-10-19）し、最初の文字まで0.6〜0.7秒、全体約6秒で、比較した llama-4-scout（全体8〜12秒）より速く、指示した書式を守った |
| AI の止まり対策 | 開始失敗は1回再試行、25秒無応答で打ち切り | Workers AI の上流切断やストリームの停止で、画面が「停止」のまま固まるのを防ぐ |
| 画面 | Preact + Vite | React 互換の API で約15KB（gzip）。モバイル回線でも最初の表示が速い。Vite はビルドが速く、ハッシュつきのファイルを出力する |
| 見た目 | 自作 CSS（Liquid Glass） | `backdrop-filter`、多層の内側の影、ポインタ追従の光でガラスを表現。UI ライブラリを入れず CSS は約4KB（gzip） |
| アニメーション | CSS + View Transitions API | 追加のライブラリなしで、スプリング、メッセージの出現、シート、リップル、カーソル、スケルトンのクロスフェードを実装。`prefers-reduced-motion` で止める |
| スケルトン | index.html に直接書く | JS の読み込み前の最初の描画から全画面に出せる |
| サービスごとの値 | `src/config/service.ts` に集約、ビルド時に HTML・マニフェスト・アイコンへ反映 | 新しいサービスで触るファイルを最小にし、テストも同じ値で検査できる |
| アイコン | SVG 1枚から `@resvg/resvg-js` で PNG を生成 | 色を theme から入れ替えるだけで、PWA に必要な各サイズがそろう |
| 認証 | Google OAuth 2.0 + PKCE を自前実装 | Google だけなので認証 SaaS は要らない。セッションはランダムなトークンの SHA-256 だけを D1 に保存し、Cookie は HttpOnly / Secure / SameSite=Lax |
| 決済 | Stripe Customer Portal + Webhook（Checkout は新規登録の終了に合わせて停止） | カード情報を自社で扱わない。以前の月額プランの登録者の解約とカード変更は Portal に任せる。SDK を使わず fetch で呼び、Webhook の署名は Web Crypto で検証。イベントIDで二重処理を防ぐ。`/api/billing/checkout` は 410 `plan_discontinued` を返す |
| 料金 | 相談は無料（2026-10-20 に無料期間と月額プランを廃止） | 弁護士ドットコムと同じく、相談の入口を無料にする。`users.trial_started_at` などの列は残すが、送信の可否の判定には使わない |
| ログインなしの利用 | 初回送信時に匿名の利用者とセッション Cookie を発行 | 開いてすぐ相談できる。訪問しただけでは DB に行を作らない。Cookie を消しての繰り返し利用は、IP のハッシュ値ごとの開始数で抑える（IP そのものは保存しない） |
| PWA | マニフェスト + Service Worker（オフライン案内だけ保存） | ホーム画面に追加できる。HTML にはログイン状態が入るので保存しない |
| テスト | Playwright + node:test | 実ブラウザ（Chromium・WebKit）で、3つの端末サイズを自動操作する。Stripe は署名つき Webhook まで再現するローカルのモックで、Google は E2E 専用のログインで代替する。Cloudflare の認証情報があるときは本物の Workers AI も呼ぶ |
| パッケージ管理 | pnpm | 既存のリポジトリと同じ |

## ローカル開発

```bash
pnpm install
pnpm run db:migrate:local
cp .dev.vars.example .dev.vars   # 値を設定
pnpm dev
```

Workers AI はローカルでも Cloudflare に接続して動くため、`wrangler login` が必要です。ログインしない場合は `pnpm build && npx wrangler dev --env mock --var AI_MOCK:1` で、決まった文面を返すモックで画面を確認できます。

## テスト

```bash
pnpm test              # 型チェック・単体テスト・E2E
pnpm screenshots       # docs/screenshots を撮り直す
```

- `playwright.config.ts` が Stripe のモックと `wrangler dev`（`E2E_MODE=1`）を起動します。`/auth/test-login` と `/api/test/*` は `E2E_MODE=1` かつ localhost のときだけ有効です。
- `CLOUDFLARE_API_TOKEN` がないときは Workers AI を使わない `mock` 環境で動き、`@real-ai` のテストは飛ばします。
- Playwright のブラウザを取得できない環境では `CHROMIUM_PATH=<chromium の実行ファイル>` を付けると Chromium だけで実行します（WebKit は GitHub Actions で確認）。
- `BASE_URL=https://...` を付けると、ローカル専用の機能を使わないテストを本番に対して実行します。

## 本番の設定（Secrets）

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

- Google Cloud Console: OAuth クライアント（ウェブアプリケーション）の承認済みリダイレクト URI に `https://<host>/auth/callback` を登録
- Stripe: 新規の登録は受け付けないため Price は不要です。以前の登録者のために、Webhook の送信先 `https://<host>/api/stripe/webhook`（イベントは `checkout.session.completed` と `customer.subscription.created/updated/deleted`）と Customer Portal（解約は「請求期間の終了時」）を残します
- 秘密値が未設定の間は、ログインのボタンが「準備中」の表示になります

## 独自ドメイン

sapporo.todokede.jp などのサブドメインにする場合は、京都版と同じ Cloudflare for SaaS のゾーンにカスタムホスト名を追加し、DNS に CNAME と TXT を登録します（手順は京都版の `docs/domain-setup.md`）。接続後に `wrangler.jsonc` の `CANONICAL_ORIGIN` を `https://<host>` に変えると、workers.dev のページは 301 で転送されます。

## 設置義務・届出のルール判定（src/rules）

設置義務（消防法施行令）と届出の要否・期限（札幌市火災予防条例・同規則（src/rules/cities/sapporo.ts、横浜市・大阪市は src/rules/filings.ts））を条文どおりに決定的に判定し、結果を「判定メモ」としてシステムプロンプトに渡す。モデルは結論を変えずに説明だけをする。入力が足りない項目は「条件次第」とし、足りない情報を質問させる。

- `src/rules/` と `eval/` は京都版（kyoto-shobo-soudan）・東京版（shobo-soudan）と同じ内容。直すときは3つのリポジトリをそろえる
- `RULES_ENABLED=1` で有効。テストは `pnpm run test:unit`（評価セット87問と照合）
