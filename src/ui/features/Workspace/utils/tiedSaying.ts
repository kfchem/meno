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
 * A warning's words; the atoms of what it is about (by id, in order), and where each lay in the drawing's list of atoms
 * (`atomAt`); its bonds - every bond at those atoms - as they were; the lists last looked at (`seenAtoms`, `seenBonds`); and
 * whether what it is about is not as it was now.
 */
export type Tied = {
  text: string;
  ids: readonly number[];
  /** The same ids, to be asked of each bond's ends. */
  idSet: ReadonlySet<number>;
  atoms: readonly object[];
  atomAt: readonly number[];
  bonds: ReadonlySet<object>;
  seenAtoms: Drawn["atoms"];
  seenBonds: Drawn["bonds"];
  hidden: boolean;
};

/**
 * Whether `t`'s atoms are in `atoms` as they were, and where (null: one is not). Looked at where they lay - what the structure
 * warned of costs, not the page - and the whole list looked through only where it moved under them (something taken away or
 * put in before them).
 */
function atomsAsTheyWere(t: Tied, atoms: Drawn["atoms"]): readonly number[] | null {
  let moved = false;
  for (let i = 0; i < t.ids.length; i++) {
    const a = atoms[t.atomAt[i]];
    if (a === t.atoms[i]) continue;
    // (the atom itself changed - moved, given another element: not as it was)
    if (a?.id === t.ids[i]) return null;
    moved = true;
    break;
  }
  if (!moved) return t.atomAt;
  const slot = new Map(t.ids.map((id, i) => [id, i]));
  const at = t.ids.map(() => -1);
  atoms.forEach((a, i) => {
    const k = slot.get(a.id);
    if (k != null && a === t.atoms[k]) at[k] = i;
  });
  return at.some((i) => i < 0) ? null : at;
}

/**
 * Whether the bonds at `t`'s atoms in `bonds` are its own bonds, all of them: one plain pass, nothing made - every edit
 * that puts a bond at them, takes one away or makes one anew, wherever in the list, is seen.
 */
function bondsAsTheyWere(t: Tied, bonds: Drawn["bonds"]): boolean {
  let n = 0;
  for (let i = 0; i < bonds.length; i++) {
    const b = bonds[i];
    if (!t.idSet.has(b.a) && !t.idSet.has(b.b)) continue;
    if (!t.bonds.has(b)) return false;
    n++;
  }
  return n === t.bonds.size;
}

/** A warning about `atoms` of `model` as it is: null where there are none - a warning about nothing in particular, shown as it is. */
export function tiedTo(text: string, atoms: Iterable<number>, model: Drawn): Tied | null {
  const ids = [...new Set(atoms)];
  if (!ids.length) return null;
  const at = new Map(model.atoms.map((a, i) => [a.id, i]));
  const atomAt = ids.map((id) => at.get(id) ?? -1);
  const set = new Set(ids);
  return {
    text,
    ids,
    idSet: set,
    atoms: atomAt.map((i) => (i < 0 ? {} : model.atoms[i])),
    atomAt,
    bonds: new Set<object>(model.bonds.filter((b) => set.has(b.a) || set.has(b.b))),
    seenAtoms: model.atoms,
    seenBonds: model.bonds,
    // (one of them gone already - said after an undo took it away: out of sight from the first)
    hidden: atomAt.some((i) => i < 0),
  };
}

/**
 * What `t` is once the document has changed to `model`: shown only while what it is about is as it was. Lists already looked at
 * are not looked at again: the same two, `t` as it is; the same bonds, its atoms alone; the same atoms, its bonds alone.
 */
export function tiedAfter(t: Tied, model: Drawn): Tied {
  const sameAtoms = model.atoms === t.seenAtoms;
  const sameBonds = model.bonds === t.seenBonds;
  if (sameAtoms && sameBonds) return t;
  // (what was seen not as it was, looked at again whole: an undo or a redo may bring it back)
  const atomAt = sameAtoms && !t.hidden ? t.atomAt : atomsAsTheyWere(t, model.atoms);
  const bondsKept = sameBonds && !t.hidden ? true : atomAt != null && bondsAsTheyWere(t, model.bonds);
  const hidden = atomAt == null || !bondsKept;
  return { ...t, atomAt: atomAt ?? t.atomAt, seenAtoms: model.atoms, seenBonds: model.bonds, hidden };
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
