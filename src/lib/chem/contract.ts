/**
 * Which parts of a structure Clean-up writes as their labels
 * (docs/EDITOR-2D.md, "Clean-up"): a named group hanging by one bond, drawn
 * as the chemist would write it rather than atom by atom.
 *
 * - A protecting, activating or leaving group (`role`, ./abbreviations) is
 *   written by its name wherever it does that work - on a heteroatom or a
 *   metal (TBS even on ethanol), or, by an atom of its own that is not
 *   carbon, on a carbon (TMS, Bpin, Ts) - but not where the rest of the
 *   molecule is one atom or none: that is the group's own reagent (TsCl,
 *   Boc2O, B2pin2), and is drawn. On a carbon by a carbon it is something
 *   else - Boc so is a tert-butyl ester, MOM a methoxymethyl - and is
 *   counted with the other groups.
 * - Any other named group of three atoms or more hanging from a heteroatom
 *   or a metal is written by its name where it is under 15% of the
 *   molecule's atoms (`SHARE`): taxol's OAc and OBz, Pd(PPh3)4's phenyls;
 *   not aspirin's acetyl, a quarter of it. Methyl and ethyl are always
 *   drawn.
 * - Where the drawing still hides something, the largest groups left,
 *   alike ones together, are written by name too, as long as that hides
 *   less (`contractionTrials`).
 * - A group written as its formula wherever it hangs - an atom and the
 *   halogens on it (CF3, CCl3, CHF2, SF5) and a nitro group, NO2 - is
 *   written so, but where the rest of the molecule is one atom or none
 *   (CF3I). CO2H, CN, SO2Cl, SO3H and PO3H2 are drawn.
 * - A group the user has just drawn out (`keep`) is left drawn out.
 *
 * A heteroatom that hangs by one bond, all else on it now named, is written
 * with them in one label, as chemists write it: OTBS, NHBoc, PPh3, PPh2.
 */
import { GROUPS, abbreviationStructure, type Abbreviation } from "./abbreviations";
import { kekuleOrders } from "./kekulize";
import { implicitHydrogens } from "./molecule";
import { readSmiles } from "./smiles";
import type { Layout2D } from "../layout/engine";
import { layoutMetrics } from "../layout/metrics";
import { isMetal, type LayoutInput } from "../layout/perceive";

/** Under this share of a molecule's atoms, a named group on a heteroatom or a metal is written by name. */
export const SHARE = 0.15;

/** A structure as contraction reads it: its atoms - elements, or labels - and bonds, by index. */
export type ContractGraph = {
  atoms: { el: string; charge?: number }[];
  bonds: { a: number; b: number; order: number }[];
};

/**
 * A structure's atoms and bonds, by index, as contraction reads them: a
 * haptic bond's star joined to each atom of its pi system, so that a ring
 * bound to a metal so is not taken for a group hanging free.
 */
export function contractGraph(
  atoms: readonly { el: string; charge?: number }[],
  bonds: readonly { a1: number; a2: number; order?: number; endpoints?: readonly number[] }[],
): ContractGraph {
  const out: ContractGraph = { atoms: atoms.map((a) => ({ el: a.el, charge: a.charge })), bonds: [] };
  for (const b of bonds) {
    out.bonds.push({ a: b.a1, b: b.a2, order: b.order ?? 1 });
    for (const e of b.endpoints ?? []) out.bonds.push({ a: b.a2, b: e, order: 0 });
  }
  return out;
}

/** A part to write as a label: these atoms, shown as one labelled `label` where `at` is. */
export type Contraction = { atoms: number[]; at: number; label: string };

type Pattern = {
  group: Abbreviation;
  atoms: { el: string; charge: number }[];
  bonds: { a: number; b: number; order: number }[];
  /** The atom it is attached by. */
  root: number;
  aromatic: Set<string>;
};

const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
const ELEMENT = /^[A-Z][a-z]?$/;

/**
 * The bonds of six-membered rings whose bonds alternate single and double
 * - a benzene ring however its Kekulé structure is drawn - by key.
 */
