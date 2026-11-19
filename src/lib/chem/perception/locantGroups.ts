/**
 * The characteristic groups of a molecule for level 2 of IUPAC numbering (foundation part 16b; docs/ATOM-MAPPING.md, *IUPAC
 * numbering*): each group's class in the order of seniority of P-41 Table 4.1 (with Tables 3.3 and 4.4), where it sits in a parent,
 * and whether Meno builds it. Pure.
 *
 * A group is found by a pattern on the graph and by what that pattern must not match: a carboxylic acid is an acyl carbon (=O, its
 * third neighbour C or H) with OH - not one on an acyclic N or O (carbamic, carbonic acids); an ester ranks as its acid; a lactone,
 * a lactam or a cyclic anhydride is a ring ketone (P-64); an acyl group on a ring N is a ketone on the chain. A class Meno does not
 * build is said (`built: false`): the carbonic family, thio acids and their kin, anhydrides, hydrazides, amidines, the oxoacids of
 * P, B, S, Si and their esters and amides, N-halo and N-nitroso amines, hydroxylamines.
 */
export type GroupAtom = { el: string; hs: number; charge?: number };
export type GroupBond = { a: number; b: number; order: number };

/** A characteristic group: its class's place in the order (lower is senior), its name, whether it is built, the atom its suffix
 *  sits on in a parent (`at`), the carbon a chain may end on (`carbon`: an acid's, an amide's, a nitrile's, an aldehyde's), the
 *  group's own atoms, and for an ester the alkoxy side (`away`: never the parent). */
export type Group = { rank: number; name: string; built: boolean; at: number; carbon?: number; atoms: number[]; away?: number };

/** The classes, top first (P-41 Table 4.1; the not-built ones where the text puts them). */
export const CLASS = {
  carboxylicAcid: 10,
  thioAcid: 11,
  sulfonicAcid: 12,
  sulfinicAcid: 13,
  carbonicAcid: 14,
  oxoacid: 15,
  anhydride: 16,
  carboxylicEster: 20,
  thioEster: 21,
  sulfonateEster: 22,
  sulfinateEster: 23,
  carbonicEster: 24,
  carboxylicHalide: 30,
  sulfonylHalide: 31,
  sulfinylHalide: 32,
  carboxamide: 40,
  thioAmide: 41,
  hydrazide: 42,
  sulfonamide: 43,
  sulfinamide: 44,
  urea: 45,
  amidine: 46,
  nitrile: 50,
  aldehyde: 60,
  ketone: 70,
  thioketone: 71,
  hydroxy: 80,
  thiol: 81,
  selanyl: 82,
  tellanyl: 83,
  hydroperoxide: 90,
  amine: 100,
  imine: 110,
} as const;

const HALOGEN = new Set(["F", "Cl", "Br", "I"]);

/** The elements an acyl group may hang on besides carbon, as A3 step 0's parents: Si, Ge, Sn, Pb, B. */
const STEP_ZERO = new Set(["Si", "Ge", "Sn", "Pb", "B"]);

