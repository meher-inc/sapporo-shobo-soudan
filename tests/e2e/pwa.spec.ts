import { expect, test } from "@playwright/test";
import { SERVICE } from "../../src/config/service";

type Icon = { src: string; purpose?: string };

test("ホーム画面に追加できる（マニフェストとアイコン）", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");
  const res = await request.get(href!);
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name).toBe(SERVICE.name);
  expect(m.short_name).toBe(SERVICE.shortName);
  expect(m.display).toBe("standalone");
  expect(m.start_url).toMatch(/^\//);
  expect((m.icons as Icon[]).some((i) => i.purpose === "maskable")).toBeTruthy();
  for (const icon of m.icons as Icon[]) expect((await request.get(icon.src)).ok(), icon.src).toBeTruthy();
  expect((await request.get("/apple-touch-icon.png")).ok()).toBeTruthy();
});

test("Service Worker がオフライン案内だけを保存し、ページ本体は保存しない", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "Playwright の WebKit では Service Worker を検証しない");
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) paths.push(new URL(r.url).pathname);
    return paths;
  });
  expect(cached).toContain("/offline");
  // ページ本体にはログイン中の利用者の情報が入るため、保存してはいけない
  expect(cached).not.toContain("/");
  expect(cached.some((p) => p.startsWith("/api/"))).toBeFalsy();
  const offline = await page.request.get("/offline");
  expect(await offline.text()).toContain("インターネットに接続されていません");
});
