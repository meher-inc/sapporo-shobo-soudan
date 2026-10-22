import { expect, test } from "@playwright/test";

// `pnpm screenshots` refreshes docs/screenshots/*.png (iPhone-sized, light). Not part of the normal test run.
test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

test("capture @screenshots", async ({ page }) => {
  const shot = (name: string) => page.screenshot({ path: `docs/screenshots/${name}.png`, animations: "disabled" });
  await page.route("**/assets/*.js", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto("/");
  await shot("1-skeleton");
  await expect(page.getByTestId("composer-input")).toBeVisible();
  await page.waitForTimeout(800);
  await shot("2-home");
  await page.getByTestId("composer-input").fill("はじめての相談です。何から確認すればいいですか？");
  await page.getByTestId("send-button").click();
  await expect(page.getByTestId("msg-assistant").last().getByRole("button", { name: "コピー" })).toBeVisible();
  await page.waitForTimeout(700);
  await shot("3-answer");
  await page.getByTestId("menu-button").click();
  await page.waitForTimeout(800);
  await shot("4-menu");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // 行政書士への依頼の前のヒアリング（届出の種類 → 建物と時期 → 資料の持ち主と依頼文）
  await page.getByTestId("composer-input").fill("ビルの7階に事務所を移転します。消防計画を作成してほしいです");
  await page.getByTestId("send-button").click();
  const card = page.getByTestId("msg-assistant").last().getByTestId("handoff-card");
  await card.getByTestId("handoff-open").click();
  const hearing = page.getByTestId("hearing");
  await expect(hearing.locator('[aria-checked="true"]').first()).toBeVisible();
  await page.waitForTimeout(800);
  await shot("5-hearing-type");
  await hearing.getByTestId("hearing-next").click();
  await hearing.locator('[data-id="address"] input').fill("名古屋市中村区名駅4丁目 ○○ビル");
  await hearing.locator('[data-id="start_date"] input').fill("2026-12-01");
  await hearing.getByTestId("hearing-next").click();
  for (const id of ["tp_plan_doc", "tp_unified_doc", "tp_equip_doc"]) {
    await hearing.locator(`[data-testid="hearing-doc"][data-id="${id}"] [data-holder="kanri"]`).click();
  }
  await hearing.locator('[data-testid="hearing-draft"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await shot("6-hearing-docs");
});
