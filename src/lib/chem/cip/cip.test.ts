import { describe, expect, it } from "vitest";
import { readStereo, type DrawnAtom, type DrawnBond } from "../../layout/drawn";
import type { IdentityInput } from "../identity";
import { cipLabels, MOST_VARIANTS } from "./index";
import { cipInput, cipOf, cipSaid } from "./testdata/cipFrom";

/**
 * Each rule and convention pinned by a pair of structures alike but in what
 * that rule reads: one answer for one, another (or none) for the other. The
 * cases the published validation suite gives are in cipCases.test.ts.
 */

describe("rule 1a: higher atomic number precedes lower", () => {
  it("ranks a centre's own neighbours by their atomic numbers - a neighbour above F or below it turns the label", () => {
    // (Cl > F > C > H, and F > O > C > H: the same places, the order of two swapped)
    expect(cipOf("F[C@H](Cl)C")).toEqual(["C1:R"]);
    expect(cipOf("F[C@H](O)C")).toEqual(["C1:S"]);
    expect(cipOf("Br[C@H](Cl)F")).toEqual(["C1:S"]);
    expect(cipOf("Br[C@@H](Cl)F")).toEqual(["C1:R"]);
  });

  it("goes out sphere by sphere from the higher-ranked atom first: an OMe's C beats an OH's H before a CH2Br's Br is reached", () => {
    // (each ligand C(O)(C)H: at their O the OMe wins; with OH on both, at their C the CH2Br does - the label turns)
    expect(cipOf("F[C@H](C(O)CBr)C(OC)C")).toEqual(["C1:R"]);
    expect(cipOf("F[C@H](C(O)CBr)C(O)C")).toEqual(["C1:S"]);
  });

  it("gives a multiple bond's atoms duplicates at both ends: an aldehyde's CHO above a CH2OH, an ethynyl above a tert-butyl, a vinyl below it", () => {
    // ((R)-glyceraldehyde: CHO is (O,O,H), CH2OH (O,H,H))
    expect(cipOf("O=C[C@H](O)CO")).toEqual(["C2:R"]);
    // (C#CH is (C,C,C), then its C (C,C,H) against a methyl's (H,H,H); CH=CH2 is (C,C,H) against (C,C,C))
    expect(cipOf("O[C@H](C#C)C(C)(C)C")).toEqual(["C1:S"]);
    expect(cipOf("O[C@H](C=C)C(C)(C)C")).toEqual(["C1:R"]);
  });

  it("takes a lone pair as a phantom atom of atomic number 0, lowest of all: a sulfoxide's S, an N-oxide's N", () => {
    expect(cipOf("C[S@](=O)CC")).toEqual(["S1:S"]);
    expect(cipOf("C[S@@](=O)CC")).toEqual(["S1:R"]);
  });

  it("blends a ring's Kekulé structures: either drawing of a phenyl or a 2-pyridyl gives one label", () => {
    expect(cipOf("F[C@H](Cl)C=1C=CC=CC1")).toEqual(cipOf("F[C@H](Cl)C1=CC=CC=C1"));
    expect(cipOf("O[C@@H](C1=NC=CC=C1)C")).toEqual(["C1:R"]);
    expect(cipOf("O[C@@H](C1=CC=CC=N1)C")).toEqual(["C1:R"]);
  });
});

describe("the 1966 conventions, applied before any ranking", () => {
  it("(b): an S=O, a P=O is a dipolar single bond with no duplicates - drawn S=O or S+-O-, P=O or P+-O-, one label", () => {
    expect(cipOf("CO[S@](=O)C")).toEqual(["S2:S"]);
    expect(cipOf("CO[S@+]([O-])C")).toEqual(["S2:S"]);
    expect(cipOf("C[S@](=O)CC")).toEqual(cipOf("C[S@+]([O-])CC"));
    expect(cipOf("C[P@](=O)(CC)c1ccccc1")).toEqual(["P1:S"]);
    expect(cipOf("C[P@+]([O-])(CC)c1ccccc1")).toEqual(["P1:S"]);
  });

  it("(c): a nitro group drawn N(=O)=O, an N-oxide drawn N=O, is given its usual structure, N+ and O-: drawn any way, one label", () => {
    expect(cipOf("O=N(=O)[C@H](C)CC")).toEqual(["C3:R"]);
    expect(cipOf("O=[N+]([O-])[C@H](C)CC")).toEqual(["C3:R"]);
    expect(cipOf("[O-][N+](=O)[C@H](C)CC")).toEqual(["C3:R"]);
    expect(cipOf("CC[N@](=O)(C)c1ccccc1")).toEqual(cipOf("CC[N@+]([O-])(C)c1ccccc1"));
  });
});

