/**
 * How a molecule without its hydrogens is protonated, as the chemist
 * chooses it (docs/WORKSPACE.md, *How it is protonated*): its sites - the
 * groups that can carry a hydrogen more or less, or carry it on one atom or
 * another - and each one's forms, every form a molecule of its own: an acid
 * or its anion, an amine or its ammonium, imidazole with its hydrogen on
 * one nitrogen or the other. Nothing is chosen here: a form is what the
 * chemist picks, the orders of its bonds and the charges of its atoms
 * following from the hydrogens it puts where (lib/chem/skeleton: a
 * molecule without hydrogens says none of this).
 *
 * The sites, by what they are made of - each atom in one site at most, the
 * first that takes it:
 * - an azole: a flat five-membered ring with two nitrogens or more, the
 *   hydrogen on each ring nitrogen that has no substituent, or not;
 * - a lactam: a flat six-membered ring with a nitrogen and an oxygen on a
 *   carbon of it (2-pyridone, 4-pyridone, uracil), the hydrogen on the
 *   nitrogen or on the oxygen;
 * - an amidine or a guanidine: a carbon with two or three nitrogens and no
 *   oxygen, outside a flat ring;
 * - a carboxyl: a carbon with two oxygens bonded to nothing else;
 * - a phosphate and a sulfonate: a phosphorus or sulfur with four
 *   neighbours, two oxygens or more of them bonded to nothing else;
 * - a ring nitrogen: one in a flat six-membered ring, with no substituent;
 * - a phenol and a thiol: an oxygen on a flat ring's carbon, a sulfur on a
 *   carbon, each bonded to nothing else and singly;
 * - an amine: a nitrogen with single bonds only, outside a flat ring, not
 *   on a carbon, sulfur or phosphorus doubly bonded to oxygen, sulfur or
 *   nitrogen (an amide's, a sulfonamide's), nor on an oxygen of its own (a
 *   nitro group's), nor on a flat ring's carbon beside a ring nitrogen (an
 *   aminopyridine's, whose ring nitrogen is the site).
 *
 * A form is the hydrogens each of a site's atoms carries, with its charge:
 * the orders of the bonds around it - in a ring, the whole flat ring
 * system's - are found again for it, so that each atom's valence is met;
 * where none can be found the form is not one. Two ways of drawing the
 * same hydrogens and charge (a carboxylate's two oxygens) are one form.
 *
 * Pure: over atoms and bonds, as lib/chem/skeleton.
 */
import { implicitHydrogens, type Radical } from "./molecule";

export type ProtonAtom = { el: string; charge?: number; radical?: Radical };
export type ProtonBond = { a1: number; a2: number; order: number };

/** What a site is, as the chemist knows it. */
export type SiteKind =
  | "azole"
  | "lactam"
  | "amidine"
  | "guanidine"
  | "carboxyl"
  | "phosphate"
  | "sulfonate"
  | "ring nitrogen"
  | "phenol"
  | "thiol"
  | "amine";

/**
 * A form of a site: the hydrogens and charge of each of its atoms that can
 * change (`at`), the orders its bonds then have (`orders`, by bond), its
 * charge, and what it is called - by what it is, and where its hydrogens
 * are (`name`, `where`).
 */
export type Form = {
  at: { atom: number; h: number; charge: number }[];
  orders: { bond: number; order: number }[];
  charge: number;
  name: string;
  where: string;
};

/** A site: what it is, its atoms (all of them, to be shown), those whose hydrogens change, its forms, and which of them it is drawn in now - none, where it is none of them. */
export type Site = { kind: SiteKind; atoms: number[]; changing: number[]; forms: Form[]; now: number | null };

/** Where a molecule's bond orders, and so its charges, came from: the CCD, a SMILES, or an estimate from its atoms' distances. */
export type OrdersBy = "dictionary" | "assigned" | "estimated" | "perceived" | "unknown" | undefined;

/**
 * The form each site starts at, as the card opens - Meno's one policy, so
 * that it is changed in one place: where its orders and charges were given
 * by a definition (the CCD's, a SMILES'), the form they draw; else none -
 * an estimate from distances says nothing of how a molecule is protonated,
 * so each site waits for the chemist.
 */
