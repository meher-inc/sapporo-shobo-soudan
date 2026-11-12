import { expect, test, type Page } from "@playwright/test";
import { WARD_STATIONS } from "../../src/worker/actions";
import { SERVICE } from "../../src/config/service";

const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function login(page: Page, email = uniqueEmail("u")) {
  await page.goto(`/auth/test-login?email=${encodeURIComponent(email)}&next=/`);
  await expect(page.getByTestId("composer-input")).toBeVisible();
}

async function ask(page: Page, text: string) {
  const input = page.getByTestId("composer-input");
  await input.fill(text);
  await page.getByTestId("send-button").click();
  const reply = page.getByTestId("msg-assistant").last();
  // The copy action appears once streaming has finished.
  await expect(reply.getByRole("button", { name: "コピー" })).toBeVisible({ timeout: 60_000 });
  return reply;
}

/** Local E2E only: events の件数（total）と試験の件数（test）。src/worker/events.ts */
async function events(page: Page, name: string, prop?: string): Promise<{ total: number; test: number }> {
  const q = new URLSearchParams({ name, ...(prop ? { prop } : {}) });
  return (await page.request.get(`/api/test/events?${q}`)).json();
}

const testIp = () => `198.51.100.${Math.floor(Math.random() * 250)}-${Date.now()}`;

test.beforeEach(async ({ page, context }) => {
  // Each test acts as its own client so the per-IP anonymous trial limit does not interfere.
  await context.setExtraHTTPHeaders({ "x-test-ip": testIp() });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // 429 is a handled response (per-IP anonymous limit, rate limit) that the browser still logs.
  // Linux builds of WebKit (CI) warn about the viewport's interactive-widget key, which they do not support.
  const expected = /favicon|status of 429|Viewport argument key "interactive-widget"/;
  page.on("console", (m) => m.type() === "error" && !expected.test(m.text()) && errors.push(m.text()));
  (page as Page & { __errors: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors: string[] }).__errors, "no console errors").toEqual([]);
});

// ---------------------------------------------------------------------------
// 開いた瞬間に相談できる・全画面スケルトン・キャッチコピーなし
// ---------------------------------------------------------------------------

test.describe(() => {
  // A Service Worker serving /assets/ would bypass page.route's delay, and the skeleton could vanish before it is measured.
  test.use({ serviceWorkers: "block" });

  test("full-screen skeleton is shown first, then the composer is ready immediately", async ({ page }) => {
    await page.route("**/assets/*.js", async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    // The skeleton disappears as soon as the app loads, so record its size when the HTML has been parsed (before scripts run).
    await page.addInitScript(() => {
      document.addEventListener("readystatechange", () => {
        if (document.readyState !== "interactive") return;
        const el = document.querySelector('[data-testid="skeleton"]');
        const r = el?.getBoundingClientRect();
        (window as unknown as { __skeleton?: { width: number; height: number } | null }).__skeleton = r ? { width: r.width, height: r.height } : null;
      });
    });
    const start = Date.now();
    await page.goto("/");
    const box = await page.evaluate(() => (window as unknown as { __skeleton?: { width: number; height: number } | null }).__skeleton);
    const viewport = page.viewportSize()!;
    expect(box, "skeleton is in the first HTML").toBeTruthy();
    expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 1);
    await expect(page.getByTestId("composer-input")).toBeVisible();
    await expect(page.getByTestId("skeleton")).toHaveCount(0);
    expect(Date.now() - start).toBeLessThan(5000);
    await expect(page.getByTestId("composer-input")).toBeFocused();
    await expect(page.getByRole("button", { name: SERVICE.suggestions[0] })).toBeVisible();
  });
});

test("no catch copy: the first screen shows only the brand, suggestions and the notice", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("composer-input")).toBeVisible();
  await expect(page.locator("h1, h2")).toHaveCount(0);
  const brand = [SERVICE.shortName, SERVICE.area, `${SERVICE.shortName}${SERVICE.area}`, `${SERVICE.shortName} ${SERVICE.area}`];
  const allowed = new Set<string>([...brand, SERVICE.notice, ...SERVICE.suggestions]);
  const lines = (await page.locator(".app").innerText())
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  expect(lines.filter((l) => !allowed.has(l)), "only allowed text on the first screen").toEqual([]);
  await expect(page.getByTestId("composer-input")).toHaveAttribute("placeholder", SERVICE.placeholder);
});

test("layout fits the viewport without horizontal scroll", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("composer-input")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const brand = await page.getByTestId("brand").boundingBox();
  expect(brand!.height, "header title stays on one line").toBeLessThan(30);
});

// ---------------------------------------------------------------------------
// デザイン基準（docs/DESIGN.md）: 白ベースの Liquid Glass とアニメーション
// ---------------------------------------------------------------------------

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

test("design: white base, glass surfaces and the service accent colour", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("composer-input")).toBeVisible();
  const style = await page.evaluate(() => {
    const blur = (sel: string) => {
      const cs = getComputedStyle(document.querySelector(sel)!) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
      return cs.backdropFilter || cs.webkitBackdropFilter || "";
    };
    return {
      body: getComputedStyle(document.body).backgroundColor,
      header: blur(".header"),
      composer: blur(".composer"),
      chip: blur(".chip"),
      send: getComputedStyle(document.querySelector(".send")!).backgroundImage,
    };
  });
  expect(style.body).toBe("rgb(255, 255, 255)");
  for (const k of ["header", "composer", "chip"] as const) expect(style[k], `${k} is glass`).toMatch(/blur\(\d+px\)/);
  expect(style.send).toContain(hexToRgb(SERVICE.theme.accent));
});

