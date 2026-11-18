/** localhost / 127.0.0.1 への要求か */
export const isLocal = (url: string) => ["localhost", "127.0.0.1"].includes(new URL(url).hostname);

/**
 * ローカルの E2E 専用の動き（テスト用ログイン、テスト用 API、応答の停止、本物の AI への切り替え、IP の差し替え）を有効にするか。
 * E2E_MODE=1 に加えて localhost / 127.0.0.1 への要求のときだけ有効にし、本番に E2E_MODE を誤って設定しても有効にならないようにする
 */
export const localTest = (env: { E2E_MODE?: string }, url: string) => env.E2E_MODE === "1" && isLocal(url);
