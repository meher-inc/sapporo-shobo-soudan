export interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  CHAT_LIMITER: RateLimit;
  AI_MODEL: string;
  /** "1" で設置義務・届出の要否をルールで判定し、結果を回答の前提として渡す（src/rules） */
  RULES_ENABLED?: string;
  /** e.g. https://example.todokede.jp. Pages use it for canonical URLs; workers.dev redirects to it. */
  CANONICAL_ORIGIN?: string;
  STRIPE_API_BASE: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  /** 省略可。なければ stripe-setup.ts が Webhook を作り、秘密値を D1 の settings に保存する */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Local E2E only. Never set in production. */
  E2E_MODE?: string;
  AI_MOCK?: string;
  /** Messages one user may send per JST day. Defaults to 20. */
  USER_DAILY_MESSAGE_LIMIT?: string;
}

export interface User {
  id: string;
  google_sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  /** 最初の相談の日時。以前の無料期間の判定に使っていた。いまは記録だけ */
  trial_started_at: number | null;
  stripe_customer_id: string | null;
  subscription_status: string | null;
  current_period_end: number | null;
  is_anonymous: number;
  ip_hash: string | null;
  created_at: number;
}

export type AppEnv = { Bindings: Env; Variables: { user: User | null } };