test("design: messages, chips and sheets animate in @local", async ({ page }) => {
  await page.goto("/");
  const anim = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).animationName);
  expect(await anim(".chip")).toBe("chipIn");
  expect(await anim(".ambient i")).toBe("drift");
  expect(await anim(".app")).toBe("appIn");
  await ask(page, "アニメーションの確認");
  expect(await anim(".msg.user")).toBe("msgIn");
  await page.getByTestId("menu-button").click();
  expect(await anim(".sheet")).toBe("sheetIn");
});

test("animations respect prefers-reduced-motion", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  await expect(page.getByTestId("composer-input")).toBeVisible();
  const name = await page.locator(".ambient i").first().evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toBe("none");
  await context.close();
});

// ---------------------------------------------------------------------------
// 相談（ログインなしで即利用・履歴・ストリーミング）
// ---------------------------------------------------------------------------

test("anonymous user can consult immediately without logging in @local", async ({ page }) => {
  await page.goto("/");
  const question = "はじめての相談です。何から確認すればいいですか？";
  await page.getByTestId("composer-input").fill(question);
  await page.getByTestId("send-button").click();
  await expect(page.getByTestId("login-sheet")).toHaveCount(0);
  await expect(page.getByTestId("msg-user").first()).toHaveText(question);
  const reply = page.getByTestId("msg-assistant").first();
  await expect(reply.getByRole("button", { name: "コピー" })).toBeVisible({ timeout: 60_000 });
  expect(((await reply.textContent()) ?? "").length).toBeGreaterThan(20);
  await expect(page.getByTestId("trial-badge")).toHaveCount(0);

  const me = await (await page.request.get("/api/me")).json();
  expect(me.user).toBeNull();
  expect(me.hasSession).toBe(true);
  expect(me.access).toBe("free");
  expect(me).not.toHaveProperty("trialEndsAt");

  // History survives a reload without an account.
  await page.reload();
  await page.getByTestId("menu-button").click();
  await expect(page.getByTestId("history-item")).toHaveCount(1);
  await expect(page.getByTestId("menu-login")).toBeVisible();
});

test("a suggestion chip sends right away and history reopens the conversation @local", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: SERVICE.suggestions[1] }).click();
  const reply = page.getByTestId("msg-assistant").first();
  await expect(reply.locator(".typing, .caret").first()).toBeVisible();
  await expect(reply.getByRole("button", { name: "コピー" })).toBeVisible({ timeout: 60_000 });

  await page.getByTestId("menu-button").click();
  const items = page.getByTestId("history-item");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(SERVICE.suggestions[1]);

  await page.getByTestId("new-conversation").click();
  await expect(page.getByTestId("msg-user")).toHaveCount(0);

  await page.getByTestId("menu-button").click();
  await page.getByTestId("history-item").first().click();
  await expect(page.getByTestId("msg-user")).toHaveCount(1);
  await expect(page.getByTestId("msg-assistant")).toHaveCount(1);
});

test("follow-up questions continue the same conversation @local", async ({ page }) => {
  await login(page);
  await ask(page, "最初の質問です");
  await ask(page, "その場合はどうなりますか？");
  await expect(page.getByTestId("msg-user")).toHaveCount(2);
  await page.getByTestId("menu-button").click();
  await expect(page.getByTestId("history-item")).toHaveCount(1);
});

test("streams a real Workers AI answer @local @real-ai", async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ "x-test-ip": testIp(), "x-test-real-ai": "1" });
  await page.goto("/");
  const reply = await ask(page, "相談の進め方を短く教えてください");
  const text = (await reply.textContent()) ?? "";
  expect(text.length).toBeGreaterThan(40);
  expect(text).not.toContain("回答を生成できませんでした");
});

test("a stalled AI stream ends with a retry note instead of hanging @local", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-chrome", "server behaviour; one browser is enough");
  await page.goto("/");
  const before = await events(page, "error_shown", "ai_timeout");
  await page.getByTestId("composer-input").fill("__stall__");
  await page.getByTestId("send-button").click();
  const reply = page.getByTestId("msg-assistant").first();
  await expect(reply).toContainText("途中までの回答");
  await expect(reply.getByRole("button", { name: "コピー" })).toBeVisible({ timeout: 45_000 });
  await expect(reply).toContainText("もう一度お試しください");
  await expect(page.getByTestId("send-button")).toHaveAttribute("aria-label", "送信");
  // 打ち切りを error_shown（ai_timeout）として1行記録する
  await expect.poll(async () => (await events(page, "error_shown", "ai_timeout")).total).toBe(before.total + 1);
});

test("the daily message limit stops sending with a notice @local", async ({ page }) => {
  await page.goto("/");
  await ask(page, "消火器は必要ですか");
  expect((await page.request.post("/api/test/fill-quota")).ok()).toBeTruthy();
  const before = await events(page, "limit_reached", "daily");
  const res = await page.request.post("/api/chat", { data: { message: "もう1件" } });
  expect(res.status()).toBe(429);
  expect((await res.json()).error).toBe("user_limit");
  await expect.poll(async () => (await events(page, "limit_reached", "daily")).total).toBe(before.total + 1);
  await page.getByTestId("composer-input").fill("上限を超えた質問");
  await page.getByTestId("send-button").click();
  await expect(page.getByTestId("toast")).toContainText("本日の相談回数の上限");
  await expect(page.getByTestId("composer-input")).toHaveValue("上限を超えた質問");
  await expect(page.getByTestId("msg-user")).toHaveCount(1);
});

test("conversation can be deleted from history @local", async ({ page }) => {
  await login(page);
  await ask(page, "削除する相談");
  await page.getByTestId("menu-button").click();
  await expect(page.getByTestId("history-item")).toHaveCount(1);
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.getByTestId("history-item")).toHaveCount(0);
});