export function startingForms(by: OrdersBy, sites: readonly Site[]): (number | null)[] {
  return sites.map((s) => (by === "dictionary" || by === "assigned" ? s.now : null));
}

/** An atom's hydrogens, its bonds' orders summed (`sum`): its valence's room, a phosphorus or sulfur taking its higher valences (5; 4 and 6) where its bonds go past the lower. */
export function hydrogensOf(a: ProtonAtom, sum: number): number {
  const charge = a.charge ?? 0;
  if (!charge && !a.radical && (a.el === "P" || a.el === "S")) {
    const valences = a.el === "P" ? [3, 5] : [2, 4, 6];
    const v = valences.find((x) => x >= sum);
    return v == null ? 0 : v - sum;
  }
  return implicitHydrogens(a.el, sum, charge, a.radical);
}

/** The most steps a search for bond orders takes before it says none were found. */
const MOST_STEPS = 200_000;

type Graph = { near: number[][]; bondOf: Map<string, number>; sum: Float64Array; heavy: number[] };

const key = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);

function graphOf(atoms: readonly ProtonAtom[], bonds: readonly ProtonBond[]): Graph {
  const near: number[][] = atoms.map(() => []);
  const bondOf = new Map<string, number>();
  const sum = new Float64Array(atoms.length);
  bonds.forEach((b, k) => {
    near[b.a1].push(b.a2);
    near[b.a2].push(b.a1);
    bondOf.set(key(b.a1, b.a2), k);
    const order = b.order === 4 ? 1.5 : b.order;
    sum[b.a1] += order;
    sum[b.a2] += order;
  });
  return { near, bondOf, sum, heavy: atoms.map((a, i) => (a.el === "H" ? -1 : i)).filter((i) => i >= 0) };
}

/** The rings of up to eight atoms through each bond, the smallest, each once, its atoms in order round it. */
function smallRings(g: Graph, n: number): number[][] {
  const rings = new Map<string, number[]>();
  for (const [k] of g.bondOf) {
    const [u, v] = k.split(",").map(Number);
    // (the shortest way from u to v not along their own bond)
    const from = new Int32Array(n).fill(-1);
    from[u] = u;
    let front = [u];
    for (let depth = 0; depth < 7 && from[v] < 0 && front.length; depth++) {
      const next: number[] = [];
      for (const p of front)
        for (const q of g.near[p]) {
          if (from[q] >= 0 || (p === u && q === v)) continue;
          from[q] = p;
          next.push(q);
        }
      front = next;
    }
    if (from[v] < 0) continue;
    const ring = [v];
    for (let p = v; p !== u; ) ring.push((p = from[p]));
    rings.set([...ring].sort((p, q) => p - q).join(","), ring);
  }
  return [...rings.values()];
}

/**
 * Whether a ring is flat - its atoms drawn as a conjugated ring: each has a
 * double or aromatic bond, but for as many nitrogens, oxygens and sulfurs
 * with single bonds only as it has room for: one in a five-membered ring
 * (pyrrole's, furan's), in a six-membered one as many as its carbons with
 * an oxygen on them alone (2-pyridone's, uracil's).
 */
function isFlat(ring: readonly number[], atoms: readonly ProtonAtom[], bonds: readonly ProtonBond[], g: Graph): boolean {
  const multiple = (i: number) => g.near[i].some((j) => (bonds[g.bondOf.get(key(i, j))!].order ?? 1) >= 2);
  const plain = ring.filter((i) => !multiple(i));
  if (plain.some((i) => !["N", "O", "S"].includes(atoms[i].el))) return false;
  if (ring.length === 5) return plain.length <= 1;
  if (ring.length !== 6) return false;
  const oxo = ring.filter((i) => g.near[i].some((j) => !ring.includes(j) && terminal(atoms, g, j, "O"))).length;
  return plain.length <= oxo;
}

/** Whether an atom is of an element (`el`; O, S, N unset) and bonded to nothing else. */
const terminal = (atoms: readonly ProtonAtom[], g: Graph, i: number, el?: string) => g.near[i].length === 1 && (el ? atoms[i].el === el : ["O", "S", "N"].includes(atoms[i].el));