function aromaticBonds(n: number, bonds: readonly { a: number; b: number; order: number }[]): Set<string> {
  const order = new Map(bonds.map((b) => [key(b.a, b.b), b.order]));
  const next: number[][] = Array.from({ length: n }, () => []);
  for (const b of bonds) {
    next[b.a].push(b.b);
    next[b.b].push(b.a);
  }
  const out = new Set<string>();
  const walk = (path: number[]) => {
    const last = path[path.length - 1];
    if (path.length === 6) {
      if (!next[last].includes(path[0])) return;
      const keys = path.map((a, i) => key(a, path[(i + 1) % 6]));
      const orders = keys.map((k) => order.get(k));
      if (orders.every((o, i) => o !== orders[(i + 1) % 6] && (o === 1 || o === 2))) keys.forEach((k) => out.add(k));
      return;
    }
    for (const v of next[last]) if (v > path[0] && !path.includes(v)) walk([...path, v]);
  };
  for (let a = 0; a < n; a++) walk([a]);
  return out;
}

let patterns: Pattern[] | null = null;

/** The dictionary's groups, each as a graph to look for: its atoms after the "*", by index. */
function groupPatterns(): Pattern[] {
  if (patterns) return patterns;
  patterns = [];
  for (const group of GROUPS) {
    const read = readSmiles(group.smiles);
    const star = read.atoms.findIndex((a) => a.el === "*");
    const orders = kekuleOrders(read.atoms, read.bonds);
    const keep = read.atoms.map((_, i) => i).filter((i) => i !== star);
    const at = new Map(keep.map((i, k) => [i, k]));
    const rootBond = read.bonds.find((b) => b.a1 === star || b.a2 === star);
    if (!rootBond) continue;
    const bonds = read.bonds.flatMap((b, i) =>
      b.a1 === star || b.a2 === star ? [] : [{ a: at.get(b.a1)!, b: at.get(b.a2)!, order: orders[i] }],
    );
    patterns.push({
      group,
      atoms: keep.map((i) => ({ el: read.atoms[i].el, charge: read.atoms[i].charge ?? 0 })),
      bonds,
      root: at.get(rootBond.a1 === star ? rootBond.a2 : rootBond.a1)!,
      aromatic: aromaticBonds(keep.length, bonds),
    });
  }
  return patterns;
}

/** The graph made ready to look in: neighbours, bond orders - aromatic as one - and heavy atoms. */
function prepared(g: ContractGraph) {
  const n = g.atoms.length;
  const next: number[][] = Array.from({ length: n }, () => []);
  for (const b of g.bonds) {
    next[b.a].push(b.b);
    next[b.b].push(b.a);
  }
  const aromatic = aromaticBonds(n, g.bonds);
  const order = new Map(g.bonds.map((b) => [key(b.a, b.b), aromatic.has(key(b.a, b.b)) ? 0 : b.order]));
  const isH = (a: number) => g.atoms[a].el === "H";
  const heavy = (a: number) => next[a].filter((v) => !isH(v));
  return { n, next, order, isH, heavy };
}

type Prepared = ReturnType<typeof prepared>;

/**
 * The atoms beyond `c` from `p` - all of them, H too - or null where the
 * bond is in a ring (they come back round to `p`), or where there are more
 * than `limit` of them.
 */
function beyond(P: Prepared, p: number, c: number, limit = Infinity): number[] | null {
  const seen = new Set([c]);
  const todo = [c];
  while (todo.length) {
    const u = todo.pop()!;
    for (const v of P.next[u]) {
      if (u === c && v === p) continue;
      if (v === p) return null;
      if (!seen.has(v)) {
        seen.add(v);
        if (seen.size > limit) return null;
        todo.push(v);
      }
    }
  }
  return [...seen];
}

/** Whether the heavy atoms `side`, attached by `c`, are exactly the group `pat`. */
function matches(g: ContractGraph, P: Prepared, side: number[], c: number, pat: Pattern): boolean {
  const heavySide = side.filter((a) => !P.isH(a));
  if (heavySide.length !== pat.atoms.length) return false;
  const inSide = new Set(heavySide);
  const patNext: number[][] = pat.atoms.map(() => []);
  for (const b of pat.bonds) {
    patNext[b.a].push(b.b);
    patNext[b.b].push(b.a);
  }
  const patOrder = new Map(pat.bonds.map((b) => [key(b.a, b.b), pat.aromatic.has(key(b.a, b.b)) ? 0 : b.order]));
  const map = new Map<number, number>();
  const used = new Set<number>();
  const fits = (u: number, v: number) => {
    const a = g.atoms[v];
    if (a.el !== pat.atoms[u].el || (a.charge ?? 0) !== pat.atoms[u].charge) return false;
    // as many heavy neighbours as the group's atom has - the root one more, its bond out
    const deg = P.heavy(v).filter((w) => inSide.has(w)).length;
    if (deg !== patNext[u].length || P.heavy(v).length !== deg + (u === pat.root ? 1 : 0)) return false;
    for (const w of patNext[u]) {
      const x = map.get(w);
      if (x != null && P.order.get(key(v, x)) !== patOrder.get(key(u, w))) return false;
    }
    return true;
  };
  const order: number[] = [pat.root];
  for (let i = 0; i < order.length; i++) for (const w of patNext[order[i]]) if (!order.includes(w)) order.push(w);
  const place = (i: number): boolean => {
    if (i === order.length) return true;
    const u = order[i];
    const from = patNext[u].find((w) => map.has(w));
    const candidates = from == null ? [c] : P.heavy(map.get(from)!).filter((v) => inSide.has(v) && !used.has(v));
    for (const v of candidates) {
      if (!fits(u, v)) continue;
      map.set(u, v);
      used.add(v);
      if (place(i + 1)) return true;
      map.delete(u);
      used.delete(v);
    }
    return false;
  };
  return place(0);
}

