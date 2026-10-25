import { useEffect, type RefObject } from "react";
import { isTextTarget } from "../../../../lib/doc/shortcuts";

/** What of the page's text selection is read: where it begins and ends, whether it holds anything, and its words. */
type SelectionLike = { isCollapsed: boolean; anchorNode: unknown; focusNode: unknown; toString?: () => string };

/**
 * Words on the canvas that can be selected and copied all the same: a step
 * card's failure, a program's own line, a run's - what a chemist copies.
 * Spread on the element (with `select-text`).
 */
export const COPYABLE = { "data-copyable": "" } as const;

/** The words flagged `COPYABLE` that `node` lies in - their text - or none. */
function copyableOf(node: unknown): { textContent: string | null } | null {
  const n = node as { closest?: (s: string) => unknown; parentElement?: { closest(s: string): unknown } | null } | null;
  const el = (n?.closest ? n : n?.parentElement) as { closest?: (s: string) => unknown } | null | undefined;
  return (el?.closest?.("[data-copyable]") as { textContent: string | null } | null) ?? null;
}

/**
 * Whether the page's text selection reaches into `within` - begins or ends
 * there - and is to be let go: never while a text field has the keys, whose
 * own selection is its words', nor one wholly in words that can be copied
 * (`copyable`: both its ends in such words, or all it holds within them).
 */
export function selectionReaches(
  selection: SelectionLike | null,
  within: { contains(node: never): boolean } | null,
  typing: boolean,
  copyable: (node: unknown) => { textContent: string | null } | null = copyableOf,
): boolean {
  if (!selection || selection.isCollapsed || !within || typing) return false;
  const a = copyable(selection.anchorNode);
  const f = copyable(selection.focusNode);
  if (a && f) return false;
  // (a line clicked three times: its words, the selection ending at the start of what follows it - kept, as all it holds is the line's)
  const line = a ?? f;
  const words = selection.toString?.().trim();
  if (line?.textContent && words && line.textContent.includes(words)) return false;
  const inside = (n: unknown) => n != null && within.contains(n as never);
  return inside(selection.anchorNode) || inside(selection.focusNode);
}

/**
 * The browser's own text selection kept off the canvas and what lies over
 * it - notes, chips, cards, a set's words - which are Meno's to select, not
 * the page's (they are `select-none` as well; this lets go of any that gets
 * there all the same: a drag begun beside them, a double or triple click, a
 * long press). Words in the column, and in text fields, stay selectable -
 * and on the canvas those flagged `COPYABLE`.
 */
export function useKeepUnselected(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const onChange = () => {
      const selection = document.getSelection();
      if (selectionReaches(selection, ref.current, isTextTarget(document.activeElement))) selection?.removeAllRanges();
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [ref]);
}
