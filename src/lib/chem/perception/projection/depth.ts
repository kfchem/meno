/**
 * A drawing's rings in perspective that it gives no depth to, their depth worked out (./recognise) so that `readStereo` reads them as it
 * reads a drawing with depth (docs/EDITOR-2D.md, *Drawn in perspective*). A ring system of six-rings drawn as chairs - one ring, or chairs
 * fused on bonds - a ring of five or six drawn as a Haworth ring, or a bridged system or a cage drawn as a view of the engine's solid for
 * it, a bold bond its near edge; no atom of it with a depth already, no wedge at any of its atoms (a wedge reads as it always did);
 * anything else is as drawn. The drawing is not changed: its atoms come back with a depth, and as stereocentres, for the reading.
 *
 * The rings are the core's (../rings). How Meno draws a bridged system or a cage in perspective is the layout engine's, which the core
 * may not import: those views come from whoever asks (`CageViewsOf`, lib/layout/recognised); asked without them, such a system is read
 * as drawn.
 */
import { READ_AS_HAWORTH, READ_IN_PERSPECTIVE, recogniseByViews, recogniseChairs, recogniseHaworth, type Recognised } from "./recognise";
import { ringSystemsOf, sharesThreeAtoms, smallestRings } from "../rings";
import { ofTheStructure } from "../graph";
import { readStereo, type DrawnAtom, type DrawnBond } from "../stereo/from2d";
import { notCandidate } from "../stereo/candidates";

/** What is said of a chair's ring atom whose group is drawn half way between axial and equatorial, its configuration not read. */
export const BETWEEN_AXIAL_AND_EQUATORIAL = "a group drawn between axial and equatorial: not read";

/** A point of a view of a ring system, its depth too. */
export type ViewPoint = { x: number; y: number; z: number };

/**
 * The ways the engine draws a ring system of a drawing in perspective - each view its atoms' places and depths, in the order of the
 * system's atoms as given, worked out only when asked for - and whether it is a cage; asked of the drawing's atoms and bonds, then of each
 * system by its atoms.
 */
export type CageViewsOf = (atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]) => (system: readonly number[]) => { cage: boolean; views: () => ViewPoint[][] };

/** A drawing's atoms with the depth its rings drawn in perspective give them (`recognition`). */
export function withRecognisedDepth(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], cageViews?: CageViewsOf): readonly DrawnAtom[] {
  return recognition(atoms, bonds, cageViews, false).atoms;
}

/**
 * What the recognition says of each atom of a ring system it took for a projection, by its index: "read from the ring as drawn in
 * perspective", "read as a Haworth ring", or - unread - why, and what to draw. Where a centre's R or S is shown, its tip says it.
 */
export function recognisedSaid(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], cageViews?: CageViewsOf): ReadonlyMap<number, string> {
  return recognition(atoms, bonds, cageViews, true).said;
}

type Recognition = { atoms: readonly DrawnAtom[]; said: Map<number, string> };
/**
 * The last recognitions, by the drawing's atoms and bonds as given: one drawing is read for its identity, its R and S and its marks in turn.
 * `words`: whether what is said of each atom was worked out too - a reading of the atoms alone leaves out what only the words need (`recognise`),
 * and is worked out again, words and all, where they are asked.
 */
const kept = new WeakMap<readonly DrawnAtom[], { bonds: readonly DrawnBond[]; places: string; views?: CageViewsOf; words: boolean; got: Recognition }>();