/** A named group found hanging: from `p`, by `c`, its atoms (H too). */
type Found = { group: Abbreviation; p: number; c: number; atoms: number[]; heavy: number };

/** Every named group hanging by one bond, the largest first. */
function found(g: ContractGraph, P: Prepared): Found[] {
  const pats = groupPatterns();
  const sizes = new Set(pats.map((p) => p.atoms.length));
  // (a group's H counted too, the largest with all of its drawn)
  const limit = 3 * Math.max(...sizes);
  const out: Found[] = [];
  for (const b of g.bonds) {
    // (a group hangs by a single bond)
    if (b.order !== 1) continue;
    for (const [p, c] of [
      [b.a, b.b],
      [b.b, b.a],
    ]) {
      if (P.isH(c) || P.isH(p) || !ELEMENT.test(g.atoms[c].el)) continue;
      const side = beyond(P, p, c, limit);
      if (!side) continue;
      const heavy = side.filter((a) => !P.isH(a)).length;
      if (!sizes.has(heavy) || side.some((a) => !ELEMENT.test(g.atoms[a].el) || isMetal(g.atoms[a].el))) continue;
      const pat = pats.find((q) => q.atoms.length === heavy && matches(g, P, side, c, q));
      if (pat) out.push({ group: pat.group, p, c, atoms: side, heavy });
    }
  }
  return out.sort((x, y) => y.heavy - x.heavy);
}

const HALOGENS = ["F", "Cl", "Br", "I"];

/**
 * The groups written as their formulas wherever they hang (by one single
 * bond): an atom and the halogens on it, two or more - CF3, CCl3, CHF2,
 * SF5 - and a nitro group, NO2. (Not one whose atoms beyond the first
 * carry H, nor a carbonyl's or a sulfonyl's: CO2H, CN, SO2Cl, SO3H and
 * PO3H2 are drawn.) Each with its formula, where Meno reads that formula
 * as the same atoms.
 */
function formulas(g: ContractGraph, P: Prepared): Found[] {
  const out: Found[] = [];
  const terminal = (t: number, c: number) => P.heavy(t).length === 1 && P.heavy(t)[0] === c && !P.next[t].some(P.isH);
  for (const b of g.bonds) {
    if (b.order !== 1) continue;
    for (const [p, c] of [
      [b.a, b.b],
      [b.b, b.a],
    ]) {
      const el = g.atoms[c].el;
      if (P.isH(p) || P.isH(c) || !ELEMENT.test(el) || isMetal(el) || !ELEMENT.test(g.atoms[p].el)) continue;
      const ends = P.heavy(c).filter((t) => t !== p);
      if (ends.length < 2 || !ends.every((t) => terminal(t, c))) continue;
      const els = ends.map((t) => g.atoms[t].el);
      let label: string | null = null;
      if (els.every((x) => HALOGENS.includes(x)) && !(g.atoms[c].charge ?? 0)) {
        // its H, drawn or not, after it; then the halogens, the most first
        const heavyOrders = P.heavy(c).reduce((t, v) => t + (P.order.get(key(c, v)) || 1), 0);
        const toMetals = P.heavy(c).reduce((t, v) => t + (isMetal(g.atoms[v].el) ? P.order.get(key(c, v)) || 1 : 0), 0);
        // (an H drawn takes its place among the bonds, so it is not counted again: CHCl2 with its H drawn is CHCl2)
        const drawnH = P.next[c].filter(P.isH).length;
        const hs = implicitHydrogens(el, heavyOrders + drawnH, 0, undefined, toMetals) + drawnH;
        const counts = HALOGENS.map((x) => [x, els.filter((y) => y === x).length] as const)
          .filter(([, n]) => n > 0)
          .sort((u, v) => v[1] - u[1]);
        label = `${el}${hs ? `H${hs > 1 ? hs : ""}` : ""}${counts.map(([x, n]) => `${x}${n > 1 ? n : ""}`).join("")}`;
      } else if (el === "N" && els.length === 2 && els.every((x) => x === "O")) {
        label = "NO2";
      }
      if (!label) continue;
      // (read as the same atoms)
      const read = abbreviationStructure(label);
      const heavyOf = (xs: string[]) => xs.filter((x) => x !== "H" && x !== "*").sort().join();
      if (!read || read.attach.length !== 1 || heavyOf(read.atoms.map((a) => a.el)) !== heavyOf([el, ...els])) continue;
      const atoms = beyond(P, p, c);
      if (!atoms) continue;
      out.push({ group: { label, smiles: "", name: label }, p, c, atoms, heavy: 1 + ends.length });
    }
  }
  return out;
}

