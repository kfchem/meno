import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { DURATION, EASE } from "../theme/motion";
import { escapeTakes, numberDraft, numberField, rangeOf, rangeSaid, setAsItGoes, type NumberEvent } from "./number";

/** How long a refused number's field is marked, the number it went back to fading in. */
const REFUSED_MS = 1600;

/**
 * A number to type (docs/LOOK.md, Controls). While it is typed in it holds
 * any text, so that what is there can be put right a key at a time - the
 * first digit taken out and another typed; Enter or leaving it sets the
 * number, where it is one the field takes, and otherwise goes back to the
 * last good one, fading in, its border a moment in the colour of
 * attention (what it takes is said as the pointer rests on it). Escape goes back
 * to it - and, with nothing typed to take back, is left to close what the
 * field is in. Up and down step it (no browser steppers: a text field).
 */
export default function NumberField({
  value,
  onChange,
  label,
  min,
  max,
  step,
  whole,
  unsettable,
  placeholder,
  className,
  autoFocus = false,
}: {
  value: number;
  onChange: (n: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  /** A whole number alone, one with a fraction refused as one out of range is. */
  whole?: boolean;
  /** The number may be left unset: emptying the field says so (`onChange` is given NaN), and `value` NaN shows it empty. */
  unsettable?: boolean;
  /** What an empty field shows, dimmed: what unset comes to. */
  placeholder?: string;
  className?: string;
  /** Focused as it is first shown: where what it holds is asked for at once (a step's card opened to ask for it). */
  autoFocus?: boolean;
}) {
  const range = rangeOf({ min, max, step, whole, unsettable });
  const [draft, setDraft] = useState(() => numberDraft(value));
  const typing = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  // (asked for at once: the field taken as it is first shown - the page left where it is)
  useEffect(() => {
    if (autoFocus) field.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- (as it is first shown only)
  }, []);
  // (the number set from outside shown, except over what is being typed)
  useEffect(() => {
    if (!typing.current) setDraft(numberDraft(value));
  }, [value]);
  useEffect(() => {
    if (!draft.refused) return;
    const t = window.setTimeout(() => setDraft((d) => ({ ...d, refused: false })), REFUSED_MS);
    return () => window.clearTimeout(t);
  }, [draft.refused]);
  const go = (e: NumberEvent) => {
    const next = numberField({ ...draft, value }, e, range);
    setDraft(next);
    if (!Object.is(next.value, value)) onChange(next.value);
    if (next.refused) field.current?.animate?.([{ opacity: 0.2 }, { opacity: 1 }], { duration: DURATION.base * 1000, easing: `cubic-bezier(${EASE.join(",")})` });
  };
  // (gone while being typed in - its card or menu closed: what was typed set as leaving it sets it. WebView2 says the field
  // was left as it goes, WebKit not always: so that both set it alike)
  const last = useRef({ draft, value, onChange, range });
  last.current = { draft, value, onChange, range };
  useEffect(
    () => () => {
      const { draft: d, value: v, onChange: set, range: r } = last.current;
      const n = setAsItGoes({ ...d, value: v }, typing.current, r);
      if (n != null) set(n);
    },
    [],
  );
  return (
    <input
      ref={field}
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={draft.refused || undefined}
      title={rangeSaid(range) || undefined}
      value={draft.text}
      placeholder={draft.text === "" ? placeholder : undefined}
      spellCheck={false}
      autoComplete="off"
      onFocus={() => (typing.current = true)}
      onChange={(e) => go({ kind: "typed", text: e.target.value })}
      onBlur={() => {
        typing.current = false;
        go({ kind: "commit" });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") go({ kind: "commit" });
        else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          go({ kind: "step", by: e.key === "ArrowUp" ? 1 : -1 });
        } else if (e.key === "Escape" && escapeTakes(draft.text, value)) {
          // (what was typed taken back; the card it is in stays open)
          e.preventDefault();
          e.stopPropagation();
          go({ kind: "escape" });
        }
      }}
      className={clsx(
        "h-7 rounded-md border bg-white px-2 text-right tabular-nums text-gh-black outline-none transition-colors duration-150 ease-meno focus:ring-2 focus:ring-accel-lightbase",
        draft.refused ? "border-accel-accent" : "border-gh-line focus:border-accel-base",
        className,
      )}
    />
  );
}
