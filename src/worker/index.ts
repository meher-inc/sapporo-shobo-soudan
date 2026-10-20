import { Hono } from "hono";
import type { AppEnv } from "./env";
import { loadUser, publicMe } from "./session";
import { jstDay } from "./caps";
import { auth } from "./auth";
import { billing, stripeWebhook } from "./billing";
import { chat, conversations } from "./chat";
import { SERVICE } from "../config/service";
import { withSharedSecrets } from "./secrets";

const app = new Hono<AppEnv>();

const isLocal = (url: string) => ["localhost", "127.0.0.1"].includes(new URL(url).hostname);

// Once the custom domain is live, workers.dev pages move to it permanently (API and OAuth stay where they are).
app.use("*", async (c, next) => {
  const canonical = c.env.CANONICAL_ORIGIN;
  const url = new URL(c.req.url);
  if (canonical && c.req.method === "GET" && url.hostname.endsWith(".workers.dev") && url.origin !== canonical && !/^\/(api|auth)\//.test(url.pathname)) {
    return c.redirect(`${canonical}${url.pathname}${url.search}`, 301);
  }
  await next();
});

app.use("*", async (c, next) => {
  c.set("user", c.req.path.startsWith("/api/stripe/") ? null : await loadUser(c));
  await next();
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "strict-origin-when-cross-origin");
  c.header("x-frame-options", "DENY");
});

// Reject cross-site state-changing API calls (cookie auth + SameSite=Lax is the first line).
app.use("/api/*", async (c, next) => {
  if (c.req.method !== "GET" && !c.req.path.startsWith("/api/stripe/")) {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: "forbidden" }, 403);
  }
  await next();
});

app.route("/auth", auth);
app.get("/api/me", (c) => c.json(publicMe(c.get("user"), c.env)));
app.route("/api/chat", chat);
app.route("/api/conversations", conversations);
app.route("/api/billing", billing);
app.route("/api/stripe/webhook", stripeWebhook);

// Local E2E only: move the first consultation back past the former 24-hour free period,
// to check that nothing is gated on it any more.
app.post("/api/test/expire-trial", async (c) => {
  const user = c.get("user");
  if (c.env.E2E_MODE !== "1" || !isLocal(c.req.url) || !user) return c.notFound();
  await c.env.DB.prepare("UPDATE users SET trial_started_at = ? WHERE id = ?")
    .bind(Date.now() - 25 * 60 * 60 * 1000, user.id)
    .run();
  return c.json({ ok: true });
});

// Local E2E only: use up today's message limit for the current user.
app.post("/api/test/fill-quota", async (c) => {
  const user = c.get("user");
  if (c.env.E2E_MODE !== "1" || !isLocal(c.req.url) || !user) return c.notFound();
  await c.env.DB.prepare(
    "INSERT INTO user_daily_usage (user_id, day, messages) VALUES (?1, ?2, ?3) ON CONFLICT(user_id, day) DO UPDATE SET messages = ?3",
  )
    .bind(user.id, jstDay(), Number(c.env.USER_DAILY_MESSAGE_LIMIT || 20))
    .run();
  return c.json({ ok: true });
});

// Local E2E only: mark the current user as an existing subscriber (from before new sign-ups ended).
app.post("/api/test/subscribe", async (c) => {
  const user = c.get("user");
  if (c.env.E2E_MODE !== "1" || !isLocal(c.req.url) || !user) return c.notFound();
  await c.env.DB.prepare("UPDATE users SET stripe_customer_id = ?, subscription_status = 'active' WHERE id = ?")
    .bind(`cus_e2e_${user.id}`, user.id)
    .run();
  return c.json({ ok: true });
});

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

app.get("/robots.txt", (c) => {
  const origin = c.env.CANONICAL_ORIGIN ?? new URL(c.req.url).origin;
  return c.text(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\n\nSitemap: ${origin}/sitemap.xml\n`);
});

app.get("/sitemap.xml", (c) => {
  const origin = c.env.CANONICAL_ORIGIN ?? new URL(c.req.url).origin;
  const urls = ["/", "/legal/terms", "/legal/privacy", "/legal/tokushoho"].map((p) => `<url><loc>${origin}${p}</loc></url>`).join("");
  return c.body(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, 200, {
    "content-type": "application/xml; charset=utf-8",
  });
});

function homeHead(origin: string) {
  const publisher = { "@type": "Organization", name: SERVICE.seller.name, url: "https://meher-inc.co.jp/" };
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "WebSite", name: SERVICE.name, url: `${origin}/`, inLanguage: "ja", publisher },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: SERVICE.name,
      url: `${origin}/`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      areaServed: { "@type": "AdministrativeArea", name: SERVICE.areaServed },
      offers: { "@type": "Offer", price: 0, priceCurrency: "JPY", description: "相談は無料" },
      publisher,
    },
  ];
  return [
    `<link rel="canonical" href="${origin}/">`,
    `<meta property="og:type" content="website"><meta property="og:url" content="${origin}/"><meta property="og:site_name" content="${SERVICE.name}"><meta property="og:locale" content="ja_JP">`,
    ...jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`),
  ].join("\n");
}

// Inline the session state into the shell so the first paint needs no extra round trip.
app.get("*", async (c) => {
  const asset = await c.env.ASSETS.fetch(new Request(new URL("/", c.req.url)));
  const html = await asset.text();
  const me = JSON.stringify(publicMe(c.get("user"), c.env)).replace(/</g, "\\u003c");
  const origin = c.env.CANONICAL_ORIGIN ?? new URL(c.req.url).origin;
  const head = c.req.path === "/" ? homeHead(origin) : "";
  return c.html(html.replace("<!--ME-->", `${head}<script>window.__ME__=${me}</script>`), 200, {
    "cache-control": "no-store",
  });
});

export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, await withSharedSecrets(env), ctx);
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;
