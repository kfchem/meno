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
 * electrons 4n + 2 (Hückel's rule, counted as below): a tetrazine none, a
 * tetrazole and a benzotriazole one, porphine two, guanine two beside its
 * C=O. Where no choice makes 4n + 2, as few as can be. Which nitrogen
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
 * Per bond, the order to draw it with (`kekuleOrders`); and the atoms read
 * as carrying an H the input did not state, where another atom of their
 * ring system could have carried it instead (`hChosen`, by index): which
 * nitrogen of an imidazole, a tetrazole, a purine or a porphine has it is
 * Meno's choice there, and not the input's (the maintainer, 2026-10-22: to
 * be said where the structure is shown).
 */
export function kekulized(atoms: readonly KekuleAtom[], bonds: readonly KekuleBond[]): { orders: (1 | 2 | 3)[]; hChosen: number[] } {
  const out: (1 | 2 | 3)[] = bonds.map((b) =>
    b.order === 2 ? 2 : b.order === 3 ? 3 : 1,
  );
  const aromatic = bonds
    .map((b, i) => (b.order === AROMATIC_BOND ? i : -1))
    .filter((i) => i >= 0);
  if (aromatic.length === 0) return { orders: out, hChosen: [] };

  const degree = new Array<number>(atoms.length).fill(0);
  const hasMultiple = new Array<boolean>(atoms.length).fill(false);
  for (const b of bonds) {
    degree[b.a1]++;
    degree[b.a2]++;
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

  // Hückel's rule: a ring, or a fused ring system, is aromatic with 4N + 2
  // pi electrons - counted as the RDKit Book counts them ("The RDKit
  // Aromaticity Model", rdkit.org/docs/RDKit_Book.html, the 2026.09.1
  // documentation, read 2026-10-21): c 1, n 1, an n with a third neighbour
  // or its H 2, o, s, se, te 2, a ring atom's exocyclic double bond to O or
  // N 0 (it "steals" the electron). Beyond the table's examples: an
  // exocyclic C=S, C=Se, C=P or C=As 0 too, as RDKit counts them (measured:
  // a 2-pyridone's ring is aromatic in RDKit with each of these on its
  // carbon, and not with C=C); a charged carbon, which the table does not
  // list, 0 as a cation and 2 as an anion (the tropylium's, the
  // cyclopentadienide's). After E. Hückel, Z. Phys.
  // 70, 204 (1931) and its sequels, Z. Phys. 72, 310 (1931) and 76, 628
  // (1932) - not opened here. Of the ways to give the double bonds, those
  // whose every system holding an atom that may take one counts 4N + 2 come
  // first - guanine's two N-H with its C=O, a tetrazine's none - and where
  // none does, the fewest left without (an atom of no known count: no count)
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
  /** An atom's pi electrons, given whether it has its double bond in the ring; null where it is not known. */
  const electrons = (i: number, matched: boolean): number | null => {
    const el = canonical(atoms[i]?.el ?? "");
    const charge = atoms[i]?.charge ?? 0;
    if (hasMultiple[i]) {
      // (its double bond made already: in the ring, one; out of it - a C=O, C=N, C=S, C=Se, C=P, C=As - none, the
      // bond taking its electron, as RDKit counts it; out of it to a carbon, one)
      const out = bonds.find((b) => (b.order === 2 || b.order === 3) && (b.a1 === i || b.a2 === i) && !inRing(b.a1, b.a2));
      if (!out) return 1;
      return ["O", "N", "S", "Se", "Te", "P", "As"].includes(canonical(atoms[out.a1 === i ? out.a2 : out.a1]?.el ?? "")) ? 0 : 1;
    }
    if (matched) return 1;
    if (QUERY_ATOMS.has(atoms[i]?.el ?? "")) return null;
    if (el === "C") return charge < 0 ? 2 : charge > 0 ? 0 : null;
    if (el === "B") return charge < 0 ? 1 : 0;
    if (["N", "P", "As", "O", "S", "Se", "Te"].includes(el)) return 2;
    return null;
  };
  const counted = new Set(willing.map((i) => system[i]));
  const huckel = (): boolean => {
    const sum = new Map<number, number | null>();
    for (let i = 0; i < atoms.length; i++) {
      const k = system[i];
      if (!counted.has(k)) continue;
      const was = sum.get(k);
      if (was === null) continue;
      const e = electrons(i, matched[i] >= 0);
      sum.set(k, e === null ? null : (was ?? 0) + e);
    }
    for (const total of sum.values()) if (total !== null && total % 4 !== 2) return false;
    return true;
  };

  const matched = new Array<number>(atoms.length).fill(-1);
  const free = (i: number) => partners[i].filter((p) => matched[p.other] < 0);
  let budget = 200_000;

  // Most constrained atom first - every one that needs a double bond, then
  // those that may take one, `slack` of them at most left without; a partner
  // that needs a double bond before one that merely may take it; between
  // equals, the lower rank.
  const solve = (slack: number, rule: boolean): boolean => {
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
      for (const a of willing) {
        if (matched[a] >= 0) continue;
        const f = free(a);
        if (f.length === 0) {
          if (++left > slack) return false;
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
        if (solve(slack, rule)) return true;
        matched[pick] = -1;
        matched[p.other] = -1;
      }
      // (or this one left without, where there is slack for it: counted with those left below)
      if (left + 1 > slack) return false;
      const was = partners[pick];
      partners[pick] = [];
      const ok = solve(slack, rule);
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
      if (solve(slack, rule)) return true;
      matched[pick] = -1;
      matched[p.other] = -1;
    }
    return false;
  };
  const solved = () => {
    for (const rule of [true, false]) {
      for (let slack = 0; slack <= willing.length; slack++) {
        matched.fill(-1);
        if (solve(slack, rule)) return true;
        if (budget < 0) return false;
      }
    }
    return false;
  };

  if (!solved()) {
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
  // (a neutral N or P of two bonds whose H the input did not state, left without its double bond, carries one;
  // where others of its ring system could have carried it, which does is a choice made here)
  const carriers = willing.filter((i) => ["N", "P"].includes(canonical(atoms[i]?.el ?? "")) && degree[i] === 2 && (atoms[i]?.charge ?? 0) === 0 && atoms[i]?.hs == null);
  const hChosen: number[] = [];
  for (const k of new Set(carriers.map((i) => system[i]))) {
    const here = carriers.filter((i) => system[i] === k);
    const left = here.filter((i) => matched[i] < 0);
    if (left.length && left.length < here.length) hChosen.push(...left);
  }
  return { orders: out, hChosen: hChosen.sort((p, q) => p - q) };
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
