-- 専門家への引き継ぎ（行政書士・点検工事の手配）と弁護士への案内。東京版 0005_escalations.sql と同じ構造。
-- AI が検知した時点で 'detected' の行を作り、相談者が画面で同意して連絡先を送ったときだけ 'requested' になる。
CREATE TABLE escalations (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lane TEXT NOT NULL CHECK (lane IN ('gyosei', 'setsubi', 'bengoshi')),
  reasons TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'requested')),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  requested_at INTEGER
);
CREATE INDEX idx_escalations_status ON escalations(status, created_at DESC);
CREATE INDEX idx_escalations_conversation ON escalations(conversation_id);

-- 回答の下に出す引き継ぎカード。会話を開き直しても残す
ALTER TABLE messages ADD COLUMN escalation_id TEXT;
