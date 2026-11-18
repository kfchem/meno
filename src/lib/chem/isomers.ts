/**
 * The stereoisomers of a structure, counted by Meno (foundation part 13, E): every way of giving a configuration to each place the
 * core's candidates leave open (perception/stereo/candidates: a centre, a double bond, a run of cumulated double bonds, by shape),
 * those given kept, each written by Meno's identity - the distinct identities are the stereoisomers, each with one way that makes
 * it. Dependent places fall out: a meso form's two writings, a centre that sets nothing, are one identity. A biaryl's axis is
 * none to give: only a drawing states one, so atropisomers are not counted (`NOT_COUNTED_AXES`, to say beside a count). A cage's
 * or a bridged system's bridgehead left open gives no count (`NOT_COUNTED_CAGE`): its senses are tied by the cage, which this
 * does not know. Past `ASSIGNMENTS_TRIED` ways, none is written and the answer says how many there were.
 */
import { hydrogensFolded } from "./perception/fold";
import { candidates } from "./perception/stereo/candidates";
import { identity, type IdentityInput } from "./identity";

/**
 * The most ways of giving the open places their configurations `isomersOf` writes: two to the tenth, ten open places. MEASURED,
 * one machine: inositol's 64 ways in 79 ms; a cholesterol skeleton's 256 (its eight centres, 256 stereoisomers) in 0.7 s; ten
 * centres on a chain, 1024 ways, in 1.6 s. Past it the count grows twofold a place: worked out off the drawing's thread by
 * whoever asks, never on it.
 */
export const ASSIGNMENTS_TRIED = 1024;

/** One stereoisomer: its identity text and the structure, every open place given, that makes it. */
export type Stereoisomer = { text: string; input: IdentityInput };

/** A place `isomersOf` gives a configuration to - a centre by its atom - and how: up or down, cis or trans, one sense of an axis or the other. */
type Open = { at?: number; set: (g: IdentityInput, up: boolean) => IdentityInput };

/** What is said where a cage or a bridged system is left open (`isomersOf`): what the structure has, not how it is counted. */
export const NOT_COUNTED_CAGE = "Its stereoisomers are not counted: a cage or a bridged ring system in it has a configuration not given";

/** What is said beside a count (`isomersOf`): what it leaves out. */
export const NOT_COUNTED_AXES = "Atropisomers are not counted";

/**
 * The atoms of `g` a cage holds: an atom joined to another by three paths that share no atom but their ends, each with
 * `BRIDGE_MOST` atoms or fewer between them - a bridgehead of norbornane, of camphor, of tropane, every atom of cubane and of
 * adamantane's cage. A fused system's junction is none (decalin's: its other two paths have four atoms), nor a bridgehead whose
 * bridges are long enough to stand in or out (bicyclo[4.4.1]undecane's), whose senses are its own.
 */
function cageAtoms(g: IdentityInput): Set<number> {
  const around: number[][] = g.atoms.map(() => []);
  for (const b of g.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
  }
  const out = new Set<number>();
  for (let a = 0; a < g.atoms.length; a++) {
    // (three paths need three bonds)
    if (around[a].length < 3) continue;
    // (every path out of `a` of up to BRIDGE_MOST + 1 bonds, by the atom it ends at: its atoms between)
    const paths = new Map<number, number[][]>();
    const walk = (at: number, between: number[]) => {
      for (const n of around[at]) {
        if (n === a || between.includes(n)) continue;
        paths.set(n, [...(paths.get(n) ?? []), between]);
        if (between.length < BRIDGE_MOST) walk(n, [...between, n]);
      }
    };
    walk(a, []);
    for (const ps of paths.values()) {
      if (ps.length < 3) continue;
      // (three of them sharing no atom between)
      const apart = (p: number[], q: number[]) => !p.some((x) => q.includes(x));
      let found = false;
      for (let i = 0; i < ps.length && !found; i++)
        for (let j = i + 1; j < ps.length && !found; j++) {
          if (!apart(ps[i], ps[j])) continue;
          for (let k = j + 1; k < ps.length && !found; k++) if (apart(ps[i], ps[k]) && apart(ps[j], ps[k])) found = true;
        }
      if (found) {
        out.add(a);
        break;
      }
    }
  }
  return out;
}