describe("rule 2: higher mass precedes lower", () => {
  it("tells H from D, and D from T, by their isotopes' masses - no centre without them", () => {
    expect(cipOf("[2H][C@H](C)O")).toEqual(["C1:R"]);
    expect(cipOf("[3H][C@H]([2H])O")).toEqual(["C1:S"]);
    expect(cipOf("[H][C@H](C)O")).toEqual(["C1:alike"]);
  });
});

describe("rule 3: seqcis (Z) precedes seqtrans (E), which precedes a double bond that is no stereogenic unit", () => {
  it("ranks a Z propenyl above an E one - two Z, and the centre is none", () => {
    expect(cipOf(String.raw`C/C=C\[C@H](O)/C=C/C`)).toEqual(["C3:R", "C1=C2:Z", "C5=C6:E"]);
    expect(cipOf(String.raw`C/C=C\[C@H](O)/C=C\C`)).toEqual(["C3:alike", "C1=C2:Z", "C5=C6:Z"]);
  });

  it("ranks a double bond with a Z and an E group on it above one with two Z groups - their Z and E rule 3's own, not left for rules 4 and 5", () => {
    expect(cipOf(String.raw`C/C=C\C/C(=C\[C@H](C=C(C/C=C\C)C/C=C\C)O)/C/C=C/C`)).toEqual(["C6:S", "C1=C2:Z", "C4=C5:Z", "C10=C11:Z", "C14=C15:Z", "C19=C20:E"]);
    // (with two Z groups on both, the two branches are alike; and so is a double bond with two alike groups)
    expect(cipOf(String.raw`O[C@H](C=C(C/C=C\C)C/C=C\C)/C=C(/C/C=C\C)C/C=C\C`)).toEqual(["C1:alike", "C5=C6:Z", "C9=C10:Z", "C12=C13:alike", "C15=C16:Z", "C19=C20:Z"]);
  });
});

describe("rules 4a, 4b, 4c and 5: configurations in the ligands", () => {
  it("4a: a configured centre in a ligand precedes an unconfigured one - the two ligands' places swapped, the label turns", () => {
    expect(cipOf("O[C@H]([C@H](C)Cl)C(C)Cl")).toEqual(["C1:S", "C2:S"]);
    expect(cipOf("O[C@H](C(C)Cl)[C@H](C)Cl")).toEqual(["C1:R", "C5:S"]);
  });

  it("4b: a ligand whose two centres are like (R,R or S,S) precedes one whose are unlike - a chiral centre, R or S", () => {
    expect(cipOf("O[C@H]([C@H](Cl)[C@H](C)Cl)[C@H](Cl)[C@@H](C)Cl")).toEqual(["C1:S", "C2:S", "C4:S", "C7:S", "C9:R"]);
  });

  it("4c: a ligand with an r centre precedes one with an s - and with two s centres, none", () => {
    expect(cipOf("O[C@H]([C@H]([C@H](C)Cl)[C@@H](C)Cl)[C@@H]([C@H](C)Cl)[C@@H](C)Cl")).toEqual(["C1:S", "C2:r", "C3:S", "C6:R", "C9:s", "C10:S", "C13:R"]);
    expect(cipOf("O[C@H]([C@@H]([C@H](C)Cl)[C@@H](C)Cl)[C@@H]([C@H](C)Cl)[C@@H](C)Cl")[0]).toEqual("C1:alike");
  });

  it("5: an R group precedes its mirror image, S - a pseudoasymmetric centre, r or s, the same in the mirror image; R and R, none", () => {
    expect(cipOf("C[C@@H](Cl)[C@H](O)[C@@H](Cl)C")).toEqual(["C1:R", "C3:r", "C5:S"]);
    expect(cipOf("C[C@H](Cl)[C@@H](O)[C@H](Cl)C")).toEqual(["C1:S", "C3:r", "C5:R"]);
    expect(cipOf("C[C@@H](Cl)[C@H](O)[C@H](Cl)C")).toEqual(["C1:R", "C3:alike", "C5:R"]);
    // (two enantiomorphic ligands, each the other's mirror image, against a like and an unlike pair: rule 5, r or s)
    expect(cipOf("O[C@H]([C@@H](Cl)[C@H](C)Cl)[C@H](Cl)[C@@H](C)Cl")[0]).toEqual("C1:s");
  });

  it("5 at a double bond: its two groups each other's mirror image - seqTrans or seqCis, Z or E that turns in the mirror image", () => {
    expect(cipOf("Cl[C@H](C)/C(=C/C)[C@H](C)Cl")).toEqual(["C1:R", "C6:S", "C3=C4:E turns"]);
    expect(cipOf("Cl[C@@H](C)/C(=C/C)[C@@H](C)Cl")).toEqual(["C1:S", "C6:R", "C3=C4:Z turns"]);
  });

  it("3 leaves a double bond that turns in the mirror image to rules 4a and 5, reading it as none: here it goes on to the Z bonds further out", () => {
    // (the first ligand's double bond seqTrans, its groups CH(Cl)CH=CHCH3 with E bonds, R and S; the second's, unconfigured, with Z bonds, no unit)
    expect(cipOf(String.raw`O[C@H](/C=C(\[C@H](Cl)/C=C/C)[C@@H](Cl)/C=C/C)C=C(C(Cl)/C=C\C)C(Cl)/C=C\C`).slice(0, 4)).toEqual(["C1:R", "C4:R", "C9:S", "C2=C3:E turns"]);
  });
});

