/**
 * Identity's fill (`filledIn`, part 13's U1) tried on every writing of
 * fourteen structures - each place that can carry a configuration written one
 * way, the other way or left blank - against what each writing stands for:
 * the compounds among its completions. CHEM's three tests (11-13, third
 * check): never one identity for two meanings; a writing that stands for one
 * compound has that compound's identity; and filled in the canonical order,
 * the identity is the same whatever order the atoms are given in. And CHEM's
 * known answers: how many stereoisomers each structure has, counted by
 * identity over every full writing, and the writings with one centre left
 * plain.
 */
import { describe, expect, it } from "vitest";
import type { LayoutInput } from "../layout/perceive";
import { fromSmiles } from "../layout/testdata/fromSmiles";
import { SHUFFLE_SEEDS, shuffled } from "../layout/testdata/shuffled";
import { measured } from "../../testing/timeouts";
import { constitutionKey, identityKey, identityText } from "./identity";

/** Each place written up (1), down (-1) or left blank (0). */
type Writing = (1 | -1 | 0)[];

/**
 * A structure's places that can carry a configuration - its centres of four
 * single bonds with at most one H, its C=C bonds each end with a group and no
 * other double bond - and the structure as each writing of them gives it.
 */
function writingsOf(smiles: string) {
  const base = fromSmiles(smiles);
  const around: number[][] = base.atoms.map(() => []);
  for (const b of base.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
  }
  const hs = (i: number) => base.atoms[i].hs ?? 0;
  const single = (i: number) => base.bonds.every((b) => (b.a !== i && b.b !== i) || b.order === 1);
  const centres = base.atoms.map((_, i) => i).filter((i) => hs(i) <= 1 && around[i].length + hs(i) === 4 && single(i));
  const doubles = base.bonds
    .map((_, k) => k)
    .filter((k) => {
      const b = base.bonds[k];
      const doubled = (x: number) => base.bonds.filter((o) => (o.a === x || o.b === x) && o.order === 2).length;
      const end = (x: number) => base.atoms[x].el === "C" && around[x].length >= 2 && around[x].length + hs(x) === 3;
      return b.order === 2 && doubled(b.a) === 1 && doubled(b.b) === 1 && end(b.a) && end(b.b);
    });
  const places = centres.length + doubles.length;
  const written = (w: Writing): LayoutInput => ({
    atoms: base.atoms.map(({ tetra: _tetra, ...a }, i) => {
      const j = centres.indexOf(i);
      return j < 0 || w[j] === 0 ? a : { ...a, tetra: { neighbours: hs(i) ? [...around[i], -1] : [...around[i]], volume: w[j] as 1 | -1 } };
    }),
    bonds: base.bonds.map(({ stereo: _stereo, ...b }, k) => {
      const j = doubles.indexOf(k);
      if (j < 0 || w[centres.length + j] === 0) return b;
      const refs: [number, number] = [around[b.a].find((x) => x !== b.b)!, around[b.b].find((x) => x !== b.a)!];
      return { ...b, stereo: { refs, cis: w[centres.length + j] === 1 } };
    }),
  });
  const known = new Map<string, string>();
  const identityOf = (w: Writing) => {
    const key = w.join(",");
    if (!known.has(key)) known.set(key, identityText(written(w)));
    return known.get(key)!;
  };
  const every = (blank: boolean): Writing[] => {
    const values: (1 | -1 | 0)[] = blank ? [0, 1, -1] : [1, -1];
    let out: Writing[] = [[]];
    for (let k = 0; k < places; k++) out = out.flatMap((w) => values.map((v) => [...w, v]));
    return out;
  };
  /** What a writing stands for: the identities of its completions, each blank written both ways. */
  const meaning = (w: Writing) => {
    let out: Writing[] = [[]];
    for (const v of w) out = out.flatMap((c) => (v === 0 ? [[...c, 1], [...c, -1]] : [[...c, v]]) as Writing[]);
    return [...new Set(out.map(identityOf))].sort();
  };
  return { places, written, identityOf, every, meaning };
}

