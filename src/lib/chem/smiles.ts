/**
 * A reader for the plain part of SMILES, as OpenSMILES describes it: atoms
 * of the organic subset and in brackets (isotope, hydrogens, charge),
 * aromatic atoms, branches, ring closures and bond symbols, and "*" for an
 * atom of any kind - enough for the groups Meno's abbreviations stand for
 * (./abbreviations), written by hand. A tetrahedral centre's @ or @@ is
 * kept, as the configuration Meno's layout engine takes, and a double
 * bond's cis or trans, as its neighbours' directional bonds (/ and \) say
 * it; other stereo marks are read past. An atom class is kept: a ligand's
 * (./ligands) marks the atoms that bind a metal.
 */

export type SmilesAtom = {
  el: string;
  charge?: number;
  /** Hydrogens a bracket atom says it has; an organic-subset atom's are by valence. */
  hs?: number;
  isotope?: number;
  aromatic?: boolean;
  /** Its atom class ([P:1]): which of a ligand's donors it is. */
  cls?: number;
  /** Its configuration, where it is a tetrahedral centre ([C@H], [C@@]). */
  tetra?: Configuration;
};
/**
 * A tetrahedral centre's configuration, as Meno's layout engine takes it
 * (lib/layout/stereo): its neighbours by index, -1 for its H, last, and the
 * sign of the volume the first three span, seen from the centre.
 */
export type Configuration = { neighbours: number[]; volume: 1 | -1 };
/**
 * A bond by atom index; order 4 is aromatic. A double bond with a
 * directional bond (/ or \) on each end has its cis or trans: an atom
 * bonded to each end (`refs`, the first to `a1`), and whether the two are
 * on the same side.
 */
export type SmilesBond = { a1: number; a2: number; order: number; cisTrans?: { refs: [number, number]; cis: boolean } };
export type Smiles = { atoms: SmilesAtom[]; bonds: SmilesBond[] };

const ORGANIC = ["Cl", "Br", "B", "C", "N", "O", "P", "S", "F", "I"];
const AROMATIC = ["b", "c", "n", "o", "p", "s"];
const BOND_ORDER: Record<string, number> = { "-": 1, "=": 2, "#": 3, $: 4, ":": 4, "/": 1, "\\": 1 };