test("sheet closes with Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("menu-button").click();
  await expect(page.getByTestId("menu-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("menu-sheet")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Google 認証のみ・相談は無料・以前の登録者の解約
// ---------------------------------------------------------------------------

test("signing in with Google keeps anonymous history @local", async ({ page }) => {
  await page.goto("/");
  await ask(page, "引き継ぎの確認");

  await page.goto(`/auth/test-login?email=${uniqueEmail("adopt")}&next=/`);
  const after = await (await page.request.get("/api/me")).json();
  expect(after.user).not.toBeNull();
  expect(after.access).toBe("free");
  await page.getByTestId("menu-button").click();
  await expect(page.getByTestId("history-item")).toHaveCount(1);
  await expect(page.getByTestId("history-item").first()).toContainText("引き継ぎ");
});

test("the menu offers Google as the only way to sign in", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("menu-button").click();
  const sheet = page.getByTestId("menu-sheet");
  await expect(sheet.getByTestId("menu-login")).toHaveText(/Googleでログイン/);
  await expect(sheet.locator('input[type="password"], input[type="email"]')).toHaveCount(0);
});

test("consulting stays free after the former 24-hour free period, without a paywall @local", async ({ page }) => {
  await page.goto("/");
  await ask(page, "無料期間の確認");
  expect((await page.request.post("/api/test/expire-trial")).ok()).toBeTruthy();
  await page.reload();
  const me = await (await page.request.get("/api/me")).json();
  expect(me.access).toBe("free");
  await expect(page.getByTestId("trial-badge")).toHaveCount(0);

  await ask(page, "25時間後の質問です");
  await expect(page.getByTestId("paywall-sheet")).toHaveCount(0);
  await expect(page.getByTestId("msg-assistant")).toHaveCount(1);
});

test("a signed-in user can keep consulting after the former free period @local", async ({ page }) => {
  await login(page);
  await ask(page, "1回目の質問");
  expect((await page.request.post("/api/test/expire-trial")).ok()).toBeTruthy();
  const res = await page.request.post("/api/chat", { data: { message: "期限後のAPI確認" } });
  expect(res.status()).toBe(200);
  await res.body();

  await page.reload();
  await ask(page, "画面からの2回目の質問");
  await expect(page.getByTestId("paywall-sheet")).toHaveCount(0);
  await page.getByTestId("menu-button").click();
  const menu = page.getByTestId("menu-sheet");
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId("plan-row")).toHaveCount(0);
  await expect(menu.getByTestId("billing-portal")).toHaveCount(0);
  await expect(menu).not.toContainText("月額");
});

test("new subscriptions are refused; checkout returns plan_discontinued @local", async ({ page, request }) => {
  const anon = await request.post("/api/billing/checkout");
  expect(anon.status()).toBe(410);
  expect(await anon.json()).toEqual({ error: "plan_discontinued" });
  await login(page);
  const res = await page.request.post("/api/billing/checkout");
  expect(res.status()).toBe(410);
  expect(await res.json()).toEqual({ error: "plan_discontinued" });
});

test("an existing subscriber can still open the Customer Portal to cancel @local", async ({ page }) => {
  await login(page);
  expect((await page.request.post("/api/test/subscribe")).ok()).toBeTruthy();
  await page.reload();
  const me = await (await page.request.get("/api/me")).json();
  expect(me.access).toBe("paid");
  expect(me.billingPortal).toBe(true);
  await page.getByTestId("menu-button").click();
  const portal = page.getByTestId("menu-sheet").getByTestId("billing-portal");
  await expect(portal).toHaveText("お支払い・解約の管理");
  const res = await page.request.post("/api/billing/portal");
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).url).toBe("http://localhost:12111/portal");
});

test("anonymous trials are limited per IP, then login is offered @local", async ({ page, playwright, baseURL }) => {
  const ip = testIp();
  for (let i = 0; i < SERVICE.anonTrialsPerIp; i++) {
    const client = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-test-ip": ip } });
    const res = await client.post("/api/chat", { data: { message: "上限の確認" } });
    expect(res.status()).toBe(200);
    await res.body();
    await client.dispose();
  }
  await page.context().setExtraHTTPHeaders({ "x-test-ip": ip });
  await page.goto("/");
  const before = await events(page, "limit_reached", "anon_ip");
  await page.getByTestId("composer-input").fill("上限を超えた新しい端末");
  await page.getByTestId("send-button").click();
  await expect(page.getByTestId("login-sheet")).toBeVisible();
  await expect.poll(async () => (await events(page, "limit_reached", "anon_ip")).total).toBe(before.total + 1);
  await expect(page.getByTestId("composer-input")).toHaveValue("上限を超えた新しい端末");
});