/** How many atoms a structure's atoms stand for: a label its group's heavy atoms. */
function weightOf(el: string): number {
  if (el === "H" || el === "*") return 0;
  if (ELEMENT.test(el)) return 1;
  return abbreviationStructure(el)?.atoms.filter((a) => a.el !== "H" && a.el !== "*").length ?? 1;
}

/**
 * What of `g` Clean-up writes as labels, by the rules above: the groups
 * `keep` holds none of (the user's last drawing out), and, after them,
 * `extra` - found by `crowdedContractions` where the drawing hid something.
 */
export function contractions(g: ContractGraph, keep: ReadonlySet<number> = new Set(), extra: readonly Found[] = []): Contraction[] {
  const P = prepared(g);
  const total = g.atoms.reduce((s, a) => s + weightOf(a.el), 0);
  const taken = new Set<number>();
  const chosen: Found[] = [];
  const free = (f: Found) => f.atoms.every((a) => !taken.has(a) && !keep.has(a)) && !taken.has(f.p);
  const take = (f: Found) => {
    chosen.push(f);
    f.atoms.forEach((a) => taken.add(a));
  };
  const all = found(g, P);
  // protecting groups, where something besides them is drawn
  const roles: Found[] = [];
  const inRoles = new Set<number>();
  // (doing its work: on a heteroatom or a metal, or by an atom not carbon)
  const working = (f: Found) => f.group.role === "protecting" && (g.atoms[f.p].el !== "C" || g.atoms[f.c].el !== "C");
  for (const f of all) {
    if (!working(f) || !free(f) || f.atoms.some((a) => inRoles.has(a))) continue;
    roles.push(f);
    f.atoms.forEach((a) => inRoles.add(a));
  }
  const rest = total - roles.reduce((s, f) => s + f.heavy, 0);
  if (rest > 1) roles.forEach(take);
  // groups written as their formulas, where something besides them is
  // drawn - two atoms or more, a label counting as one (CF3I and the
  // Ruppert-Prakash reagent's CF3 on its TMS are drawn)
  let drawn = g.atoms.filter((_, i) => !P.isH(i) && !taken.has(i)).length + chosen.length;
  for (const f of formulas(g, P)) {
    if (!free(f) || drawn - f.heavy < 2) continue;
    take(f);
    drawn -= f.heavy - 1;
  }
  // other named groups, small beside the molecule, on a heteroatom or a metal
  for (const f of all) {
    if (working(f) || f.heavy < 3 || !free(f)) continue;
    const on = g.atoms[f.p].el;
    if (!ELEMENT.test(on) || on === "C" || on === "H") continue;
    if (f.heavy / total < SHARE) take(f);
  }
  for (const f of extra) if (free(f)) take(f);
  return merged(g, P, chosen, keep);
}

/**
 * What of `g` to try writing as labels, in turn: what the rules choose
 * (`contractions`), and then, while the layout drawn with the last still
 * hides something (`hiddenIn`, sent back by the caller), that and the
 * largest groups left besides - alike ones together - for as long as each
 * try hides less than the one before. The caller keeps the try that hid
 * least.
 */