/** A SMILES string's atoms and bonds; throws on what it cannot read. */
export function readSmiles(text: string): Smiles {
  const atoms: SmilesAtom[] = [];
  const bonds: SmilesBond[] = [];
  const stack: number[] = [];
  const rings = new Map<number, { atom: number; order: number | null; slot: number; dir: string | null }>();
  // each atom's neighbours in the order OpenSMILES reads a centre's by: the
  // atom before it, its own H, its ring closures as their digits come, then
  // the atoms after it; and the centres, @ or @@
  const around: number[][] = [];
  const chiral = new Map<number, string>();
  let prev = -1;
  let pending: number | null = null;
  // (a directional bond's mark, / or \, and each such bond as written: from
  // the atom before it to the atom after)
  let pendingDir: string | null = null;
  const directed: { from: number; to: number; up: boolean }[] = [];
  let i = 0;
  const connect = (a: number, mark = "") => {
    around[a] = prev >= 0 ? [prev] : [];
    if (mark) chiral.set(a, mark);
    if (atoms[a].hs === 1) around[a].push(-1);
    if (prev >= 0) {
      const both = atoms[prev].aromatic && atoms[a].aromatic;
      bonds.push({ a1: prev, a2: a, order: pending ?? (both ? 4 : 1) });
      around[prev].push(a);
      if (pendingDir) directed.push({ from: prev, to: a, up: pendingDir === "/" });
    }
    pending = null;
    pendingDir = null;
    prev = a;
  };
  while (i < text.length) {
    const c = text[i];
    if (c === "(") {
      stack.push(prev);
      i++;
      continue;
    }
    if (c === ")") {
      if (!stack.length) throw new Error(`Unopened branch at ${i} in ${text}`);
      prev = stack.pop()!;
      i++;
      continue;
    }
    if (c === ".") {
      prev = -1;
      i++;
      continue;
    }
    if (c in BOND_ORDER) {
      pending = BOND_ORDER[c];
      if (c === "/" || c === "\\") pendingDir = c;
      i++;
      continue;
    }
    if (/\d/.test(c) || c === "%") {
      const n = c === "%" ? Number.parseInt(text.slice(i + 1, i + 3), 10) : Number.parseInt(c, 10);
      i += c === "%" ? 3 : 1;
      const open = rings.get(n);
      if (open) {
        const both = atoms[open.atom].aromatic && atoms[prev].aromatic;
        bonds.push({ a1: open.atom, a2: prev, order: pending ?? open.order ?? (both ? 4 : 1) });
        around[open.atom][open.slot] = prev;
        around[prev].push(open.atom);
        // (a ring bond's direction as written where its mark is: at its
        // closing digit, from this atom to the one that opened it; at its
        // opening one, from that atom to this)
        if (pendingDir) directed.push({ from: prev, to: open.atom, up: pendingDir === "/" });
        else if (open.dir) directed.push({ from: open.atom, to: prev, up: open.dir === "/" });
        rings.delete(n);
      } else {
        rings.set(n, { atom: prev, order: pending, slot: around[prev].push(-2) - 1, dir: pendingDir });
      }
      pending = null;
      pendingDir = null;
      continue;
    }
    if (c === "*") {
      atoms.push({ el: "*" });
      connect(atoms.length - 1);
      i++;
      continue;
    }
    if (c === "[") {
      const end = text.indexOf("]", i);
      if (end < 0) throw new Error(`Unclosed bracket at ${i} in ${text}`);
      const { atom, mark } = bracketAtom(text.slice(i + 1, end));
      atoms.push(atom);
      connect(atoms.length - 1, mark);
      i = end + 1;
      continue;
    }
    const organic = ORGANIC.find((s) => text.startsWith(s, i));
    if (organic) {
      atoms.push({ el: organic });
      connect(atoms.length - 1);
      i += organic.length;
      continue;
    }
    if (AROMATIC.includes(c)) {
      atoms.push({ el: c.toUpperCase(), aromatic: true });
      connect(atoms.length - 1);
      i++;
      continue;
    }
    throw new Error(`Cannot read "${c}" at ${i} in ${text}`);
  }
  if (rings.size) throw new Error(`Unclosed ring in ${text}`);
  for (const [at, mark] of chiral) {
    const tetra = configuration(around[at], mark);
    if (tetra) atoms[at].tetra = tetra;
  }
  // A double bond's cis or trans (OpenSMILES): a directional bond on each
  // end; a neighbour written before its end with "/" lies below it, one
  // written after it above, "\\" the other way; the two the same side, cis
  // (F/C=C/F trans, F/C=C\\F cis)
  const side = (end: number, other: number) => {
    const d = directed.find((b) => (b.from === end && b.to !== other) || (b.to === end && b.from !== other));
    if (!d) return null;
    const n = d.from === end ? d.to : d.from;
    return { n, above: d.from === end ? d.up : !d.up };
  };
  for (const b of bonds) {
    if (b.order !== 2) continue;
    const [p, q] = [side(b.a1, b.a2), side(b.a2, b.a1)];
    if (p && q) b.cisTrans = { refs: [p.n, q.n], cis: p.above === q.above };
  }
  return { atoms, bonds };
}

/**
 * A centre's configuration from its neighbours in SMILES order and its
 * mark: @, looking from the first, the other three go round anticlockwise;
 * @@, clockwise. Put in the engine's terms - its H last, the sign turned
 * for every place it moves - or none, for a centre without four.
 */
function configuration(neighbours: readonly number[], mark: string): Configuration | undefined {
  if (neighbours.length !== 4 || (mark !== "@" && mark !== "@@")) return undefined;
  const h = neighbours.indexOf(-1);
  const moves = h < 0 ? 0 : 3 - h;
  const sign = (mark === "@" ? 1 : -1) * (moves % 2 ? -1 : 1);
  return { neighbours: h < 0 ? [...neighbours] : [...neighbours.filter((n) => n !== -1), -1], volume: sign as 1 | -1 };
}

/** What is inside a bracket: [isotope] symbol [chirality] [H count] [charge] [:class]. */
function bracketAtom(body: string): { atom: SmilesAtom; mark: string } {
  const m = /^(\d+)?(\*|[A-Z][a-z]?|[a-z][a-z]?)(@*)(H\d*)?([+-]\d*|\+\+|--)?(?::(\d+))?$/.exec(body);
  if (!m) throw new Error(`Cannot read [${body}]`);
  const [, iso, sym, mark, h, q, cls] = m;
  const aromatic = /^[a-z]/.test(sym);
  const atom: SmilesAtom = { el: aromatic ? sym[0].toUpperCase() + sym.slice(1) : sym };
  if (aromatic) atom.aromatic = true;
  if (iso) atom.isotope = Number.parseInt(iso, 10);
  atom.hs = h ? (h.length > 1 ? Number.parseInt(h.slice(1), 10) : 1) : 0;
  if (cls) atom.cls = Number.parseInt(cls, 10);
  if (q) {
    const sign = q[0] === "+" ? 1 : -1;
    atom.charge = q === "++" || q === "--" ? 2 * sign : sign * (q.length > 1 ? Number.parseInt(q.slice(1), 10) : 1);
  }
  return { atom, mark };
}

