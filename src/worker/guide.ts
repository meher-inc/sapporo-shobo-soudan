// 検索流入用の解説ページ（/soudan）のルート。中身は guide-pages.ts
import { Hono } from "hono";
import type { AppEnv } from "./env";
import { recordPageView } from "./events";
import { judgeScenario, publishedScenarios, renderIndex, renderScenario, SCENARIOS } from "./guide-pages.ts";

export { publishedScenarios };

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "public, max-age=3600",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
};

export const guide = new Hono<AppEnv>();
const originOf = (url: string, canonical?: string) => canonical ?? new URL(url).origin;

guide.get("/soudan", (c) => {
  recordPageView(c);
  return c.body(renderIndex(originOf(c.req.url, c.env.CANONICAL_ORIGIN), publishedScenarios(), c.env.GSC_VERIFICATION), 200, HEADERS);
});

guide.get("/soudan/:slug", (c) => {
  const s = SCENARIOS.find((x) => x.slug === c.req.param("slug"));
  const r = s && judgeScenario(s);
  if (!s || !r) return c.redirect("/soudan", 302);
  recordPageView(c);
  return c.body(renderScenario(originOf(c.req.url, c.env.CANONICAL_ORIGIN), s, r, c.env.GSC_VERIFICATION), 200, HEADERS);
});