/** The orders a form's bonds take, by bond, and what each atom's valence asks of them: found, or none. */
function ordersFor(
  atoms: readonly ProtonAtom[],
  bonds: readonly ProtonBond[],
  g: Graph,
  region: readonly number[],
  fixed: ReadonlyMap<number, { h: number; charge: number }>,
): Map<number, number> | null {
  const inRegion = new Set(region);
  // (each bond among the region's atoms single or double, as the search makes it)
  const free = [...new Set(region.flatMap((i) => g.near[i].filter((j) => inRegion.has(j)).map((j) => g.bondOf.get(key(i, j))!)))];
  // (what each region atom asks of them: its valence less its hydrogens and its bonds' single parts, and less the double parts of its bonds out of the region)
  const need = new Map<number, number>();
  for (const i of region) {
    const a = atoms[i];
    const f = fixed.get(i);
    const drawn = Math.round(g.sum[i]);
    let outside = 0;
    for (const j of g.near[i]) {
      if (inRegion.has(j)) continue;
      const o = bonds[g.bondOf.get(key(i, j))!].order;
      if (o === 4) return null;
      outside += o - 1;
    }
    // (its valence: as its charge leaves it, for an atom whose hydrogens the form gives; else as it is drawn - a sulfonyl's sulfur six, a metal's bonds as they are)
    const valence = f ? implicitHydrogens(a.el, 0, f.charge, a.radical) : drawn + hydrogensOf(a, drawn);
    const h = f ? f.h : hydrogensOf(a, drawn);
    need.set(i, valence - h - g.near[i].length - outside);
  }
  if ([...need.values()].some((x) => x < 0)) return null;
  const order = new Map<number, number>(free.map((b) => [b, 1]));
  let steps = 0;
  const left = new Map(need);
  const go = (): boolean => {
    if (++steps > MOST_STEPS) return false;
    // (the atom still wanting, with the fewest bonds it could take it from)
    let pick = -1;
    let ways: number[] = [];
    for (const [i, w] of left) {
      if (w <= 0) continue;
      const can = g.near[i].filter((j) => (left.get(j) ?? 0) > 0 && order.get(g.bondOf.get(key(i, j))!) === 1);
      if (!can.length) return false;
      if (pick < 0 || can.length < ways.length) [pick, ways] = [i, can];
    }
    if (pick < 0) return true;
    for (const j of ways) {
      const b = g.bondOf.get(key(pick, j))!;
      order.set(b, 2);
      left.set(pick, left.get(pick)! - 1);
      left.set(j, left.get(j)! - 1);
      if (go()) return true;
      order.set(b, 1);
      left.set(pick, left.get(pick)! + 1);
      left.set(j, left.get(j)! + 1);
    }
    return false;
  };
  return go() ? order : null;
}

/**
 * Each way an atom that can change can be: its charge, the double bonds it
 * takes (0 or 1), and so its hydrogens. A nitrogen of a flat ring, an
 * amidine or a guanidine (`flat`) stays flat: charged, it keeps a double
 * bond - never an ammonium's four single ones.
 */
function waysOf(a: ProtonAtom, degree: number, outsideDouble: number, charges: readonly number[], doubles: readonly number[], flat: boolean): { h: number; charge: number }[] {
  const ways: { h: number; charge: number }[] = [];
  for (const charge of charges)
    for (const d of doubles) {
      if (flat && a.el === "N" && charge > 0 && d + outsideDouble === 0) continue;
      // (its valence as its charge leaves it, met by these bonds and its hydrogens - never past it)
      const valence = implicitHydrogens(a.el, 0, charge, a.radical);
      const sum = degree + outsideDouble + d;
      if (valence >= sum) ways.push({ h: valence - sum, charge });
    }
  return ways;
}

