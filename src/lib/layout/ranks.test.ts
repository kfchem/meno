import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { layout2D } from "./engine";
import { perceive, type LayoutInput } from "./perceive";
import { atomClasses, canonicalRanks } from "./ranks";
import { fromSmiles } from "./testdata/fromSmiles";
import { shuffled } from "./testdata/shuffled";
import { measured } from "../../testing/timeouts";

/** Each atom's new place in `shuffled(g, seed)`: the same shuffle, its atoms told apart by a charge. */
const placesIn = (n: number, seed: number) => {
  const marked = { atoms: Array.from({ length: n }, (_, i) => ({ el: "C", hs: 0, charge: i + 1 })), bonds: [] };
  const out = shuffled(marked, seed);
  const to = new Array<number>(n);
  out.atoms.forEach((a, t) => (to[(a.charge ?? 0) - 1] = t));
  return to;
};

describe("atom classes and canonical ranks", () => {
  const molecules = [
    "CC(C)(C)c1ccc(O)cc1",
    "C12C3C4C3C2C5C4C51",
    "C[C@H]1CC[C@@H](C(C)C)[C@@H](O)C1",
    "OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O",
  ];
  /** The molecule written by its atoms' canonical ranks: the same text for the same molecule, whichever of alike atoms took which rank. */
  const written = (g: LayoutInput) => {
    const r = canonicalRanks(perceive(g));
    return g.bonds.map((b) => [r[b.a], r[b.b]].sort((p, q) => p - q).join("-") + `:${b.order}`).sort().join(" ");
  };
  it.each(molecules)("are the same for %s in any order of its atoms", (smiles) => {
    const g = fromSmiles(smiles);
    const classes = atomClasses(perceive(g));
    for (const seed of [11, 23, 37]) {
      const to = placesIn(g.atoms.length, seed);
      const other = shuffled(g, seed);
      const c = atomClasses(perceive(other));
      expect(to.map((t) => c[t])).toEqual(classes);
      expect(written(other)).toBe(written(g));
    }
  });

  it("puts a tert-butyl's methyls in one class, each still alone by its canonical rank", () => {
    const mol = perceive(fromSmiles("CC(C)(C)O"));
    const c = atomClasses(mol);
    expect(new Set([c[0], c[2], c[3]]).size).toBe(1);
    expect(new Set(canonicalRanks(mol)).size).toBe(mol.n);
  });
});

/**
 * `g` with the double bond `k`'s cis or trans given against the other neighbour of its end `end` - the same configuration said the other
 * way; null where that end has no second neighbour.
 */
function exchanged(g: LayoutInput, k: number, end: 0 | 1): LayoutInput | null {
  const b = g.bonds[k];
  const [at, partner] = end === 0 ? [b.a, b.b] : [b.b, b.a];
  const others = g.bonds.flatMap((x) => (x.a === at && x.b !== partner ? [x.b] : x.b === at && x.a !== partner ? [x.a] : []));
  const other = others.find((o) => o !== b.stereo!.refs[end]);
  if (others.length !== 2 || other == null) return null;
  const refs: [number, number] = end === 0 ? [other, b.stereo!.refs[1]] : [b.stereo!.refs[0], other];
  return { ...g, bonds: g.bonds.map((x, j) => (j === k ? { ...x, stereo: { refs, cis: !b.stereo!.cis } } : x)) };
}

describe("a double bond's cis or trans, given against either neighbour of an end", () => {
  // (the smallest molecule of the layout's fixtures whose ranks hung on it, by a search over them all, each end exchanged in turn:
  //  beta-carotene's two alike halves were told apart by which neighbour a C=C was given against - two such bonds of eighteen)
  const carotene = "CC1=C(C(CCC1)(C)C)/C=C/C(=C/C=C/C(=C/C=C/C=C(/C=C/C=C(/C=C/C2=C(CCCC2(C)C)C)\\C)\\C)/C)/C";

  it("gives beta-carotene the same canonical ranks, and lays it out the same", () => {
    const g = fromSmiles(carotene);
    for (const k of [20, 24]) {
      const other = exchanged(g, k, 1)!;
      expect(canonicalRanks(perceive(other))).toEqual(canonicalRanks(perceive(g)));
      const [p, q] = [layout2D(other), layout2D(g)];
      expect([p.x, p.y]).toEqual([q.x, q.y]);
    }
  }, measured(370));

  it("gives beta-carotene the same ranks with a stereo bond's atoms listed the other way round, its refs as they were", () => {
    // (the ref on the bond's first atom is found by the end it is on, not by its place in the refs)
    const g = fromSmiles(carotene);
    for (const k of [20, 24]) {
      const turned = { ...g, bonds: g.bonds.map((x, j) => (j === k ? { ...x, a: x.b, b: x.a } : x)) };
      expect(canonicalRanks(perceive(turned)), `bond ${k}`).toEqual(canonicalRanks(perceive(g)));
    }
  });

  it("gives every fixture with a stereo double bond the same ranks, each end of each such bond exchanged in turn", () => {
    const fixtures = ["molecules.json", "heldout.json"].flatMap(
      (f) => (JSON.parse(readFileSync(resolve(__dirname, "../../../scripts/layout", f), "utf8")).molecules as { smiles?: string }[]).flatMap((m) => (m.smiles ? [m.smiles] : [])),
    );
    let tried = 0;
    for (const smiles of fixtures) {
      const g = fromSmiles(smiles);
      if (!g.bonds.some((b) => b.stereo)) continue;
      const ranks = canonicalRanks(perceive(g));
      g.bonds.forEach((b, k) => {
        if (!b.stereo) return;
        for (const end of [0, 1] as const) {
          const other = exchanged(g, k, end);
          if (!other) continue;
          tried++;
          expect(canonicalRanks(perceive(other)), `${smiles} bond ${k} end ${end}`).toEqual(ranks);
        }
      });
    }
    expect(tried).toBeGreaterThan(10);
  });
});
