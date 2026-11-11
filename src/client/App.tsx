import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  ApiError,
  createRequest,
  deleteConversation,
  listConversations,
  loadConversation,
  logout,
  openPortal,
  requestHandoff,
  streamChat,
  type AnswerActions,
  type ChatMessage,
  type ConversationSummary,
  type EscalationRef,
  type Me,
} from "./api";
import { SERVICE } from "../config/service";
import { renderMarkdown } from "./markdown";
import { stripEchoes } from "./echo";
import { conditionProp, trackEvent } from "./events";
import { Sheet } from "./components/Sheet";
import { Hearing } from "./components/Hearing";
import type { HearingAnswers } from "../hearing/hearing";
import { BackIcon, ChatIcon, GoogleIcon, MenuIcon, PlusIcon, SendIcon, StopIcon, TrashIcon } from "./components/Icons";

type SheetKind = "login" | "menu" | "handoff" | null;

const HANDOFF = {
  gyosei: {
    title: "書類の作成・提出は行政書士に依頼できます",
    body: "トドケデ提携の行政書士が、内容の確認から作成・提出まで対応します。費用は行政書士からお見積りします。",
    action: "行政書士に依頼する",
  },
  setsubi: {
    title: "点検・工事の手配を相談できます",
    body: "トドケデが提携の消防設備士・点検業者におつなぎします。費用は業者からお見積りします。",
    action: "手配を相談する",
  },
  bengoshi: {
    title: "個別の対応は弁護士へのご相談をおすすめします",
    body: "違反処理や命令、紛争に関わる内容は、法的な判断が必要です。お近くの弁護士会の法律相談などをご利用ください。",
    action: null,
  },
} as const;

// 行政書士への依頼の近くに出す文（F-05・F-07・F-26。文言は todokede-corporate の 03_screens.md §1 と F-07）
const GYOSEI_CONTRACT = "書類の作成・提出は行政書士が行います。ご契約・お支払いは行政書士と直接です。";
const GYOSEI_TO_CONFIRM = "行政書士への依頼は、いただいた後に対応できるかを確認してご連絡します。";
const GYOSEI_NONE = "この地域は、書類の作成を依頼できる行政書士をまだご案内できません。";
// 同じ相談の依頼を送信済みのとき（fixrules R2）
const ALREADY_REQUESTED = "この相談はご依頼済みです。担当からご連絡します。";
const RECEIVER = SERVICE.gyoseiReceiver as "要確認" | "あり" | "なし";

