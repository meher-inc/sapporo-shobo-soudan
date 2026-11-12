// 回答のストリーム（src/worker/stream.ts の textStream）。保存（onDone）は、終わりでも相手の切断でも1回だけ（F-26 fixrules R4、レビュー M-5）
import { test } from "node:test";
import assert from "node:assert/strict";
import { textStream } from "../../src/worker/stream.ts";

const sse = (t: string) => new TextEncoder().encode(`data: ${JSON.stringify({ response: t })}\n\n`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("ふつうに終わると、保存を終えてからストリームを閉じ、保存は1回", async () => {
  const order: string[] = [];
  const src = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(sse("全文")); c.close(); } });
  const s = textStream(src, async (full) => {
    await wait(30);
    order.push(`save:${full}`);
  });
  const reader = s.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "全文");
  assert.equal((await reader.read()).done, true);
  order.push("closed");
  assert.deepEqual(order, ["save:全文", "closed"]);
});

test("回答の途中で相手が切断しても、保存は1回（M-5）", async () => {
  const saved: string[] = [];
  const src = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(sse("前半")); } });
  const s = textStream(src, (full) => { saved.push(full); });
  const reader = s.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "前半");
  const pending = reader.read(); // 次の pull が上流を待っている間に切断する
  await wait(10);
  await reader.cancel();
  await pending.catch(() => {});
  await wait(200);
  assert.deepEqual(saved, ["前半"]);
});

test("保存を待っている間に相手が切断しても、保存は1回で例外が外に出ない", async () => {
  const saved: string[] = [];
  const src = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(sse("全文")); c.close(); } });
  const s = textStream(src, async (full) => { saved.push(full); await wait(50); });
  const reader = s.getReader();
  await reader.read();
  const p = reader.read();
  await wait(10);
  await reader.cancel();
  await p.catch(() => {});
  await wait(100);
  assert.deepEqual(saved, ["全文"]);
});
