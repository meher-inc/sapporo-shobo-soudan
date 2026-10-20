import type { Env } from "./env";
import { SERVICE } from "../config/service";

/**
 * Stripe の Webhook を、サービスが自分で用意する。STRIPE_WEBHOOK_SECRET が設定されていればそれを使う。
 * 月額プランの新規登録は終了したため、Price の自動作成は削除した。ensureWebhook は、
 * 今後の有料プランで Checkout を再開するときに、決済の直前に呼ぶ。
 */

export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];
const SETTING_PREFIX = "stripe_webhook_secret:";

export async function stripeApi(env: Env, method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, string>) {
  const res = await fetch(`${env.STRIPE_API_BASE}/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Stripe ${method} ${path.split("?")[0]} ${res.status}`);
  return body;
}

/** 署名の検証に使う秘密値。独自ドメインへの切り替え直後は新旧2つの送信先があり得るので、すべて返す */
export async function webhookSecrets(env: Env): Promise<string[]> {
  if (env.STRIPE_WEBHOOK_SECRET) return [env.STRIPE_WEBHOOK_SECRET];
  const rows = await env.DB.prepare("SELECT value FROM settings WHERE key LIKE ?").bind(`${SETTING_PREFIX}%`).all<{ value: string }>();
  return rows.results.map((r) => r.value);
}

/** この公開URL宛ての Webhook がなければ作り、署名用の秘密値を D1 に保存する（決済の直前に呼ぶ） */
export async function ensureWebhook(env: Env, origin: string): Promise<void> {
  if (env.STRIPE_WEBHOOK_SECRET) return;
  const url = `${origin}/api/stripe/webhook`;
  const key = `${SETTING_PREFIX}${url}`;
  const stored = await env.DB.prepare("SELECT 1 FROM settings WHERE key = ?").bind(key).first();
  if (stored) return;

  // 同じ送信先の古い Webhook は秘密値が分からないので作り直す
  const list = (await stripeApi(env, "GET", "webhook_endpoints?limit=100")) as { data?: { id: string; url: string }[] };
  for (const ep of list.data ?? []) {
    if (ep.url === url) await stripeApi(env, "DELETE", `webhook_endpoints/${ep.id}`);
  }
  const params: Record<string, string> = { url, description: `${SERVICE.name}（自動作成）`, "metadata[service]": SERVICE.id };
  WEBHOOK_EVENTS.forEach((e, i) => (params[`enabled_events[${i}]`] = e));
  const created = (await stripeApi(env, "POST", "webhook_endpoints", params)) as { id: string; secret: string };

  const saved = await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)")
    .bind(key, created.secret, Date.now())
    .run();
  // 同時に作られた場合は先に保存された方を残す
  if (saved.meta.changes === 0) await stripeApi(env, "DELETE", `webhook_endpoints/${created.id}`);
}