const STRUCTURES: [string, string][] = [
  ["propan-2-ol", "CC(C)O"],
  ["tartaric acid", "OC(C(O)C(O)=O)C(O)=O"],
  ["2,3,4-trihydroxypentanedioic acid", "OC(C(O)C(O)=O)C(O)C(O)=O"],
  ["1,4-dimethylcyclohexane", "CC1CCC(C)CC1"],
  ["1,2-dimethylcyclohexane", "CC1CCCCC1C"],
  ["1,2,3-trimethylcyclopropane", "CC1C(C)C1C"],
  ["1,3,5-trimethylcyclohexane", "CC1CC(C)CC(C)C1"],
  ["1,2,3,4-tetramethylcyclobutane", "CC1C(C)C(C)C1C"],
  ["2,6-dimethylspiro[3.3]heptane", "CC1CC2(C1)CC(C)C2"],
  ["(4-methylcyclohexylidene)acetic acid", "CC1CCC(=CC(O)=O)CC1"],
  ["hexa-2,4-diene", "CC=CC=CC"],
  ["decalin", "C1CCC2CCCCC2C1"],
  ["1,2,3,4,5-pentamethylcyclopentane", "CC1C(C)C(C)C(C)C1C"],
  ["inositol", "OC1C(O)C(O)C(O)C(O)C1O"],
];

describe("identity filled in, over every writing of fourteen structures", () => {
  it(
    "never gives two meanings one identity, and gives a writing of one compound that compound's identity",
    () => {
      let writings = 0;
      for (const [name, smiles] of STRUCTURES) {
        const s = writingsOf(smiles);
        const meanings = new Map<string, Set<string>>();
        for (const w of s.every(true)) {
          writings++;
          const id = s.identityOf(w);
          const means = s.meaning(w);
          (meanings.get(id) ?? meanings.set(id, new Set()).get(id)!).add(means.join("|"));
          if (means.length === 1) expect(id, `${name}: ${w.join(",")}`).toBe(means[0]);
        }
        for (const [, means] of meanings) expect(means.size, name).toBe(1);
      }
      expect(writings).toBe(1218);
    },
    measured(20_000),
  );

  it(
    "is the same whatever order the atoms are given in",
    () => {
      // (every writing of the smaller ones, shuffled)
      for (const [name, smiles] of STRUCTURES.slice(0, 12)) {
        const s = writingsOf(smiles);
        for (const w of s.every(true)) {
          const g = s.written(w);
          for (const seed of SHUFFLE_SEEDS.slice(0, 2)) expect(identityText(shuffled(g, seed)), `${name}: ${w.join(",")}`).toBe(s.identityOf(w));
        }
      }
    },
    measured(20_000),
  );
});