describe("an allene's axis and an odd cumulene's cis or trans", () => {
  it("names an allene's axis by its ends' groups, the near end's first: M or P, the same from either end", () => {
    expect(cipOf("CC=[C@]=CC")).toEqual(["C1~C3:M"]);
    expect(cipOf("CC=[C@@]=CC")).toEqual(["C1~C3:P"]);
    expect(cipOf("NC(Br)=[C@]=C(O)C")).toEqual(["C1~C4:M"]);
    expect(cipOf("CC(O)=[C@]=C(Br)N")).toEqual(["C1~C4:M"]);
    expect(cipOf("CC(O)=[C@@]=C(Br)N")).toEqual(["C1~C4:P"]);
    // (an even run of four double bonds, likewise)
    expect(cipOf("CC=C=[C@]=C=CC")).toEqual(["C1~C5:M"]);
    // (an end with two alike groups: no axis)
    expect(cipOf("CC(C)=[C@]=CC")).toEqual(["C1~C4:alike"]);
  });

  it("names an odd cumulene's cis or trans E or Z by its ends' groups ranked, as a double bond's", () => {
    expect(cipOf("C/C=C=C=C/C")).toEqual(["C1=..=C4:E"]);
    expect(cipOf("C/C=C=C=C\\C")).toEqual(["C1=..=C4:Z"]);
    // (Cl over F at the first end: Cl trans to the far F, so E)
    expect(cipOf("Cl/C(F)=C=C=C/F")).toEqual(["C1=..=C5:E"]);
    expect(cipOf("F/C(Cl)=C=C=C/F")).toEqual(["C1=..=C5:Z"]);
  });
});

