/**
 * Bond orders to draw a molecule with, aromatic bonds written out as a Kekulé
 * structure.
 *
 * A MOL file may mark a ring's bonds as aromatic (bond type 4) rather than
 * single and double. The editor draws single, double and triple bonds, so an
 * aromatic system has to be given its double bonds back: every carbon in it
 * takes exactly one, a pyrrole-type N-H or a furan O takes none, and of the
 * nitrogens whose hydrogens the file does not state, those left without one
 * - each read as an N-H - are as many as make each ring system's pi
 * electrons 4n + 2 (Hückel's rule, each atom counted as lib/chem/
 * aromaticity counts it): a tetrazine none, a tetrazole and a
 * benzotriazole one, porphine two, guanine two beside its C=O. Where no
 * choice makes 4n + 2, as few as can be. Which nitrogen
 * carries it, where the file does not say - a tetrazole's, a purine's - is
 * chosen by the atoms' ranks, not their order in the file, so that one
 * molecule written two ways is read as one; the tautomer itself is not in
 * the file. This works that out
 * without anything outside TypeScript, so a file opens the same before the
 * chemistry backend is available as after.
 *
 * Where the atoms say their hydrogens and charges, as SMILES's brackets do,
 * those decide too: an N that carries its H ([nH]) takes no double bond,
 * and a charged one may with a third bond (an N-alkylpyridinium's [n+], a
 * pyrylium's [o+]); without them, a charged aromatic atom is judged as if
 * it were neutral. A query atom - A, Q, *, an atom list - takes one where
 * the ring needs it, as a pyridine's N does. Where no assignment satisfies every atom, as many
 * carbons as possible still get their double bond and the rest stay single.
 */

import { piElectrons } from "./aromaticity";
import { NOT_METALS } from "./elements";

/** MDL bond type 4: aromatic. */
export const AROMATIC_BOND = 4;

export type KekuleAtom = { el: string; hs?: number; charge?: number };
export type KekuleBond = { a1: number; a2: number; order: number };

type Role = "needs" | "may" | "never";

/** A CTfile's query atoms that a ring of aromatic bonds may run through: A, Q, * and an atom list, L. */
const QUERY_ATOMS = new Set(["A", "Q", "*", "L"]);

/** Per bond, the order to draw it with: 1, 2 or 3. */
export function kekuleOrders(atoms: readonly KekuleAtom[], bonds: readonly KekuleBond[]): (1 | 2 | 3)[] {
  return kekulized(atoms, bonds).orders;
}

/**
 * Per bond, its order with those given as aromatic (4) written out as a
 * Kekulé structure (`kekuleOrders`), the rest as given: what an atom's
 * hydrogens are counted from by its valence. Counted as 1.5 each, an
 * aromatic bond rounds a pyrrole's N, two such bonds and no H stated, to
 * none. An aromatic bond no Kekulé structure gives a double bond stays
 * single (1), as `kekuleOrders` leaves it - so its atoms count it as a
 * single bond, and may carry a hydrogen more than 1.5 would have given,
 * never fewer. (No aromatic bond at all: the orders as given, untouched -
 * a shortcut only.)
 */
export function valenceOrders(atoms: readonly KekuleAtom[], bonds: readonly { a: number; b: number; order: number }[]): number[] {
  if (!bonds.some((b) => b.order === AROMATIC_BOND)) return bonds.map((b) => b.order);
  const kekule = kekuleOrders(atoms, bonds.map((b) => ({ a1: b.a, a2: b.b, order: b.order })));
  return bonds.map((b, i) => (b.order === AROMATIC_BOND ? kekule[i] : b.order));
}

/**
 * Per bond, the order to draw it with (`kekuleOrders`); and the atoms read
 * as carrying an H the input did not state, where another atom of their
 * ring system could have carried it instead (`hChosen`, by index): which
 * nitrogen of an imidazole, a tetrazole, a purine or a porphine has it is
 * Meno's choice there, and not the input's (the maintainer, 2026-10-22: to
 * be said where the structure is shown).
 */
