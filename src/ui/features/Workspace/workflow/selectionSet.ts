/**
 * The selection as an input (docs/WORKFLOWS.md, *An input: a set from the
 * selection*): where it holds whole structures or molecules in 3D - a few
 * atoms of a structure make no input - the frame a set round it takes:
 * clear of what it holds as it is drawn, its labels and frames chips
 * included, with room for its name above it.
 */
import type { Style3D } from "../../../../lib/chem/style3d";
import { labelBox, labelSetOf, pxToWorld, type Layout, type LayoutOptions, type TextItem } from "../../../../lib/chem/layout2d";
import type { Model, Molecule3D, Turn3D } from "../store/types";
import { chipMarks, lookOf, poseOf, seenBounds, sharesOf, solidOf } from "../utils/molecule3d";
import { framesOf, inside, placesOf, refinedFrame, structuresOf, type Frame, type Page } from "./entries";
import { SET_PAD, SET_TOP, CHIP, CHIP_CHAR, CHIP_SIDES } from "./look";
import { greatest, least } from "../../../../lib/chem/lists";
import { aboveSaid, barsAbove } from "../utils/barsAbove";

/** Whether a molecule in 3D shows a frames chip below it (Molecule3DView): it has frames, or a calculation it was read from. */
export const hasChip = (m: Pick<Molecule3D, "frames" | "calc"> & Partial<Pick<Molecule3D, "title" | "stack" | "failed" | "conformerSet">>) => setShown(m) || !!m.calc || named3d(m) || !!m.failed?.some(Boolean);
/**
 * Whether a molecule's chip says which of its frames it shows, always - not
 * only while it is pointed at (Frames3D, not `single`): it has several, or
 * it is a compound of a conformer set, though one conformer of it was kept.
 */
const setShown = (m: Pick<Molecule3D, "frames"> & Partial<Pick<Molecule3D, "conformerSet">>) => framesOf(m) > 1 || !!m.conformerSet;
/** A molecule in 3D called by a name of its own - a structure read from coordinates in a text - not one of a stack, whose chip says its record's: its chip says it. */
export const named3d = (m: Partial<Pick<Molecule3D, "title" | "stack">>) => !!m.title && !m.stack;

/**
 * About how wide a molecule's frames chip is, shut, on the page - as
 * Frames3D writes it: "#3 · 4 / 12 · 0.00 kcal/mol · 62%", its widest
 * numbers - where it shows always, a molecule of several frames. A single
 * geometry's shows only while it is pointed at, over what is beside it:
 * none.
 */
export function chipWide(m: Pick<Molecule3D, "frames" | "energies" | "shares" | "numbers" | "conformerSet"> & Partial<Pick<Molecule3D, "title" | "stack" | "partOf" | "degeneracies" | "failed" | "imaginary" | "calc" | "marksUnread">>): number {
  const n = framesOf(m);
  // (a single geometry called by its name: its name, and its energy where it has one)
  if (!setShown(m)) return named3d(m) ? `${m.title}${m.energies?.length === 1 ? " · -1234.567890" : ""}`.length * CHIP_CHAR + CHIP_SIDES : 0;
  const numbered = m.numbers?.length === n && m.numbers.some((k, i) => k !== i + 1) ? `#${Math.max(...m.numbers)} · ` : "";
  const shares = sharesOf(m) ? " · 100%" : "";
  // (each frame's energy as it says it - its height above the lowest, or why it has none - and what it says of the frame after
  //  that: why it failed, its imaginary frequencies, its warnings. The widest, as any frame may be the one shown)
  const bars = m.energies?.length === n ? barsAbove(m.energies, m.failed, m.marksUnread) : null;
  // (a path whose highest point was refined says each frame's energy from its start, as Molecule3DView tells its chip)
  const fromStart = refinedFrame(m) != null;
  const said = Math.max(0, greatest(Array.from({ length: n }, (_, k) => {
    const marks = chipMarks({ imaginary: m.imaginary, calc: m.calc, failed: m.failed }, k, n);
    return (bars ? 3 + aboveSaid(bars, k, fromStart).length : 0) + (marks ? 3 + marks.length : 0);
  })));
  return (`${numbered}${n} / ${n}${shares}`.length + said) * CHIP_CHAR + CHIP_SIDES;
}


