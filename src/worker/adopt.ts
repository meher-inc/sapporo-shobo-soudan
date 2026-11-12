// ログインしたときに、匿名の利用者の記録をアカウントへ移す。auth.ts から分けたのは、Node の単体テストで動かすため
import type { User } from "./env";

/**
 * Moves an anonymous user's conversations to the signed-in account. The earlier first-consultation
 * time is kept as a record only (nothing is gated on it since consultations became free).
 * 専門家への引き継ぎ（escalations）も、匿名の利用者を消す前に移す。escalations.user_id は ON DELETE CASCADE なので、
 * 移さないと送信済みの依頼の記録まで消え、同じ相談をもう一度依頼できてしまう（plan 20261112-keep-requests-on-login N-1）。
 * ほかに利用者に結び付く表: sessions は匿名のセッションなので消えてよい（ログインのセッションを作り直す）。
 * user_daily_usage は外部キーがなく消えない。events・action_clicks は利用者を持たない。
 * 1つの batch（1つのトランザクション）なので、途中で失敗しても半端に移らない。
 */
export async function adoptAnonymous(db: D1Database, anon: User | null, userId: string): Promise<void> {
  if (!anon?.is_anonymous || anon.id === userId) return;
  await db.batch([
    db.prepare("UPDATE conversations SET user_id = ? WHERE user_id = ?").bind(userId, anon.id),
    db.prepare("UPDATE escalations SET user_id = ? WHERE user_id = ?").bind(userId, anon.id),
    db
      .prepare("UPDATE users SET trial_started_at = MIN(COALESCE(trial_started_at, ?1), COALESCE(?1, trial_started_at)) WHERE id = ?2")
      .bind(anon.trial_started_at, userId),
    db.prepare("DELETE FROM users WHERE id = ? AND is_anonymous = 1").bind(anon.id),
  ]);
}
