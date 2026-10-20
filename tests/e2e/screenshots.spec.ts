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
});