/**
 * How far each labelled atom's label reaches on the page, by the atom's id,
 * as the drawing lays it out (`layout`, from `atoms` in that order, under
 * `opts`): OH hangs well to the right of its O.
 */
export function labelReach(layout: Pick<Layout, "texts" | "zoom">, atoms: readonly { id: number }[], opts: LayoutOptions): Map<number, Frame> {
  const size = opts.units === "world" ? opts.fontPx : pxToWorld(opts.fontPx, layout.zoom);
  const set = labelSetOf(opts);
  const out = new Map<number, Frame>();
  for (const t of layout.texts) {
    const id = t.atom != null ? atoms[t.atom]?.id : undefined;
    if (id == null) continue;
    // (a label the layout kept - its structure not laid out again - reaches where it did)
    const was = reached.get(t);
    if (was && was.opts === opts && was.size === size) {
      out.set(id, was.frame);
      continue;
    }
    const b = labelBox(t, size, set);
    const frame = { x0: t.x - b.left, x1: t.x + b.right, y0: t.y - b.bottom, y1: t.y + b.top };
    reached.set(t, { opts, size, frame });
    out.set(id, frame);
  }
  return out;
}

/** How far each label reached, as last worked out, and under what. */
const reached = new WeakMap<TextItem, { opts: LayoutOptions; size: number; frame: Frame }>();

export function selectionFrame(
  model: Model,
  atoms: ReadonlySet<number>,
  molecules: readonly Molecule3D[],
  sel3d: ReadonlySet<number>,
  style: Style3D,
  turns: Record<number, Turn3D>,
  frames: Record<number, number>,
  labels: ReadonlyMap<number, Frame> = new Map(),
): Frame | null {
  if (!atoms.size && !sel3d.size) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  if (atoms.size) {
    const byId = new Map(model.atoms.map((a) => [a.id, a]));
    for (const part of structuresOf(model)) {
      const n = part.filter((id) => atoms.has(id)).length;
      if (n === 0) continue;
      if (n < part.length) return null;
      for (const id of part) {
        const a = byId.get(id)!;
        const l = labels.get(id);
        xs.push(Math.min(a.x, l?.x0 ?? a.x) - SET_PAD, Math.max(a.x, l?.x1 ?? a.x) + SET_PAD);
        ys.push(Math.min(a.y, l?.y0 ?? a.y) - SET_PAD, Math.max(a.y, l?.y1 ?? a.y) + SET_PAD);
      }
    }
  }
  for (const m of molecules) {
    if (!sel3d.has(m.id)) continue;
    const b = seenBounds(poseOf(m, solidOf(m, style), lookOf(m), turns[m.id], frames[m.id]));
    // (and its frames chip below it, where it has one - as wide as it is, centred under it: "4 / 4 · 0.00 kcal/mol" is
    //  wider than an HCN, as a result set makes room for it: run `roomOf`)
    const chip = hasChip(m) ? CHIP : 0;
    const half = chipWide(m) / 2;
    xs.push(Math.min(b.minX, m.at.x - half) - SET_PAD, Math.max(b.maxX, m.at.x + half) + SET_PAD);
    ys.push(b.minY - SET_PAD - chip, b.maxY + SET_PAD);
  }
  if (!xs.length) return null;
  return { x0: least(xs), x1: greatest(xs), y0: least(ys), y1: greatest(ys) + SET_TOP - SET_PAD };
}

/**
 * Whether any of the selection - a structure drawn, wholly or in part, or
 * a molecule in 3D - lies in one of `sets` (its middle inside its frame,
 * as a set holds it: entries `lyingIn`): it is in a set already, whose
 * port is that set's, shown as the set is pointed at or chosen; the
 * selection takes no port of its own there.
 */
export function selectionInSet(page: Page, atoms: ReadonlySet<number>, sel3d: ReadonlySet<number>, sets: readonly Frame[]): boolean {
  if (!sets.length || (!atoms.size && !sel3d.size)) return false;
  const places = placesOf(page);
  const at = [...places.structures.filter((s) => s.ids.some((id) => atoms.has(id))).map((s) => s.at), ...[...sel3d].flatMap((id) => places.molecules.get(id) ?? [])];
  return at.some((pt) => sets.some((f) => inside(f, pt)));
}
