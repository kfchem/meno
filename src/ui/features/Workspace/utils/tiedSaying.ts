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

/**
 * A warning's words, the atoms (by id, in order) and bonds of what it is about as they were, where each lay in the drawing's
 * lists (`atomAt`, `bondAt`), how many bonds the drawing had (`bondsWere`), the drawing last looked at (`seen`), and whether
 * what it is about is not as it was now.
 */
export type Tied = {
  text: string;
  ids: readonly number[];
  atoms: readonly object[];
  atomAt: readonly number[];
  bonds: readonly object[];
  bondAt: readonly number[];
  bondsWere: number;
  seen: Drawn;
  hidden: boolean;
};

/** Where `t`'s atoms and bonds lie in `model`, looked for through the whole of it; null where one of them is not there as it was. */
function foundWhole(t: Pick<Tied, "ids" | "atoms" | "bonds">, model: Drawn): Pick<Tied, "atomAt" | "bondAt" | "bondsWere"> | null {
  const ids = new Set(t.ids);
  const atomAt = t.ids.map(() => -1);
  const slot = new Map(t.ids.map((id, i) => [id, i]));
  model.atoms.forEach((a, i) => {
    const k = slot.get(a.id);
    if (k != null) atomAt[k] = a === t.atoms[k] ? i : -1;
  });
  if (atomAt.some((i) => i < 0)) return null;
  const was = new Map(t.bonds.map((b, i) => [b, i]));
  const bondAt = t.bonds.map(() => -1);
  let n = 0;
  for (let i = 0; i < model.bonds.length; i++) {
    const b = model.bonds[i];
    if (!ids.has(b.a) && !ids.has(b.b)) continue;
    const k = was.get(b);
    if (k == null) return null;
    bondAt[k] = i;
    n++;
  }
  return n === t.bonds.length ? { atomAt, bondAt, bondsWere: model.bonds.length } : null;
}

/**
 * Whether what `t` is about is in `model` just as it was - the same atoms, the same bonds at them - and where (null: not so).
 * Looked at where they lay, and at the bonds put on after, so that it costs what the structure warned of costs, not the page:
 * the whole drawing is looked through only where an edit took things away or put them before them (the lists moved under them).
 */
function asItWas(t: Tied, model: Drawn): Pick<Tied, "atomAt" | "bondAt" | "bondsWere"> | null {
  let moved = model.bonds.length < t.bondsWere;
  for (let i = 0; i < t.ids.length && !moved; i++) {
    const a = model.atoms[t.atomAt[i]];
    if (a === t.atoms[i]) continue;
    // (the atom itself changed - moved, given another element: not as it was)
    if (a?.id === t.ids[i]) return null;
    moved = true;
  }
  for (let i = 0; i < t.bonds.length && !moved; i++) if (model.bonds[t.bondAt[i]] !== t.bonds[i]) moved = true;
  if (moved) return foundWhole(t, model);
  // (bonds put on since: one at an atom of it makes it another)
  const ids = new Set(t.ids);
  for (let i = t.bondsWere; i < model.bonds.length; i++) {
    const b = model.bonds[i];
    if (ids.has(b.a) || ids.has(b.b)) return null;
  }
  return t;
}

/** A warning about `atoms` of `model` as it is: null where there are none - a warning about nothing in particular, shown as it is. */
export function tiedTo(text: string, atoms: Iterable<number>, model: Drawn): Tied | null {
  const ids = [...new Set(atoms)];
  if (!ids.length) return null;
  const at = new Map(model.atoms.map((a, i) => [a.id, i]));
  const atomAt = ids.map((id) => at.get(id) ?? -1);
  const set = new Set(ids);
  const bondAt = model.bonds.flatMap((b, i) => (set.has(b.a) || set.has(b.b) ? [i] : []));
  return {
    text,
    ids,
    atoms: atomAt.map((i) => (i < 0 ? {} : model.atoms[i])),
    atomAt,
    bonds: bondAt.map((i) => model.bonds[i]),
    bondAt,
    bondsWere: model.bonds.length,
    seen: model,
    // (one of them gone already - said after an undo took it away: out of sight from the first)
    hidden: atomAt.some((i) => i < 0),
  };
}

/** What `t` is once the document has changed to `model`: shown only while what it is about is as it was. Nothing looked at for the drawing it has seen. */
export function tiedAfter(t: Tied, model: Drawn): Tied {
  if (model === t.seen) return t;
  const found = asItWas(t, model);
  const hidden = found == null;
  if (found === t) return hidden === t.hidden ? { ...t, seen: model } : { ...t, seen: model, hidden };
  return found ? { ...t, ...found, seen: model, hidden: false } : { ...t, seen: model, hidden: true };
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
      held.current = next;
      if (next.hidden !== t.hidden) setTied(next);
    });
  }, [doc, live]);
  return { shown: live && tied.hidden ? null : said, sayAbout };
}
