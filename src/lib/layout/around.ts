/**
 * A part of a structure drawn afresh between neighbours that stay where the
 * chemist drew them (docs/LAYOUT-2D.md, *A part between fixed neighbours*):
 * the new scaffold of a scaffold swap, its substituents as they were.
 *
 * The part is laid out by the engine as it would draw it on its own
 * (`layout2D`), each bond to the rest a stub, and set down onto the rest:
 * on one bond, exactly; on two or more, by the rigid motion that best puts
 * its stubs where the rest's atoms are, each branch of the rest then moved
 * rigidly onto its new bond, keeping its own drawing and, as near as that
 * bond allows, its direction (the maintainer's rulings, 2026-10-23). The
 * part is never bent to meet the rest. Where the drawing cannot be made so
 * - a part joined to the rest through a ring that is not taken whole, by a
 * double bond, a metal complex or a cage in it, its stubs too far from
 * where the rest's atoms are - nothing is drawn, and why is said: the
 * caller draws the whole structure afresh instead.
 */
import { canonicalRanks, reordered, restored, symmetryOrbits, walkOrder } from "./canonical";
import { notAsGiven } from "./readBack";
import { layout2D, measureLaidOut, type Layout2D } from "./engine";
import { angleOf, cross, dist, dot, rotate, sub, wrap, type Point } from "./geometry";
import { isMetal, key, perceive, type LayoutAtom, type LayoutBond, type LayoutInput, type Molecule } from "./perceive";
import { placeStereo, type Stereo, type Tetrahedral, type Wedge } from "./stereo";

/** The rest of a structure as the chemist drew it: where each atom not in the part is (any unit; the part's own are not read), and its wedges and drawn H's. */
export type FixedDrawing = {
  at: readonly (Point | null | undefined)[];
  stereo?: Stereo;
};

/**
 * A part drawn between the rest's atoms: the whole structure's drawing, in
 * the rest's unit; the atoms drawn afresh (`part`), those of them taken in
 * because a ring system cannot be cut (`taken`), each branch of the rest
 * moved onto its new bond (`moved`), how far the part's stubs were from
 * the rest's atoms, in bonds (`mismatch`), and where the drawing is
 * crowded (`crowded`, in words). Or why it cannot be drawn so (`refused`).
 */
export type Around = { layout: Layout2D; part: number[]; taken: number[]; moved: number[][]; mismatch: number; crowded: string[] } | { refused: string };

/** How far, in bonds, the part's stubs may be from the rest's atoms they stand for: past it the substituents would end up elsewhere than drawn. */
export const MISMATCH_LIMIT = 1;

/** How many ways of pairing the part's stubs with the rest's atoms its symmetries give are tried. */
const PAIRINGS_TRIED = 96;

export function layoutAround(input: LayoutInput, part: readonly number[], fixed: FixedDrawing): Around {
  const n = input.atoms.length;
  if (!part.length || part.some((a) => !Number.isInteger(a) || a < 0 || a >= n)) return { refused: "No part of the structure was given to draw." };
  // (worked in the molecule's own order, as layout2D is: the same molecule given with its atoms in any order comes out the same)
  const to = walkOrder(input, canonicalRanks(input));
  const back = new Array<number>(n);
  to.forEach((t, o) => (back[t] = o));
  const own = reordered(input, to);
  const at = new Array<Point | null>(n).fill(null);
  fixed.at.forEach((p, i) => {
    if (p && i < n) at[to[i]] = p;
  });
  const stereo: Stereo | undefined = fixed.stereo && {
    wedges: fixed.stereo.wedges.map((w) => ({ ...w, from: to[w.from], to: w.to < 0 ? w.to : to[w.to] })),
    hydrogens: fixed.stereo.hydrogens.map((h) => ({ on: to[h.on], at: h.at })),
  };
  // (and read back against the structure as given, so that what it says of an atom is said of it as given)
  const readBack = (layout: Layout2D) => notAsGiven(input, restored(layout, to));
  const r = inOwnOrder(own, new Set(part.map((a) => to[a])), at, stereo, (a) => back[a], readBack);
  if ("refused" in r) return r;
  const named = (atoms: readonly number[]) => atoms.map((a) => back[a]).sort((p, q) => p - q);
  return { ...r, layout: restored(r.layout, to), part: named(r.part), taken: named(r.taken), moved: r.moved.map(named) };
}

