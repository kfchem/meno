/** The numbers a field takes: from `min` to `max`, each where given; `step` what an arrow key adds or takes away. */
export type NumberRange = { min?: number; max?: number; step?: number };

/**
 * A number field as it is (NumberField): the text in it, the last good
 * number - what it stands for - and whether what was typed was just
 * refused, going back to that number.
 */
export type NumberDraft = { text: string; value: number; refused: boolean };

/** What happens to a number field: a key typed, Enter or leaving it, Escape, an arrow key, or the number set from outside. */
export type NumberEvent =
  | { kind: "typed"; text: string }
  | { kind: "commit" }
  | { kind: "escape" }
  | { kind: "step"; by: 1 | -1 }
  | { kind: "set"; value: number };

/** What a number field shows of `value`: nothing, where there is none. */
function shown(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

/** A number field showing `value`. */
export function numberDraft(value: number): NumberDraft {
  return { text: shown(value), value, refused: false };
}

/**
 * A number as typed: digits, a decimal point or comma, a sign (a true
 * minus too), an exponent - and nothing else, so that what Number() would
 * read by its own rules (0x10, 0b11, " ", Infinity) is none. A comma with
 * three digits after it and digits before (1,000) may be a thousands'
 * separator, not a decimal one: none either, rather than read as 1. NaN
 * where it is none.
 */
export function typedNumber(text: string): number {
  const t = text.trim();
  if (!/^[+\-\u2212]?\d*[.,]?\d*(?:e[+-]?\d+)?$/i.test(t) || !/\d/.test(t.replace(/e.*$/i, ""))) return NaN;
  if (/^[+\-\u2212]?\d+,\d{3}$/.test(t)) return NaN;
  return Number(t.replace("\u2212", "-").replace(",", "."));
}

/** How many decimal places `n` has as written (none past the tenth, nor for one written with an exponent). */
function placesOf(n: number): number {
  const s = String(n);
  return s.includes("e") ? 0 : Math.min(10, (s.split(".")[1] ?? "").length);
}

/** Whether `n` is a number `range` takes. */
function inRange(n: number, { min, max }: NumberRange): boolean {
  return Number.isFinite(n) && (min == null || n >= min) && (max == null || n <= max);
}

/** The numbers `range` takes, said: "From 1 to 100", "At least 0", "At most 5" - or nothing, where any is. */
export function rangeSaid({ min, max }: NumberRange): string {
  if (min != null && max != null) return `From ${min} to ${max}`;
  if (min != null) return `At least ${min}`;
  if (max != null) return `At most ${max}`;
  return "";
}

/**
 * The field after `e`. While it is typed in it holds any text - nothing,
 * a minus alone, "1." - so that what is there can be put right a key at a
 * time; Enter or leaving it takes the text as a number (`typedNumber`)
 * where it is one `range` takes, and otherwise goes
 * back to the last good one, refused. Escape goes back to it unrefused; an
 * arrow key steps from what is there, within the range.
 */
export function numberField(d: NumberDraft, e: NumberEvent, range: NumberRange = {}): NumberDraft {
  switch (e.kind) {
    case "typed":
      return { ...d, text: e.text, refused: false };
    case "set":
      return numberDraft(e.value);
    case "escape":
      return numberDraft(d.value);
    case "commit": {
      const n = typedNumber(d.text);
      if (inRange(n, range)) return numberDraft(n);
      return { ...numberDraft(d.value), refused: d.text !== shown(d.value) };
    }
    case "step": {
      const step = range.step ?? 1;
      const typed = typedNumber(d.text);
      const from = Number.isFinite(typed) ? typed : Number.isFinite(d.value) ? d.value : (range.min ?? 0);
      const n = from + e.by * step;
      // (to as many places as the step or the number has, the more: 0.1 and 0.2 add to 0.3, and 0.25 and 1 to 1.25)
      const places = Math.max(placesOf(step), placesOf(from));
      const stepped = Number(n.toFixed(places));
      const held = Math.min(range.max ?? Infinity, Math.max(range.min ?? -Infinity, stepped));
      return numberDraft(held);
    }
  }
}

/**
 * The number to set as a field goes while it is typed in (`typing`) - its
 * card or menu closed: what leaving it would set, where that is another
 * than it stands for; none otherwise (nothing typed, or nothing it takes).
 */
export function setAsItGoes(d: NumberDraft, typing: boolean, range: NumberRange = {}): number | null {
  if (!typing) return null;
  const next = numberField(d, { kind: "commit" }, range);
  return Object.is(next.value, d.value) ? null : next.value;
}
