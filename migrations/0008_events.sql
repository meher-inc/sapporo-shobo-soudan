-- 計測のイベント（plan 11、src/worker/events.ts）。誰の操作かは持たない。本文・連絡先・IP は入れない。
-- name: page_view / limit_reached / error_shown / condition_answered
-- prop: 英小文字・数字・_:.- の60文字以内（page_view は流入元、limit_reached は daily・anon_ip・rate、error_shown は ai_timeout・ai_error、condition_answered は質問の topic）
-- is_test: 試験の利用（src/worker/traffic.ts の isTestVisit）。件数から除く
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prop TEXT,
  is_test INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_events_name_created ON events(name, created_at);

-- 回答の下の入口が押された回数にも試験の印を残す
ALTER TABLE action_clicks ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