test("Google login redirects to Google with PKCE and state; checkout is closed @local", async ({ request }) => {
  const res = await request.get("/auth/google", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  const location = new URL(res.headers()["location"]);
  expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(location.searchParams.get("code_challenge_method")).toBe("S256");
  expect(location.searchParams.get("state")).toBeTruthy();
  expect(location.searchParams.get("redirect_uri")).toBe("http://localhost:8787/auth/callback");
  expect(res.headers()["set-cookie"]).toMatch(/oauth=.*HttpOnly/i);
  const badCallback = await request.get("/auth/callback?code=x&state=wrong", { maxRedirects: 0 });
  expect(badCallback.headers()["location"]).toBe("/?login=failed");
  expect((await request.post("/api/billing/checkout")).status()).toBe(410);
});

test("logout returns to the signed-out state @local", async ({ page }) => {
  await login(page);
  await page.getByTestId("menu-button").click();
  await page.getByTestId("logout").click();
  // Wait for the sign-out request to finish before checking.
  await expect.poll(async () => (await (await page.request.get("/api/me")).json()).user).toBeNull();
});

// ---------------------------------------------------------------------------
// セキュリティ・法定表示・検索
// ---------------------------------------------------------------------------

test("stripe webhook rejects unsigned events", async ({ request }) => {
  const res = await request.post("/api/stripe/webhook", {
    data: { id: "evt_x", type: "checkout.session.completed", data: { object: {} } },
    headers: { "stripe-signature": "t=1,v1=deadbeef" },
  });
  expect(res.status()).toBe(400);
});

test("cross-origin API writes are rejected", async ({ request }) => {
  const res = await request.post("/api/chat", { data: { message: "x" }, headers: { origin: "https://evil.example" } });
  expect(res.status()).toBe(403);
});

for (const [path, heading] of [
  ["/legal/terms", "利用規約"],
  ["/legal/privacy", "プライバシーポリシー"],
  ["/legal/tokushoho", "特定商取引法に基づく表記"],
] as const) {
  test(`legal page ${path} renders from the service config`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByRole("link", { name: "相談に戻る" })).toBeVisible();
    await expect(page.locator(".legal")).toContainText(SERVICE.seller.name);
    if (path === "/legal/tokushoho") {
      await expect(page.locator(".legal")).toContainText(SERVICE.seller.address);
      await expect(page.locator(".legal")).toContainText("相談は無料です");
      await expect(page.locator(".legal")).not.toContainText("980円");
    }
    if (path === "/legal/terms") {
      await expect(page.locator(".legal")).toContainText(SERVICE.name);
      await expect(page.locator(".legal")).toContainText("相談は無料です");
      await expect(page.locator(".legal")).not.toContainText("無料期間");
    }
  });
}

test("home page carries search metadata without visible copy", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(SERVICE.title);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  const types = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) => els.map((e) => (JSON.parse(e.textContent ?? "{}") as { "@type": string })["@type"]));
  expect(types).toEqual(expect.arrayContaining(["WebSite", "WebApplication"]));
  const offer = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) => els.map((e) => JSON.parse(e.textContent ?? "{}") as { offers?: { price: number; priceCurrency: string } }).find((j) => j.offers)?.offers);
  expect(offer).toEqual(expect.objectContaining({ price: 0, priceCurrency: "JPY" }));
  expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap:");
  expect(await (await request.get("/sitemap.xml")).text()).toContain("<urlset");
});

// ---------------------------------------------------------------------------
// 専門家への引き継ぎ（行政書士・点検工事の手配）。東京版と同じ


test("a request to draft a filing is answered as information and handed to a gyoseishoshi only with consent @local", async ({ page, request }) => {
  // iPhone 版 WebKit の CI で、出現の動きの途中のチップが「動いている」と判定され続けて押せないことがあった。動きを止めて操作の流れを確かめる
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const reply = await ask(page, "防火対象物使用開始届を作成してほしいです");
  const card = reply.getByTestId("handoff-card");
  await expect(card).toContainText("行政書士");
  // 自分で作りたい人には、トドケデの作成ツールを回答の下のボタンで案内する
  await expect(reply.getByTestId("action-button").filter({ hasText: "届出書類を自分で作る" })).toHaveAttribute("href", /^https:\/\/docs\.todokede\.jp\/\?utm_source=todokede_ai/);
  // 依頼カードが出ている回答には、回答の下の「行政書士に依頼する」を重ねない（F-26）
  await expect(reply.getByTestId("action-request")).toHaveCount(0);
  // 依頼カードの近くに、契約の注記と受け手（要確認）の注記を出す（F-05・F-07）
  await expect(card.getByTestId("handoff-contract")).toHaveText("書類の作成・提出は行政書士が行います。ご契約・お支払いは行政書士と直接です。");
  await expect(card.getByTestId("handoff-receiver")).toHaveText("行政書士への依頼は、いただいた後に対応できるかを確認してご連絡します。");
  await card.getByTestId("handoff-open").click();

  const sheet = page.getByTestId("handoff-sheet");
  await expect(sheet).toBeVisible();
  // 行政書士への依頼は、まず届出の種類ごとのヒアリング。答えずに連絡先だけ送ることもできる
  await expect(sheet.getByTestId("hearing")).toBeVisible();
  await sheet.getByTestId("hearing-skip").click();
  await sheet.getByTestId("handoff-name").fill("テスト 太郎");
  const email = uniqueEmail("handoff");
  await sheet.getByTestId("handoff-email").fill(email);
  // Nothing is shared until the user agrees.
  await expect(sheet.getByTestId("handoff-submit")).toBeDisabled();
  await sheet.getByTestId("handoff-consent").check();
  await sheet.getByTestId("handoff-submit").click();
  await expect(card.getByTestId("handoff-done")).toBeVisible();

  // The request reaches the admin list with the contact details.
  await request.get(`/auth/test-login?email=${encodeURIComponent("s.maru0714@gmail.com")}&next=/`);
  const list = (await (await request.get("/api/admin/escalations?status=requested")).json()) as { escalations: { email: string; lane: string }[] };
  expect(list.escalations.some((e) => e.email === email && e.lane === "gyosei")).toBe(true);

  // The card survives reopening the conversation.
  await page.reload();
  await page.getByTestId("menu-button").click();
  await page.getByTestId("history-item").first().click();
  await expect(page.getByTestId("handoff-done")).toBeVisible();
});

