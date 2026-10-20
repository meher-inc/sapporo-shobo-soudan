import { defineConfig, devices } from "@playwright/test";

const PORT = 8787;
const STATE = ".wrangler/e2e-state";
const testVars = [
  "E2E_MODE:1",
  "AI_MOCK:1",
  "CANONICAL_ORIGIN:http://localhost:8787",
  "GOOGLE_CLIENT_ID:e2e-client.apps.googleusercontent.com",
  "GOOGLE_CLIENT_SECRET:e2e-secret",
  "STRIPE_API_BASE:http://localhost:12111",
  "STRIPE_SECRET_KEY:sk_test_e2e",
]
  .map((v) => `--var ${v}`)
  .join(" ");

// BASE_URL=https://... runs the tests that need no local-only endpoints against a deployment.
const remote = process.env.BASE_URL;
// With Cloudflare credentials the tests tagged @real-ai call the real Workers AI model.
// Without them the worker runs in the "mock" environment (no AI binding) and those tests are skipped.
const realAi = Boolean(process.env.CLOUDFLARE_API_TOKEN);
const envFlag = realAi ? "" : "--env mock";
// Where the Playwright CDN is unreachable, point this at an installed Chromium (WebKit then runs in CI only).
const chromiumPath = process.env.CHROMIUM_PATH;
const chromium = chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {};

// `pnpm screenshots` sets SCREENSHOTS=1 to run only the capture for docs/DESIGN.md.
const screenshots = Boolean(process.env.SCREENSHOTS);
const skip = [remote && "@local", !realAi && "@real-ai", !screenshots && "@screenshots"].filter(Boolean).join("|");

export default defineConfig({
  testDir: "tests/e2e",
  grep: screenshots ? /@screenshots/ : undefined,
  grepInvert: skip ? new RegExp(skip) : undefined,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: remote ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"], ...chromium } },
    // WebKit is not available from CHROMIUM_PATH; it always runs in CI.
    ...(chromiumPath ? [] : [{ name: "mobile-safari", use: { ...devices["iPhone 15"] } }]),
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"], ...chromium } },
  ],
  webServer: remote
    ? undefined
    : [
        {
          command: "node tests/mocks/stripe-mock.mjs",
          port: 12111,
          reuseExistingServer: false,
        },
        {
          // Each run starts from an empty, separate local state so earlier runs cannot affect results.
          command: [
            `node -e "require('fs').rmSync('${STATE}',{recursive:true,force:true})"`,
            "vite build",
            `wrangler d1 migrations apply DB --local ${envFlag} --persist-to ${STATE}`,
            `wrangler dev ${envFlag} --port ${PORT} --persist-to ${STATE} ${testVars}`,
          ].join(" && "),
          url: `http://localhost:${PORT}/api/me`,
          timeout: 120_000,
          reuseExistingServer: false,
        },
      ],
});
