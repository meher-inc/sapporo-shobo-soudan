-- 相談件数の測り方（src/worker/traffic.ts）
-- source: 最初に開いたときの流入元（utm_source、検索、SNS、todokede の各サイト、direct）。この変更より前の利用者は NULL
-- is_test: 試験の利用（?test=1 で開いた端末、TEST_EMAILS・ADMIN_EMAILS のアカウント）。相談件数から除く
ALTER TABLE users ADD COLUMN source TEXT;
ALTER TABLE users ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;

-- 既存分: 管理者のアカウントと、動作確認として出した依頼の利用者は試験とみなす
UPDATE users SET is_test = 1 WHERE lower(email) IN ('s.maru0714@gmail.com', 'shun_maruoka@meher-inc.co.jp');
UPDATE users SET is_test = 1 WHERE id IN (SELECT user_id FROM escalations WHERE contact_name LIKE '%動作確認%' OR contact_name LIKE '%テスト%');