export function kekulized(atoms: readonly KekuleAtom[], bonds: readonly KekuleBond[]): { orders: (1 | 2 | 3)[]; hChosen: number[] } {
  // (judged ring system by ring system - its aromatic bonds joined at their atoms, no atom in two - where the molecule as a whole
  // has no Kekule structure: a ring with none leaves the others theirs, and is itself as it would be alone)
  const whole = kekulizedAs(atoms, bonds);
  if (whole.solved) return whole;
  const orders = [...whole.orders];
  let hChosen = whole.hChosen;
  for (const system of aromaticSystems(atoms.length, bonds)) {
    // (the system alone: the molecule's other aromatic bonds single, which leaves every atom's bonds as many as they were)
    const own = kekulizedAs(atoms, bonds.map((b, k) => (b.order === AROMATIC_BOND && !system.has(k) ? { ...b, order: 1 } : b)));
    const at = new Set([...system].flatMap((k) => [bonds[k].a1, bonds[k].a2]));
    for (const k of system) orders[k] = own.orders[k];
    hChosen = [...hChosen.filter((i) => !at.has(i)), ...own.hChosen.filter((i) => at.has(i))];
  }
  return { orders, hChosen };
}

/** A metal, by its symbol: an element not among the nonmetals and metalloids (`NOT_METALS`). */
function isMetalEl(el: string | undefined): boolean {
  const s = canonical(el ?? "");
  return /^[A-Z][a-z]?$/.test(s) && !NOT_METALS.has(s) && !QUERY_ATOMS.has(s);
}

/** The aromatic bonds by ring system: those joined at their atoms, by bond index. */
function aromaticSystems(n: number, bonds: readonly KekuleBond[]): Set<number>[] {
  const root = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  for (const b of bonds) if (b.order === AROMATIC_BOND) root[find(b.a1)] = find(b.a2);
  const by = new Map<number, Set<number>>();
  bonds.forEach((b, k) => {
    if (b.order !== AROMATIC_BOND) return;
    const r = find(b.a1);
    if (!by.has(r)) by.set(r, new Set());
    by.get(r)!.add(k);
  });
  return [...by.values()];
}

