/**
 * What a look states, in words, where the pointer rests on a bond or an atom of a structure (foundation part 15, phase 4;
 * docs/EDITOR-2D.md, *What a look states*): a wedge, the centre it states and how; a bold or dashed line, that it states nothing; a
 * centre, what it is - its R or S where the drawing shows one, open, or not read and why; an atom drawn with depth, that the drawing
 * shows it. What it is, never how it is worked out. Pure: no DOM, no store.
 */
import { hashedLinesOpen } from "../../../../lib/chem/perception/stereo/from2d";
import { drawingOf } from "../chem/drawing";
import { atomName, type Reading } from "./changes";
import type { Model } from "../store/types";

/** A unit's descriptor where the drawing shows one (its R, S, E or Z), by `centre-<id>` or `bond-<id>`, as the marks have them. */
export type LabelOf = (key: string) => string | undefined;

/** The words for the bond `bond` of `model`, or null where it states nothing worth a word (a plain single bond). */
export function bondSaid(model: Model, reading: Reading, bond: number, label: LabelOf): string | null {
  const b = model.bonds.find((x) => x.id === bond);
  if (!b) return null;
  if (b.stereo === "up" || b.stereo === "down") {
    const centre = b.narrow ?? b.a;
    const wide = centre === b.a ? b.b : b.a;
    const name = atomName(model, centre);
    const why = reading.unread.get(centre);
    // (an axis the wedge states from one of its ends - an allene's, a biaryl's (IUPAC ST-1.7): its hand set by this wedge)
    const axis = [...reading.said.axes.keys()].map((key) => key.split(",").map(Number)).find((ends) => ends.includes(centre));
    const first = why
      ? `${name}: not read: ${why}`
      : reading.said.centres.has(centre)
        ? `${name}: ${label(`centre-${centre}`) ?? "set"}, by this wedge`
        : axis
          ? `the axis through ${atomName(model, axis[0])} and ${atomName(model, axis[1])}: set, by this wedge`
          : `${name}: no configuration, though this wedge is drawn`;
    // (a centre at its wide end too: the wedge says nothing of it)
    return reading.said.centres.has(wide) || reading.unread.has(wide) ? `${first}; it says nothing of ${atomName(model, wide)}` : first;
  }
  if (b.stereo === "wavy") return `a wavy bond: ${atomName(model, b.narrow ?? b.a)} open`;
  if (b.stereo === "either") return `${atomName(model, b.a)}=${atomName(model, b.b)}: open (either)`;
  if (b.display === "bold") return deep(model, b.a) && deep(model, b.b) ? "a bold line: the near edge" : "a bold line: no configuration";
  if (b.display === "dashed") return "a dashed line: no configuration";
  if (b.display === "hashed") {
    // (a hashed line read as IUPAC grades it (ST-0.3; perception/stereo/from2d `hashedLinesRead`): the centre it sets, as a wedge's;
    //  why it sets none where a centre at its end is left open by it; else nothing)
    const drawing = drawingOf(model);
    const open = hashedLinesOpen(drawing.atoms, drawing.bonds);
    for (const c of [b.a, b.b]) {
      const why = open.get(model.atoms.findIndex((a) => a.id === c));
      if (why) return `${atomName(model, c)}: not read: ${why}`;
    }
    const wedgedAt = (c: number) => model.bonds.some((x) => (x.stereo === "up" || x.stereo === "down") && (x.narrow ?? x.a) === c);
    const set = [b.a, b.b].find((c) => reading.said.centres.has(c) && !wedgedAt(c) && !deep(model, c));
    if (set != null) return `${atomName(model, set)}: ${label(`centre-${set}`) ?? "set"}, by this hashed line`;
    return "a hashed line: no configuration";
  }
  if (b.order === 2) {
    const key = b.a < b.b ? `${b.a},${b.b}` : `${b.b},${b.a}`;
    const d = reading.said.doubles.get(key);
    if (!d) return null;
    return `${atomName(model, b.a)}=${atomName(model, b.b)}: ${label(`bond-${b.id}`) ?? (d.cis ? "cis" : "trans")}`;
  }
  return null;
}

/** The words for the atom `atom` of `model`: a centre's configuration, or that the drawing shows it; null for any other atom. */
export function atomSaid(model: Model, reading: Reading, atom: number, label: LabelOf): string | null {
  const name = atomName(model, atom);
  if (deep(model, atom) && reading.said.centres.has(atom)) return `${name}: its configuration is shown by the drawing`;
  const why = reading.unread.get(atom);
  if (why) return `${name}: not read: ${why}`;
  if (reading.said.centres.has(atom)) return `${name}: ${label(`centre-${atom}`) ?? "set"}`;
  if (reading.open.has(atom)) return `${name}: open`;
  return null;
}

/** Whether the atom `id` is drawn with depth (a ring in perspective). */
const deep = (model: Model, id: number) => model.atoms.find((a) => a.id === id)?.z != null;