test("行政書士への依頼は、届出の種類ごとに一度で聞き、資料の持ち主に送る依頼文を作り、案件シートに入れる @local", async ({ page, request }) => {
  // iPhone 版 WebKit の CI で、出現の動きの途中のチップが「動いている」と判定され続けて押せないことがあった。動きを止めて操作の流れを確かめる
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const reply = await ask(page, "名古屋駅前のビルの7階に事務所を移転します。消防計画を作成してほしいです");
  await reply.getByTestId("handoff-card").getByTestId("handoff-open").click();
  const sheet = page.getByTestId("handoff-sheet");
  const hearing = sheet.getByTestId("hearing");

  // 相談の文面から種類を推して選んでおく
  await expect(hearing.locator('[data-testid="hearing-type"][data-type="tenant_plan"]')).toHaveAttribute("aria-checked", "true");
  await hearing.getByTestId("hearing-next").click();

  // 必須（所在地・予定日）が埋まるまで次へ進めない
  await expect(hearing.getByTestId("hearing-next")).toBeDisabled();
  await hearing.locator('[data-id="address"] input').fill("名古屋市中村区名駅4丁目 テストビル");
  const date = hearing.locator('[data-id="start_date"] input');
  await date.fill("2099-12-01");
  // 日付の欄からフォーカスを外す（iPhone 版 WebKit で、次の操作が進まないことがあった）
  await date.blur();
  await hearing.locator('[data-id="tp_unified"]').getByTestId("hearing-option").filter({ hasText: "分からない" }).click();
  await expect(hearing.locator('[data-id="tp_unified"] [aria-checked="true"]')).toHaveText("分からない");
  await hearing.getByTestId("hearing-next").click();

  // 資料の持ち主を選ぶと、その相手への依頼文がその場で出る
  await expect(hearing).toHaveAttribute("data-step", "docs");
  await hearing.locator('[data-testid="hearing-doc"][data-id="tp_plan_doc"] [data-holder="kanri"]').click();
  await hearing.locator('[data-testid="hearing-doc"][data-id="tp_unified_doc"] [data-holder="kanri"]').click();
  await hearing.locator('[data-testid="hearing-doc"][data-id="tp_prev_doc"] [data-holder="self"]').click();
  const draft = hearing.locator('[data-testid="hearing-draft"][data-holder="kanri"]');
  await expect(draft).toContainText("名古屋市中村区名駅4丁目 テストビル");
  await expect(draft).toContainText("平面図・避難経路図");
  await expect(draft).toContainText("統括防火管理者の氏名・連絡先");
  await expect(hearing.getByTestId("hearing-draft")).toHaveCount(1);
  // 393px でも横にはみ出さない
  expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await hearing.getByTestId("hearing-next").click();

  await sheet.getByTestId("handoff-name").fill("テスト 花子");
  const email = uniqueEmail("hearing");
  await sheet.getByTestId("handoff-email").fill(email);
  await sheet.getByTestId("handoff-consent").check();
  await sheet.getByTestId("handoff-submit").click();
  await expect(reply.getByTestId("handoff-done")).toBeVisible();

  await request.get(`/auth/test-login?email=${encodeURIComponent("s.maru0714@gmail.com")}&next=/`);
  const list = (await (await request.get("/api/admin/escalations?status=requested")).json()) as { escalations: { email: string; hearing: string | null }[] };
  const saved = JSON.parse(list.escalations.find((e) => e.email === email)?.hearing ?? "null") as {
    type: string;
    values: Record<string, string>;
    docs: Record<string, { holder: string }>;
  } | null;
  expect(saved?.type).toBe("tenant_plan");
  expect(saved?.values.address).toBe("名古屋市中村区名駅4丁目 テストビル");
  expect(saved?.values.tp_unified).toBe("分からない");
  expect(saved?.docs.tp_plan_doc.holder).toBe("kanri");
});

test("普通の相談の回答の下に「自分で作る」と「行政書士に依頼する」を出し、依頼を押すと依頼カードが開いて受付まで進む（F-26） @local", async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const reply = await ask(page, "防火管理者は必要ですか？");
  // 相談文からは引き継ぎを検知しない普通の相談
  await expect(reply.getByTestId("handoff-card")).toHaveCount(0);
  await expect(reply.getByTestId("action-button").filter({ hasText: "届出書類を自分で作る" })).toHaveAttribute("href", /^https:\/\/docs\.todokede\.jp\/\?utm_source=todokede_ai/);
  const req = reply.getByTestId("action-request");
  await expect(req).toHaveCount(1);
  await expect(req).toContainText("行政書士に依頼する");
  const before = await events(page, "request_clicked", "answer_button");
  await req.click();

  // その場で依頼カードとシート（ヒアリング → 連絡先 → 送信）が開く
  const card = reply.getByTestId("handoff-card");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("handoff-contract")).toHaveText("書類の作成・提出は行政書士が行います。ご契約・お支払いは行政書士と直接です。");
  await expect(card.getByTestId("handoff-receiver")).toHaveText("行政書士への依頼は、いただいた後に対応できるかを確認してご連絡します。");
  // 依頼カードが出たら、回答の下の依頼のボタンは重ねない
  await expect(reply.getByTestId("action-request")).toHaveCount(0);
  const sheet = page.getByTestId("handoff-sheet");
  await expect(sheet.getByTestId("hearing")).toBeVisible();
  await expect.poll(async () => (await events(page, "request_clicked", "answer_button")).total).toBe(before.total + 1);
  await sheet.getByTestId("hearing-skip").click();
  await expect(sheet.getByTestId("handoff-contract")).toBeVisible();
  await sheet.getByTestId("handoff-name").fill("テスト 依頼ボタン");
  const email = uniqueEmail("request-button");
  await sheet.getByTestId("handoff-email").fill(email);
  await sheet.getByTestId("handoff-consent").check();
  await sheet.getByTestId("handoff-submit").click();
  await expect(page.getByTestId("toast")).toContainText("ご依頼を受け付けました");
  await expect(card.getByTestId("handoff-done")).toHaveText("ご依頼を受け付けました");

  // 同じ会話でもう一度作ろうとしても、引き継ぎは1件のまま（受付済みの1件が返る）
  const conv = (await (await page.request.get("/api/conversations")).json()) as { conversations: { id: string }[] };
  const again = (await (await page.request.post("/api/escalations", { data: { conversationId: conv.conversations[0].id } })).json()) as { escalation: { status: string } };
  expect(again.escalation.status).toBe("requested");
  await request.get(`/auth/test-login?email=${encodeURIComponent("s.maru0714@gmail.com")}&next=/`);
  const list = (await (await request.get("/api/admin/escalations")).json()) as { escalations: { conversationId: string; reasons: string; email: string | null }[] };
  const mine = list.escalations.filter((e) => e.conversationId === conv.conversations[0].id);
  expect(mine).toHaveLength(1);
  expect(mine[0].email).toBe(email);
  expect(JSON.parse(mine[0].reasons)).toEqual(["回答の下の依頼ボタン"]);
});

