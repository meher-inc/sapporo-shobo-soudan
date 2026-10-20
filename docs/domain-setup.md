# sapporo.todokede.jp の接続と公開設定

名古屋市版（nagoya-shobo-soudan）の `docs/domain-setup.md` と同じ構成。SaaS ゾーンは共通基盤の meher-edge.com。

| 項目 | 値 |
|---|---|
| Worker | sapporo-shobo-soudan（Workers Builds で meher-inc/sapporo-shobo-soudan の main を自動デプロイ。デプロイコマンド `pnpm run deploy`） |
| D1 | sapporo-shobo-soudan（`scripts/ensure-d1.mjs` が初回デプロイで作成） |
| カスタムホスト名 | sapporo.todokede.jp（meher-edge.com） |
| ルート | `sapporo.todokede.jp/*`（zone: meher-edge.com） |
| レート制限 | namespace_id 7292 |
| 正規URL | `CANONICAL_ORIGIN = https://sapporo.todokede.jp` |

todokede.jp の DNS（お名前.com）には、`sapporo` の CNAME（`customers.meher-edge.com`）と、Cloudflare が示す TXT（`_cf-custom-hostname.sapporo`）・CNAME（`_acme-challenge.sapporo`）を登録する。Google の OAuth クライアントの承認済みリダイレクト URI に `https://sapporo.todokede.jp/auth/callback` を追加する。