/** `kekulized` of the molecule whole; and whether every atom that needs a double bond has one. */
function kekulizedAs(atoms: readonly KekuleAtom[], bonds: readonly KekuleBond[]): { orders: (1 | 2 | 3)[]; hChosen: number[]; solved: boolean } {
  const out: (1 | 2 | 3)[] = bonds.map((b) =>
    b.order === 2 ? 2 : b.order === 3 ? 3 : 1,
  );
  const aromatic = bonds
    .map((b, i) => (b.order === AROMATIC_BOND ? i : -1))
    .filter((i) => i >= 0);
  if (aromatic.length === 0) return { orders: out, hChosen: [], solved: true };

  const degree = new Array<number>(atoms.length).fill(0);
  const hasMultiple = new Array<boolean>(atoms.length).fill(false);
  // (a ring atom bound to a metal: that bond is not among the ring's - the atom may take a double bond in its ring, lending its
  // pair to the metal as a pyridine's N does, or be left without one, the bond its own as a pyrrolide's or a porphyrin's N-metal
  // is; which, the ring decides, as it does a pyrrole-type N's H - and left without, it carries no H: the metal is where one would be)
  const aromaticAt = new Set(bonds.flatMap((b) => (b.order === AROMATIC_BOND ? [b.a1, b.a2] : [])));
  const lends = (i: number, other: number) => aromaticAt.has(i) && isMetalEl(atoms[other]?.el) && !isMetalEl(atoms[i]?.el);
  const bound = new Set<number>();
  for (const b of bonds) {
    if (lends(b.a1, b.a2)) bound.add(b.a1);
    if (lends(b.a2, b.a1)) bound.add(b.a2);
    if (!lends(b.a1, b.a2)) degree[b.a1]++;
    if (!lends(b.a2, b.a1)) degree[b.a2]++;
    if (b.order === 2 || b.order === 3) {
      hasMultiple[b.a1] = true;
      hasMultiple[b.a2] = true;
    }
  }
  const role = (i: number): Role => {
    if (hasMultiple[i]) return "never"; // already has its double bond, e.g. a pyridone's C=O
    const el = canonical(atoms[i]?.el ?? "");
    const charge = atoms[i]?.charge ?? 0;
    const hs = atoms[i]?.hs;
    // (a charged carbon, a tropylium's or a cyclopentadienide's: as the ring needs)
    if (el === "C") return charge ? "may" : "needs";
    if (el === "N" || el === "P") {
      // a pyrrole-type N-H that says so takes none
      if (degree[i] === 2 && charge <= 0 && hs != null && hs > 0) return "never";
      // two connections: pyridine-like, or a pyrrole-type N-H whose H the
      // file leaves implicit; the ring decides which. Three, as a cation: a
      // pyridinium's
      if (degree[i] === 2 || (degree[i] === 3 && charge > 0)) return "may";
    }
    // a pyrylium's or a thiopyrylium's
    if ((el === "O" || el === "S") && degree[i] === 2 && charge > 0) return "may";
    // a query atom - any atom (A, *), any but C (Q), one of a list (L) -
    // in a ring of aromatic bonds: as the ring needs, as a pyridine's N
    if (QUERY_ATOMS.has(atoms[i]?.el ?? "")) return "may";
    return "never";
  };
  const roles = atoms.map((_, i) => role(i));

  // Each atom's rank by what it is and where it stands, not where the file
  // put it: choices between equals are made in this order, so that a
  // molecule written two ways is read as one (which nitrogen of a
  // tetrazole carries its H, say)
  const rank = canonicalRanks(atoms, bonds);
  const byRank = (p: number, q: number) => rank[p] - rank[q] || p - q;

  // Candidate double bonds per atom: aromatic bonds to atoms that can take one.
  const partners = atoms.map(() => [] as { bond: number; other: number }[]);
  for (const i of aromatic) {
    const { a1, a2 } = bonds[i];
    if (roles[a1] === "never" || roles[a2] === "never") continue;
    partners[a1].push({ bond: i, other: a2 });
    partners[a2].push({ bond: i, other: a1 });
  }
  for (const p of partners) p.sort((x, y) => byRank(x.other, y.other));
  const needy = atoms
    .map((_, i) => i)
    .filter((i) => roles[i] === "needs" && partners[i].length > 0)
    .sort(byRank);
  // (the atoms that may take one - a pyridine-type N, a charged ring atom: each
  // left without one is read as carrying an H the file does not state, or a
  // lone pair, so how many are is chosen by the electrons: below)
  const willing = atoms
    .map((_, i) => i)
    .filter((i) => roles[i] === "may" && !QUERY_ATOMS.has(atoms[i]?.el ?? "") && partners[i].length > 0)
    .sort(byRank);

  // Each atom's pi electrons are counted as Meno counts them for its rule on
  // aromatic rings (lib/chem/aromaticity `piElectrons`). How many N carry an
  // H is a count over each ring system whole: of the ways to give the double
  // bonds, those whose every system holding an atom that may take one counts
  // 4n + 2 come first - guanine's two N-H with its C=O, a tetrazine's none,
  // a porphine's two (26) - and where none does, the fewest left without
  // (an atom of no known count: no count). Not the rule's rings and pairs:
  // a porphine with no N-H has 18 round each pyrrole and the inner ring,
  // which would take it for aromatic with two hydrogens fewer
  const system = new Int32Array(atoms.length).fill(-1);
  {
    const near = atoms.map(() => [] as number[]);
    for (const i of aromatic) {
      near[bonds[i].a1].push(bonds[i].a2);
      near[bonds[i].a2].push(bonds[i].a1);
    }
    let k = 0;
    for (let i = 0; i < atoms.length; i++) {
      if (system[i] >= 0 || !near[i].length) continue;
      const edge = [i];
      system[i] = k;
      while (edge.length) {
        for (const j of near[edge.pop()!]) {
          if (system[j] >= 0) continue;
          system[j] = k;
          edge.push(j);
        }
      }
      k++;
    }
  }
  const inRing = (i: number, j: number) => system[i] >= 0 && system[i] === system[j];
  /** An atom's pi electrons as the matching stands (lib/chem/aromaticity `piElectrons`); null where not known. */
  const electrons = (i: number): number | null => {
    if (QUERY_ATOMS.has(atoms[i]?.el ?? "")) return null;
    // (its double bond made already: in the ring, or out of it - a C=O, a C=S - to the element across it)
    const out = bonds.find((b) => b.order === 2 && (b.a1 === i || b.a2 === i) && !inRing(b.a1, b.a2));
    return piElectrons({
      el: canonical(atoms[i]?.el ?? ""),
      charge: atoms[i]?.charge ?? 0,
      inSystem: matched[i] >= 0 || (hasMultiple[i] && !out),
      outTo: out ? canonical(atoms[out.a1 === i ? out.a2 : out.a1]?.el ?? "") : null,
      triple: bonds.some((b) => b.order === 3 && (b.a1 === i || b.a2 === i)),
      degree: degree[i] + (atoms[i]?.hs ?? 0),
    });
  };
  const counted = new Set(willing.map((i) => system[i]));
  const huckel = (): boolean => {
    const sum = new Map<number, number | null>();
    for (let i = 0; i < atoms.length; i++) {
      const k = system[i];
      if (!counted.has(k)) continue;
      const was = sum.get(k);
      if (was === null) continue;
      const e = electrons(i);
      sum.set(k, e === null ? null : (was ?? 0) + e);
    }
    for (const total of sum.values()) if (total !== null && total % 4 !== 2) return false;
    return true;
  };

  // (a neutral N or P of two bonds whose H the input did not state, bound to no metal: left without its double bond, it carries one)
  const supplies = (i: number) => ["N", "P"].includes(canonical(atoms[i]?.el ?? "")) && degree[i] === 2 && (atoms[i]?.charge ?? 0) === 0 && atoms[i]?.hs == null && !bound.has(i);
  const carriers = willing.filter(supplies);

  const matched = new Array<number>(atoms.length).fill(-1);
  const free = (i: number) => partners[i].filter((p) => matched[p.other] < 0);
  let budget = 200_000;

  // Most constrained atom first - every one that needs a double bond, then
  // those that may take one, `slack` of them at most left without and of
  // those `supplied` at most carrying an H the input does not state; a partner
  // that needs a double bond before one that merely may take it; between
  // equals, the lower rank.
  const solve = (slack: number, rule: boolean, supplied: number): boolean => {
    if (--budget < 0) return false;
    let pick = -1;
    let options: { bond: number; other: number }[] = [];
    for (const a of needy) {
      if (matched[a] >= 0) continue;
      const f = free(a);
      if (f.length === 0) return false;
      if (pick < 0 || f.length < options.length) {
        pick = a;
        options = f;
      }
    }
    if (pick < 0) {
      // (each that needs one has it: now those that may)
      let left = 0;
      let h = 0;
      for (const a of willing) {
        if (matched[a] >= 0) continue;
        const f = free(a);
        if (f.length === 0) {
          if (++left > slack || (supplies(a) && ++h > supplied)) return false;
          continue;
        }
        if (pick < 0 || f.length < options.length) {
          pick = a;
          options = f;
        }
      }
      if (pick < 0) return !rule || huckel();
      for (const p of options) {
        matched[pick] = p.bond;
        matched[p.other] = p.bond;
        if (solve(slack, rule, supplied)) return true;
        matched[pick] = -1;
        matched[p.other] = -1;
      }
      // (or this one left without, where there is slack for it: counted with those left below)
      if (left + 1 > slack || (supplies(pick) && h + 1 > supplied)) return false;
      const was = partners[pick];
      partners[pick] = [];
      const ok = solve(slack, rule, supplied);
      partners[pick] = was;
      return ok;
    }
    options.sort(
      (p, q) =>
        Number(roles[p.other] !== "needs") - Number(roles[q.other] !== "needs") || byRank(p.other, q.other),
    );
    for (const p of options) {
      matched[pick] = p.bond;
      matched[p.other] = p.bond;
      if (solve(slack, rule, supplied)) return true;
      matched[pick] = -1;
      matched[p.other] = -1;
    }
    return false;
  };
  // (the fewest left without first; of those, where a ring atom bound to a metal could be one of them, the fewest carrying an H the
  // input does not state - a pyrazine on a platinum lends its bound N's pair rather than take an H on its other N)
  const solved = () => {
    for (const rule of [true, false]) {
      for (let slack = 0; slack <= willing.length; slack++) {
        for (let supplied = bound.size ? 0 : slack; supplied <= slack; supplied++) {
          matched.fill(-1);
          if (solve(slack, rule, supplied)) return true;
          if (budget < 0) return false;
        }
      }
    }
    return false;
  };

  const ok = solved();
  if (!ok) {
    // Nothing satisfies every atom, or the search ran out: give as many
    // carbons as will take one a double bond, and leave the rest single.
    matched.fill(-1);
    for (const a of needy) {
      if (matched[a] >= 0) continue;
      const p = free(a).sort(
        (x, y) =>
          Number(roles[x.other] !== "needs") -
          Number(roles[y.other] !== "needs"),
      )[0];
      if (p) {
        matched[a] = p.bond;
        matched[p.other] = p.bond;
      }
    }
  }

  // A query atom the carbons left without one takes its double bond with a
  // neighbour left without one too - the ring's last, which carbons alone
  // did not need: a pyridine with * for a carbon
  for (let a = 0; a < atoms.length; a++) {
    if (matched[a] >= 0 || !QUERY_ATOMS.has(atoms[a]?.el ?? "")) continue;
    const p = free(a)[0];
    if (p) {
      matched[a] = p.bond;
      matched[p.other] = p.bond;
    }
  }

  for (const i of aromatic) {
    const { a1, a2 } = bonds[i];
    out[i] = matched[a1] === i && matched[a2] === i ? 2 : 1;
  }
  // (a carrier left without its double bond carries an H; where others of its ring system could have carried it, which does is a
  // choice made here)
  const hChosen: number[] = [];
  for (const k of new Set(carriers.map((i) => system[i]))) {
    const here = carriers.filter((i) => system[i] === k);
    const left = here.filter((i) => matched[i] < 0);
    if (left.length && left.length < here.length) hChosen.push(...left);
  }
  return { orders: out, hChosen: hChosen.sort((p, q) => p - q), solved: ok };
}