/** The most atoms a cage's bridge has between its bridgeheads for their senses to be tied (`cageAtoms`): with four, in,out isomers begin. */
const BRIDGE_MOST = 3;

/**
 * The stereoisomers of `input` (see the file's header), in the order of their identity texts, and whether every identity was
 * written in full (`identity`'s `complete`) - or, past `most` ways, how many there were.
 */
export function isomersOf(input: IdentityInput, most = ASSIGNMENTS_TRIED): { isomers: Stereoisomer[]; complete: boolean } | { tooMany: number } | { notCounted: string } {
  const g = hydrogensFolded(input);
  // (a cage's bridgeheads stand only one way to each other, which giving each its own sense does not know: one whose two senses
  //  are one structure - norbornane's, two of its bridges alike - is no place to give; any other, none counted, said - until
  //  Meno ties them, its own item)
  const caged = cageAtoms(g);
  const open = openPlaces(g).filter((o) => o.at == null || !caged.has(o.at) || identity(o.set(g, true)).text !== identity(o.set(g, false)).text);
  if (open.some((o) => o.at != null && caged.has(o.at))) return { notCounted: NOT_COUNTED_CAGE };
  const ways = 2 ** open.length;
  if (ways > most) return { tooMany: ways };
  const found = new Map<string, IdentityInput>();
  let complete = true;
  for (let way = 0; way < ways; way++) {
    const given = open.reduce((h, o, k) => o.set(h, (way & (1 << k)) === 0), g);
    const w = identity(given);
    complete &&= w.complete;
    if (!found.has(w.text)) found.set(w.text, given);
  }
  const isomers = [...found].map(([text, made]) => ({ text, input: made })).sort((p, q) => (p.text < q.text ? -1 : p.text > q.text ? 1 : 0));
  return { isomers, complete };
}

/** The places the candidates leave open in `g` (a structure with its plain hydrogens folded in), each as how to give it one way or the other. */
function openPlaces(g: IdentityInput): Open[] {
  const around: number[][] = g.atoms.map(() => []);
  const order = new Map<string, number>();
  const pair = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
  for (const b of g.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
    order.set(pair(b.a, b.b), b.order);
  }
  for (const a of around) a.sort((p, q) => p - q);
  // (a group on an end, besides `not` and the run's own double bonds)
  const groupOf = (end: number, not: number) => around[end].find((n) => n !== not && order.get(pair(end, n)) !== 2);
  const key = (xs: readonly number[]) => [...xs].sort((p, q) => p - q).join(",");
  const given = new Set([...(g.axes ?? []), ...(g.cumulated ?? [])].map((x) => key(x.atoms)));
  const out: Open[] = [];
  for (const c of candidates(g)) {
    if (c.kind === "centre") {
      const at = c.at;
      if (g.atoms[at].tetra) continue;
      const neighbours = [...around[at], ...((g.atoms[at].hs ?? 0) ? [-1] : [])];
      out.push({ at, set: (h, up) => ({ ...h, atoms: h.atoms.map((a, i) => (i === at ? { ...a, tetra: { neighbours, volume: up ? 1 : -1 } } : a)) }) });
    } else if (c.kind === "bond") {
      const k = c.at;
      const b = g.bonds[k];
      if (b.stereo) continue;
      const refs = [around[b.a].find((n) => n !== b.b)!, around[b.b].find((n) => n !== b.a)!] as const;
      out.push({ set: (h, up) => ({ ...h, bonds: h.bonds.map((x, i) => (i === k ? { ...x, stereo: { refs, cis: up } } : x)) }) });
    } else if (c.kind === "axis" || c.kind === "cumulated") {
      if (given.has(key(c.ends))) continue;
      const atoms = c.ends;
      const refs = [groupOf(atoms[0], -1)!, groupOf(atoms[1], -1)!] as const;
      if (c.kind === "axis") out.push({ set: (h, up) => ({ ...h, axes: [...(h.axes ?? []), { atoms, refs, sense: up ? 1 : -1 }] }) });
      else out.push({ set: (h, up) => ({ ...h, cumulated: [...(h.cumulated ?? []), { atoms, refs, cis: up }] }) });
    }
  }
  return out;
}
