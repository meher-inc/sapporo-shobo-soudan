import type { Env } from "./env";

// Hard cap against runaway Workers AI cost now that consultations are free.

export const jstDay = (t = Date.now()) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10);

/** Counts one message for today (JST); false once the user is over USER_DAILY_MESSAGE_LIMIT. */
export async function takeUserQuota(env: Env, userId: string): Promise<boolean> {
  const limit = Number(env.USER_DAILY_MESSAGE_LIMIT || 20);
  const row = await env.DB.prepare(
    `INSERT INTO user_daily_usage (user_id, day, messages) VALUES (?, ?, 1)
     ON CONFLICT(user_id, day) DO UPDATE SET messages = messages + 1
     RETURNING messages`,
  )
    .bind(userId, jstDay())
    .first<{ messages: number }>();
  return (row?.messages ?? 0) <= limit;
}