/** The names of a site's forms, by what it is and its charge. */
function nameOf(kind: SiteKind, charge: number, atoms: readonly ProtonAtom[], site: readonly number[], g: Graph, form: Form): string {
  const ring = (n: string, plus: string, minus: string) => (charge > 0 ? plus : charge < 0 ? minus : n);
  switch (kind) {
    case "azole": {
      const ns = site.filter((i) => atoms[i].el === "N");
      const together = ns.some((i) => g.near[i].some((j) => ns.includes(j)));
      const base = ns.length >= 4 ? "Tetrazol" : ns.length === 3 ? "Triazol" : together ? "Pyrazol" : "Imidazol";
      return ring(`${base}e`, `${base}ium`, `${base}ate`);
    }
    case "lactam": {
      if (charge) return charge > 0 ? "Protonated" : "Deprotonated";
      const ohs = form.at.filter((x) => atoms[x.atom].el === "O" && x.h > 0).length;
      const os = form.at.filter((x) => atoms[x.atom].el === "O").length;
      return ohs === 0 ? "Lactam" : ohs === os ? "Lactim" : "Lactam and lactim";
    }
    case "amidine":
      return ring("Amidine", "Amidinium", "Amidinate");
    case "guanidine":
      return ring("Guanidine", "Guanidinium", "Guanidinate");
    case "carboxyl":
      return charge < 0 ? "Carboxylate" : "Carboxylic acid";
    case "phosphate":
      return "Phosphate";
    case "sulfonate":
      return charge < 0 ? "Sulfonate" : "Sulfonic acid";
    case "ring nitrogen":
      return charge > 0 ? "Pyridinium" : "Pyridine";
    case "phenol":
      return charge < 0 ? "Phenolate" : "Phenol";
    case "thiol":
      return charge < 0 ? "Thiolate" : "Thiol";
    case "amine":
      return charge > 0 ? "Ammonium" : "Amine";
  }
}

/** Where a form's hydrogens are, by its atoms' names (`label`): "H on O2", "2 H on N1, H on N3"; none, "no H". */
function whereOf(form: Form, label: (i: number) => string): string {
  const on = form.at.filter((x) => x.h > 0).map((x) => `${x.h > 1 ? `${x.h} ` : ""}H on ${label(x.atom)}`);
  return on.length ? on.join(", ") : "no H";
}

type Found = { kind: SiteKind; atoms: number[]; changing: number[]; region: number[]; charges: Map<number, readonly number[]>; doubles: Map<number, readonly number[]> };

