#!/usr/bin/env node
// Runs before every production deploy (`pnpm run deploy`, Workers Builds and GitHub Actions alike).
// Finds the D1 database named after the service, creates it on the first deploy, and writes its ID
// into wrangler.jsonc for this build only. The committed wrangler.jsonc keeps the placeholder ID,
// so a new service needs no manual `wrangler d1 create` and no ID to copy around.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

let config = readFileSync("wrangler.jsonc", "utf8");
const name = config.match(/"database_name": "([^"]+)"/)?.[1];
if (!name) throw new Error("wrangler.jsonc に database_name がありません");

const current = config.match(/"database_id": "([^"]+)"/)?.[1];
if (current && current !== PLACEHOLDER) {
  console.log(`D1 ${name}: wrangler.jsonc の ID (${current}) を使います`);
  process.exit(0);
}

const list = JSON.parse(wrangler("d1", "list", "--json"));
let id = list.find((db) => db.name === name)?.uuid;
if (id) {
  console.log(`D1 ${name}: 既存のデータベースを使います (${id})`);
} else {
  const out = wrangler("d1", "create", name);
  id = out.match(/"database_id":\s*"([0-9a-f-]{36})"/)?.[1] ?? out.match(/database_id\s*=\s*"([0-9a-f-]{36})"/)?.[1];
  if (!id) throw new Error(`作成した D1 の ID を読み取れませんでした:\n${out}`);
  console.log(`D1 ${name}: 新しく作成しました (${id})`);
}

// Only the first (top-level, production) entry; env.mock keeps the placeholder for local tests.
config = config.replace(`"database_id": "${PLACEHOLDER}"`, `"database_id": "${id}"`);
writeFileSync("wrangler.jsonc", config);
