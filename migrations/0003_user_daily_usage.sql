-- Consultations are free; this caps messages per user per JST day (USER_DAILY_MESSAGE_LIMIT).
CREATE TABLE user_daily_usage (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  messages INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