describe("what gives no label, and why", () => {
  it("says a ligand's double bond left open in the drawing, by its bond", () => {
    const input = cipInput("CC=C[C@H](O)/C=C/C");
    const r = cipLabels(input).centres.get(3)!;
    expect(r).toEqual({
      why: "open",
      bond: input.bonds.findIndex((b) => b.order === 2 && !b.stereo),
    });
  });

  it("reads an axis in a ligand as its M or P: two alike ligands but for their axes' senses, a pseudoasymmetric centre; their axes alike, no centre", () => {
    // (two 2'-methylbiphenyl-2-yl groups, each with its axis between its rings: bonds 7-8 and 20-21)
    const input = cipInput("O[C@H](c1ccccc1-c1ccccc1C)c1ccccc1-c1ccccc1C");
    expect(cipSaid(input)).toEqual(["C1:alike"]);
    const axes = (a: 1 | -1, b: 1 | -1) => [
      { atoms: [7, 8] as const, refs: [6, 13] as const, sense: a },
      { atoms: [20, 21] as const, refs: [19, 26] as const, sense: b },
    ];
    // (M precedes P, as R precedes S: rule 5, Hanson et al. 2018 p. 1761; the axes the other way round, the other)
    expect(cipSaid({ ...input, axes: axes(1, -1) })).toEqual(["C1:s", "C7~C8:M", "C20~C21:P"]);
    expect(cipSaid({ ...input, axes: axes(-1, 1) })).toEqual(["C1:r", "C7~C8:P", "C20~C21:M"]);
    expect(cipSaid({ ...input, axes: axes(1, 1) })).toEqual(["C1:alike", "C7~C8:M", "C20~C21:M"]);
  });

  it("says a ligand it would have to look past cannot be told from the drawing: a metal's, a star's", () => {
    expect(cipOf("C[C@H](O)[Fe]")).toEqual(["C1:unsure"]);
    expect(cipOf("C[C@H](O)*")).toEqual(["C1:unsure"]);
  });

  it("says a double bond whose end is part of a charged system cannot be told: an enolate's C=C, unlike an enol's", () => {
    expect(cipOf("C/C=C/[O-]")).toEqual(["C1=C2:unsure"]);
    expect(cipOf("C/C=C/O")).toEqual(["C1=C2:E"]);
  });

  it("takes three bonds and a lone pair for a centre - a carbanion's, its lone pair counted with its charge - but three bonds and an empty place for none", () => {
    // (CHFCl- and CHFCl+, configured as their three bonds stand: F, Cl and the H, a fourth place the lone pair's or empty)
    const three = (smiles: string) => {
      const input = cipInput(smiles);
      return cipSaid({ ...input, atoms: input.atoms.map((a, i) => (i === 1 ? { ...a, tetra: { neighbours: [0, 2, -1], volume: 1 as const } } : a)) });
    };
    expect(three("F[CH-]Cl")).toEqual(["C1:R"]);
    expect(three("F[CH+]Cl")).toEqual(["C1:unsure"]);
  });

  it("6, the 2018 proposal: a spiro atom between two rings each with an N and a C=O - its N alike, its C alike - R or S, the other in the mirror image", () => {
    expect(cipOf("O=C1CCN[C@@]12NCCC2=O")).toEqual(["C5:R"]);
    expect(cipOf("O=C1CCN[C@]12NCCC2=O")).toEqual(["C5:S"]);
  });

  it("6 leaves alike what promotion does not tell apart, as drawn and in the mirror image: a spiro atom between two rings each alike in itself, a ring atom with two ways round its one ring", () => {
    expect(cipOf("C1=CC[C@]2(C1)CCCCC2")).toEqual(["C3:alike"]);
    expect(cipOf("O[C@H]1CCCCC1")).toEqual(["C1:alike"]);
  });

  it("gives up past its node budget, and says so, rather than freezing: a centre between two cages tied far out", () => {
    expect(prismsCentre(4)).toEqual({ why: "alike" });
    expect(prismsCentre(12)).toEqual({ why: "large" });
  });
});