/**
 * The part drawn, with the atoms in the molecule's own order; `given`,
 * each atom's index as given, by which words name it (as readBack.ts
 * does);
 * `readBack`, what a drawing does not show as given (readBack.ts
 * `notAsGiven`, against the structure as given).
 */
function inOwnOrder(input: LayoutInput, asked: Set<number>, at: (Point | null)[], stereo: Stereo | undefined, given: (a: number) => number, readBack: (layout: Layout2D) => string[]): Around {
  const n = input.atoms.length;
  const said = (a: number) => `${input.atoms[a].el}${given(a)}`;
  const mol = perceive(input);
  const part = new Set(asked);
  // (a cut through a ring system would leave half its rings to bend: the system is taken whole)
  for (let grew = true; grew; ) {
    grew = false;
    for (const b of input.bonds) {
      if (part.has(b.a) === part.has(b.b) || !mol.ringBonds.has(key(b.a, b.b))) continue;
      for (const a of mol.systems[mol.systemOf[b.a]].atoms) part.add(a);
      grew = true;
    }
  }
  const inPart = [...part].sort((p, q) => p - q);
  const taken = inPart.filter((a) => !asked.has(a));
  if (part.size === n) return { refused: "The part is the whole structure, so it is drawn whole." };
  const metal = inPart.find((a) => isMetal(input.atoms[a].el) || input.atoms[a].el === "*" || input.atoms[a].pi);
  if (metal != null) return { refused: `${said(metal)} makes the part a metal complex, which is drawn whole.` };
  if (input.axes?.some((x) => x.atoms.some((a) => part.has(a)))) return { refused: "An axis of chirality runs through the part, so the structure is drawn whole." };
  const joins = input.bonds.filter((b) => part.has(b.a) !== part.has(b.b));
  const multiple = joins.find((b) => b.order !== 1);
  if (multiple) return { refused: `The part is joined to the rest by a ${multiple.order === 2 ? "double" : multiple.order === 3 ? "triple" : "non-single"} bond (${said(multiple.a)}-${said(multiple.b)}), so the structure is drawn whole.` };
  if (!joins.length) return { refused: "The part is not bonded to the rest." };
  if (!connected(mol, inPart)) return { refused: "The part is in pieces, so the structure is drawn whole." };
  const unplaced = input.atoms.findIndex((_, a) => !part.has(a) && !at[a]);
  if (unplaced >= 0) return { refused: `${said(unplaced)} of the rest is not placed.` };

  // (worked at the engine's unit, a bond of length 1: the rest's bonds' middle length)
  const lengths = input.bonds.filter((b) => !part.has(b.a) && !part.has(b.b)).map((b) => dist(at[b.a]!, at[b.b]!)).filter((l) => l > 1e-9).sort((p, q) => p - q);
  const unit = lengths.length ? lengths[lengths.length >> 1] : 1;
  const rest = at.map((p) => (p ? { x: p.x / unit, y: p.y / unit } : null));

  // (each bond to the rest, by the rest's atom: one at most to each, as each is a bridge)
  const attachments = joins.map((b) => (part.has(b.a) ? { a: b.a, f: b.b } : { a: b.b, f: b.a })).sort((p, q) => p.f - q.f);
  const branches = attachments.map(({ a, f }) => branchOf(mol, f, a, part));

  // the part on its own, each bond to the rest a stub: the rest's atom, alone
  const sub2 = new Map(inPart.map((a, k) => [a, k]));
  attachments.forEach(({ f }, k) => sub2.set(f, inPart.length + k));
  const subAtoms: LayoutAtom[] = [
    ...inPart.map((a) => {
      const atom = input.atoms[a];
      if (!atom.tetra) return atom;
      return { ...atom, tetra: { neighbours: atom.tetra.neighbours.map((m) => (m < 0 ? m : sub2.get(m)!)), volume: atom.tetra.volume } };
    }),
    ...attachments.map(({ f }) => ({ el: input.atoms[f].el, ...(input.atoms[f].hs != null ? { hs: input.atoms[f].hs } : {}) })),
  ];
  const subBonds: LayoutBond[] = input.bonds
    .filter((b) => part.has(b.a) || part.has(b.b))
    .map((b) => ({ ...b, a: sub2.get(b.a)!, b: sub2.get(b.b)!, ...(b.stereo ? { stereo: { ...b.stereo, refs: [sub2.get(b.stereo.refs[0])!, sub2.get(b.stereo.refs[1])!] as [number, number] } } : {}) }));
  const subInput: LayoutInput = { atoms: subAtoms, bonds: subBonds };
  // (every way of pairing stubs alike with the rest's atoms is compared, or none: a few of them would go by the order of the atoms)
  const pairings = pairingsOf(subInput, inPart.length);
  if ("why" in pairings) return { refused: pairings.why };
  const laid = layout2D(subInput);
  if (laid.depth.some((d) => d != null) || laid.solid.some(Boolean)) return { refused: "The part holds a cage, drawn in perspective, so the structure is drawn whole." };

  // the part's drawing as each of its symmetries has it - its stubs alike paired with the rest's atoms each way, not only as the order of the atoms pairs them - and each mirrored
  const drawings: Point[][] = [];
  for (const g of pairings) {
    const p = subAtoms.map((_, k) => ({ x: laid.x[g[k]], y: laid.y[g[k]] }));
    drawings.push(p, p.map((q) => ({ x: -q.x, y: q.y })));
  }
  const kept = keptStereo(input, stereo, part, attachments);
  const candidates: { layout: Layout2D; moved: number[][]; mismatch: number; score: number; seen: string }[] = [];
  for (const p of drawings) {
    for (const placed of setDown(mol, p, attachments, attachments.map(({ a }) => sub2.get(a)!), inPart.length, rest, part)) {
      if (placed.mismatch > MISMATCH_LIMIT + 1e-9) continue;
      const pos = new Map<number, Point>();
      for (let a = 0; a < n; a++) if (!part.has(a)) pos.set(a, rest[a]!);
      inPart.forEach((a, k) => pos.set(a, placed.move(p[k])));
      const moved: number[][] = [];
      const motions = new Map<number, (q: Point) => Point>();
      if (attachments.length > 1) {
        attachments.forEach(({ a, f }, k) => {
          const stub = placed.move(p[inPart.length + k]);
          const turn = branchTurn(mol, f, a, rest, stub, pos.get(a)!, part);
          const motion = (q: Point) => {
            const v = rotate(sub(q, rest[f]!), turn);
            return { x: stub.x + v.x, y: stub.y + v.y };
          };
          for (const b of branches[k]) {
            pos.set(b, motion(rest[b]!));
            motions.set(b, motion);
          }
          moved.push(branches[k]);
        });
      }
      const layout = drawingOf(input, mol, pos, kept, motions);
      const score = measureLaidOut(input, layout).score;
      // (and as a reader sees it, whatever its atoms are numbered: each element where it is)
      const seen = input.atoms.map((atom, i) => `${atom.el}@${layout.x[i].toFixed(6)},${layout.y[i].toFixed(6)}`).sort().join(" ");
      candidates.push({ layout, moved, mismatch: placed.mismatch, score, seen });
    }
  }
  if (!candidates.length) {
    return { refused: `The new part's bonds to the rest end more than ${MISMATCH_LIMIT} bond${MISMATCH_LIMIT === 1 ? "" : "s"} from where the rest's atoms are, so the structure is drawn whole.` };
  }
  // (nearest the rest's atoms first, then the drawing that reads best - each to a millionth, so that sums taken in another order do not part them - then by each element where it is: never by the order the atoms came in)
  const cut = (v: number) => Math.round(v * 1e6);
  candidates.sort((p, q) => cut(p.mismatch) - cut(q.mismatch) || cut(p.score) - cut(q.score) || (p.seen < q.seen ? -1 : p.seen > q.seen ? 1 : 0));
  let why = "";
  for (const c of candidates) {
    const wrong = readBack(c.layout);
    if (wrong.length) {
      why ||= wrong[0];
      continue;
    }
    const layout = inUnit(c.layout, unit, at, part, c.moved);
    return { layout, part: inPart, taken, moved: c.moved, mismatch: c.mismatch, crowded: crowding(input, c.layout, part, c.moved, given) };
  }
  return { refused: `Drawn so, it would not read back as the structure given (${why}), so the structure is drawn whole.` };
}