export function* contractionTrials(
  g: ContractGraph,
  keep: ReadonlySet<number> = new Set(),
): Generator<Contraction[], void, number> {
  let extra: Found[] = [];
  let chosen = contractions(g, keep);
  let hidden = yield chosen;
  while (hidden > 0) {
    const more = crowdedContractions(g, keep, chosen);
    if (!more.length) return;
    extra = [...extra, ...more];
    const next = contractions(g, keep, extra);
    const size = (cs: Contraction[]) => cs.reduce((t, c) => t + c.atoms.length, 0);
    if (size(next) <= size(chosen)) return;
    const now = yield next;
    if (now >= hidden) return;
    chosen = next;
    hidden = now;
  }
}

/**
 * The groups Clean-up would write by name next where the drawing still hides
 * something: the largest of those left, alike ones together - each found
 * group hanging by one bond, of three atoms or more, not one `keep` holds.
 */
function crowdedContractions(g: ContractGraph, keep: ReadonlySet<number>, already: readonly Contraction[]): Found[] {
  const P = prepared(g);
  const taken = new Set(already.flatMap((c) => c.atoms));
  const left = found(g, P).filter(
    (f) => f.heavy >= 3 && f.atoms.every((a) => !taken.has(a) && !keep.has(a)) && !taken.has(f.p),
  );
  if (!left.length) return [];
  const label = left[0].group.label;
  return left.filter((f) => f.group.label === label);
}

/**
 * The groups chosen, as contractions: each on its own, or - where they are
 * all on one heteroatom that hangs by one bond and is in no ring - that
 * atom and they in one label, where Meno reads that label as the same atoms
 * (OTBS, NHBoc, PPh3, PCy2) and `keep` does not hold the atom.
 */
function merged(g: ContractGraph, P: Prepared, chosen: Found[], keep: ReadonlySet<number>): Contraction[] {
  const byParent = new Map<number, Found[]>();
  for (const f of chosen) byParent.set(f.p, [...(byParent.get(f.p) ?? []), f]);
  const out: Contraction[] = [];
  for (const [p, fs] of byParent) {
    const atom = g.atoms[p];
    const others = P.heavy(p).filter((v) => !fs.some((f) => f.c === v));
    const labels = new Set(fs.map((f) => f.group.label));
    const inRing = others.length === 1 && beyond(P, others[0], p) == null;
    const own = ELEMENT.test(atom.el) && atom.el !== "C" && !isMetal(atom.el) && !(atom.charge ?? 0);
    if (own && !keep.has(p) && others.length === 1 && labels.size === 1 && !inRing) {
      // its H, drawn or not: what its bonds to heavy atoms leave of its valence
      const orderTo = (v: number) => g.bonds.find((b) => key(b.a, b.b) === key(p, v))?.order ?? 1;
      const heavyOrders = P.heavy(p).reduce((s, v) => s + orderTo(v), 0);
      const drawnH = P.next[p].filter((v) => P.isH(v));
      // (its bonds to metals apart: a phosphine on a metal is PPh3, no P-H - the core's count)
      const toMetals = P.heavy(p).reduce((s, v) => s + (isMetal(g.atoms[v].el) ? orderTo(v) : 0), 0);
      const hs = implicitHydrogens(atom.el, heavyOrders, 0, undefined, toMetals);
      const name = fs[0].group.label;
      const label = `${atom.el}${hs ? `H${hs > 1 ? hs : ""}` : ""}${name}${fs.length > 1 ? fs.length : ""}`;
      const read = abbreviationStructure(label);
      const heavy = 1 + fs.reduce((s, f) => s + f.heavy, 0);
      if (read && read.atoms.filter((a) => a.el !== "H" && a.el !== "*").length === heavy) {
        out.push({ atoms: [p, ...drawnH, ...fs.flatMap((f) => f.atoms)], at: p, label });
        continue;
      }
    }
    for (const f of fs) out.push({ atoms: f.atoms, at: f.c, label: f.group.label });
  }
  return out;
}


/**
 * How much a layout hides: atoms on each other, and atoms lying on bonds
 * they are not part of (../layout/metrics) - what writing more groups by
 * name is for.
 */
export function hiddenIn(input: LayoutInput, laid: Layout2D): number {
  const m = layoutMetrics({
    x: laid.x,
    y: laid.y,
    edges: input.bonds.map((b) => [b.a, b.b] as const),
    orders: input.bonds.map((b) => b.order),
    // (a star at a pi system's centre is drawn as nothing)
    labelled: input.atoms.map((a) => (a.el !== "C" && a.el !== "*") || !!a.charge),
    elements: input.atoms.map((a) => a.el),
    hydrogens: input.atoms.map((a) => a.hs ?? 0),
    perspective: laid.solid,
    depth: laid.depth,
  });
  return m.overlaps + m.clashes;
}