test("匿名で依頼を送ってから Google でログインしても、開き直すと受付済みのカードが残り、同じ相談をもう一度依頼できない（N-1） @local", async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const reply = await ask(page, "防火管理者は必要ですか？");
  await reply.getByTestId("action-request").click();
  const sheet = page.getByTestId("handoff-sheet");
  await sheet.getByTestId("hearing-skip").click();
  await sheet.getByTestId("handoff-name").fill("テスト ログイン前の依頼");
  const email = uniqueEmail("before-login");
  await sheet.getByTestId("handoff-email").fill(email);
  await sheet.getByTestId("handoff-consent").check();
  await sheet.getByTestId("handoff-submit").click();
  await expect(page.getByTestId("toast")).toContainText("ご依頼を受け付けました");

  // ログイン（本番の Google ログインと同じく、匿名の利用者の記録をアカウントへ移す）
  await login(page, uniqueEmail("after-request"));
  await page.getByTestId("menu-button").click();
  await page.getByTestId("history-item").first().click();
  const reopened = page.getByTestId("msg-assistant").first();
  await expect(reopened.getByTestId("handoff-done")).toHaveText("ご依頼を受け付けました");

  // もう一度押しても新しい依頼はできず、受付済みの1件が返る
  const conv = (await (await page.request.get("/api/conversations")).json()) as { conversations: { id: string }[] };
  const again = (await (await page.request.post("/api/escalations", { data: { conversationId: conv.conversations[0].id } })).json()) as { escalation: { status: string } };
  expect(again.escalation.status).toBe("requested");
  await request.get(`/auth/test-login?email=${encodeURIComponent("s.maru0714@gmail.com")}&next=/`);
  const list = (await (await request.get("/api/admin/escalations")).json()) as { escalations: { conversationId: string; status: string; email: string | null }[] };
  const mine = list.escalations.filter((e) => e.conversationId === conv.conversations[0].id);
  expect(mine).toHaveLength(1);
  expect(mine[0].status).toBe("requested");
  expect(mine[0].email).toBe(email);
});

test.describe(() => {
  // WebKit では Service Worker が制御するページの通信を page.route で差し替えられないことがあるので、このテストでは止める
  test.use({ serviceWorkers: "block" });
test("送信に失敗した後、画面に残る1つ前の回答の下で押すと、その回答の相談の依頼になる（N-2） @local", async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const first = await ask(page, "防火管理者は必要ですか？");
  // 2つ目の相談は画面には失敗（503）として届く。画面は相談文と回答を消して入力欄に文を戻し、1つ前の回答が最後に戻る
  const second = "消防計画の届出のしかたを教えてください";
  await page.route("/api/chat", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "ai_unavailable" }) }),
  );
  await page.getByTestId("composer-input").fill(second);
  await page.getByTestId("send-button").click();
  await expect(page.getByTestId("composer-input")).toHaveValue(second);
  await expect(page.getByTestId("msg-assistant")).toHaveCount(1);
  await page.unroute("/api/chat");
  // サーバーには2つ目の相談文が保存されている状態にする（AI が失敗しても相談文は残る。ここでは回答も残るが、
  // 直す前のコードは「いちばん新しい相談文」＝2つ目で依頼を作るので、押した回答の相談文になっているかを見分けられる）
  const convId = ((await (await page.request.get("/api/conversations")).json()) as { conversations: { id: string }[] }).conversations[0].id;
  const saved = await page.request.post("/api/chat", { data: { message: second, conversationId: convId } });
  expect(saved.ok()).toBeTruthy();
  await saved.text();
  // この 503 はテストで起こしたもの。ブラウザが出すエラーの記録から外す
  const errors = (page as Page & { __errors: string[] }).__errors;
  errors.splice(0, errors.length, ...errors.filter((e) => !/status of 503/.test(e)));

  const sent = page.waitForRequest((r) => r.url().endsWith("/api/escalations") && r.method() === "POST");
  await first.getByTestId("action-request").click();
  const body = (await sent).postDataJSON() as { conversationId: string; answerId?: string };
  expect(body.answerId).toBeTruthy();
  await expect(first.getByTestId("handoff-card")).toBeVisible();

  // 開き直すと、依頼カードは押した回答（1つ目）の下に残る
  await page.goto("/");
  await page.getByTestId("menu-button").click();
  await page.getByTestId("history-item").first().click();
  const answers = page.getByTestId("msg-assistant");
  await expect(answers).toHaveCount(2);
  await expect(answers.nth(0).getByTestId("handoff-card")).toBeVisible();
  await expect(answers.nth(1).getByTestId("handoff-card")).toHaveCount(0);

  // きっかけの質問（通知メール）は押した回答の相談文
  await request.get(`/auth/test-login?email=${encodeURIComponent("s.maru0714@gmail.com")}&next=/`);
  const list = (await (await request.get("/api/admin/escalations")).json()) as { escalations: { conversationId: string; question: string }[] };
  const mine = list.escalations.filter((e) => e.conversationId === body.conversationId);
  expect(mine.map((e) => e.question)).toEqual(["防火管理者は必要ですか？"]);
});
});