function GyoseiNotes() {
  return (
    <>
      <p class="handoff-note" data-testid="handoff-contract">{GYOSEI_CONTRACT}</p>
      {RECEIVER === "要確認" && <p class="handoff-note" data-testid="handoff-receiver">{GYOSEI_TO_CONFIRM}</p>}
    </>
  );
}

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
  const [handoff, setHandoff] = useState<EscalationRef | null>(null);
  const [handoffForm, setHandoffForm] = useState({ name: "", email: "", phone: "", note: "", consent: false });
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  // 行政書士への依頼は、連絡先の前に届出の種類ごとのヒアリングをする（hearingDone で連絡先へ進む）
  const [hearing, setHearing] = useState<HearingAnswers | null>(null);
  const [hearingDone, setHearingDone] = useState(false);
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
    // 回答が終わると下にボタンと選択肢が出るので、そこまで見せる
  }, [messages, streaming]);

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
        (escalation) => setMessages((m) => m.map((x) => (x.id === botId ? { ...x, escalation } : x))),
        (actions) => setMessages((m) => m.map((x) => (x.id === botId ? { ...x, actions } : x))),
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

  function openHandoff(e: EscalationRef) {
    if (handoff?.id !== e.id) {
      setHearing(null);
      setHearingDone(false);
    }
    setHandoff(e);
    setHandoffForm((f) => ({ ...f, email: f.email || me.user?.email || "", name: f.name || me.user?.name || "" }));
    setSheet("handoff");
  }

  /** 依頼の状態を、同じ引き継ぎのカードすべてに反映する */
  function markRequested(id: string) {
    setMessages((m) =>
      m.map((x) => ({
        ...x,
        ...(x.escalation?.id === id ? { escalation: { ...x.escalation, status: "requested" as const } } : {}),
        ...(x.request?.id === id ? { request: { ...x.request, status: "requested" as const } } : {}),
      })),
    );
  }

  /**
   * 回答の下の「行政書士に依頼する」: この相談の行政書士への引き継ぎを作り（あればそれを使い）、その回答の下に依頼カードを出して、依頼のシートを開く。
   * 点検・弁護士のカードはそのまま残す（request は escalation と別に持つ）。同じ依頼のカードがすでに出ていれば2枚目は出さない。送信済みならシートを開かない
   */
  async function requestFromAnswer(messageId: string, label: string) {
    if (!conversationId || requestBusy) return;
    setRequestBusy(true);
    trackClick("handoff", label);
    try {
      const ref = await createRequest(conversationId);
      setMessages((m) => {
        const shown = m.some((x) => x.escalation?.id === ref.id || x.request?.id === ref.id);
        return m.map((x) =>
          x.escalation?.id === ref.id
            ? { ...x, escalation: ref }
            : x.request?.id === ref.id || (!shown && x.id === messageId)
              ? { ...x, request: ref }
              : x,
        );
      });
      if (ref.status === "requested") flash(ALREADY_REQUESTED);
      else openHandoff(ref);
    } catch {
      flash("依頼の画面を開けませんでした。時間をおいてもう一度お試しください。");
    } finally {
      setRequestBusy(false);
    }
  }

  async function submitHandoff(e: Event) {
    e.preventDefault();
    if (!handoff) return;
    setHandoffBusy(true);
    try {
      await requestHandoff(handoff.id, { ...handoffForm, hearing: handoff.lane === "gyosei" ? hearing : null });
      markRequested(handoff.id);
      setSheet(null);
      flash("ご依頼を受け付けました。担当からご連絡します。");
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      if (code === "already_requested") {
        markRequested(handoff.id);
        setSheet(null);
        flash(ALREADY_REQUESTED);
        return;
      }
      if (code === "hearing_incomplete" || code === "invalid_hearing") {
        setHearingDone(false);
        flash("所在地と予定日をご確認ください。");
        return;
      }
      flash(
        code === "invalid_email"
          ? "メールアドレスの形式をご確認ください。"
          : code === "invalid_phone"
            ? "電話番号の形式をご確認ください。"
            : "送信できませんでした。時間をおいてもう一度お試しください。",
      );
    } finally {
      setHandoffBusy(false);
    }
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
    // 画面のボタン・選択肢と同じ文言を本文に重ねて出さない
    const out = renderMarkdown(stripEchoes(m.content, m.actions));
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
                  {!(streaming && m.id === lastBot?.id) && m.content && m.escalation && (
                    <Handoff escalation={m.escalation} onOpen={openHandoff} />
                  )}
                  {!(streaming && m.id === lastBot?.id) && m.content && m.request && m.request.id !== m.escalation?.id && (
                    <Handoff escalation={m.request} onOpen={openHandoff} />
                  )}
                  {!streaming && m.id === lastBot?.id && m.content && m.actions && (
                    <AnswerActionsView
                      actions={m.actions}
                      // この回答にすでに行政書士の依頼カードがあれば、依頼のボタンは重ねない
                      hideRequest={m.escalation?.lane === "gyosei" || !!m.request}
                      requestBusy={requestBusy}
                      onRequest={(label) => void requestFromAnswer(m.id, label)}
                      onReply={(text) => {
                        if (text) void send(text);
                        else textarea.current?.focus();
                      }}
                    />
                  )}
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

      {sheet === "handoff" && handoff && (
        <Sheet label="依頼" onClose={() => setSheet(null)} testId="handoff-sheet">
          {handoff.lane === "gyosei" && !hearingDone ? (
            <Hearing
              escalationId={handoff.id}
              value={hearing}
              onChange={setHearing}
              onDone={(a) => {
                setHearing(a);
                setHearingDone(true);
                document.querySelector(".sheet")?.scrollTo({ top: 0 });
              }}
            />
          ) : (
          <form class="stagger handoff-form" onSubmit={submitHandoff}>
            {handoff.lane === "gyosei" && hearing && <p class="hearing-step">4 / 4 ・ ご連絡先</p>}
            <h2>{HANDOFF[handoff.lane].action}</h2>
            <p>ご連絡先をお知らせください。担当からご連絡し、内容と費用をご案内します。</p>
            <label>
              お名前
              <input
                required
                maxLength={60}
                autocomplete="name"
                value={handoffForm.name}
                data-testid="handoff-name"
                onInput={(e) => setHandoffForm({ ...handoffForm, name: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label>
              メールアドレス
              <input
                type="email"
                maxLength={254}
                autocomplete="email"
                value={handoffForm.email}
                data-testid="handoff-email"
                onInput={(e) => setHandoffForm({ ...handoffForm, email: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label>
              電話番号（任意）
              <input
                type="tel"
                maxLength={30}
                autocomplete="tel"
                value={handoffForm.phone}
                data-testid="handoff-phone"
                onInput={(e) => setHandoffForm({ ...handoffForm, phone: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label>
              補足（任意）
              <textarea
                rows={3}
                maxLength={1000}
                value={handoffForm.note}
                placeholder="建物の所在地、希望の時期など"
                onInput={(e) => setHandoffForm({ ...handoffForm, note: (e.target as HTMLTextAreaElement).value })}
              />
            </label>
            <label class="consent">
              <input
                type="checkbox"
                checked={handoffForm.consent}
                data-testid="handoff-consent"
                onChange={(e) => setHandoffForm({ ...handoffForm, consent: (e.target as HTMLInputElement).checked })}
              />
              <span>
                この相談のやり取り{handoff.lane === "gyosei" && hearing ? "とご回答の内容" : ""}を、MeHer株式会社を通じて提携の
                {handoff.lane === "gyosei" ? "行政書士" : "消防設備士・点検業者"}
                に共有することに同意します。ご依頼の契約と費用は、提携先とお客様の間で決めます。
              </span>
            </label>
            {handoff.lane === "gyosei" && <GyoseiNotes />}
            <button
              type="submit"
              class="btn btn-primary rp"
              data-testid="handoff-submit"
              disabled={handoffBusy || !handoffForm.consent || !handoffForm.name.trim() || !(handoffForm.email.trim() || handoffForm.phone.trim())}
            >
              {handoffBusy ? "送信しています…" : "依頼内容を送る"}
            </button>
            <p class="terms">メールアドレスか電話番号のどちらかをご入力ください。</p>
            {handoff.lane === "gyosei" && (
              <button type="button" class="hearing-skip" onClick={() => setHearingDone(false)}>
                前の質問に戻る
              </button>
            )}
          </form>
          )}
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

/** Offered under an answer that a licensed professional should take over. */
function Handoff({ escalation, onOpen }: { escalation: EscalationRef; onOpen: (e: EscalationRef) => void }) {
  const copy = HANDOFF[escalation.lane];
  return (
    <div class={`handoff glass lane-${escalation.lane}`} data-testid="handoff-card">
      <strong>{copy.title}</strong>
      <p>{copy.body}</p>
      {escalation.lane === "gyosei" && (RECEIVER === "なし" ? <p class="handoff-note">{GYOSEI_NONE}</p> : <GyoseiNotes />)}
      {copy.action &&
        !(escalation.lane === "gyosei" && RECEIVER === "なし") &&
        (escalation.status === "requested" ? (
          <span class="handoff-done" data-testid="handoff-done">
            ご依頼を受け付けました
          </span>
        ) : (
          <button
            class="btn btn-primary rp"
            data-testid="handoff-open"
            onClick={() => {
              trackClick("handoff", escalation.lane);
              onOpen(escalation);
            }}
          >
            {copy.action}
          </button>
        ))}
    </div>
  );
}

// 押された入口を数える（トドケデのツール・電話・専門家への依頼のどれに流れたか）。失敗しても画面には影響させない
function trackClick(kind: "link" | "tel" | "handoff", label: string) {
  try {
    navigator.sendBeacon?.("/api/click", JSON.stringify({ kind, label }));
  } catch {
    /* 計測は best effort */
  }
}

// 回答の下のボタンと選択肢（LINE のように押すだけで進める）。いちばん新しい回答にだけ出す。
// トドケデのツールを大きく、消防署への電話は一番下に小さな文字で出す（119番だけは大きく）
function AnswerActionsView({
  actions,
  onReply,
  onRequest,
  hideRequest,
  requestBusy,
}: {
  actions: AnswerActions;
  onReply: (text: string) => void;
  onRequest: (label: string) => void;
  hideRequest?: boolean;
  /** 依頼を作っている間は押せない（fixrules R3） */
  requestBusy?: boolean;
}) {
  const isBig = (b: AnswerActions["buttons"][number]) => b.kind === "link" || b.kind === "request" || b.href === "tel:119";
  const big = actions.buttons.filter((b) => isBig(b) && !(hideRequest && b.kind === "request"));
  const small = actions.buttons.filter((b) => !isBig(b));
  return (
    <div class="answer-actions" data-testid="answer-actions">
      {big.length > 0 && (
        <div class="action-buttons">
          {big.map((b, i) =>
            b.kind === "request" ? (
              <button
                key="request"
                type="button"
                class={`action-btn glass rp${i === 0 ? " primary" : ""}`}
                data-testid="action-request"
                disabled={requestBusy}
                aria-busy={requestBusy}
                style={{ animationDelay: `${0.05 + i * 0.06}s` }}
                onClick={(e) => {
                  addRipple(e);
                  onRequest(b.label);
                }}
              >
                <span class="action-label">{b.label}</span>
                {b.sub && <span class="action-sub">{b.sub}</span>}
                <span class="action-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            ) : (
            <a
              key={b.href}
              class={`action-btn glass rp${i === 0 ? " primary" : ""}${b.kind === "tel" ? " tel" : ""}`}
              href={b.href}
              {...(b.kind === "link" ? { target: "_blank", rel: "noopener" } : {})}
              data-testid="action-button"
              style={{ animationDelay: `${0.05 + i * 0.06}s` }}
              onClick={(e) => {
                addRipple(e);
                trackClick(b.kind === "tel" ? "tel" : "link", b.label);
              }}
            >
              <span class="action-label">{b.label}</span>
              {b.sub && <span class="action-sub">{b.sub}</span>}
              <span class="action-arrow" aria-hidden="true">
                {b.kind === "tel" ? "☎" : "›"}
              </span>
            </a>
            ),
          )}
        </div>
      )}
      {actions.question && (
        <div class="quick" data-testid="quick-replies">
          <p class="quick-q">{actions.question.text}</p>
          <div class="quick-chips">
            {actions.question.options.map((o, i) => (
              <button
                key={o.label}
                class={`quick-chip glass rp${o.text ? "" : " other"}`}
                style={{ animationDelay: `${0.1 + i * 0.04}s` }}
                data-testid="quick-reply"
                onClick={(e) => {
                  addRipple(e);
                  const topic = actions.question?.topic;
                  if (topic) trackEvent("condition_answered", conditionProp(topic, o));
                  onReply(o.text);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {small.map((b) => (
        <a key={b.href} class="action-tel-link" href={b.href} data-testid="action-tel-link" onClick={() => trackClick("tel", b.label)}>
          {b.label}
          {b.sub ? `（${b.sub}）` : ""}
        </a>
      ))}
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