/** The sites among some atoms (`among`), each atom in one at most - as the comment above lists them, in that order. */
function sitesAmong(atoms: readonly ProtonAtom[], bonds: readonly ProtonBond[], g: Graph, among: ReadonlySet<number>): Found[] {
  const taken = new Set<number>();
  const found: Found[] = [];
  const order = (i: number, j: number) => bonds[g.bondOf.get(key(i, j))!].order;
  const rings = smallRings(g, atoms.length).filter((r) => r.every((i) => among.has(i)));
  const flat = rings.filter((r) => isFlat(r, atoms, bonds, g));
  const inFlat = new Set(flat.flat());
  // (a flat ring's system: the flat rings it shares atoms with, and theirs - its atoms, with the oxygens on them)
  const systemOf = (ring: readonly number[]) => {
    const atomsOf = new Set(ring);
    for (let grew = true; grew; ) {
      grew = false;
      for (const r of flat)
        if (r.some((i) => atomsOf.has(i)) && r.some((i) => !atomsOf.has(i))) {
          r.forEach((i) => atomsOf.add(i));
          grew = true;
        }
    }
    for (const i of [...atomsOf]) for (const j of g.near[i]) if (!atomsOf.has(j) && terminal(atoms, g, j) && order(i, j) <= 2) atomsOf.add(j);
    return [...atomsOf];
  };
  const add = (f: Found) => {
    if (f.changing.some((i) => taken.has(i)) || !f.changing.length) return;
    // (its atoms in their order in the molecule: a form's hydrogens said in that order)
    f.changing.sort((p, q) => p - q);
    f.atoms.forEach((i) => taken.add(i));
    found.push(f);
  };
  const N_WAYS = { charges: [0, 1], doubles: [0, 1] };
  // (azoles)
  for (const r of flat.filter((x) => x.length === 5 && x.filter((i) => atoms[i].el === "N").length >= 2)) {
    const changing = r.filter((i) => atoms[i].el === "N" && g.near[i].length === 2);
    add({ kind: "azole", atoms: r, changing, region: systemOf(r), charges: new Map(changing.map((i) => [i, [-1, 0, 1]])), doubles: new Map(changing.map((i) => [i, N_WAYS.doubles])) });
  }
  // (lactams: a flat six-membered ring's unsubstituted nitrogens and the oxygens on its carbons)
  for (const r of flat.filter((x) => x.length === 6 && x.some((i) => atoms[i].el === "N"))) {
    const os = r.flatMap((i) => g.near[i].filter((j) => !r.includes(j) && terminal(atoms, g, j, "O")));
    const ns = r.filter((i) => atoms[i].el === "N" && g.near[i].length === 2);
    if (!os.length || !ns.length) continue;
    const changing = [...ns, ...os];
    add({
      kind: "lactam",
      atoms: [...r, ...os],
      changing,
      region: systemOf(r),
      charges: new Map(changing.map((i) => [i, atoms[i].el === "N" ? [0, 1] : [-1, 0]])),
      doubles: new Map(changing.map((i) => [i, [0, 1]])),
    });
  }
  // (amidines and guanidines: outside a flat ring, a carbon with two or three nitrogens and no oxygen or sulfur)
  for (const c of g.heavy) {
    if (!among.has(c) || atoms[c].el !== "C" || inFlat.has(c)) continue;
    const ns = g.near[c].filter((j) => atoms[j].el === "N" && !inFlat.has(j));
    if (ns.length < 2 || g.near[c].some((j) => atoms[j].el === "O" || atoms[j].el === "S") || g.near[c].length > 3) continue;
    // (a nitrogen on a carbonyl too - an acyl amidine's - is the amide's)
    const changing = ns.filter((n) => !g.near[n].some((j) => j !== c && g.near[j].some((k) => terminal(atoms, g, k, "O") && order(j, k) === 2)));
    if (changing.length < 2) continue;
    add({
      kind: ns.length === 3 ? "guanidine" : "amidine",
      atoms: [c, ...ns],
      changing,
      region: [c, ...changing],
      charges: new Map(changing.map((i) => [i, N_WAYS.charges])),
      doubles: new Map(changing.map((i) => [i, N_WAYS.doubles])),
    });
  }
  // (carboxyls, phosphates and sulfonates)
  for (const c of g.heavy) {
    if (!among.has(c)) continue;
    const os = g.near[c].filter((j) => terminal(atoms, g, j, "O"));
    const el = atoms[c].el;
    const kind: SiteKind | null =
      el === "C" && os.length === 2 && g.near[c].length <= 3 && !g.near[c].some((j) => !os.includes(j) && atoms[j].el === "O")
        ? "carboxyl"
        : el === "P" && g.near[c].length === 4 && os.length >= 2
          ? "phosphate"
          : el === "S" && g.near[c].length === 4 && os.length >= 2
            ? "sulfonate"
            : null;
    if (!kind) continue;
    add({ kind, atoms: [c, ...os], changing: os, region: [c, ...os], charges: new Map(os.map((i) => [i, [-1, 0]])), doubles: new Map(os.map((i) => [i, [0, 1]])) });
  }
  // (ring nitrogens: a flat six-membered ring's, with no substituent)
  for (const r of flat.filter((x) => x.length === 6))
    for (const n of r)
      if (atoms[n].el === "N" && g.near[n].length === 2 && !taken.has(n))
        add({ kind: "ring nitrogen", atoms: [n], changing: [n], region: [], charges: new Map([[n, N_WAYS.charges]]), doubles: new Map([[n, [1]]]) });
  // (phenols and thiols: an oxygen on a flat ring's carbon, a sulfur on a carbon, singly)
  for (const o of g.heavy) {
    if (!among.has(o) || taken.has(o) || !terminal(atoms, g, o) || order(o, g.near[o][0]) !== 1 || atoms[g.near[o][0]].el !== "C") continue;
    if (atoms[o].el === "O" && inFlat.has(g.near[o][0]))
      add({ kind: "phenol", atoms: [o], changing: [o], region: [], charges: new Map([[o, [-1, 0]]]), doubles: new Map([[o, [0]]]) });
    else if (atoms[o].el === "S") add({ kind: "thiol", atoms: [o], changing: [o], region: [], charges: new Map([[o, [-1, 0]]]), doubles: new Map([[o, [0]]]) });
  }
  // (amines)
  const doublyToHetero = (j: number) => g.near[j].some((k) => ["O", "S", "N"].includes(atoms[k].el) && order(j, k) >= 2);
  for (const n of g.heavy) {
    if (!among.has(n) || taken.has(n) || atoms[n].el !== "N" || inFlat.has(n) || (atoms[n].charge ?? 0) !== 0) continue;
    if (g.near[n].some((j) => order(n, j) !== 1) || g.near[n].length > 3) continue;
    if (g.near[n].some((j) => terminal(atoms, g, j, "O") || (["C", "S", "P"].includes(atoms[j].el) && doublyToHetero(j)))) continue;
    if (g.near[n].some((j) => inFlat.has(j) && g.near[j].some((k) => inFlat.has(k) && atoms[k].el === "N" && g.near[k].length === 2))) continue;
    add({ kind: "amine", atoms: [n], changing: [n], region: [], charges: new Map([[n, N_WAYS.charges]]), doubles: new Map([[n, [0]]]) });
  }
  return found;
}

