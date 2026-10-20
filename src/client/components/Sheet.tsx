import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

interface Props {
  label: string;
  onClose: () => void;
  children: ComponentChildren;
  testId?: string;
}

export function Sheet({ label, onClose, children, testId }: Props) {
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);

  const close = () => {
    setLeaving(true);
    setTimeout(onClose, 260);
  };

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Swipe down to dismiss
  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, textarea")) return;
    drag.current = { y: e.clientY, dy: 0 };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
    ref.current.style.transition = "none";
  };
  const onPointerUp = () => {
    if (!drag.current || !ref.current) return;
    const { dy } = drag.current;
    drag.current = null;
    ref.current.style.transition = "transform .45s cubic-bezier(.34,1.56,.64,1)";
    if (dy > 90) close();
    else ref.current.style.transform = "";
  };

  return (
    <>
      <div class={`scrim${leaving ? " out" : ""}`} onClick={close} />
      <div
        ref={ref}
        class={`sheet glass${leaving ? " out" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-testid={testId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div class="grab" />
        {children}
      </div>
    </>
  );
}
