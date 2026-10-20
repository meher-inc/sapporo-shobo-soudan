#!/usr/bin/env node
// Prepares the Cloudflare side of a new service created from this template.
//
//   node scripts/setup-cloudflare.mjs              creates the D1 database and writes its ID into wrangler.jsonc
//   node scripts/setup-cloudflare.mjs --dry-run    only rewrites wrangler.jsonc (placeholder database ID)
//
// Options: --namespace <int>  rate-limiter namespace (unique per account; default: derived from the service id)
//          --subdomain <name> workers.dev subdomain (default: shun-maruoka)
//
// Reads the service id from src/config/service.ts, so edit that file first.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const dryRun = args.includes("--dry-run");

const config = readFileSync("src/config/service.ts", "utf8");
const id = config.match(/\bid:\s*"([^"]+)"/)?.[1];
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) throw new Error("src/config/service.ts の id が見つからないか、英小文字・数字・ハイフン以外を含んでいます");
if (id === "service-template" && !dryRun) throw new Error("先に src/config/service.ts の id を新しいサービスの値に変えてください");

// 4101 is taken by the Tokyo fire consultation service; derive a stable number in 5000-8999 from the id.
const hash = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const namespace = opt("namespace", String(5000 + (hash % 4000)));
const subdomain = opt("subdomain", "shun-maruoka");

let databaseId = "00000000-0000-0000-0000-000000000000";
if (!dryRun) {
  const out = execFileSync("npx", ["wrangler", "d1", "create", id], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  databaseId = out.match(/"database_id":\s*"([0-9a-f-]{36})"/)?.[1] ?? out.match(/database_id\s*=\s*"([0-9a-f-]{36})"/)?.[1];
  if (!databaseId) throw new Error(`database_id を読み取れませんでした:\n${out}`);
}

let w = readFileSync("wrangler.jsonc", "utf8");
w = w.replace(/"name": "[^"]+",/, `"name": "${id}",`);
w = w.replaceAll(/"database_name": "[^"]+"/g, `"database_name": "${id}"`);
w = w.replaceAll(/"database_id": "[^"]+"/g, `"database_id": "${databaseId}"`);
w = w.replaceAll(/"namespace_id": "[^"]+"/g, `"namespace_id": "${namespace}"`);
w = w.replace(/"CANONICAL_ORIGIN": "https:[^"]+"/, `"CANONICAL_ORIGIN": "https://${id}.${subdomain}.workers.dev"`);
writeFileSync("wrangler.jsonc", w);

console.log(`wrangler.jsonc を更新しました
  Worker 名        ${id}
  D1               ${id} (${databaseId})
  レート制限        namespace_id ${namespace}
  公開URL          https://${id}.${subdomain}.workers.dev

次にやること（README の「新しいサービスを公開する」）
  1. pnpm run db:migrate:remote
  2. wrangler secret put で GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
  3. pnpm run deploy`);
