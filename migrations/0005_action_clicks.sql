-- 回答の下の入口（トドケデのツール・消防署への電話・専門家への依頼）が押された回数。誰が押したかは持たない。
CREATE TABLE action_clicks (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_action_clicks_created ON action_clicks(created_at);
