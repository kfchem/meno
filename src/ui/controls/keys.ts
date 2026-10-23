/** How the keys move through Meno's own controls (src/ui/controls). */

/**
 * Where the lit row of an open list goes for a key: one up or down (held at
 * the ends), the first or the last, or the next whose name begins with a
 * letter typed - from the one after the lit one, round to the start. Null
 * for a key that moves nothing.
 */
export function nextLit(key: string, lit: number, labels: readonly string[]): number | null {
  const n = labels.length;
  if (!n) return null;
  if (key === "ArrowDown") return Math.min(n - 1, lit + 1);
  if (key === "ArrowUp") return Math.max(0, lit - 1);
  if (key === "Home" || key === "PageUp") return 0;
  if (key === "End" || key === "PageDown") return n - 1;
  if (key.length !== 1 || !/\S/.test(key)) return null;
  const k = key.toLowerCase();
  for (let step = 1; step <= n; step++) {
    const i = (lit + step) % n;
    if (labels[i].toLowerCase().startsWith(k)) return i;
  }
  return null;
}

/**
 * The choice an arrow key goes to in a radio group: the next or the one
 * before, round from the ends; the first or the last. Null for a key that
 * moves nothing.
 */
export function nextChoice(key: string, at: number, count: number): number | null {
  if (!count) return null;
  if (key === "ArrowDown" || key === "ArrowRight") return (at + 1) % count;
  if (key === "ArrowUp" || key === "ArrowLeft") return (at - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** A key pressed, as much of it as the controls read and answer. */
export type Pressed = {
  key: string;
  defaultPrevented?: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
};

/**
 * What a key does in an open list (Select), its moves its own: Escape
 * closes it, focus back on its button; Tab closes it too, focus back on the
 * button so that Tab goes on from there, not from the list at the end of
 * the page; Enter or Space chooses the lit row; an arrow, Home, End or a
 * letter lights another. A key it answers goes no further - not to a card's
 * own Escape behind it, which would let the card go with what was chosen
 * in it - as the browser's own pull-down keeps its keys.
 */
export function listKey(
  e: Pressed,
  lit: number,
  labels: readonly string[],
  does: { close: (back: boolean) => void; choose: (i: number) => void; light: (i: number) => void },
): void {
  if (e.key === "Tab") {
    does.close(true);
    return;
  }
  const answer = (act: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    act();
  };
  if (e.key === "Escape") return answer(() => does.close(true));
  if (e.key === "Enter" || e.key === " ") return answer(() => does.choose(lit));
  const next = nextLit(e.key, lit, labels);
  if (next != null) answer(() => does.light(next));
}

/** Whether a key on a Select's button opens its list. */
export function opensList(key: string): boolean {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ";
}

/**
 * Whether an Escape is left for a card behind to answer (let it go): not one
 * a control in it has answered already, an open list closed by it.
 */
export function escapeLeft(e: Pick<Pressed, "key" | "defaultPrevented">): boolean {
  return e.key === "Escape" && !e.defaultPrevented;
}

/**
 * What a key does on a checkbox: Enter nothing - the browser's checkbox
 * turns on Space or a press, never on Enter, and one that accepts a warning
 * must be turned on purpose - so that Enter goes on to what holds it.
 */
export function checkboxKey(e: Pressed): void {
  if (e.key === "Enter") e.preventDefault();
}

/**
 * Whether Enter pressed on this answers for itself: a button does, a
 * checkbox - though Meno draws it as a button - does not.
 */
export function answersEnter(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; getAttribute?: (name: string) => string | null } | null;
  return el?.tagName === "BUTTON" && el.getAttribute?.("role") !== "checkbox";
}
