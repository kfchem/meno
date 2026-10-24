import { useEffect, type RefObject } from "react";
import { isTextTarget } from "../../../../lib/doc/shortcuts";

/** What of the page's text selection is read: where it begins and ends, and whether it holds anything. */
type SelectionLike = { isCollapsed: boolean; anchorNode: unknown; focusNode: unknown };

/**
 * Whether the page's text selection reaches into `within` - begins or ends
 * there - and is to be let go: never while a text field has the keys, whose
 * own selection is its words'.
 */
export function selectionReaches(selection: SelectionLike | null, within: { contains(node: never): boolean } | null, typing: boolean): boolean {
  if (!selection || selection.isCollapsed || !within || typing) return false;
  const inside = (n: unknown) => n != null && within.contains(n as never);
  return inside(selection.anchorNode) || inside(selection.focusNode);
}

/**
 * The browser's own text selection kept off the canvas and what lies over
 * it - notes, chips, cards, a set's words - which are Meno's to select, not
 * the page's (they are `select-none` as well; this lets go of any that gets
 * there all the same: a drag begun beside them, a double or triple click, a
 * long press). Words in the column, and in text fields, stay selectable.
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
