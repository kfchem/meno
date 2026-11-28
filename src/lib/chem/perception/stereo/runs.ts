/**
 * Runs of cumulated double bonds, written once (foundation part 4, C): where a run is, end to end, whether it has an even number of
 * double bonds (an allene's, C=C=C: an axis) or an odd one (a butatriene's, C=C=C=C: a cis or trans, as a double bond's), and the atom
 * an axis's or a cumulene's end runs on through. Every reader of such a run - the SMILES reader, the drawing's, 3D's, the CIP's marks,
 * the layout's open double bonds - finds it here.
 *
 * A run is reported whatever it ends on and whatever ring it is in: a ketene's C=C=O is a run of two ending on its O, a carbodiimide's
 * N=C=N a run of two with N ends, a run in a ring a run. Whether such a run is a stereo unit - an end with nothing on it, a ring too
 * small for its configuration - is each caller's rule, with its own basis.
 *
 * **What a run goes on through** differs between the readers, and each keeps its own (`Middle`): a move, no answer changes.
 */

/** A run of cumulated double bonds: its atoms end to end, the lower-numbered end first; how many double bonds; whether that is odd. */
export type Run = {
  /** The run's atoms, end to end: `atoms[0]` and the last are its ends, `atoms[0]` the lower-numbered. */
  atoms: readonly number[];
  /** How many double bonds it has: one fewer than its atoms. */
  doubles: number;
  /** An odd number (a butatriene's, three): a cis or trans across it. Even (an allene's, two): an axis. */
  odd: boolean;
};

/**
 * Which atoms a run goes on through - an atom between two of its double bonds:
 * - `linear`, the readers' - the drawing's, the SMILES's and 3D's: a carbon, or an N+, bonded by its two double bonds and nothing else (a
 *   sulfur's C=S=C is bent, and no run - the rule the restraints' linear-by-bonds has; an N with no charge and two double bonds has
 *   four bonds, which a closed-shell N has only as an N+: a file that lost its charge, read as no run);
 * - `twoDoubles`, the CIP marks': any atom with two double bonds, whatever else it is bonded to.
 */
export type Middle = "linear" | "twoDoubles";

/** The atoms and bonds a run is found in: an atom's element (a carbon where none is said) and charge; bonds by their atoms' indices. */
export type RunGraph = {
  atoms: readonly { el?: string; charge?: number }[];
  bonds: readonly { a: number; b: number; order: number }[];
};

/** A graph's runs, worked out once: whether an atom is one a run goes on through, the run from an end on, and every run. */
export type Runs = {
  /** Whether `x` is an atom a run goes on through (`Middle`). */
  middle(x: number): boolean;
  /** The atoms along the run from `end` through its double bond to `next`, on to the run's far end (`[end, next]` where it goes no further). */
  from(end: number, next: number): number[];
  /** The run a double bond is in, from end to end - the bond's own two atoms where it is in none - and how many double bonds it has. */
  of(a: number, b: number): Run;
  /**
   * Whether `end` has a bond of order two or more besides the one to `other`: a double bond's end with a second double bond, or a triple
   * one - an allene's middle C, an azide's middle N - is straight through, and that double bond has no cis or trans of its own.
   */
  cumulatedAt(end: number, other: number): boolean;
  /** Every run of two or more double bonds, each once, in order of its first end. */
  all: readonly Run[];
};

const runOf = (atoms: readonly number[]): Run => {
  const ordered = atoms[0] <= atoms[atoms.length - 1] ? atoms : [...atoms].reverse();
  return { atoms: ordered, doubles: atoms.length - 1, odd: (atoms.length - 1) % 2 === 1 };
};

/** `g`'s runs of cumulated double bonds, by the rule `middle` of what a run goes on through (the reader's where none is said). */
export function runsOf(g: RunGraph, middle: Middle = "linear"): Runs {
  const n = g.atoms.length;
  const near: number[][] = g.atoms.map(() => []);
  const order = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (const b of g.bonds) {
    if (b.a === b.b || near[b.a] == null || near[b.b] == null || order.has(key(b.a, b.b))) continue;
    near[b.a].push(b.b);
    near[b.b].push(b.a);
    order.set(key(b.a, b.b), b.order);
  }
  const orderOf = (a: number, b: number) => order.get(key(a, b)) ?? 0;
  const doubles = (x: number) => near[x].filter((m) => orderOf(x, m) === 2);
  const linear = (x: number) => {
    const { el = "C", charge = 0 } = g.atoms[x];
    return el === "C" || (el === "N" && charge === 1);
  };
  const isMiddle =
    middle === "twoDoubles"
      ? (x: number) => doubles(x).length === 2
      : (x: number) => near[x].length === 2 && near[x].every((m) => orderOf(x, m) === 2) && linear(x);
  const from = (end: number, next: number): number[] => {
    const run = [end, next];
    while (isMiddle(run[run.length - 1]) && run.length <= n) {
      const x = run[run.length - 1];
      const on = (middle === "twoDoubles" ? doubles(x) : near[x]).find((m) => m !== run[run.length - 2]);
      if (on == null) break;
      run.push(on);
    }
    return run;
  };
  const all: Run[] = [];
  for (let a = 0; a < n; a++) {
    if (isMiddle(a)) continue;
    for (const m of near[a]) {
      if (orderOf(a, m) !== 2 || !isMiddle(m)) continue;
      const run = from(a, m);
      if (a < run[run.length - 1]) all.push(runOf(run));
    }
  }
  const of = (a: number, b: number): Run => {
    // (on from b through a, turned round - its far end first, then a, b - and on from a through b, which starts a, b again)
    const back = from(b, a).reverse();
    return runOf([...back.slice(0, -2), ...from(a, b)]);
  };
  const cumulatedAt = (end: number, other: number) => near[end].some((m) => m !== other && orderOf(end, m) >= 2);
  return { middle: isMiddle, from, of, cumulatedAt, all };
}

/** Every run of cumulated double bonds in `g`, each once, in order of its first end (`runsOf`). */
export function cumulatedRuns(g: RunGraph, middle: Middle = "linear"): readonly Run[] {
  return runsOf(g, middle).all;
}

/**
 * The atom an axis's or a cumulene's end runs on through toward its other end, of the end's own neighbours (`near`): `other`, where the
 * end is bonded to it (a biaryl's); else the atom across its first bond of order two or more (an allene's, a butatriene's) - so that the
 * end's own groups are the rest of its neighbours. None where it has neither: each caller says what stands in.
 */
export function runsThrough(near: readonly { to: number; order: number }[], other?: number): number | undefined {
  if (other != null && near.some((e) => e.to === other)) return other;
  return near.find((e) => e.order >= 2)?.to;
}
