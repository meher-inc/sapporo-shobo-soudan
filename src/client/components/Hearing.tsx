import { useEffect, useMemo, useState } from "preact/hooks";
import {
  HOLDER_LABEL,
  THIRD_PARTY,
  hearingDefs,
  requestDraft,
  sectionsOf,
  summarize,
  type HearingAnswers,
  type HearingType,
  type Holder,
  type Item,
} from "../../hearing/hearing";
import { loadHearing } from "../api";

type Step = "type" | "items" | "docs";

const HOLDERS = Object.keys(HOLDER_LABEL) as Holder[];

interface Props {
  escalationId: string;
  value: HearingAnswers | null;
  onChange: (a: HearingAnswers) => void;
  /** 連絡先の入力へ進む。null は「ヒアリングを飛ばして連絡先だけ送る」 */
  onDone: (a: HearingAnswers | null) => void;
}

/**
 * 行政書士に依頼する前のヒアリング。届出の種類 → 建物・時期などの項目 → 資料の持ち主、の順に一度で聞く。
 * 顧客以外が持っている資料は、その相手に送る依頼文の下書きをその場で出す。
 */
export function Hearing({ escalationId, value, onChange, onDone }: Props) {
  // 連絡先の画面から戻ったときは、最後の資料の画面から続ける
  const [step, setStep] = useState<Step>(value ? "docs" : "type");
  const [loading, setLoading] = useState(value === null);
  const a = value ?? { type: "other" as HearingType, values: {}, docs: {} };

  useEffect(() => {
    if (value) return;
    let alive = true;
    loadHearing(escalationId)
      .then((p) => alive && onChange({ type: p.type, values: p.values, docs: {} }))
      .catch(() => alive && onChange({ type: "other", values: {}, docs: {} }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [escalationId]);

  const sections = sectionsOf(a.type);
  const factSections = sections.map((s) => ({ ...s, items: s.items.filter((i) => i.kind !== "doc") })).filter((s) => s.items.length);
  const docItems = sections.flatMap((s) => s.items.filter((i) => i.kind === "doc"));
  const missing = factSections.flatMap((s) => s.items).filter((i) => i.required && !a.values[i.id]?.trim());
  const summary = useMemo(() => summarize(a, Date.now()), [a]);

  const setValue = (id: string, v: string) => onChange({ ...a, values: { ...a.values, [id]: v } });
  const setHolder = (id: string, holder: Holder) =>
    onChange({ ...a, docs: { ...a.docs, [id]: THIRD_PARTY.includes(holder) ? { ...a.docs[id], holder } : { holder } } });
  const setWhen = (id: string, when: string) => onChange({ ...a, docs: { ...a.docs, [id]: { ...a.docs[id], when } } });
  const go = (s: Step) => {
    const run = () => {
      setStep(s);
      document.querySelector(".sheet")?.scrollTo({ top: 0 });
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (doc.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(run);
    else run();
  };

  const stepNo = { type: 1, items: 2, docs: 3 }[step];

  return (
    <div class="hearing stagger" data-testid="hearing" data-step={step} key={step}>
      <p class="hearing-step">
        {stepNo} / 4 ・ {step === "type" ? "届出の種類" : step === "items" ? "建物と届出の内容" : "資料"}
      </p>

      {step === "type" && (
        <>
          <h2>どの届出のご依頼ですか</h2>
          <p class="hearing-lead">最初にまとめて伺うと、行政書士からの聞き直しが減り、早く着手できます。分からない項目は「分からない」で構いません。</p>
          {loading ? (
            <div class="sk sk-row" />
          ) : (
            <div class="hearing-types" role="radiogroup" aria-label="届出の種類">
              {hearingDefs().map((d) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={a.type === d.type}
                  class={`hearing-type glass${a.type === d.type ? " on" : ""}`}
                  data-testid="hearing-type"
                  data-type={d.type}
                  onClick={() => d.type !== a.type && onChange({ ...a, type: d.type, docs: {} })}
                >
                  <strong>{d.label}</strong>
                  <span>{d.sub}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" class="btn btn-primary rp" data-testid="hearing-next" disabled={loading} onClick={() => go("items")}>
            次へ
          </button>
          <button type="button" class="hearing-skip" data-testid="hearing-skip" onClick={() => onDone(null)}>
            連絡先だけ送る
          </button>
        </>
      )}

      {step === "items" && (
        <>
          <h2>建物と届出の内容を教えてください</h2>
          {factSections.map((s) => (
            <fieldset class="hearing-section">
              <legend>{s.title}</legend>
              {s.items.map((item) => (
                <Field item={item} value={a.values[item.id] ?? ""} onChange={(v) => setValue(item.id, v)} />
              ))}
            </fieldset>
          ))}
          {summary.alerts.length > 0 && (
            <div class="hearing-alerts" data-testid="hearing-alerts">
              {summary.alerts.map((x) => (
                <p>{x}</p>
              ))}
            </div>
          )}
          <div class="hearing-nav">
            <button type="button" class="btn btn-ghost rp" onClick={() => go("type")}>
              戻る
            </button>
            <button type="button" class="btn btn-primary rp" data-testid="hearing-next" disabled={missing.length > 0} onClick={() => go("docs")}>
              次へ
            </button>
          </div>
          {missing.length > 0 && <p class="terms">必須：{missing.map((i) => i.label).join("、")}</p>}
        </>
      )}

      {step === "docs" && (
        <>
          <h2>資料はどなたがお持ちですか</h2>
          <p class="hearing-lead">お手元にない資料は、持っている方を選んでください。その方に送る依頼文の下書きを作ります。</p>
          {docItems.map((item) => {
            const d = a.docs[item.id];
            return (
              <fieldset class="hearing-section hearing-doc" data-testid="hearing-doc" data-id={item.id}>
                <legend>{item.label}</legend>
                <div class="hearing-chips">
                  {HOLDERS.map((h) => (
                    <button
                      type="button"
                      class={`hearing-chip${d?.holder === h ? " on" : ""}`}
                      aria-pressed={d?.holder === h}
                      data-testid="hearing-holder"
                      data-holder={h}
                      onClick={() => setHolder(item.id, h)}
                    >
                      {HOLDER_LABEL[h]}
                    </button>
                  ))}
                </div>
                {d && THIRD_PARTY.includes(d.holder) && (
                  <input
                    class="hearing-when"
                    maxLength={60}
                    placeholder="いつ頃もらえそうか（任意）例：来週中"
                    value={d.when ?? ""}
                    onInput={(e) => setWhen(item.id, (e.target as HTMLInputElement).value)}
                  />
                )}
              </fieldset>
            );
          })}
          {summary.byHolder
            .filter((g) => THIRD_PARTY.includes(g.holder))
            .map((g) => (
              <Draft holder={g.holder} text={requestDraft(g.holder, g.docs, a)} />
            ))}
          <div class="hearing-nav">
            <button type="button" class="btn btn-ghost rp" onClick={() => go("items")}>
              戻る
            </button>
            <button type="button" class="btn btn-primary rp" data-testid="hearing-next" onClick={() => onDone(a)}>
              次へ
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ item, value, onChange }: { item: Item; value: string; onChange: (v: string) => void }) {
  const label = (
    <span class="hearing-label">
      {item.label}
      {item.required && <em>必須</em>}
    </span>
  );
  if (item.kind === "choice") {
    return (
      <div class="hearing-field" data-testid="hearing-field" data-id={item.id}>
        {label}
        <div class="hearing-chips" role="radiogroup" aria-label={item.label}>
          {item.options!.map((o) => (
            <button
              type="button"
              role="radio"
              aria-checked={value === o}
              class={`hearing-chip${value === o ? " on" : ""}`}
              data-testid="hearing-option"
              onClick={() => onChange(value === o ? "" : o)}
            >
              {o}
            </button>
          ))}
        </div>
        {item.hint && <small>{item.hint}</small>}
      </div>
    );
  }
  return (
    <label class="hearing-field" data-testid="hearing-field" data-id={item.id}>
      {label}
      <input
        type={item.kind === "date" ? "date" : "text"}
        maxLength={300}
        value={value}
        placeholder={item.placeholder}
        required={item.required}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
      {item.hint && <small>{item.hint}</small>}
    </label>
  );
}

function Draft({ holder, text }: { holder: Holder; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div class="hearing-draft glass" data-testid="hearing-draft" data-holder={holder}>
      <div class="hearing-draft-head">
        <strong>{HOLDER_LABEL[holder]}への依頼文</strong>
        <button
          type="button"
          class="hearing-copy"
          onClick={() =>
            navigator.clipboard
              ?.writeText(text)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              })
              .catch(() => {})
          }
        >
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}