// --- writing -----------------------------------------------------------------

/** An atom to write: its element ("*" for an attachment), and what a bracket says of it. */
export type SmilesAtomOut = { el: string; charge?: number; isotope?: number; hs: number };

/** The valences an organic-subset atom may have, as OpenSMILES fills its hydrogens to. */
const NORMAL_VALENCES: Record<string, number[]> = {
  B: [3], C: [4], N: [3, 5], O: [2], P: [3, 5], S: [2, 4, 6], F: [1], Cl: [1], Br: [1], I: [1],
};

/** The hydrogens OpenSMILES gives an organic-subset atom written plainly, for bonds summing to `sum`. */
function plainHydrogens(el: string, sum: number): number | null {
  const normal = NORMAL_VALENCES[el];
  if (!normal) return null;
  const v = normal.find((n) => n >= sum);
  return v == null ? 0 : v - sum;
}

/**
 * Atoms and bonds as SMILES (OpenSMILES), from atom `start` - an
 * abbreviation's "*" first, as Meno writes them. Bonds are written as
 * their orders (Kekulé), an atom plainly where the organic subset's
 * hydrogens are its own and in brackets otherwise: with its isotope, its
 * hydrogens and its charge. Rings are closed with digits, then %nn; parts
 * not joined to the rest follow after a dot.
 */
export function writeSmiles(atoms: readonly SmilesAtomOut[], bonds: readonly SmilesBond[], start = 0): string {
  const near = atoms.map(() => [] as { to: number; order: number; bond: number }[]);
  bonds.forEach((b, i) => {
    near[b.a1].push({ to: b.a2, order: b.order, bond: i });
    near[b.a2].push({ to: b.a1, order: b.order, bond: i });
  });
  const sums = atoms.map((_, i) => near[i].reduce((s, e) => s + e.order, 0));
  // which bonds the walk goes along; the rest close rings
  const seen = atoms.map(() => false);
  const tree = new Set<number>();
  const walk = (u: number) => {
    seen[u] = true;
    for (const e of near[u]) {
      if (!seen[e.to]) {
        tree.add(e.bond);
        walk(e.to);
      }
    }
  };
  const roots: number[] = [];
  for (const r of [start, ...atoms.map((_, i) => i)]) {
    if (r < atoms.length && !seen[r]) {
      roots.push(r);
      walk(r);
    }
  }
  const symbol = (order: number) => (order === 2 ? "=" : order === 3 ? "#" : order === 4 ? ":" : "");
  const atomText = (i: number) => {
    const a = atoms[i];
    if (a.el === "*" && !a.charge && !a.isotope && !a.hs) return "*";
    const plain = plainHydrogens(a.el, sums[i]);
    if (!a.charge && !a.isotope && plain === a.hs) return a.el;
    const charge = !a.charge ? "" : `${a.charge > 0 ? "+" : "-"}${Math.abs(a.charge) > 1 ? Math.abs(a.charge) : ""}`;
    return `[${a.isotope ?? ""}${a.el}${a.hs ? `H${a.hs > 1 ? a.hs : ""}` : ""}${charge}]`;
  };
  const digits = new Map<number, number>();
  const free: number[] = [];
  let next = 1;
  const written = atoms.map(() => false);
  const write = (u: number): string => {
    written[u] = true;
    let out = atomText(u);
    for (const e of near[u]) {
      if (tree.has(e.bond)) continue;
      const open = digits.get(e.bond);
      if (open != null) {
        out += open < 10 ? `${open}` : `%${open}`;
        digits.delete(e.bond);
        free.push(open);
      } else {
        free.sort((x, y) => x - y);
        const n = free.length ? free.shift()! : next++;
        digits.set(e.bond, n);
        out += symbol(e.order) + (n < 10 ? `${n}` : `%${n}`);
      }
    }
    const children = near[u].filter((e) => tree.has(e.bond) && !written[e.to]);
    children.forEach((e, k) => {
      const branch = symbol(e.order) + write(e.to);
      out += k < children.length - 1 ? `(${branch})` : branch;
    });
    return out;
  };
  return roots.map(write).join(".");
}