/**
 * The sites of a molecule without its hydrogens - of some of its atoms
 * (`among`; all, unset): each with its forms, and the form it is drawn in
 * now. Its atoms are named by `label` where a form says where its
 * hydrogens go. A site with one form alone - nothing to choose - is none.
 */
export function protonationSites(
  atoms: readonly ProtonAtom[],
  bonds: readonly ProtonBond[],
  label: (i: number) => string,
  among: readonly number[] = atoms.map((_, i) => i),
): Site[] {
  const g = graphOf(atoms, bonds);
  const inside = new Set(among);
  const sites: Site[] = [];
  for (const f of sitesAmong(atoms, bonds, g, inside)) {
    const regionSet = new Set(f.region);
    // (each changing atom's ways, its bonds out of the region as they are)
    const ways = f.changing.map((i) => {
      const outside = g.near[i].filter((j) => !regionSet.has(j)).reduce((s, j) => s + bonds[g.bondOf.get(key(i, j))!].order - 1, 0);
      // (outside a region an atom's double bonds stay as they are)
      const doubles = f.region.length ? f.doubles.get(i)! : [Math.round(g.sum[i]) - g.near[i].length - outside];
      return waysOf(atoms[i], g.near[i].length, outside, f.charges.get(i)!, doubles, f.region.length > 0).map((w) => ({ atom: i, ...w }));
    });
    if (ways.some((w) => !w.length)) continue;
    const forms = new Map<string, Form & { charged: number }>();
    const pick = (k: number, chosen: { atom: number; h: number; charge: number }[]) => {
      if (k < ways.length) {
        for (const w of ways[k]) pick(k + 1, [...chosen, w]);
        return;
      }
      const charge = chosen.reduce((s, x) => s + x.charge, 0);
      const charged = chosen.filter((x) => x.charge).length;
      // (one charge a site, of one sign: no zwitterion of its own; a ring's one at most - no doubly charged uracil)
      if (chosen.some((x) => x.charge > 0) && chosen.some((x) => x.charge < 0)) return;
      if ((f.kind === "azole" || f.kind === "lactam") && Math.abs(charge) > 1) return;
      const id = `${chosen.map((x) => x.h).join(",")}|${charge}`;
      const was = forms.get(id);
      if (was && was.charged <= charged) return;
      const fixed = new Map(chosen.map((x) => [x.atom, x]));
      let orders: { bond: number; order: number }[] = [];
      if (f.region.length) {
        const found = ordersFor(atoms, bonds, g, f.region, fixed);
        if (!found) return;
        orders = [...found].map(([bond, order]) => ({ bond, order }));
      }
      forms.set(id, { at: chosen, orders, charge, name: "", where: "", charged });
    };
    pick(0, []);
    const list: Form[] = [...forms.values()]
      .sort((p, q) => q.charge - p.charge || p.at.reduce((s, x, k) => s || q.at[k].h - x.h, 0))
      .map(({ charged: _, ...form }) => ({ ...form, name: nameOf(f.kind, form.charge, atoms, f.atoms, g, form), where: whereOf(form, label) }));
    if (list.length < 2) continue;
    // (the form it is drawn in now: its atoms' hydrogens as its orders and charges give them, and its charge - however its bonds are drawn, a carboxylate's either way)
    const drawnCharge = f.changing.reduce((s, i) => s + (atoms[i].charge ?? 0), 0);
    const now = list.findIndex((form) => form.charge === drawnCharge && form.at.every((x) => x.h === hydrogensOf(atoms[x.atom], Math.round(g.sum[x.atom]))));
    sites.push({ kind: f.kind, atoms: f.atoms, changing: f.changing, forms: list, now: now < 0 ? null : now });
  }
  return sites;
}

