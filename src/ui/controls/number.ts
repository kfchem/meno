import { typedValue } from "../features/Workspace/utils/typedValue";

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

/** A number field showing `value`. */
export function numberDraft(value: number): NumberDraft {
  return { text: String(value), value, refused: false };
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
 * time; Enter or leaving it takes the text as a number (a true minus or a
 * comma read as well) where it is one `range` takes, and otherwise goes
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
      const n = typedValue(d.text);
      if (inRange(n, range)) return numberDraft(n);
      return { ...numberDraft(d.value), refused: d.text !== String(d.value) };
    }
    case "step": {
      const step = range.step ?? 1;
      const from = typedValue(d.text);
      const n = (Number.isFinite(from) ? from : d.value) + e.by * step;
      // (to as many places as the step has, so that 0.1 and 0.2 add to 0.3)
      const places = (String(step).split(".")[1] ?? "").length;
      const stepped = Number(n.toFixed(places));
      const held = Math.min(range.max ?? Infinity, Math.max(range.min ?? -Infinity, stepped));
      return numberDraft(held);
    }
  }
}