test("緊急時と弁護士の案内の回答には「自分で作る」「行政書士に依頼する」を出さない（F-26） @local", async ({ page }) => {
  await page.goto("/");
  const fire = await ask(page, "店が燃えています");
  await expect(fire.getByTestId("action-button")).toHaveText(/119番に電話する/);
  await expect(fire.getByTestId("action-request")).toHaveCount(0);
  const lawyer = await ask(page, "是正命令が来ました。どうすればいいですか");
  await expect(lawyer.getByTestId("handoff-card")).toBeVisible();
  await expect(lawyer.getByTestId("action-button")).toHaveCount(0);
  await expect(lawyer.getByTestId("action-request")).toHaveCount(0);
});

test("点検・工事のカードが出た回答で依頼を押しても、両方のカードがその場でも開き直しても残る（F-26 fixrules R4） @local", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const reply = await ask(page, "消火器の点検をお願いしたい");
  await expect(reply.locator(".handoff.lane-setsubi")).toHaveCount(1);
  await reply.getByTestId("action-request").click();
  await expect(page.getByTestId("handoff-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("handoff-sheet")).toHaveCount(0);
  await expect(reply.locator(".handoff.lane-setsubi")).toHaveCount(1);
  await expect(reply.locator(".handoff.lane-gyosei")).toHaveCount(1);
  await expect(reply.getByTestId("action-request")).toHaveCount(0);
  await page.reload();
  await page.getByTestId("menu-button").click();
  await page.getByTestId("history-item").first().click();
  const reopened = page.getByTestId("msg-assistant").last();
  await expect(reopened.locator(".handoff.lane-setsubi")).toHaveCount(1);
  await expect(reopened.locator(".handoff.lane-gyosei")).toHaveCount(1);
});

test("ログインした別の利用者は、他人の会話に依頼を作れない（F-26） @local", async ({ page, browser }) => {
  await login(page, uniqueEmail("owner"));
  await ask(page, "防火管理者は必要ですか？");
  const conv = (await (await page.request.get("/api/conversations")).json()) as { conversations: { id: string }[] };
  const id = conv.conversations[0].id;
  const other = await browser.newContext({ extraHTTPHeaders: { "x-test-ip": testIp() } });
  const p2 = await other.newPage();
  await login(p2, uniqueEmail("other"));
  const res = await p2.request.post("/api/escalations", { data: { conversationId: id } });
  expect(res.status()).toBe(404);
  await other.close();
  // 持ち主は作れる
  expect((await page.request.post("/api/escalations", { data: { conversationId: id } })).status()).toBe(200);
});

test("ヒアリングの初期値は、本人の依頼でなければ返さない", async ({ request }) => {
  const res = await request.get("/api/escalations/not-a-real-id/hearing");
  expect([401, 404]).toContain(res.status());
});

test("a general question gets no hand-off card @local", async ({ page }) => {
  await page.goto("/");
  const reply = await ask(page, "防火管理者は必要ですか？");
  await expect(reply.getByTestId("handoff-card")).toHaveCount(0);
});

test("hand-off requests need consent and the owner's session", async ({ request }) => {
  const res = await request.post("/api/escalations/not-a-real-id/request", { data: { name: "x", email: "x@example.com", consent: false } });
  expect([400, 401]).toContain(res.status());
  const admin = await request.get("/api/admin/escalations");
  expect(admin.status()).toBe(403);
});

// ---------------------------------------------------------------------------
// 回答の下のボタンと選択肢（LINE のように押すだけで進める）

test("用途が分からない相談には、押すだけで答えられる選択肢を出し、押すとその内容で続きを相談できる @local", async ({ page }) => {
  await page.goto("/");
  const first = await ask(page, "お店を始めるときの消防の手続を知りたい");
  const quick = first.getByTestId("quick-replies");
  await expect(quick).toContainText("建物は何に使いますか？");
  await expect(quick.getByTestId("quick-reply")).toHaveCount(7);
  // 指で押しやすい大きさ（出現のアニメーションが終わってから測る）
  await expect.poll(async () => (await quick.getByTestId("quick-reply").first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const before = await events(page, "condition_answered", "occupancy");
  await quick.getByTestId("quick-reply").filter({ hasText: "飲食店" }).click();
  await expect(page.getByTestId("msg-user").last()).toHaveText("飲食店です。");
  // 押した選択肢を condition_answered（質問の topic）として記録する
  await expect.poll(async () => (await events(page, "condition_answered", "occupancy")).total).toBe(before.total + 1);
  const second = page.getByTestId("msg-assistant").last();
  await expect(second.getByTestId("quick-replies")).toBeVisible();
  // 選択肢は最新の回答にだけ出す
  await expect(page.getByTestId("msg-assistant").first().getByTestId("quick-replies")).toHaveCount(0);
  await expect(second.getByTestId("quick-replies")).not.toContainText("建物は何に使いますか？");
});

test("区が分かると、その区の消防署に電話するボタンを出す @local", async ({ page }) => {
  const s = WARD_STATIONS[0];
  test.skip(!s, "消防署の一覧を持たない版（一般版）");
  await page.goto("/");
  const reply = await ask(page, `${s.ward}で飲食店を開店します。延べ面積は120㎡、収容人員は25人、2階建てでコンロを使います。`);
  // 電話はトドケデのツールより目立たせない（ボタンではなく、一番下の小さな文字リンク）
  await expect(reply.getByTestId("action-button").filter({ hasText: "電話" })).toHaveCount(0);
  const tel = reply.getByTestId("action-tel-link").filter({ hasText: `${s.name}に電話する` });
  await expect(tel).toHaveAttribute("href", `tel:${s.tel.replace(/[^\d]/g, "")}`);
  await expect(reply.getByTestId("action-button").filter({ hasText: "届出書類を自分で作る" })).toBeVisible();
});

test("「その他」を押すと入力欄に移る @local", async ({ page }) => {
  await page.goto("/");
  const reply = await ask(page, "消防の手続を知りたい");
  const before = await events(page, "condition_answered", "other:occupancy");
  await reply.getByTestId("quick-reply").filter({ hasText: "その他" }).click();
  await expect(page.getByTestId("composer-input")).toBeFocused();
  await expect.poll(async () => (await events(page, "condition_answered", "other:occupancy")).total).toBe(before.total + 1);
});

test("回答の下の入口が押された回数を記録する @local", async ({ request }) => {
  const ok = await request.post("/api/click", { data: JSON.stringify({ kind: "link", label: "届出書類を作る" }), headers: { "content-type": "text/plain" } });
  expect(ok.status()).toBe(204);
  const bad = await request.post("/api/click", { data: JSON.stringify({ kind: "other", label: "x" }), headers: { "content-type": "text/plain" } });
  expect(bad.status()).toBe(400);
});

test("計測のイベントは許可した名前と形式の prop だけを受け付ける @local", async ({ request }) => {
  const post = (body: unknown) => request.post("/api/event", { data: JSON.stringify(body), headers: { "content-type": "text/plain" } });
  expect((await post({ name: "condition_answered", prop: "unknown:capacity" })).status()).toBe(204);
  expect((await post({ name: "page_view", prop: "direct" })).status()).toBe(400);
  expect((await post({ name: "condition_answered", prop: "foo" })).status()).toBe(400);
  expect((await post({ name: "condition_answered", prop: "飲食店" })).status()).toBe(400);
  expect((await post({ name: "condition_answered", prop: "x".repeat(61) })).status()).toBe(400);
  expect((await request.post("/api/event", { data: "not json", headers: { "content-type": "text/plain" } })).status()).toBe(400);
});

test("ホームを開くと page_view を1行記録し、?test=1 の端末は試験として記録する @local", async ({ page }) => {
  const before = await events(page, "page_view");
  await page.goto("/?utm_source=e2e_check");
  await expect(page.getByTestId("composer-input")).toBeVisible();
  await expect.poll(async () => (await events(page, "page_view")).total).toBe(before.total + 1);
  expect((await events(page, "page_view")).test).toBe(before.test);
  expect((await events(page, "page_view", "e2e_check")).total).toBeGreaterThanOrEqual(1);
  // 規約のページは数えない
  await page.goto("/legal/terms");
  await page.goto("/?test=1");
  await expect(page.getByTestId("composer-input")).toBeVisible();
  await expect.poll(async () => (await events(page, "page_view")).total).toBe(before.total + 2);
  expect((await events(page, "page_view")).test).toBe(before.test + 1);
  // ボットの User-Agent は数えない
  expect((await page.request.get("/", { headers: { "user-agent": "Googlebot/2.1" } })).ok()).toBeTruthy();
  await page.waitForTimeout(500);
  expect((await events(page, "page_view")).total).toBe(before.total + 2);
});

test("流入元を最初の接触で記録し、?test=1 の端末は試験として数えない @local", async ({ page }) => {
  await page.goto("/?utm_source=todokede_widget&utm_content=plan");
  await ask(page, "飲食店の届出を知りたい");
  expect(await (await page.request.get("/api/test/traffic")).json()).toEqual({ source: "todokede_widget:plan", is_test: 0 });
  // 同じ端末で試験の印をつけると、その利用者は試験に切り替わる（流入元は変えない）
  await page.goto("/?test=1");
  await expect(page.getByTestId("composer-input")).toBeVisible();
  expect(await (await page.request.get("/api/test/traffic")).json()).toEqual({ source: "todokede_widget:plan", is_test: 1 });
});

test("何もつけずに開いた利用者は direct として記録する @local", async ({ page }) => {
  await page.goto("/");
  await ask(page, "消防の届出を知りたい");
  expect(await (await page.request.get("/api/test/traffic")).json()).toEqual({ source: "direct", is_test: 0 });
});

test("よくある相談のページ（/soudan）が開け、相談画面へ戻れる @local", async ({ page, request }) => {
  const index = await page.goto("/soudan");
  expect(index?.status()).toBe(200);
  await expect(page.locator("h1")).toContainText("よくある相談");
  await page.locator('a[href^="/soudan/"]').first().click();
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByText("根拠: ").first()).toBeVisible();
  const box = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(box).toBe(true);
  const cta = page.getByRole("link", { name: "条件を変えて相談する" });
  await expect(cta).toHaveAttribute("href", /^\/\?utm_source=guide&utm_content=/);
  await cta.click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/soudan/inshokuten-kaigyo-80");
  expect((await request.get("/soudan/no-such-page", { maxRedirects: 0 })).status()).toBe(302);
});
