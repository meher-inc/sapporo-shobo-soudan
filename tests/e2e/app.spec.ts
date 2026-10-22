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
  await page.getByTestId("composer-input").fill("__stall__");
  await page.getByTestId("send-button").click();
  const reply = page.getByTestId("msg-assistant").first();
  await expect(reply).toContainText("途中までの回答");
  await expect(reply.getByRole("button", { name: "コピー" })).toBeVisible({ timeout: 45_000 });
  await expect(reply).toContainText("もう一度お試しください");
  await expect(page.getByTestId("send-button")).toHaveAttribute("aria-label", "送信");
});

test("the daily message limit stops sending with a notice @local", async ({ page }) => {
  await page.goto("/");
  await ask(page, "消火器は必要ですか");
  expect((await page.request.post("/api/test/fill-quota")).ok()).toBeTruthy();
  const res = await page.request.post("/api/chat", { data: { message: "もう1件" } });
  expect(res.status()).toBe(429);
  expect((await res.json()).error).toBe("user_limit");
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
  await page.getByTestId("composer-input").fill("上限を超えた新しい端末");
  await page.getByTestId("send-button").click();
  await expect(page.getByTestId("login-sheet")).toBeVisible();
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
  await expect(reply.getByTestId("action-button").filter({ hasText: "届出書類を作る" })).toHaveAttribute("href", /^https:\/\/docs\.todokede\.jp\/\?utm_source=todokede_ai/);
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
  await quick.getByTestId("quick-reply").filter({ hasText: "飲食店" }).click();
  await expect(page.getByTestId("msg-user").last()).toHaveText("飲食店です。");
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
  await expect(reply.getByTestId("action-button").filter({ hasText: "届出書類を作る" })).toBeVisible();
});

test("「その他」を押すと入力欄に移る @local", async ({ page }) => {
  await page.goto("/");
  const reply = await ask(page, "消防の手続を知りたい");
  await reply.getByTestId("quick-reply").filter({ hasText: "その他" }).click();
  await expect(page.getByTestId("composer-input")).toBeFocused();
});

test("回答の下の入口が押された回数を記録する @local", async ({ request }) => {
  const ok = await request.post("/api/click", { data: JSON.stringify({ kind: "link", label: "届出書類を作る" }), headers: { "content-type": "text/plain" } });
  expect(ok.status()).toBe(204);
  const bad = await request.post("/api/click", { data: JSON.stringify({ kind: "other", label: "x" }), headers: { "content-type": "text/plain" } });
  expect(bad.status()).toBe(400);
});
