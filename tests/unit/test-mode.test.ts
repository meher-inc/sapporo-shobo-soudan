// Run: node --experimental-strip-types --test tests/unit/
// ローカルの E2E 専用の動きは、E2E_MODE=1 かつ localhost / 127.0.0.1 への要求のときだけ有効
import { test } from "node:test";
import assert from "node:assert/strict";
import { localTest } from "../../src/worker/test-mode.ts";

test("E2E_MODE=1 で localhost / 127.0.0.1 への要求のときだけ有効", () => {
  assert.equal(localTest({ E2E_MODE: "1" }, "http://localhost:8787/api/test/events"), true);
  assert.equal(localTest({ E2E_MODE: "1" }, "http://127.0.0.1:8787/auth/test-login"), true);
  assert.equal(localTest({}, "http://localhost:8787/api/test/events"), false);
  assert.equal(localTest({ E2E_MODE: "0" }, "http://localhost:8787/api/test/events"), false);
});

test("本番のドメインでは、E2E_MODE=1 を誤って設定しても有効にならない", () => {
  assert.equal(localTest({ E2E_MODE: "1" }, "https://osaka.todokede.jp/auth/test-login"), false);
  assert.equal(localTest({ E2E_MODE: "1" }, "https://localhost.example.com/api/test/events"), false);
  assert.equal(localTest({ E2E_MODE: "1" }, "https://example.workers.dev/api/chat"), false);
});