/** Whether `atoms` are one piece by their own bonds. */
function connected(mol: Molecule, atoms: readonly number[]): boolean {
  const inside = new Set(atoms);
  const seen = new Set([atoms[0]]);
  const todo = [atoms[0]];
  while (todo.length) {
    for (const m of mol.neighbours[todo.pop()!]) {
      if (inside.has(m) && !seen.has(m)) {
        seen.add(m);
        todo.push(m);
      }
    }
  }
  return seen.size === atoms.length;
}

/** The rest's atoms reached from `f` without going through the part (its atom `a` among them). */
function branchOf(mol: Molecule, f: number, a: number, part: ReadonlySet<number>): number[] {
  const seen = new Set([f]);
  const todo = [f];
  while (todo.length) {
    for (const m of mol.neighbours[todo.pop()!]) {
      if (m !== a && !part.has(m) && !seen.has(m)) {
        seen.add(m);
        todo.push(m);
      }
    }
  }
  return [...seen].sort((p, q) => p - q);
}

/**
 * The part's symmetries (its drawing's atoms, its stubs after its own
 * `stubs`), one for each place they take its stubs to, the identity
 * first: stubs alike - a gem-dimethyl's two methyls - paired with the
 * rest's atoms each way. One that moves only the part's own atoms gives
 * the same drawing, element for element, so one of each is enough. Or why
 * not: more of them than are tried, or symmetries left unfound.
 */
