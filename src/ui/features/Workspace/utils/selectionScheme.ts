import { schemeAmong } from "./copyPaste";
import { selectedOf } from "../store/slices/selectionSlice";
import type { EditorStore } from "../store";
import type { Arrow, Caption, EditorState, Plus } from "../store/types";

type Of = Pick<EditorState, "model" | "sel" | "arrows" | "pluses" | "captions" | "selArrows" | "selPluses" | "selCaptions">;

/**
 * The arrows, "+" signs and words a selection carries as it is moved,
 * turned, turned over, copied, cut or deleted (docs/EDITOR-2D.md, *What is
 * done to a selection*): those among its atoms (`atoms`, the selection's
 * unless said), as a reaction's are; those selected for themselves - an
 * arrow standing alone on a slide, pointing at something; and the words
 * over any arrow it takes - each once, however it came.
 */
export function selectionScheme(st: Of, atoms: Set<number> = st.sel.atoms): { arrows: Arrow[]; pluses: Plus[]; captions: Caption[] } {
  const among = schemeAmong({ ...st.model, arrows: st.arrows, pluses: st.pluses, captions: st.captions }, atoms);
  const arrowIds = new Set([...among.arrows.map((a) => a.id), ...st.selArrows]);
  const plusIds = new Set([...among.pluses.map((p) => p.id), ...st.selPluses]);
  const wordIds = new Set([...among.captions.map((c) => c.id), ...st.selCaptions]);
  return {
    arrows: st.arrows.filter((a) => arrowIds.has(a.id)),
    pluses: st.pluses.filter((p) => plusIds.has(p.id)),
    captions: st.captions.filter((c) => wordIds.has(c.id) || (c.arrow != null && arrowIds.has(c.arrow))),
  };
}

/** Whether the arrow or "+" `id` is carried by a selection that holds more than it: a press on it then takes all of it, as on a picture selected with more. */
export function carriedWithMore(store: EditorStore, kind: "arrow" | "plus", id: number): boolean {
  const st = store.getState();
  const carried = selectionScheme(st);
  const mine = kind === "arrow" ? carried.arrows : carried.pluses;
  if (!mine.some((x) => x.id === id)) return false;
  const others = selectedOf({ ...st, selArrows: new Set(), selPluses: new Set() }).any;
  return others || carried.arrows.length + carried.pluses.length > 1;
}
