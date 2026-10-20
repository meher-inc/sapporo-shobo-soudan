-- Values the worker sets up by itself (e.g. the signing secret of the Stripe webhook it created).
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