function pairingsOf(input: LayoutInput, stubs: number): number[][] | { why: string } {
  const identity = input.atoms.map((_, k) => k);
  const { automorphisms: generators, complete } = symmetryOrbits(input);
  if (!complete) return { why: "The part is too symmetric for each of its symmetries to be found, so the structure is drawn whole." };
  const where = (g: readonly number[]) => g.slice(stubs).join(",");
  const found = new Map([[where(identity), identity]]);
  const todo = [identity];
  while (todo.length) {
    const g = todo.shift()!;
    for (const h of generators) {
      const gh = g.map((k) => h[k]);
      if (found.has(where(gh))) continue;
      if (found.size >= PAIRINGS_TRIED) return { why: "The part has too many bonds to the rest that are alike to compare each way of pairing them, so the structure is drawn whole." };
      found.set(where(gh), gh);
      todo.push(gh);
    }
  }
  return [...found.values()];
}

/**
 * Where the rest leaves room for a bond from `f`: the middle of the widest
 * gap between its bonds to the rest's atoms; on an atom with one such bond,
 * either way at 120 degrees from it, as a chain zigzags; none on an atom
 * bonded to nothing else of the rest.
 */
function openings(mol: Molecule, f: number, a: number, rest: readonly (Point | null)[], part: ReadonlySet<number>): number[] {
  const others = mol.neighbours[f].filter((m) => m !== a && !part.has(m)).map((m) => angleOf(sub(rest[m]!, rest[f]!)));
  if (!others.length) return [];
  if (others.length === 1) return [wrap(others[0] + (2 * Math.PI) / 3), wrap(others[0] - (2 * Math.PI) / 3)];
  const sorted = [...others].sort((p, q) => p - q);
  let best = -1;
  let middle = 0;
  sorted.forEach((t, k) => {
    const next = k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + 2 * Math.PI;
    if (next - t > best + 1e-9) [best, middle] = [next - t, wrap(t + (next - t) / 2)];
  });
  return [middle];
}

/**
 * Each way the part's drawing `p` (its stubs after its own atoms, from
 * `stubs`; each bond's own atom in it, `ak`) is set down onto the rest, by a turn and a shift - and how far
 * its stubs then are from the rest's atoms they stand for, the farthest.
 * On one bond, exactly: its stub on the rest's atom, the bond along an
 * opening the rest leaves (or, with none, as the part was drawn). On two
 * or more, by the turn and shift that put the stubs nearest those atoms,
 * the squares of the distances summed.
 */
