import { useEffect, useMemo } from "react";
import { captionSet, withWordsNeed, wordsNeed, type ArrowWords } from "../../../../lib/chem/captions";
import { labelSetOf, type LabelSet } from "../../../../lib/chem/layout2d";
import { useEditor, useEditorStore } from "../store";
import type { Arrow, EditorState } from "../store/types";
import { useDrawnLayout } from "./drawnLayoutContext";

/*
 * The reaction arrows as they are drawn: each as long as it was made, or as
 * long as the words over it and under it need, its middle where it is
 * (lib/chem/captions `wordsNeed`) - the words being written as they are
 * written, in place of their caption's own.
 */

/** The words over arrows, set as the canvas sets them - but the caption `except`. */
function wordsOver(captions: EditorState["captions"], fontSize: number, set: LabelSet, except?: number | null): ArrowWords[] {
  return captions
    .filter((c) => c.arrow != null && c.id !== except)
    .map((c) => {
      const s = captionSet(c.text, c.x, c.y, fontSize, set, c.width, c.align);
      return { arrow: c.arrow, x: c.x, y: c.y, halfW: s.halfW, halfH: s.halfH };
    });
}

/** The arrows as they are drawn, with the words being written - in place of those of the caption `editing`, if any. */
export function drawnArrows(s: Pick<EditorState, "arrows" | "captions" | "wordsWriting">, editing: number | null, fontSize: number, set: LabelSet): Arrow[] {
  const writing = s.wordsWriting;
  const words = wordsOver(s.captions, fontSize, set, writing ? editing : null);
  if (writing) words.push(writing);
  return withWordsNeed(s.arrows, wordsNeed(s.arrows, words, fontSize));
}

/**
 * The arrows as they are drawn with every caption's words but those of
 * `except` - words being put down or written, which are then placed by
 * them (lib/chem/captions `captionPlace`) and not by themselves.
 */
export function arrowsBeside(s: Pick<EditorState, "arrows" | "captions">, fontSize: number, set: LabelSet, except?: number | null): Arrow[] {
  return withWordsNeed(s.arrows, wordsNeed(s.arrows, wordsOver(s.captions, fontSize, set, except), fontSize));
}

/** The arrows as they are drawn (`drawnArrows`), for the drawing as it stands. */
export function useDrawnArrows(): Arrow[] {
  const arrows = useEditor((s) => s.arrows);
  const captions = useEditor((s) => s.captions);
  const wordsWriting = useEditor((s) => s.wordsWriting);
  const editing = useEditor((s) => s.captionEdit?.id ?? null);
  const { opts } = useDrawnLayout();
  const set = useMemo(() => labelSetOf(opts), [opts]);
  return useMemo(
    () => drawnArrows({ arrows, captions, wordsWriting }, editing, opts.fontPx, set),
    [arrows, captions, wordsWriting, editing, opts.fontPx, set],
  );
}

/** Words being written over an arrow, or to go over one - `words`, of writing `n` - told to the arrows as they change, and gone as they go. */
export function useWordsWriting(words: (ArrowWords & { arrow: number }) | null, n: number) {
  const store = useEditorStore();
  const { arrow, x, y, halfW, halfH } = words ?? {};
  useEffect(() => {
    if (arrow == null || x == null || y == null || halfW == null || halfH == null) store.getState().setWordsWriting(null, n);
    else store.getState().setWordsWriting({ arrow, x, y, halfW, halfH, n }, n);
  }, [store, n, arrow, x, y, halfW, halfH]);
  useEffect(() => () => store.getState().setWordsWriting(null, n), [store, n]);
}
