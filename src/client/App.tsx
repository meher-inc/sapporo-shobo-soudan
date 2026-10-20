import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  ApiError,
  deleteConversation,
  listConversations,
  loadConversation,
  logout,
  openPortal,
  streamChat,
  type ChatMessage,
  type ConversationSummary,
  type Me,
} from "./api";
import { SERVICE } from "../config/service";
import { renderMarkdown } from "./markdown";
import { Sheet } from "./components/Sheet";
import { BackIcon, ChatIcon, GoogleIcon, MenuIcon, PlusIcon, SendIcon, StopIcon, TrashIcon } from "./components/Icons";

type SheetKind = "login" | "menu" | null;

function withTransition(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (doc.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(fn);
  else fn();
}

function addRipple(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const span = document.createElement("span");
  span.className = "ripple";
  span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
  el.appendChild(span);
  span.addEventListener("animationend", () => span.remove());
}

export function App({ initialMe }: { initialMe: Me }) {
  const [me, setMe] = useState<Me>(initialMe);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [history, setHistory] = useState<ConversationSummary[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [compact, setCompact] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const composer = useRef<HTMLFormElement>(null);

  useEffect(() => {
    textarea.current?.focus();
    const params = new URLSearchParams(location.search);
    if (params.get("login") === "failed") flash("ログインできませんでした。もう一度お試しください。");
    // Questions typed on a topic page arrive as ?q= and are sent right away.
    const q = params.get("q")?.trim();
    if (q) void send(q.slice(0, 2000));
    if (params.toString()) history_replace();
  }, []);

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input]);

  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function history_replace() {
    window.history.replaceState(null, "", "/");
  }

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 3200);
  }

  async function refreshMe() {
    const res = await fetch("/api/me");
    if (res.ok) setMe(await res.json());
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    setInput("");
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: message };
    const botId = `a-${Date.now()}`;
    setMessages((m) => [...m, userMsg, { id: botId, role: "assistant", content: "" }]);
    setStreaming(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const id = await streamChat(
        message,
        conversationId,
        (chunk) => setMessages((m) => m.map((x) => (x.id === botId ? { ...x, content: x.content + chunk } : x))),
        ctrl.signal,
      );
      if (id) setConversationId(id);
      // The first message creates an anonymous session; reflect it so the menu shows history.
      if (!me.hasSession) void refreshMe();
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((m) => m.map((x) => (x.id === botId && !x.content ? { ...x, content: "（停止しました）" } : x)));
      } else {
        setMessages((m) => m.filter((x) => x.id !== botId && x.id !== userMsg.id));
        setInput(message);
        if (err instanceof ApiError && err.code === "trial_limit") {
          setSheet("login");
        } else if (err instanceof ApiError && err.code === "user_limit") {
          flash("本日の相談回数の上限に達しました。明日またご利用ください。緊急時は119番へ。");
        } else if (err instanceof ApiError && err.status === 429) {
          flash("送信が続いています。1分ほど待ってからもう一度お試しください。");
        } else {
          flash("送信に失敗しました。時間をおいてもう一度お試しください。");
        }
      }
    } finally {
      setStreaming(false);
      abort.current = null;
    }
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    if (streaming) abort.current?.abort();
    else {
      composer.current?.classList.remove("shine");
      void composer.current?.offsetWidth;
      composer.current?.classList.add("shine");
      void send(input);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(hover: hover)").matches) {
      e.preventDefault();
      void send(input);
    }
  }

  function newConversation() {
    abort.current?.abort();
    withTransition(() => {
      setMessages([]);
      setConversationId(null);
      setSheet(null);
    });
    setTimeout(() => textarea.current?.focus(), 50);
  }

  async function openConversation(id: string) {
    setSheet(null);
    if (id === conversationId) return;
    abort.current?.abort();
    setLoadingThread(true);
    setMessages([]);
    try {
      const msgs = await loadConversation(id);
      withTransition(() => {
        setMessages(msgs);
        setConversationId(id);
      });
    } catch {
      flash("相談履歴を読み込めませんでした。もう一度お試しください。");
    } finally {
      setLoadingThread(false);
    }
  }

  async function openMenu() {
    setSheet("menu");
    if (me.hasSession) setHistory(await listConversations());
  }

  async function removeConversation(id: string) {
    setHistory((h) => h?.filter((c) => c.id !== id) ?? null);
    await deleteConversation(id);
    if (id === conversationId) newConversation();
  }

  async function portal() {
    try {
      location.href = await openPortal();
    } catch {
      flash("お支払い情報を開けませんでした。時間をおいてもう一度お試しください。");
    }
  }

  async function signOut() {
    await logout();
    setMe({ ...me, user: null, hasSession: false, access: "free", billingPortal: false });
    setMessages([]);
    setConversationId(null);
    setHistory(null);
    setSheet(null);
  }

  function onPointerMove(e: PointerEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".glass");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  const lastBot = messages[messages.length - 1];
  const html = useMemo(() => new Map<string, string>(), []);
  const md = (m: ChatMessage) => {
    if (streaming && m.id === lastBot?.id) return renderMarkdown(m.content);
    const cached = html.get(m.id + m.content.length);
    if (cached) return cached;
    const out = renderMarkdown(m.content);
    html.set(m.id + m.content.length, out);
    return out;
  };

  return (
    <div class="app" onPointerMove={onPointerMove}>
      <div class="ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <header class={`header glass${compact ? " compact" : ""}`}>
        <button class="icon-btn" aria-label="メニュー" data-testid="menu-button" onClick={openMenu}>
          <MenuIcon />
        </button>
        <div class="brand" data-testid="brand">
          <img src="/icon.svg" alt="" />
          {SERVICE.shortName}
          <span class="brand-area">{SERVICE.area}</span>
        </div>
        <div class="right">
          {me.user ? (
            <button class="icon-btn" aria-label="アカウント" onClick={openMenu}>
              {me.user.picture ? (
                <img class="avatar" src={me.user.picture} alt="" referrerpolicy="no-referrer" />
              ) : (
                <span class="avatar-fallback">{(me.user.name ?? me.user.email).slice(0, 1)}</span>
              )}
            </button>
          ) : (
            <button class="icon-btn" aria-label="新しい相談" onClick={newConversation}>
              <PlusIcon />
            </button>
          )}
        </div>
      </header>

      <div class="thread" ref={thread} onScroll={(e) => setCompact((e.currentTarget as HTMLElement).scrollTop > 8)} data-testid="thread">
        <div class="thread-inner" aria-live="polite">
          {loadingThread && (
            <div data-testid="thread-skeleton" style="display:flex;flex-direction:column;gap:14px">
              <div class="sk" style="width:58%;height:52px;align-self:flex-end;border-radius:20px 20px 6px 20px" />
              <div class="sk" style="width:82%;height:110px;border-radius:20px 20px 20px 6px" />
              <div class="sk" style="width:44%;height:44px;align-self:flex-end;border-radius:20px 20px 6px 20px" />
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} class={`msg ${m.role}`} data-testid={`msg-${m.role}`}>
              {m.role === "user" ? (
                <div class="bubble">{m.content}</div>
              ) : (
                <>
                  <div class="bubble glass md">
                    {m.content ? (
                      <>
                        <div dangerouslySetInnerHTML={{ __html: md(m) }} />
                        {streaming && m.id === lastBot?.id && <span class="caret" />}
                      </>
                    ) : (
                      <span class="typing" aria-label="回答を作成中">
                        <span />
                        <span />
                        <span />
                      </span>
                    )}
                  </div>
                  {!(streaming && m.id === lastBot?.id) && m.content && (
                    <div class="msg-actions">
                      <button
                        class="mini-btn"
                        onClick={() => navigator.clipboard?.writeText(m.content).then(() => flash("コピーしました。"))}
                      >
                        コピー
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div class="composer-wrap">
        {messages.length === 0 && !loadingThread && (
          <div class="empty">
            <div class="chips">
              {SERVICE.suggestions.map((s, i) => (
                <button
                  key={s}
                  class="chip glass rp"
                  style={{ animationDelay: `${0.08 + i * 0.06}s` }}
                  onClick={(e) => {
                    addRipple(e);
                    void send(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <form ref={composer} class={`composer glass${focused ? " focus" : ""}`} onSubmit={onSubmit}>
          <textarea
            ref={textarea}
            rows={1}
            value={input}
            placeholder={SERVICE.placeholder}
            aria-label="相談内容"
            data-testid="composer-input"
            maxLength={2000}
            enterkeyhint="send"
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          <button
            type="submit"
            class={`send rp${streaming ? " busy-stop" : ""}`}
            aria-label={streaming ? "停止" : "送信"}
            data-testid="send-button"
            disabled={!streaming && !input.trim()}
            onClick={addRipple}
          >
            {streaming ? <StopIcon /> : <SendIcon />}
          </button>
        </form>
        <p class="note">{SERVICE.notice}</p>
      </div>

      {sheet === "login" && (
        <Sheet label="ログイン" onClose={() => setSheet(null)} testId="login-sheet">
          <div class="stagger">
            <h2>Googleでログインして相談する</h2>
            <p>この回線からのログインなしの利用は上限に達しました。ログインすると続けて相談できます。</p>
            <button
              class="btn btn-google rp"
              data-testid="google-login"
              disabled={!me.loginAvailable}
              onClick={(e) => {
                addRipple(e);
                location.href = `/auth/google?next=${encodeURIComponent("/")}`;
              }}
            >
              <GoogleIcon />
              Googleでログイン
            </button>
            {!me.loginAvailable && <p class="terms">ログイン機能は現在準備中です。</p>}
            <p class="terms">
              相談は無料です。<a href="/legal/terms">利用規約</a>と<a href="/legal/privacy">プライバシーポリシー</a>をご確認ください。
            </p>
          </div>
        </Sheet>
      )}

      {sheet === "menu" && (
        <Sheet label="メニュー" onClose={() => setSheet(null)} testId="menu-sheet">
          <div class="stagger">
            <button class="btn btn-primary rp" data-testid="new-conversation" onClick={(e) => { addRipple(e); newConversation(); }}>
              <PlusIcon />
              新しい相談
            </button>
            {me.hasSession && (
              <>
                <div class="section-label">相談履歴</div>
                <div class="list" data-testid="history-list">
                  {history === null ? (
                    <>
                      <div class="sk sk-row" />
                      <div class="sk sk-row" />
                      <div class="sk sk-row" />
                    </>
                  ) : history.length === 0 ? (
                    <p style="margin:6px 4px">まだ相談はありません。</p>
                  ) : (
                    history.map((c) => (
                      <div key={c.id} style="display:flex;align-items:center">
                        <button class={`row${c.id === conversationId ? " active" : ""}`} onClick={() => openConversation(c.id)} data-testid="history-item">
                          <ChatIcon />
                          <span class="t">{c.title}</span>
                        </button>
                        <button class="icon-btn" aria-label="削除" onClick={() => removeConversation(c.id)}>
                          <TrashIcon />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
            {me.user ? (
              <>
                <div class="section-label">アカウント</div>
                <div class="list">
                  <div class="row" style="cursor:default">
                    <span class="t">{me.user.email}</span>
                  </div>
                  {me.billingPortal && (
                    <button class="row" data-testid="billing-portal" onClick={portal}>
                      <span class="t">お支払い・解約の管理</span>
                    </button>
                  )}
                  <button class="row" data-testid="logout" onClick={signOut}>
                    <span class="t">ログアウト</span>
                  </button>
                </div>
              </>
            ) : (
              <div style="margin-top:10px">
                <button class="btn btn-google rp" data-testid="menu-login" disabled={!me.loginAvailable} onClick={() => (location.href = "/auth/google")}>
                  <GoogleIcon />
                  Googleでログイン
                </button>
                {me.hasSession && <p class="terms">ログインすると相談履歴を引き継ぎ、ほかの端末でも見られます。</p>}
              </div>
            )}
            <div class="links">
              <a href="/legal/terms">利用規約</a>
              <a href="/legal/privacy">プライバシーポリシー</a>
              <a href="/legal/tokushoho">特定商取引法に基づく表記</a>
            </div>
          </div>
        </Sheet>
      )}

      {toast && (
        <div class="toast glass" role="status" data-testid="toast">
          {toast}
        </div>
      )}
    </div>
  );
}

export function LegalBack() {
  return (
    <a class="back" href="/">
      <BackIcon />
      相談に戻る
    </a>
  );
}