function setDown(
  mol: Molecule,
  p: readonly Point[],
  attachments: readonly { a: number; f: number }[],
  ak: readonly number[],
  stubs: number,
  rest: readonly (Point | null)[],
  part: ReadonlySet<number>,
): { move: (q: Point) => Point; mismatch: number }[] {
  const motion = (turn: number, from: Point, onto: Point) => (q: Point) => {
    const v = rotate(sub(q, from), turn);
    return { x: onto.x + v.x, y: onto.y + v.y };
  };
  if (attachments.length === 1) {
    const { a, f } = attachments[0];
    const stub = p[stubs];
    const along = angleOf(sub(p[ak[0]], stub));
    const ways = openings(mol, f, a, rest, part);
    if (!ways.length) return [{ move: motion(0, stub, rest[f]!), mismatch: 0 }];
    return ways.map((w) => ({ move: motion(w - along, stub, rest[f]!), mismatch: 0 }));
  }
  const from = attachments.map((_, k) => p[stubs + k]);
  const onto = attachments.map(({ f }) => rest[f]!);
  const mid = (ps: readonly Point[]) => ({ x: ps.reduce((s, q) => s + q.x, 0) / ps.length, y: ps.reduce((s, q) => s + q.y, 0) / ps.length });
  const [pc, qc] = [mid(from), mid(onto)];
  let [c, s] = [0, 0];
  from.forEach((q, k) => {
    const [u, v] = [sub(q, pc), sub(onto[k], qc)];
    c += dot(u, v);
    s += cross(u, v);
  });
  const move = motion(Math.atan2(s, c), pc, qc);
  const mismatch = Math.max(...from.map((q, k) => dist(move(q), onto[k])));
  return [{ move, mismatch }];
}

/**
 * How far a branch of the rest is turned about its atom `f`, set where the
 * part's stub for it is: its new bond to the part's atom (now at `atA`)
 * where it left room for the old - of two such ways, the nearer - so that
 * it keeps its direction as near as the new bond allows. None for an atom
 * bonded to nothing else of the rest.
 */
function branchTurn(mol: Molecule, f: number, a: number, rest: readonly (Point | null)[], stub: Point, atA: Point, part: ReadonlySet<number>): number {
  const ways = openings(mol, f, a, rest, part);
  if (!ways.length) return 0;
  const bond = angleOf(sub(atA, stub));
  const turns = ways.map((w) => wrap(bond - w));
  return turns.reduce((best, t) => (Math.abs(t) < Math.abs(best) - 1e-9 ? t : best));
}

/**
 * The rest's wedges and drawn H's that are kept: those at a centre that is
 * neither in the part nor bonded to it, on bonds still in the structure.
 * The part's centres, and those beside it, are given theirs afresh.
 */
function keptStereo(input: LayoutInput, stereo: Stereo | undefined, part: ReadonlySet<number>, attachments: readonly { a: number; f: number }[]): Stereo {
  if (!stereo) return { wedges: [], hydrogens: [] };
  const beside = new Set(attachments.map(({ f }) => f));
  const keeps = (c: number) => !part.has(c) && !beside.has(c) && !!input.atoms[c]?.tetra;
  const bonded = new Set(input.bonds.map((b) => key(b.a, b.b)));
  return {
    wedges: stereo.wedges.filter((w) => keeps(w.from) && (w.to < 0 || (!part.has(w.to) && bonded.has(key(w.from, w.to))))),
    hydrogens: stereo.hydrogens.filter((h) => keeps(h.on)),
  };
}

/**
 * The whole drawing with every atom where `pos` puts it: the rest's kept
 * wedges and H's (each H moved with its branch, by `motions`), and every
 * other centre's wedges placed afresh, as layout2D places them. Flat: the
 * rest drawn in perspective is the caller's to keep.
 */