/** The characteristic groups of the molecule given by its heavy atoms and bonds (indices), each once. */
export function groupsOf(atoms: readonly GroupAtom[], bonds: readonly GroupBond[], inRing: readonly boolean[]): Group[] {
  const n = atoms.length;
  const around: { to: number; order: number }[][] = atoms.map(() => []);
  for (const b of bonds) {
    around[b.a].push({ to: b.b, order: b.order });
    around[b.b].push({ to: b.a, order: b.order });
  }
  const el = (i: number) => atoms[i].el;
  const hs = (i: number) => atoms[i].hs;
  const heavy = (i: number) => el(i) !== "H";
  const doubleTo = (i: number, e: string) => around[i].find((x) => x.order === 2 && el(x.to) === e)?.to;
  const singles = (i: number) => around[i].filter((x) => x.order === 1 && heavy(x.to)).map((x) => x.to);
  const out: Group[] = [];
  const used = new Set<number>();
  const add = (g: Group) => {
    out.push(g);
    for (const a of g.atoms) used.add(a);
  };
  // (an O carrying an H and nothing else heavy but `on`: an OH)
  const isOH = (o: number, on: number) => el(o) === "O" && hs(o) >= 1 && singles(o).every((x) => x === on) && (atoms[o].charge ?? 0) === 0;
  const isOminus = (o: number, on: number) => el(o) === "O" && (atoms[o].charge ?? 0) === -1 && singles(o).every((x) => x === on);

  for (let c = 0; c < n; c++) {
    if (used.has(c)) continue;
    const e = el(c);
    if (e === "C") {
      const oxo = doubleTo(c, "O");
      const thio = doubleTo(c, "S");
      const imino = around[c].find((x) => x.order === 2 && el(x.to) === "N" && !inRing[x.to])?.to;
      const nitrileN = around[c].find((x) => x.order === 3 && el(x.to) === "N")?.to;
      const others = singles(c);
      // (the atom an acyl group hangs on: a carbon, or a senior element of A3 step 0 - silanecarboxylic acid - which is no heteroatom of
      //  the group's own)
      const hangsOn = (x: number) => el(x) === "C" || STEP_ZERO.has(el(x));
      const hetero = others.filter((x) => !hangsOn(x) && el(x) !== "H");
      const carbons = others.filter(hangsOn);
      if (nitrileN != null) {
        // (C#N on carbon: a nitrile; N-C#N, O-C#N, S-C#N are cyanamides and cyanates, not built)
        const on = carbons[0];
        if (hetero.length) add({ rank: CLASS.nitrile, name: "cyanate", built: false, at: c, atoms: [c, nitrileN] });
        else add({ rank: CLASS.nitrile, name: "nitrile", built: true, at: on ?? c, carbon: c, atoms: [c, nitrileN] });
        continue;
      }
      if (oxo != null) {
        const acyclicHetero = hetero.filter((x) => !inRing[x] || !inRing[c]);
        // (two single-bonded heteroatoms on a C=O outside a ring: the carbonic family - carbonates, carbamates, ureas, chloroformates)
        if (!inRing[c] && acyclicHetero.length >= 2) {
          const kinds = acyclicHetero.map(el).sort().join("");
          const rank = kinds === "NN" ? CLASS.urea : acyclicHetero.some((x) => isOH(x, c)) ? CLASS.carbonicAcid : CLASS.carbonicEster;
          add({ rank, name: "carbonic", built: false, at: c, atoms: [c, oxo, ...acyclicHetero] });
          continue;
        }
        const x = hetero[0];
        const acylOK = !inRing[c] || carbons.length + hetero.length === 0;
        if (x != null && acylOK && !inRing[c]) {
          const on = carbons[0];
          const acid = isOH(x, c) || isOminus(x, c);
          if (acid) {
            add({ rank: CLASS.carboxylicAcid, name: "carboxylic acid", built: true, at: on ?? c, carbon: c, atoms: [c, oxo, x] });
            continue;
          }
          if (el(x) === "O") {
            const z = singles(x).find((y) => y !== c);
            if (z != null && doubleTo(z, "O") != null && !inRing[z]) {
              add({ rank: CLASS.anhydride, name: "anhydride", built: false, at: c, atoms: [c, oxo, x] });
              continue;
            }
            if (z != null && el(z) === "C") add({ rank: CLASS.carboxylicEster, name: "ester", built: true, at: on ?? c, carbon: c, atoms: [c, oxo, x], away: z });
            else if (z != null && el(z) === "O") add({ rank: CLASS.carboxylicAcid, name: "peroxy acid", built: false, at: c, atoms: [c, oxo, x] });
            else add({ rank: CLASS.carboxylicEster, name: "pseudoester", built: false, at: c, atoms: [c, oxo, x] });
            continue;
          }
          if (HALOGEN.has(el(x))) {
            add({ rank: CLASS.carboxylicHalide, name: "acid halide", built: true, at: on ?? c, carbon: c, atoms: [c, oxo, x] });
            continue;
          }
          if (el(x) === "N" && !inRing[x]) {
            const hydrazide = singles(x).some((y) => el(y) === "N");
            if (hydrazide) add({ rank: CLASS.hydrazide, name: "hydrazide", built: false, at: c, atoms: [c, oxo, x] });
            else add({ rank: CLASS.carboxamide, name: "amide", built: true, at: on ?? c, carbon: c, atoms: [c, oxo, x] });
            continue;
          }
          if (el(x) === "S") {
            add({ rank: CLASS.thioEster, name: "thioester", built: false, at: c, atoms: [c, oxo, x] });
            continue;
          }
          if (el(x) === "N" && inRing[x]) {
            // (an acyl group on a ring N: a ketone on the chain - P-64; 1-(piperidin-1-yl)propan-1-one)
            add({ rank: CLASS.ketone, name: "ketone", built: true, at: c, atoms: [c, oxo] });
            continue;
          }
        }
        if (inRing[c] && hetero.some((y) => inRing[y])) {
          // (a ring C=O on a ring heteroatom - a lactone, a lactam, a cyclic imide: a ring ketone)
          add({ rank: CLASS.ketone, name: "ketone", built: true, at: c, atoms: [c, oxo] });
          continue;
        }
        if (carbons.length === 2 || (inRing[c] && hetero.length === 0)) {
          add({ rank: CLASS.ketone, name: "ketone", built: true, at: c, atoms: [c, oxo] });
          continue;
        }
        if (carbons.length <= 1 && hetero.length === 0) {
          // (an acyl carbon with H: an aldehyde - formaldehyde too)
          add({ rank: CLASS.aldehyde, name: "aldehyde", built: true, at: carbons[0] ?? c, carbon: c, atoms: [c, oxo] });
          continue;
        }
      }
      // (a ketene: C=C=O)
      const keteneC = around[c].find((x) => x.order === 2 && el(x.to) === "C" && doubleTo(x.to, "O") != null && around[x.to].length === 2)?.to;
      if (keteneC != null && !used.has(keteneC)) {
        add({ rank: CLASS.ketone, name: "ketene", built: true, at: keteneC, atoms: [keteneC, doubleTo(keteneC, "O")!] });
      }
      if (thio != null) {
        const thioHetero = hetero.filter((x) => !inRing[x]);
        if (carbons.length === 2 && !thioHetero.length) add({ rank: CLASS.thioketone, name: "thioketone", built: true, at: c, atoms: [c, thio] });
        else add({ rank: CLASS.thioAcid, name: "thio", built: false, at: c, atoms: [c, thio] });
        continue;
      }
      if (imino != null) {
        const amid = hetero.filter((x) => !inRing[x]);
        const onN = singles(imino).some((y) => el(y) === "N");
        if (amid.length) add({ rank: CLASS.amidine, name: "amidine", built: false, at: c, atoms: [c, imino, ...amid] });
        else if (!onN) add({ rank: CLASS.imine, name: "imine", built: true, at: c, atoms: [c, imino] });
        continue;
      }
    }
    if (e === "S" || e === "Se" || e === "Te") {
      const oxos = around[c].filter((x) => x.order === 2 && el(x.to) === "O").map((x) => x.to);
      const s1 = singles(c);
      if (e === "S" && oxos.length >= 1) {
        const carbon = s1.find((x) => el(x) === "C");
        const rest = s1.filter((x) => x !== carbon);
        const two = oxos.length === 2;
        if (carbon != null && rest.length === 1) {
          const x = rest[0];
          const oh = isOH(x, c) || isOminus(x, c);
          const rank = oh
            ? two
              ? CLASS.sulfonicAcid
              : CLASS.sulfinicAcid
            : el(x) === "O" && singles(x).some((y) => y !== c && el(y) === "C")
              ? two
                ? CLASS.sulfonateEster
                : CLASS.sulfinateEster
              : HALOGEN.has(el(x))
                ? two
                  ? CLASS.sulfonylHalide
                  : CLASS.sulfinylHalide
                : el(x) === "N" && !inRing[x]
                  ? two
                    ? CLASS.sulfonamide
                    : CLASS.sulfinamide
                  : null;
          if (rank != null) {
            const ester = rank === CLASS.sulfonateEster || rank === CLASS.sulfinateEster;
            add({ rank, name: "sulfur acid", built: true, at: carbon, atoms: [c, ...oxos, x], ...(ester ? { away: singles(x).find((y) => y !== c) } : {}) });
            continue;
          }
        }
        // (an S(=O) with OH or O-C but not on carbon - a sulfate, a sulfamic acid: an oxoacid, not built)
        if (s1.some((x) => isOH(x, c) || el(x) === "N" || (el(x) === "O" && singles(x).length === 2))) {
          add({ rank: CLASS.oxoacid, name: "sulfur oxoacid", built: false, at: c, atoms: [c, ...oxos] });
          continue;
        }
        // (a sulfoxide, a sulfone: never a principal group)
        continue;
      }
      if (oxos.length === 0 && hs(c) >= 1 && s1.length === 1 && el(s1[0]) === "C") {
        add({ rank: e === "S" ? CLASS.thiol : e === "Se" ? CLASS.selanyl : CLASS.tellanyl, name: "thiol", built: e === "S", at: s1[0], atoms: [c] });
        continue;
      }
    }
    if ((e === "P" || e === "B" || e === "As" || e === "Si") && !inRing[c]) {
      const carries = around[c].some((x) => (x.order === 2 && el(x.to) === "O") || (x.order === 1 && (isOH(x.to, c) || (el(x.to) === "N" && !inRing[x.to]))));
      const oc = around[c].some((x) => x.order === 1 && el(x.to) === "O" && !inRing[x.to] && singles(x.to).some((y) => y !== c && el(y) === "C"));
      if (e !== "Si" && (carries || oc)) {
        add({ rank: CLASS.oxoacid, name: "oxoacid", built: false, at: c, atoms: [c] });
        continue;
      }
    }
    if (e === "O" && hs(c) >= 1 && (atoms[c].charge ?? 0) === 0) {
      const s1 = singles(c);
      if (s1.length === 1 && el(s1[0]) === "C" && !used.has(s1[0])) {
        add({ rank: CLASS.hydroxy, name: "hydroxy", built: true, at: s1[0], atoms: [c] });
        continue;
      }
      if (s1.length === 1 && el(s1[0]) === "O") {
        const on = singles(s1[0]).find((y) => y !== c);
        if (on != null && el(on) === "C") add({ rank: CLASS.hydroperoxide, name: "hydroperoxide", built: true, at: on, atoms: [c, s1[0]] });
        continue;
      }
      if (s1.length === 1 && el(s1[0]) !== "C" && !used.has(s1[0])) {
        // (OH on a ring N, Si, B, P, S - an N-hydroxy group on an amine, imine or amide is a substituent, not this class)
        const on = s1[0];
        if (!(el(on) === "N" && !inRing[on])) add({ rank: CLASS.hydroxy, name: "hydroxy on a heteroatom", built: false, at: on, atoms: [c] });
      }
    }
    if (e === "N" && !inRing[c]) {
      const s1 = singles(c);
      const allSingle = around[c].every((x) => x.order === 1);
      if (!allSingle) continue;
      const toN = s1.some((y) => el(y) === "N");
      const toHalogen = s1.some((y) => HALOGEN.has(el(y)));
      const acylOrSulfonyl = s1.some((y) => (el(y) === "C" && doubleTo(y, "O") != null) || (el(y) === "S" && doubleTo(y, "O") != null));
      const onCarbon = s1.filter((y) => el(y) === "C");
      if (acylOrSulfonyl || toN) continue;
      if (toHalogen) {
        add({ rank: CLASS.amine, name: "N-halo amine", built: false, at: c, atoms: [c] });
        continue;
      }
      const onlyO = s1.filter((y) => el(y) !== "H").every((y) => el(y) === "O");
      if (onlyO && s1.length) {
        add({ rank: CLASS.amine, name: "hydroxylamine", built: false, at: c, atoms: [c] });
        continue;
      }
      if (onCarbon.length || s1.some((y) => el(y) === "Si" || el(y) === "B")) add({ rank: CLASS.amine, name: "amine", built: true, at: c, atoms: [c] });
    }
  }
  return out;
}