describe("identity filled in: CHEM's known answers", () => {
  it("counts each structure's stereoisomers by identity over every full writing", () => {
    const count = (smiles: string) => {
      const s = writingsOf(smiles);
      return new Set(s.every(false).map(s.identityOf)).size;
    };
    expect(count("CC1CC(C)CC(C)C1")).toBe(2);
    expect(count("CC1C(C)C1C")).toBe(2);
    expect(count("CC1CC2(C1)CC(C)C2")).toBe(2);
    expect(count("OC(C(O)C(O)=O)C(O)=O")).toBe(3);
    expect(count("OC1C(O)C(O)C(O)C(O)C1O")).toBe(9);
    expect(count("OC(C(O)C(O)=O)C(O)C(O)=O")).toBe(4);
    expect(count("CC1C(C)C(C)C1C")).toBe(4);
    expect(count("CC1CCC(C)CC1")).toBe(2);
    expect(count("CC1CCC(=CC(O)=O)CC1")).toBe(2);
    expect(count("CCC1CC2(C1)CC(C)C2")).toBe(2);
  });

  it("tells 1,6-diazaspiro[4.4]nonane-4,9-dione's two spiro senses apart, and the dimethylspiroheptane's enantiomers", () => {
    // (Blue Book P-93.5.3.2: a spiro atom of two alike pairs is a chirality centre)
    expect(identityText(fromSmiles("O=C1CCN[C@]12NCCC2=O"))).not.toBe(identityText(fromSmiles("O=C1CCN[C@@]12NCCC2=O")));
    const spiro = (a: string, b: string, c: string) => identityText(fromSmiles(`C[C${a}H]1C[C${b}]2(C1)C[C${c}H](C)C2`));
    expect(spiro("@", "@", "@")).not.toBe(spiro("@@", "@@", "@@"));
  });

  it("gives propan-2-ol one identity, drawn with its centre either way and with none", () => {
    const ids = ["C[C@H](C)O", "C[C@@H](C)O", "CC(C)O"].map((x) => identityText(fromSmiles(x)));
    expect(new Set(ids).size).toBe(1);
  });

  it("fills in a lone pair's centre that sets nothing too: dimethyl sulfoxide, against ethyl methyl sulfoxide", () => {
    const ids = (...xs: string[]) => new Set(xs.map((x) => identityText(fromSmiles(x)))).size;
    expect(ids("C[S@](C)=O", "C[S@@](C)=O", "CS(C)=O")).toBe(1);
    expect(ids("CC[S@](C)=O", "CC[S@@](C)=O", "CCS(C)=O")).toBe(3);
  });

  it("joins the cis,trans 1,2,3-trimethylcyclopropane written with its trans pair and one centre plain to the compound itself", () => {
    const s = writingsOf("CC1C(C)C1C");
    expect(s.places).toBe(3);
    // (its two compounds by their full writings: the cis,trans one written six ways, the all-cis two)
    const writtenAs = new Map<string, number>();
    for (const w of s.every(false)) writtenAs.set(s.identityOf(w), (writtenAs.get(s.identityOf(w)) ?? 0) + 1);
    expect([...writtenAs.values()].sort()).toEqual([2, 6]);
    const cisTrans = [...writtenAs].find(([, n]) => n === 6)![0];
    const allCis = [...writtenAs].find(([, n]) => n === 2)![0];
    const plain = s.every(true).filter((w) => w.filter((v) => v === 0).length === 1);
    // (a writing with one centre plain stands for one compound - the cis,trans - or for two; those of one compound are it)
    const ofOne = plain.filter((w) => s.meaning(w).length === 1);
    const ofTwo = plain.filter((w) => s.meaning(w).length === 2);
    expect(ofOne.length).toBeGreaterThan(0);
    expect(ofTwo.length).toBeGreaterThan(0);
    for (const w of ofOne) expect(s.identityOf(w)).toBe(cisTrans);
    // (the cis pair written and the third plain: open, one identity of its own, neither compound's)
    const open = new Set(ofTwo.map(s.identityOf));
    expect(open.size).toBe(1);
    expect([...open][0]).not.toBe(cisTrans);
    expect([...open][0]).not.toBe(allCis);
  });

  it("keeps unspecified 1,4-dimethylcyclohexane and unspecified tartaric acid each its own, none of its isomers'", () => {
    for (const smiles of ["CC1CCC(C)CC1", "OC(C(O)C(O)=O)C(O)=O"]) {
      const s = writingsOf(smiles);
      const blank = s.identityOf(s.every(true)[0]);
      for (const w of s.every(false)) expect(s.identityOf(w), smiles).not.toBe(blank);
    }
  });
});

describe("a constitution's key", () => {
  it("is the key Meno wrote for it before identity filled anything in, so that a value saved with it still finds its structure", () => {
    // (the keys written by identityKey before part 13's fill, for these constitutions: a value's `of` holds them)
    const bare = (smiles: string) => {
      const g = fromSmiles(smiles);
      return { atoms: g.atoms.map(({ tetra: _tetra, ...a }) => a), bonds: g.bonds.map(({ stereo: _stereo, ...b }) => b) };
    };
    expect(constitutionKey(bare("CC(C)O"))).toBe("67fcfad66e6e6c8e");
    expect(constitutionKey(bare("CC(C)Cc1ccc(cc1)C(C)C(=O)O"))).toBe("ba27f66b9b1619e3");
    expect(constitutionKey(bare("OC1C(O)C(O)C(O)C(O)C1O"))).toBe("b28395fd12924b6f");
    // (whatever configuration it is given, and though identity itself now fills propan-2-ol's centre in)
    expect(constitutionKey(fromSmiles("C[C@H](C)O"))).toBe("67fcfad66e6e6c8e");
    expect(identityKey(bare("CC(C)O"))).not.toBe("67fcfad66e6e6c8e");
  });
});
