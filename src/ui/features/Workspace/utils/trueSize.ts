import { centreOf, magnifiedOfAtom, structuresOf } from "../../../../lib/chem/magnified2d";
import type { WorkspaceDocument } from "../document";
import type { Atom } from "../store/types";

type Pt = { x: number; y: number };
/** How a structure shown magnified is held: about where, and how many times as large. */
type Frame = { c: Pt; k: number };

/**
 * An edit to the drawing done at true size (docs/WORKSPACE.md, *Magnified
 * display*): what it draws - a bond, a chain, a ring, a structure added -
 * is drawn at the style's bond length, as on a structure at 100 %, and then
 * shown as large as the structure it was drawn on is shown. Each structure
 * shown magnified is taken to its true size about its centre, the edit is
 * done there - points the pointer gave taken there too (`toTrue`) - and
 * each structure it leaves is shown again about the same centre, as large
 * as the structure it was drawn from (`from`, an atom's id) where it holds
 * that atom, else as most of its atoms were. So an edit on a structure at
 * k is the edit at 1, k times as large about its centre.
 */
export function editAtTrueSize(
  doc: WorkspaceDocument,
  edit: (d: WorkspaceDocument, toTrue: (p: Pt) => Pt) => WorkspaceDocument,
  from?: number | null,
): WorkspaceDocument {
  const atoms = doc.model.atoms;
  if (!atoms.some((a) => magnifiedOfAtom(a) !== 1)) return edit(doc, (p) => p);
  // each structure shown magnified, at its true size about its centre
  const frames = new Map<number, Frame>();
  const trueAtoms = [...atoms];
  for (const group of structuresOf(atoms, doc.model.bonds)) {
    const k = magnifiedOfAtom(atoms[group[0]]);
    if (k === 1) continue;
    const c = centreOf(group.map((i) => atoms[i]));
    for (const i of group) {
      const a = atoms[i];
      frames.set(a.id, { c, k });
      const { magnified: _was, ...rest } = a;
      trueAtoms[i] = { ...rest, x: c.x + (a.x - c.x) / k, y: c.y + (a.y - c.y) / k };
    }
  }
  // (a point the pointer gave, on the structure the edit is drawn from: there at its true size)
  const own = from != null ? frames.get(from) : undefined;
  const toTrue = (p: Pt): Pt => (own ? { x: own.c.x + (p.x - own.c.x) / own.k, y: own.c.y + (p.y - own.c.y) / own.k } : p);
  const given = { ...doc, model: { ...doc.model, atoms: trueAtoms } };
  const done = edit(given, toTrue);
  // (nothing done: the drawing as it was)
  if (done === given) return doc;
  if (done.model === given.model) return { ...done, model: doc.model };
  // each structure it leaves, shown again as large as before - the one drawn from as that one was
  const out = [...done.model.atoms];
  for (const group of structuresOf(done.model.atoms, done.model.bonds)) {
    const ids = group.map((i) => done.model.atoms[i].id);
    let frame = from != null && ids.includes(from) ? frames.get(from) : undefined;
    if (!frame) {
      // (as most of the atoms it had before were: those at true size counted too, new ones not)
      const before = new Set(atoms.map((a) => a.id));
      const count = new Map<Frame | null, number>();
      for (const id of ids) if (before.has(id)) count.set(frames.get(id) ?? null, (count.get(frames.get(id) ?? null) ?? 0) + 1);
      let most = 0;
      for (const [f, n] of count) if (n > most) [frame, most] = [f ?? undefined, n];
    }
    if (!frame) continue;
    const { c, k } = frame;
    for (const i of group) {
      const a = done.model.atoms[i];
      out[i] = { ...a, x: c.x + (a.x - c.x) * k, y: c.y + (a.y - c.y) * k, magnified: k } as Atom;
    }
  }
  return { ...done, model: { ...done.model, atoms: out } };
}
