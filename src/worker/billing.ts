import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { stripeApi, webhookSecrets } from "./stripe-setup";

export const billing = new Hono<AppEnv>();

const stripe = (env: Env, path: string, params: Record<string, string>) => stripeApi(env, "POST", path, params);

// 月額プランの新規登録は終了した（相談は無料）。以前からの登録者は /portal で解約とカード変更ができる。
billing.post("/checkout", (c) => c.json({ error: "plan_discontinued" }, 410));

billing.post("/portal", async (c) => {
  const user = c.get("user");
  if (!user?.stripe_customer_id) return c.json({ error: "no_customer" }, 400);
  const session = await stripe(c.env, "billing_portal/sessions", {
    customer: user.stripe_customer_id,
    return_url: new URL("/", c.req.url).toString(),
  });
  return c.json({ url: session.url });
});

async function verifySignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  const signatures = header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .map((kv) => kv.slice(3));
  if (!t || signatures.length === 0 || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((sig) => timingSafeEqual(sig, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type StripeSubscription = { id: string; customer: string; status: string; current_period_end?: number; items?: { data?: { current_period_end?: number }[] }; metadata?: { user_id?: string } };

export const stripeWebhook = new Hono<AppEnv>();

stripeWebhook.post("/", async (c) => {
  const secrets = await webhookSecrets(c.env);
  const signature = c.req.header("stripe-signature");
  const payload = await c.req.text();
  let valid = false;
  for (const secret of secrets) if (signature && (await verifySignature(payload, signature, secret))) valid = true;
  if (!valid) {
    return c.json({ error: "invalid_signature" }, 400);
  }
  const event = JSON.parse(payload) as { id: string; type: string; data: { object: Record<string, unknown> } };
  const inserted = await c.env.DB.prepare("INSERT OR IGNORE INTO stripe_events (id, received_at) VALUES (?, ?)")
    .bind(event.id, Date.now())
    .run();
  if (inserted.meta.changes === 0) return c.json({ received: true, duplicate: true });

  const db = c.env.DB;
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as { client_reference_id?: string; customer?: string };
    if (s.client_reference_id && s.customer) {
      await db
        .prepare("UPDATE users SET stripe_customer_id = ?, subscription_status = 'active' WHERE id = ?")
        .bind(s.customer, s.client_reference_id)
        .run();
    }
  } else if (event.type.startsWith("customer.subscription.")) {
    const sub = event.data.object as StripeSubscription;
    const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
    const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
    const byCustomer = await db
      .prepare("UPDATE users SET subscription_status = ?, current_period_end = ? WHERE stripe_customer_id = ?")
      .bind(status, periodEnd ? periodEnd * 1000 : null, sub.customer)
      .run();
    if (byCustomer.meta.changes === 0 && sub.metadata?.user_id) {
      await db
        .prepare("UPDATE users SET stripe_customer_id = ?, subscription_status = ?, current_period_end = ? WHERE id = ?")
        .bind(sub.customer, status, periodEnd ? periodEnd * 1000 : null, sub.metadata.user_id)
        .run();
    }
  }
  return c.json({ received: true });
});