describe("charged and radical mesomeric systems: a label only where every usual structure gives it", () => {
  it("labels a lactate anion's centre as the acid's, and a zwitterionic amino acid's as the neutral one's", () => {
    expect(cipOf("C[C@H](O)C(=O)[O-]")).toEqual(["C1:S"]);
    expect(cipOf("C[C@H](O)C(=O)O")).toEqual(["C1:S"]);
    // (L-alanine: S, as its zwitterion)
    expect(cipOf("C[C@@H](C(=O)[O-])[NH3+]")).toEqual(["C1:S"]);
    expect(cipOf("C[C@@H](C(=O)O)N")).toEqual(["C1:S"]);
  });

  it("labels a centre beside an amidinate, drawn with its charge on either N", () => {
    expect(cipOf("C[C@H](N)C(=N)[N-]C")).toEqual(["C1:S"]);
    expect(cipOf("C[C@H](N)C(=NC)[NH-]")).toEqual(["C1:S"]);
  });

  it("keeps a phenolate's charge on its O, its ring as blended: labelled as the phenol is", () => {
    expect(cipOf("C[C@H](O)C1=CC=C([O-])C=C1")).toEqual(cipOf("C[C@H](O)C1=CC=C(O)C=C1"));
    expect(cipOf("F[C@H](C1=CC=CC=C1[O-])C1=CC=CC=C1O")).toEqual(["C1:R"]);
  });

  it("ranks a carboxylate against an acid the same in both its usual structures: the acid's OH above the anion's O-", () => {
    expect(cipOf("[O-]C(=O)[C@H](O)C(=O)O")).toEqual(["C3:S"]);
    expect(cipOf("O=C([O-])[C@H](O)C(=O)O")).toEqual(["C3:S"]);
  });

  it("says unsure where its usual structures disagree: an allyl anion's end, above a propyl drawn C=C, below it drawn C-", () => {
    expect(cipOf("F[C@H](C=C[CH2-])CCC")).toEqual(["C1:unsure"]);
    expect(cipOf("F[C@H]([CH-]C=C)CCC")).toEqual(["C1:unsure"]);
    // (neutral, a propenyl: (C,C,H) above a propyl's (C,H,H))
    expect(cipOf("F[C@H](C=CC)CCC")).toEqual(["C1:S"]);
  });

  it("takes an empty place only on a C: an allyl cation's moves, so its ends disagree; a C+ beside C=O has the one usual structure", () => {
    expect(cipOf("F[C@H]([CH+]C=C)CCC")).toEqual(["C1:unsure"]);
    // (C=C-O+ would leave the O six electrons: no usual structure)
    expect(cipOf("F[C@H]([CH+]C=O)CCC")).toEqual(["C1:R"]);
  });

  it("works out only the systems a ranking reaches - eleven carboxylates on a chain, one centre labelled at once - and past MOST_VARIANTS says unsure", () => {
    const asp = "NC(CC(=O)[O-])C(=O)";
    expect(cipOf(`C[C@H](O)C(=O)${asp.repeat(10)}NCC(=O)[O-]`)).toEqual(["C1:S"]);
    // (two arms tied far out, each with three branches of two carboxylates: their structures 2^12 together)
    const x = "C(CC(=O)[O-])CC(=O)[O-]";
    expect(cipOf(`F[C@H](C(${x})(${x})${x})C(${x})(${x})CCC`)).toEqual(["C1:unsure"]);
    expect(MOST_VARIANTS).toBeLessThan(2 ** 12);
  });
});