/** The charges an atom outside every site can be given - its bonds' orders kept, its hydrogens following: those its valence has room for, of −1, 0 and +1 (a nitrogen, an oxygen, a sulfur). */
export function chargesFor(a: ProtonAtom, sum: number): number[] {
  if (!["N", "O", "S"].includes(a.el) || a.radical) return [];
  // (its valence, as the charge leaves it, met by its bonds and hydrogens - not past it)
  return [-1, 0, 1].filter((charge) => implicitHydrogens(a.el, 0, charge) >= sum);
}

/** What the chemist chose: a form for each site (by its place in the list), and a charge for atoms outside them. */
export type Chosen = { forms: readonly (number | null)[]; charges: ReadonlyMap<number, number> };

/**
 * A molecule protonated as chosen: each atom's charge, each bond's order -
 * found again, together, over every site's bonds, so that every atom's
 * valence is met - and the hydrogens each atom is to carry. Or why it
 * cannot be: a site not chosen, or choices that cannot all be drawn
 * together.
 */
export function protonated(
  atoms: readonly ProtonAtom[],
  bonds: readonly ProtonBond[],
  sites: readonly Site[],
  chosen: Chosen,
): { charges: number[]; orders: number[]; hydrogens: number[] } | { why: string } {
  if (chosen.forms.some((f, k) => f == null && k < sites.length) || chosen.forms.length < sites.length) return { why: "Choose how each site is protonated." };
  const g = graphOf(atoms, bonds);
  const fixed = new Map<number, { h: number; charge: number }>();
  const region = new Set<number>();
  sites.forEach((s, k) => {
    const form = s.forms[chosen.forms[k]!];
    for (const x of form.at) fixed.set(x.atom, { h: x.h, charge: x.charge });
    for (const o of form.orders) {
      region.add(bonds[o.bond].a1);
      region.add(bonds[o.bond].a2);
    }
  });
  for (const [i, charge] of chosen.charges) {
    if (fixed.has(i)) continue;
    const at = { ...atoms[i], charge };
    fixed.set(i, { h: hydrogensOf(at, g.sum[i]), charge });
  }
  const orders = bonds.map((b) => b.order);
  if (region.size) {
    const found = ordersFor(atoms, bonds, g, [...region], fixed);
    if (!found) return { why: "These choices cannot all be drawn together: choose again." };
    for (const [b, o] of found) orders[b] = o;
  }
  const charges = atoms.map((a, i) => fixed.get(i)?.charge ?? a.charge ?? 0);
  const sum = new Float64Array(atoms.length);
  bonds.forEach((b, k) => {
    sum[b.a1] += orders[k] === 4 ? 1.5 : orders[k];
    sum[b.a2] += orders[k] === 4 ? 1.5 : orders[k];
  });
  const hydrogens = atoms.map((a, i) => (a.el === "H" ? 0 : (fixed.get(i)?.h ?? hydrogensOf({ ...a, charge: charges[i] }, Math.round(sum[i])))));
  // (every atom's valence met by its bonds and hydrogens: those changed, and those not)
  for (const [i, f] of fixed) if (hydrogensOf({ ...atoms[i], charge: f.charge }, Math.round(sum[i])) !== f.h) return { why: "These choices cannot all be drawn together: choose again." };
  return { charges, orders, hydrogens };
}