function drawingOf(input: LayoutInput, mol: Molecule, pos: Map<number, Point>, kept: Stereo, motions: ReadonlyMap<number, (q: Point) => Point>): Layout2D {
  const n = input.atoms.length;
  const unit = (q: Point, on: number) => (motions.get(on) ?? ((x: Point) => x))(q);
  const hydrogens = kept.hydrogens.map((h) => ({ on: h.on, at: unit(h.at, h.on) }));
  const wedged = new Set([...kept.wedges.map((w) => w.from), ...kept.hydrogens.map((h) => h.on)]);
  const tetra = new Map<number, Tetrahedral>();
  input.atoms.forEach((a, c) => {
    if (a.tetra && !wedged.has(c)) tetra.set(c, a.tetra);
  });
  const taken = new Set(kept.wedges.filter((w) => w.to >= 0).map((w) => key(w.from, w.to)));
  const placed = placeStereo(mol, pos, tetra, taken);
  const wedges: Wedge[] = [...kept.wedges, ...placed.wedges];
  return {
    x: Array.from({ length: n }, (_, a) => pos.get(a)!.x),
    y: Array.from({ length: n }, (_, a) => pos.get(a)!.y),
    depth: new Array(n).fill(null),
    solid: new Array(n).fill(false),
    bold: [],
    toward: [],
    dashed: [],
    wedges,
    hydrogens: [...hydrogens, ...placed.hydrogens],
  };
}

/** The drawing in the rest's own unit, each atom of the rest that did not move exactly where it was given. */
function inUnit(out: Layout2D, unit: number, at: readonly (Point | null)[], part: ReadonlySet<number>, moved: readonly number[][]): Layout2D {
  const still = (a: number) => !part.has(a) && !moved.some((b) => b.includes(a));
  return {
    ...out,
    x: out.x.map((x, a) => (still(a) ? at[a]!.x : x * unit)),
    y: out.y.map((y, a) => (still(a) ? at[a]!.y : y * unit)),
    hydrogens: out.hydrogens.map((h) => ({ on: h.on, at: { x: h.at.x * unit, y: h.at.y * unit } })),
  };
}

/** Where the part, or a branch moved, crowds the drawing: atoms nearer than half a bond, bonds crossing - in words, each atom by its index as given (`given`), in that order. */
function crowding(input: LayoutInput, out: Layout2D, part: ReadonlySet<number>, moved: readonly number[][], given: (a: number) => number): string[] {
  const said = (a: number) => `${input.atoms[a].el}${given(a)}`;
  const n = input.atoms.length;
  const touched = new Set([...part, ...moved.flat()]);
  const p = (a: number) => ({ x: out.x[a], y: out.y[a] });
  const bonded = new Set(input.bonds.map((b) => key(b.a, b.b)));
  // (by their places as given: the same words whatever order the atoms came in)
  const place = given;
  const pair = (u: number, v: number) => (place(u) < place(v) ? [u, v] : [v, u]);
  const words: [number, number, string][] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if ((!touched.has(i) && !touched.has(j)) || bonded.has(key(i, j))) continue;
      const [u, v] = pair(i, j);
      if (dist(p(i), p(j)) < 0.5) words.push([place(u), place(v), `${said(u)} and ${said(v)} are on top of each other`]);
    }
  const bonds = input.bonds.map((b) => pair(b.a, b.b));
  for (let i = 0; i < bonds.length; i++)
    for (let j = i + 1; j < bonds.length; j++) {
      const [[a, b], [c, d]] = place(bonds[i][0]) < place(bonds[j][0]) ? [bonds[i], bonds[j]] : [bonds[j], bonds[i]];
      if (![a, b, c, d].some((x) => touched.has(x)) || a === c || a === d || b === c || b === d) continue;
      if (crosses(p(a), p(b), p(c), p(d))) words.push([place(a), place(c), `${said(a)}-${said(b)} crosses ${said(c)}-${said(d)}`]);
    }
  return words.sort((x, y) => x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : 1)).map((w) => w[2]);
}

/** Whether two segments cross, each strictly between its ends. */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => cross(sub(q, p), sub(r, p));
  const [d1, d2, d3, d4] = [side(c, d, a), side(c, d, b), side(a, b, c), side(a, b, d)];
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12;
}
