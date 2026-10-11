/**
 * A text read in the column, as both its halves have it (docs/PDF.md,
 * *One canvas*): its body in HTML (TextBody) takes the pointer, the wheel
 * and the keys, and the canvas draws it in the column's pass (ColumnText),
 * each from the same editor. Kept for each workspace's store, a text at a
 * time, by its id, so that a text gone back to is where it was left. A
 * Markdown text is read formatted (MarkdownBody, MarkdownText), from its
 * reader, unless its source is asked for.
 */
import { useSyncExternalStore } from "react";
import { Editor } from "./editor";
import { MarkdownReader } from "./markdownReader";
import { LINE_PX } from "./linePictures";

/** A text's editor - and, read formatted, its reader - and how to ask the canvas to draw it again. */
export type ColumnTextEntry = { ed: Editor; redraw: () => void; reader?: MarkdownReader };

const kept = new WeakMap<object, Map<number, ColumnTextEntry>>();

/** A text's editor in a workspace - made, from its text, the first time it is asked for. */
export function columnText(store: object, id: number, text: string): ColumnTextEntry {
  let all = kept.get(store);
  if (!all) kept.set(store, (all = new Map()));
  let e = all.get(id);
  if (!e) all.set(id, (e = { ed: new Editor(text), redraw: () => {} }));
  return e;
}

/** A Markdown text's reader, formatted - made, from its text, the first time it is asked for. */
export function markdownReaderOf(entry: ColumnTextEntry, text: string): MarkdownReader {
  return (entry.reader ??= new MarkdownReader(text));
}

/** The texts a workspace no longer holds, let go. */
export function keepColumnTexts(store: object, ids: readonly number[]): void {
  const all = kept.get(store);
  if (!all) return;
  for (const id of all.keys()) if (!ids.includes(id)) all.delete(id);
  const shown = sources.get(store);
  if (shown) for (const id of shown) if (!ids.includes(id)) shown.delete(id);
}

// --- a Markdown text's source shown -----------------------------------------

const sources = new WeakMap<object, Set<number>>();
const told = new Set<() => void>();
let version = 0;

/** Whether a Markdown text is shown as its source, to be written, not formatted. */
export const showsSource = (store: object, id: number) => !!sources.get(store)?.has(id);

/** A Markdown text shown as its source, or formatted again: where it was read kept, in either. */
export function setShowsSource(store: object, id: number, on: boolean, text: string): void {
  if (showsSource(store, id) === on) return;
  let shown = sources.get(store);
  if (!shown) sources.set(store, (shown = new Set()));
  const e = columnText(store, id, text);
  const r = markdownReaderOf(e, text);
  if (on) {
    // (the source's line where the words read at the top begin, at its top)
    const line = e.ed.lines.at(Math.min(r.topSrc(), e.ed.text.length));
    e.ed.scrollTo(line * LINE_PX);
    shown.add(id);
  } else {
    r.setText(e.ed.text);
    const line = Math.min(e.ed.lines.count - 1, Math.floor(e.ed.scrollTop / LINE_PX));
    r.scrollToSrc(e.ed.lines.start(Math.max(0, line)));
    shown.delete(id);
  }
  version++;
  for (const f of told) f();
  e.redraw();
}

/** Whether a Markdown text is shown as its source, as it changes. */
export function useShowsSource(store: object, id: number | null): boolean {
  useSyncExternalStore(
    (f) => {
      told.add(f);
      return () => told.delete(f);
    },
    () => version,
  );
  return id != null && showsSource(store, id);
}
