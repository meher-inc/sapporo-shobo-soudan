-- Users. Anonymous trial users have google_sub "anon:<id>" and an empty email until they sign in with Google.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  trial_started_at INTEGER,
  stripe_customer_id TEXT UNIQUE,
  subscription_status TEXT,
  current_period_end INTEGER,
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_users_anon_ip ON users(ip_hash, created_at) WHERE is_anonymous = 1;

-- Only the SHA-256 of the session token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- Processed Stripe webhook event IDs (duplicate deliveries are ignored).
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);
