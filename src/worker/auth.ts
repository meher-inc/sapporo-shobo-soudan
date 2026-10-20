import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv } from "./env";
import { base64url, createSession, destroySession, isHttps, randomToken } from "./session";

const OAUTH_COOKIE = "oauth";

export const auth = new Hono<AppEnv>();

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function redirectUri(url: string): string {
  return new URL("/auth/callback", url).toString();
}

async function upsertUser(
  db: D1Database,
  profile: { sub: string; email: string; name?: string; picture?: string },
): Promise<string> {
  const existing = await db.prepare("SELECT id FROM users WHERE google_sub = ?").bind(profile.sub).first<{ id: string }>();
  if (existing) {
    await db
      .prepare("UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?")
      .bind(profile.email, profile.name ?? null, profile.picture ?? null, existing.id)
      .run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, profile.sub, profile.email, profile.name ?? null, profile.picture ?? null, Date.now())
    .run();
  return id;
}

/**
 * Moves an anonymous user's conversations to the signed-in account. The earlier first-consultation
 * time is kept as a record only (nothing is gated on it since consultations became free).
 */
async function adoptAnonymous(c: Context<AppEnv>, userId: string): Promise<void> {
  const anon = c.get("user");
  if (!anon?.is_anonymous || anon.id === userId) return;
  const db = c.env.DB;
  await db.batch([
    db.prepare("UPDATE conversations SET user_id = ? WHERE user_id = ?").bind(userId, anon.id),
    db
      .prepare("UPDATE users SET trial_started_at = MIN(COALESCE(trial_started_at, ?1), COALESCE(?1, trial_started_at)) WHERE id = ?2")
      .bind(anon.trial_started_at, userId),
    db.prepare("DELETE FROM users WHERE id = ? AND is_anonymous = 1").bind(anon.id),
  ]);
}

auth.get("/google", async (c) => {
  const { GOOGLE_CLIENT_ID } = c.env;
  if (!GOOGLE_CLIENT_ID) return c.text("Google login is not configured", 503);
  const state = randomToken(16);
  const verifier = randomToken(32);
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const next = safeNext(c.req.query("next"));
  setCookie(c, OAUTH_COOKIE, JSON.stringify({ state, verifier, next }), {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    path: "/auth",
    maxAge: 600,
  });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(c.req.url),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

auth.get("/callback", async (c) => {
  const raw = getCookie(c, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: "/auth", secure: isHttps(c) });
  const code = c.req.query("code");
  if (!raw || !code) return c.redirect("/?login=failed");
  const saved = JSON.parse(raw) as { state: string; verifier: string; next: string };
  if (saved.state !== c.req.query("state")) return c.redirect("/?login=failed");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(c.req.url),
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  });
  if (!tokenRes.ok) return c.redirect("/?login=failed");
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) return c.redirect("/?login=failed");

  // The ID token comes straight from Google's token endpoint over TLS, so per
  // OpenID Connect Core 3.1.3.7 the claims can be validated without a signature check.
  const payload = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0)),
    ),
  ) as { iss: string; aud: string; exp: number; sub: string; email: string; email_verified: boolean; name?: string; picture?: string };
  const validIss = payload.iss === "https://accounts.google.com" || payload.iss === "accounts.google.com";
  if (!validIss || payload.aud !== c.env.GOOGLE_CLIENT_ID || payload.exp * 1000 < Date.now() || !payload.email_verified) {
    return c.redirect("/?login=failed");
  }

  const userId = await upsertUser(c.env.DB, payload);
  await adoptAnonymous(c, userId);
  await createSession(c, userId);
  return c.redirect(safeNext(saved.next));
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

// Local E2E only: emulates the Google callback without contacting Google.
auth.get("/test-login", async (c) => {
  const host = new URL(c.req.url).hostname;
  if (c.env.E2E_MODE !== "1" || !(host === "localhost" || host === "127.0.0.1")) return c.notFound();
  const email = c.req.query("email") ?? "tester@example.com";
  const userId = await upsertUser(c.env.DB, { sub: `test-${email}`, email, name: "テスト ユーザー" });
  await adoptAnonymous(c, userId);
  await createSession(c, userId);
  return c.redirect(safeNext(c.req.query("next")));
});