function recognition(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], cageViews: CageViewsOf | undefined, words: boolean): Recognition {
  // (the places, depths and bonds as they are now: an array changed in place is read again)
  const places = atoms.map((a) => `${a.x} ${a.y} ${a.z ?? ""}`).join(";") + "|" + bonds.map((b) => `${b.a} ${b.b} ${b.order} ${b.bold ? 1 : 0} ${b.wedge ? 1 : 0}`).join(";");
  const before = kept.get(atoms);
  if (before && before.bonds === bonds && before.places === places && before.views === cageViews && (before.words || !words)) return before.got;
  const got = recognise(atoms, bonds, cageViews, words);
  kept.set(atoms, { bonds, places, views: cageViews, words, got });
  return got;
}

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * The recognition of a drawing (see the file's header): its atoms, and - where `saying` - what is said of them. Without the words, a bridged
 * system or a cage with no bold bond is not fitted to its views: with no near edge marked, no fit gives it a depth (./recognise
 * `recogniseByViews`), so its atoms are as drawn whatever the views; the fit says only which words are said there.
 */
function recognise(atoms: readonly DrawnAtom[], drawn: readonly DrawnBond[], cageViews: CageViewsOf | undefined, saying: boolean): Recognition {
  // (the structure's bonds alone: a hydrogen bond drawn closes no ring - between two groups of a chair it would make it a bridged system)
  const bonds = drawn.filter(ofTheStructure);
  const said = new Map<number, string>();
  if (atoms.length < 5 || !bonds.length) return { atoms, said };
  const neighbours: number[][] = atoms.map(() => []);
  for (const b of bonds) {
    neighbours[b.a].push(b.b);
    neighbours[b.b].push(b.a);
  }
  const allRings = smallestRings(
    atoms.length,
    bonds.map((b) => [b.a, b.b] as const),
  );
  let out: DrawnAtom[] | null = null;
  const bondOf = new Map(bonds.map((b) => [key(b.a, b.b), b]));
  let views: ReturnType<CageViewsOf> | null = null;
  // (the chairs read in depth, each ring system's atoms: their groups asked after, below - a Haworth ring's group drawn neither up nor down
  //  is no Haworth ring's, read as drawn)
  const chairsRead: (readonly number[])[] = [];
  for (const sys of ringSystemsOf(atoms.length, allRings)) {
    if (sys.atoms.some((i) => atoms[i].z != null)) continue;
    // (a wedge at any atom of it: read as it always was)
    if (sys.atoms.some((i) => neighbours[i].some((n) => bondOf.get(key(i, n))?.wedge))) continue;
    // (each ring's atoms in order round it, as places in the system)
    const local = new Map(sys.atoms.map((i, k) => [i, k]));
    const rings = sys.rings.map((r) => allRings[r]);
    const places = sys.atoms.map((i) => ({ x: atoms[i].x, y: atoms[i].y }));
    const bold = sys.atoms.flatMap((i) =>
      neighbours[i].filter((n) => n > i && local.has(n) && bondOf.get(key(i, n))?.bold).map((n): [number, number] => [local.get(i)!, local.get(n)!]),
    );
    // (a bridged system or a cage: the ways Meno draws it in perspective, fitted - read by a mark only; told by rings sharing three atoms
    //  or more, or by the engine's own test for a cage)
    const bridged = rings.some((r, i) => rings.some((q, j) => j > i && sharesThreeAtoms(r, q)));
    const asked = cageViews && (bridged || rings.length >= 2) ? (views ??= cageViews(atoms, drawn))(sys.atoms) : null;
    if (bridged || asked?.cage) {
      if (!asked) continue;
      // (no near edge marked: no depth whatever the views - only the words need them)
      if (!bold.length && !saying) continue;
      const got = recogniseByViews(places, asked.views(), bold);
      if (got.kind === "unread") for (const i of sys.atoms) said.set(i, got.why);
      if (got.kind !== "depth") continue;
      // (every atom of it a centre, as a tool's projection makes them: whether a centre's sense says anything - quinuclidine's N, whose two
      //  alike arms run between the same two atoms, says none - is identity's to tell, not the reader's)
      out ??= atoms.map((a) => a);
      sys.atoms.forEach((i, k) => {
        out![i] = { ...atoms[i], z: got.z[k], centre: true };
        said.set(i, READ_IN_PERSPECTIVE);
      });
      continue;
    }
    // (chairs first - one, or fused; then a lone ring of five or six as a Haworth ring, with the page directions of the groups out of it)
    let haworthRing = false;
    let got: Recognised = rings.every((r) => r.length === 6) ? recogniseChairs(places, rings.map((r) => r.map((i) => local.get(i)!)), bold) : { kind: "flat" };
    if (got.kind === "flat" && rings.length === 1) {
      const order = rings[0];
      const n = order.length;
      const edges = order.flatMap((_, k) => (bondOf.get(key(order[k], order[(k + 1) % n]))?.bold ? [k] : []));
      const groups = order.flatMap((i) => neighbours[i].filter((v) => !order.includes(v)).map((v) => ({ x: atoms[v].x - atoms[i].x, y: atoms[v].y - atoms[i].y })));
      const haworth = recogniseHaworth(order.map((i) => places[local.get(i)!]), groups, edges);
      if (haworth.kind === "depth") got = { ...haworth, z: sys.atoms.map((i) => haworth.z[order.indexOf(i)]) };
      else got = haworth;
      haworthRing = haworth.kind === "depth";
    }
    if (got.kind === "unread") {
      for (const i of sys.atoms) said.set(i, got.why);
      continue;
    }
    if (got.kind !== "depth") continue;
    const z = got.z;
    const words = haworthRing ? READ_AS_HAWORTH : READ_IN_PERSPECTIVE;
    out ??= atoms.map((a) => a);
    sys.atoms.forEach((i, k) => {
      out![i] = { ...atoms[i], z: z[k], centre: true };
      said.set(i, words);
    });
    if (!haworthRing) chairsRead.push(sys.atoms);
  }
  // (a ring atom of a chair read with a group out of the ring whose configuration the reading of it in depth finds none for - its group
  //  drawn half way between axial and equatorial: said so at it, as the reading leaves it open; nothing silent)
  //  - asked only of an atom the core takes as able to carry a configuration (../stereo/candidates): one it takes as none - an ammonium's
  //  N with its H - carries none to read, wherever its group is drawn
  if (out && chairsRead.length) {
    const read = readStereo(out, bonds).tetra;
    const graph = { atoms: atoms.map((a) => ({ el: a.el ?? "C", hs: a.hs, ...(a.charge ? { charge: a.charge } : {}) })), bonds: bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })) };
    for (const ring of chairsRead) {
      const inRing = new Set(ring);
      for (const i of ring) {
        const around = neighbours[i];
        if (read.has(i) || atoms[i].hs > 1 || around.length + atoms[i].hs !== 4 || !around.some((n) => !inRing.has(n))) continue;
        if (notCandidate(graph, { kind: "centre", at: i }) != null) continue;
        said.set(i, BETWEEN_AXIAL_AND_EQUATORIAL);
      }
    }
  }
  return { atoms: out ?? atoms, said };
}