function canonical(el: string): string {
  const s = el.trim();
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}

/**
 * Each atom's rank by what it is - its element, charge, stated H and
 * number of bonds - and, round after round, by its neighbours' ranks and
 * the bonds to them (Morgan's refinement, H. L. Morgan, J. Chem. Doc. 5,
 * 107 (1965)), until the ranks part no further. Atoms alike in every way
 * share a rank; the file's order decides only between them.
 */
function canonicalRanks(atoms: readonly KekuleAtom[], bonds: readonly KekuleBond[]): number[] {
  const near = atoms.map(() => [] as { other: number; order: number }[]);
  for (const b of bonds) {
    near[b.a1]?.push({ other: b.a2, order: b.order });
    near[b.a2]?.push({ other: b.a1, order: b.order });
  }
  const rankOf = (keys: string[]) => {
    const sorted = [...new Set(keys)].sort();
    const at = new Map(sorted.map((k, i) => [k, i]));
    return keys.map((k) => at.get(k)!);
  };
  let rank = rankOf(atoms.map((a, i) => `${canonical(a.el)}|${a.charge ?? 0}|${a.hs ?? "-"}|${near[i].length}`));
  let classes = new Set(rank).size;
  for (let round = 0; round < atoms.length; round++) {
    const next = rankOf(
      rank.map((r, i) => `${String(r).padStart(6, "0")}|${near[i].map((x) => `${String(rank[x.other]).padStart(6, "0")}:${x.order}`).sort().join(",")}`),
    );
    const now = new Set(next).size;
    rank = next;
    if (now === classes) break;
    classes = now;
  }
  return rank;
}
