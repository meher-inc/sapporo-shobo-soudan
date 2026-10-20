/** 相談は無料。"paid" は以前に月額プランへ登録した利用者 */
export type Access = "free" | "paid";

export interface Me {
  user: { email: string; name: string | null; picture: string | null } | null;
  hasSession: boolean;
  access: Access;
  /** 以前に月額プランへ登録した利用者だけ true。解約とカード変更の入口を出す */
  billingPortal: boolean;
  loginAvailable: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
}

declare global {
  interface Window {
    __ME__?: Me;
  }
}

export async function fetchMe(): Promise<Me> {
  if (window.__ME__) {
    const me = window.__ME__;
    delete window.__ME__;
    return me;
  }
  return (await fetch("/api/me")).json();
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function streamChat(
  message: string,
  conversationId: string | null,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, conversationId }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? "error");
  }
  const id = res.headers.get("x-conversation-id") ?? "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
  return id;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await fetch("/api/conversations");
  if (!res.ok) return [];
  return ((await res.json()) as { conversations: ConversationSummary[] }).conversations;
}

export async function loadConversation(id: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/conversations/${id}`);
  if (!res.ok) throw new ApiError(res.status, "load_failed");
  const { messages } = (await res.json()) as { messages: ChatMessage[] };
  return messages;
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`/api/conversations/${id}`, { method: "DELETE" });
}

export async function openPortal(): Promise<string> {
  const res = await fetch("/api/billing/portal", { method: "POST" });
  const body = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new ApiError(res.status, body.error ?? "portal_failed");
  return body.url;
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST" });
}
