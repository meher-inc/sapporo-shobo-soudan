// 計測のイベント（plan 11、src/worker/events.ts）。送るのは名前と短い印だけで、本文や連絡先は送らない。失敗しても画面には影響させない
export function trackEvent(name: "condition_answered", prop: string) {
  try {
    navigator.sendBeacon?.("/api/event", JSON.stringify({ name, prop }));
  } catch {
    /* 計測は best effort */
  }
}

/** 条件の選択肢の prop。「わからない」は unknown:<topic>、「その他」（文が空で入力欄を開くもの）は other:<topic> */
export function conditionProp(topic: string, option: { label: string; text: string }): string {
  if (!option.text) return `other:${topic}`;
  if (option.label === "わからない") return `unknown:${topic}`;
  return topic;
}
