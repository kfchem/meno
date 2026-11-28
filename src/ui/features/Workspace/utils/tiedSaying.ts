/**
 * A warning in the line over the canvas about a structure, tied to it as it
 * was when the warning was said: shown while the structure is just so, out
 * of sight once it is not - taken away by an undo, deleted, or changed by
 * any edit to its atoms or their bonds - and shown again as an undo or a
 * redo brings it back as it was, with nothing said of its own about either.
 * A warning about no atoms is tied to nothing, and shown as any other.
 * Plain, to be tested without a page; the line itself is utils/alerts.
 *
 * "As it was" is told by the very atoms and bonds of the drawing as it was
 * said - the document's edits make anew what they change and keep what
 * they leave, and an undo or a redo brings back the drawing it held - so it
 * is a look-up by id and a comparison of objects, as the document changes,
 * and no chemistry.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentStore } from "../../../../lib/doc/document";
import type { WorkspaceDocument } from "../document";

type Drawn = { atoms: readonly { id: number }[]; bonds: readonly { a: number; b: number }[] };

/** A warning's words, the atoms (by id, in order) and bonds of what it is about as they were, and whether they are not so now. */
export type Tied = { text: string; ids: readonly number[]; atoms: readonly object[]; bonds: ReadonlySet<object>; hidden: boolean };

/** Whether what `t` is about is in `model` just as it was: the same atoms, and the same bonds at them. */
function asItWas(t: Tied, model: Drawn): boolean {
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  if (t.ids.some((id, i) => byId.get(id) !== t.atoms[i])) return false;
  const ids = new Set(t.ids);
  let n = 0;
  for (const b of model.bonds) {
    if (!ids.has(b.a) && !ids.has(b.b)) continue;
    if (!t.bonds.has(b)) return false;
    n++;
  }
  return n === t.bonds.size;
}

/** A warning about `atoms` of `model` as it is: null where there are none - a warning about nothing in particular, shown as it is. */
export function tiedTo(text: string, atoms: Iterable<number>, model: Drawn): Tied | null {
  const ids = [...new Set(atoms)];
  if (!ids.length) return null;
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const found = ids.map((id) => byId.get(id));
  const set = new Set(ids);
  const bonds = new Set<object>(model.bonds.filter((b) => set.has(b.a) || set.has(b.b)));
  // (one of them gone already - said after an undo took it away: out of sight from the first)
  return { text, ids, atoms: found.map((a) => a ?? {}), bonds, hidden: found.some((a) => !a) };
}

/** What `t` is once the document has changed to `model`: shown only while what it is about is as it was. */
export function tiedAfter(t: Tied, model: Drawn): Tied {
  const hidden = !asItWas(t, model);
  return hidden === t.hidden ? t : { ...t, hidden };
}

/**
 * The chemistry's line (`said`, `setSaid`) with warnings tied to what they
 * are about (`sayAbout`): `shown`, what the line shows now - nothing while
 * the one said is out of sight. Any other words put in the line, or none
 * (its X), end the tie.
 */
export function useTiedSaying(
  doc: DocumentStore<WorkspaceDocument> | undefined,
  said: string | null,
  setSaid: (text: string | null) => void,
): { shown: string | null; sayAbout: (text: string, atoms: Iterable<number>) => void } {
  const [tied, setTied] = useState<Tied | null>(null);
  const held = useRef(tied);
  held.current = tied;
  const sayAbout = useCallback(
    (text: string, atoms: Iterable<number>) => {
      setTied(doc ? tiedTo(text, atoms, doc.getState().model) : null);
      setSaid(text);
    },
    [doc, setSaid],
  );
  const live = tied != null && tied.text === said;
  useEffect(() => {
    if (!doc || !live) return;
    return doc.subscribe(() => {
      const t = held.current;
      if (!t) return;
      const next = tiedAfter(t, doc.getState().model);
      if (next !== t) setTied(next);
    });
  }, [doc, live]);
  return { shown: live && tied.hidden ? null : said, sayAbout };
}