describe("what does not change it", () => {
  /** `input` with its atoms put in another order: `perm[i]` the new index of atom i. */
  function renumbered(input: IdentityInput, perm: number[]): IdentityInput {
    const atoms = new Array(input.atoms.length);
    input.atoms.forEach((a, i) => {
      const t = a.tetra;
      atoms[perm[i]] = {
        ...a,
        ...(t
          ? {
              tetra: {
                ...t,
                neighbours: t.neighbours.map((n) => (n < 0 ? n : perm[n])),
              },
            }
          : {}),
      };
    });
    const bonds = input.bonds.map((b) => ({
      ...b,
      a: perm[b.a],
      b: perm[b.b],
      ...(b.stereo
        ? {
            stereo: {
              ...b.stereo,
              refs: b.stereo.refs.map((n) => perm[n]) as [number, number],
            },
          }
        : {}),
    }));
    return { atoms, bonds };
  }
  /** The labels of `input` by atom, its double bonds' at each end. */
  function byAtom(input: IdentityInput, perm?: number[]): Map<number, string> {
    const back = (i: number) => (perm ? perm.indexOf(i) : i);
    const out = new Map<number, string>();
    const r = cipLabels(input);
    for (const [a, x] of r.centres) out.set(back(a), "label" in x ? x.label : x.why);
    for (const [i, x] of r.bonds) for (const e of [input.bonds[i].a, input.bonds[i].b]) out.set(back(e), "label" in x ? x.label : x.why);
    return out;
  }
  const smiles = [
    "O=C[C@H](O)CO",
    "F[C@H](C(O)CBr)C(OC)C",
    String.raw`C/C=C\C/C(=C\[C@H](C=C(C/C=C\C)C/C=C\C)O)/C/C=C/C`,
    "CO[S@](=O)C1=CC=C(C=C1)N(=O)=O",
    "C1C=C[C@H]2C[C@@H]12",
    "C[C@@H](Cl)[C@H](O)[C@@H](Cl)C",
  ];

  it("leaves every label where it was when the atoms are numbered another way", () => {
    for (const s of smiles) {
      const input = cipInput(s);
      const n = input.atoms.length;
      // (a fixed shuffle: each atom to 7i + 3 mod n, n prime to 7 - else reversed)
      const perm = n % 7 ? input.atoms.map((_, i) => (7 * i + 3) % n) : input.atoms.map((_, i) => n - 1 - i);
      expect(byAtom(renumbered(input, perm), perm), s).toEqual(byAtom(input));
    }
  });

  it("turns R and S about in the mirror image, and keeps Z and E", () => {
    const mirror = (l: string) => ({ R: "S", S: "R" })[l] ?? l;
    for (const s of smiles) {
      const input = cipInput(s);
      const mirrored: IdentityInput = {
        ...input,
        atoms: input.atoms.map((a) => (a.tetra ? { ...a, tetra: { ...a.tetra, volume: -a.tetra.volume as 1 | -1 } } : a)),
      };
      expect(byAtom(mirrored), s).toEqual(new Map([...byAtom(input)].map(([a, l]) => [a, mirror(l)])));
    }
  });

  it("gives one label to a drawing, however its wedges show the configuration", () => {
    // (CHFClBr drawn with its H not drawn: Br up the page, Cl to the right below, F to the left)
    const atoms: DrawnAtom[] = [
      { x: 0, y: 0, el: "C", hs: 1 },
      { x: 0, y: 1, el: "Br", hs: 0 },
      { x: 0.87, y: -0.5, el: "Cl", hs: 0 },
      { x: -0.87, y: -0.5, el: "F", hs: 0 },
    ];
    const bonds = (wedge: DrawnBond["wedge"], at: number): DrawnBond[] =>
      [1, 2, 3].map((b) => ({
        a: 0,
        b,
        order: 1,
        ...(b === at ? { wedge } : {}),
      }));
    const said = (bs: DrawnBond[]) => {
      const st = readStereo(atoms, bs);
      return cipSaid({
        atoms: atoms.map((a, i) => ({
          el: a.el!,
          hs: a.hs,
          ...(st.tetra.get(i) ? { tetra: st.tetra.get(i)! } : {}),
        })),
        bonds: bs.map((b) => ({ a: b.a, b: b.b, order: b.order })),
      });
    };
    // (a wedge to Br or to Cl: the H behind either way, Br, Cl and F clockwise - R; hashes to Br: the H in front - S)
    const up = said(bonds({ narrow: 0, stereo: "up" }, 1));
    expect(up).toEqual(["C0:R"]);
    expect(said(bonds({ narrow: 0, stereo: "up" }, 2))).toEqual(up);
    expect(said(bonds({ narrow: 0, stereo: "down" }, 1))).toEqual(["C0:S"]);
  });
});

/**
 * A centre C(H)(F) bonded to two [n]prismanes - two n-rings of CH joined
 * rung by rung - each at one corner: its two cage branches alike all the
 * way out, through paths that grow some threefold a sphere.
 */
function prismsCentre(n: number) {
  const atoms: IdentityInput["atoms"][number][] = [
    { el: "C", hs: 1, tetra: { neighbours: [1, 2, 2 + 2 * n, -1], volume: 1 } },
    { el: "F", hs: 0 },
  ];
  const bonds = [{ a: 0, b: 1, order: 1 }];
  for (const start of [2, 2 + 2 * n]) {
    for (let i = 0; i < 2 * n; i++) atoms.push({ el: "C", hs: i === 0 ? 0 : 1 });
    for (let i = 0; i < n; i++) {
      bonds.push({ a: start + i, b: start + ((i + 1) % n), order: 1 }, { a: start + n + i, b: start + n + ((i + 1) % n), order: 1 }, { a: start + i, b: start + n + i, order: 1 });
    }
    bonds.push({ a: 0, b: start, order: 1 });
  }
  return cipLabels({ atoms, bonds }).centres.get(0);
}
