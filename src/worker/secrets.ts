import type { Env } from "./env";

/**
 * Google と Stripe の鍵は、アカウント共通の Secrets Store に1回だけ登録し、全サービスで使い回す。
 * wrangler.jsonc の secrets_store_secrets で SHARED_<名前> として結び付ける。
 * サービス固有の値を `wrangler secret put` で入れた場合は、そちらを優先する。
 */
const SHARED = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY"] as const;
type SharedName = (typeof SHARED)[number];
type StoreSecret = { get(): Promise<string> };

let cache: Partial<Record<SharedName, string>> | null = null;

export async function withSharedSecrets(env: Env): Promise<Env> {
  if (SHARED.every((k) => env[k])) return env;
  if (!cache) {
    const resolved: Partial<Record<SharedName, string>> = {};
    const bindings = env as unknown as Record<string, StoreSecret | undefined>;
    await Promise.all(
      SHARED.map(async (k) => {
        const b = bindings[`SHARED_${k}`];
        if (!b || typeof b.get !== "function") return;
        try {
          resolved[k] = await b.get();
        } catch {
          // 未登録の鍵は「準備中」の扱いにする（ログインや決済のボタンが無効になる）
        }
      }),
    );
    // 全部そろったときだけ保持する（あとから登録された鍵を次のリクエストで拾うため）
    if (SHARED.every((k) => resolved[k])) cache = resolved;
    return merge(env, resolved);
  }
  return merge(env, cache);
}

function merge(env: Env, values: Partial<Record<SharedName, string>>): Env {
  const out = { ...env };
  for (const k of SHARED) out[k] ||= values[k];
  return out;
}
