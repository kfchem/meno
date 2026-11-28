import { describe, expect, it } from "vitest";
import { alkaliOnCarbon, atOnePlace, besidePieces, besideReach, BESIDE_PIECE, ionApartSaid, openLabels, OVER_SAID, valenceUnread, wordsApart, inLineCarbons, lostLabelEnds, LOST_LABEL_REACH, ONE_PLACE, pictureDpi, tinyPieces, TINY_PIECE } from "./tracedRead";
import type { ReadAtom, ReadBond } from "./read";

describe("how finely a box holding pictures is drawn to be traced", () => {
  // (a picture an inch across and half an inch high: 72 by 36 points)
  const inch: [number, number, number, number] = [100, 100, 172, 136];

  it("is as finely as its picture is stored, however the picture is turned", () => {
    expect(pictureDpi({ pictures: [inch], pixels: [[300, 150]] }, inch, 300, 600)).toBeCloseTo(300, 6);
    expect(pictureDpi({ pictures: [inch], pixels: [[150, 300]] }, inch, 300, 600)).toBeCloseTo(300, 6);
    // (a picture stored coarser than the reader was measured at: drawn as coarse, never enlarged)
    expect(pictureDpi({ pictures: [inch], pixels: [[150, 75]] }, inch, 300, 600)).toBeCloseTo(150, 6);
  });

  it("is at most the most, and where the PDF does not say, the otherwise", () => {
    expect(pictureDpi({ pictures: [inch], pixels: [[1200, 600]] }, inch, 300, 600)).toBe(600);
    expect(pictureDpi({ pictures: [inch], pixels: [null] }, inch, 300, 600)).toBe(300);
    expect(pictureDpi({ pictures: [inch] }, inch, 300, 600)).toBe(300);
  });

  it("is the picture's that covers most of the box", () => {
    const beside: [number, number, number, number] = [172, 100, 180, 136];
    const box: [number, number, number, number] = [100, 100, 180, 136];
    expect(pictureDpi({ pictures: [beside, inch], pixels: [[800, 3600], [300, 150]] }, box, 300, 600)).toBeCloseTo(300, 6);
    expect(pictureDpi({ pictures: [inch, beside], pixels: [[300, 150], [800, 3600]] }, box, 300, 600)).toBeCloseTo(300, 6);
  });
});

describe("a small piece of a picture read, of carbons alone", () => {
  /** A chain of `n` atoms from `from`, each `el` where given, joined in a row - and closed where `ring`. */
  const piece = (from: number, n: number, ring = false, el: (k: number) => Partial<ReadAtom> = () => ({})) => ({
    atoms: Array.from({ length: n }, (_, k): ReadAtom => ({ x: from + k, y: 0, ...el(k) })),
    bonds: Array.from({ length: ring ? n : n - 1 }, (_, k): ReadBond => ({ a: from + k, b: from + ((k + 1) % n), order: 1 })),
  });
  // (atoms a unit apart in a row: a bond of 1)
  const read = (...ps: ReturnType<typeof piece>[]) => ({ atoms: ps.flatMap((p) => p.atoms), bonds: ps.flatMap((p) => p.bonds), bond: 1 });

  it("is said where it is six atoms or fewer - a 1 or a 7 traced as a line, and a cyclohexane or a hexane drawn alone, which still come through", () => {
    expect(TINY_PIECE).toBe(6);
    const bare = (atoms: number[]) => [{ atoms, apart: false }];
    expect(tinyPieces(read(piece(0, 2)))).toEqual(bare([0, 1]));
    expect(tinyPieces(read(piece(0, 6, true)))).toEqual(bare([0, 1, 2, 3, 4, 5]));
    expect(tinyPieces(read(piece(0, 6)))).toEqual(bare([0, 1, 2, 3, 4, 5]));
  });

  it("is not said, alone, where it has a label or another element, or is larger", () => {
    expect(tinyPieces(read(piece(0, 3, false, (k) => (k === 2 ? { label: "OH" } : {}))))).toEqual([]);
    expect(tinyPieces(read(piece(0, 3, false, (k) => (k === 2 ? { el: "N" } : {}))))).toEqual([]);
    expect(tinyPieces(read(piece(0, 7)))).toEqual([]);
  });

  it("is told piece by piece: beside a structure, only the small piece is said", () => {
    const big = piece(0, 12, true);
    const bonds = big.bonds.map((b) => ({ ...b }));
    const two = piece(12, 2);
    expect(tinyPieces({ atoms: [...big.atoms, ...two.atoms], bonds: [...bonds, ...two.bonds], bond: 1 })).toEqual([{ atoms: [12, 13], apart: false }]);
  });

  it("is said beside a larger piece where it holds a carbon with no label - a group whose bond to the structure was not read", () => {
    const big = piece(0, 12, true);
    // (an OH come off with a stray carbon: C-O)
    const co = piece(12, 2, false, (k) => (k === 1 ? { label: "OH" } : {}));
    expect(tinyPieces(read(big, co))).toEqual([{ atoms: [12, 13], apart: true }]);
    // (alone, the same piece is a drawing of its own: not said)
    expect(tinyPieces(read(piece(0, 2, false, (k) => (k === 1 ? { label: "OH" } : {}))))).toEqual([]);
    // (a piece of labels only beside it - a counterion written - is not)
    const salt = piece(12, 2, false, (k) => ({ label: k ? "Cl" : "H" }));
    expect(tinyPieces(read(big, salt))).toEqual([]);
  });

  it("is said within the picture's reach of a larger piece's atom - a group cut off by one bond not traced - and not beyond it", () => {
    // (a chain of twelve, bonds of 1; an alanine-like piece of six, carbons and labels, its first atom `gap` on from the chain's end)
    const chain = piece(0, 12);
    const six = (gap: number) => {
      const p = piece(12, 6, false, (k) => (k === 2 ? { label: "OH" } : k === 4 ? { label: "NH2" } : {}));
      return { ...p, atoms: p.atoms.map((a, k) => ({ ...a, x: 11 + gap + k })) };
    };
    const said = [{ atoms: [12, 13, 14, 15, 16, 17], apart: true }];
    // (the longest bond read is 1: the reach a bond and a half)
    expect(besideReach(read(chain))).toBeCloseTo(1.5, 6);
    // (one drawn bond off, and a little more - a bond to a label, or stretched)
    expect(tinyPieces(read(chain, six(1)))).toEqual(said);
    expect(tinyPieces(read(chain, six(1.05)))).toEqual(said);
    expect(tinyPieces(read(chain, six(1.45)))).toEqual(said);
    // (past every bond the picture has, and half a bond more: no bond of it was cut - a small molecule drawn apart, read whole)
    expect(tinyPieces(read(chain, six(1.55)))).toEqual([]);
    expect(tinyPieces(read(chain, six(3)))).toEqual([]);
  });

  it("takes its reach from the longest bond the picture has: a stretched bond lets a group stand that much farther", () => {
    const chain = piece(0, 12);
    // (the chain's last bond drawn 1.4 long)
    const stretched = { ...chain, atoms: chain.atoms.map((a, k) => (k === 11 ? { ...a, x: 10 + 1.4 } : a)) };
    const six = (gap: number) => {
      const p = piece(12, 6, false, (k) => (k === 2 ? { label: "OH" } : {}));
      return { ...p, atoms: p.atoms.map((a, k) => ({ ...a, x: 11.4 + gap + k })) };
    };
    expect(besideReach(read(stretched))).toBeCloseTo(1.9, 6);
    expect(tinyPieces(read(stretched, six(1.7)))).toEqual([{ atoms: [12, 13, 14, 15, 16, 17], apart: true }]);
    expect(tinyPieces(read(stretched, six(2)))).toEqual([]);
  });
});

describe("a carbon between two single bonds in line, in a picture read", () => {
  /** Atoms at the points given, each `el` where given, joined in a row by bonds of the orders given. */
  const row = (pts: [number, number][], orders: (1 | 2 | 3)[], els: (string | undefined)[] = []) => ({
    atoms: pts.map(([x, y], k): ReadAtom => ({ x, y, ...(els[k] ? { el: els[k] } : {}) })),
    bonds: orders.map((order, k): ReadBond => ({ a: k, b: k + 1, order })),
  });

  it("is said: a bond traced as two, the extra CH2 of a chain read too long", () => {
    // (a zigzag, its middle bond read as two in line)
    expect(inLineCarbons(row([[0, 0], [1, 0.5], [1.5, 0.5], [2, 0.5], [3, 0]], [1, 1, 1, 1]))).toEqual([2]);
    // (within ten degrees of a line, as a broken bond lies)
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, Math.tan((8 * Math.PI) / 180)]], [1, 1]))).toEqual([1]);
  });

  it("is not said of a zigzag, a bend past ten degrees, a heteroatom, or a carbon in line on a triple or cumulated bond", () => {
    expect(inLineCarbons(row([[0, 0], [0.87, 0.5], [1.73, 0]], [1, 1]))).toEqual([]);
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, Math.tan((12 * Math.PI) / 180)]], [1, 1]))).toEqual([]);
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, 0]], [1, 1], [undefined, "O"]))).toEqual([]);
    // (ethyne's and a nitrile's carbons, an allene's middle, a cumulene's: their straight carbons kept)
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, 0], [3, 0]], [1, 3, 1]))).toEqual([]);
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, 0]], [1, 3], [undefined, undefined, "N"]))).toEqual([]);
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, 0]], [2, 2]))).toEqual([]);
    expect(inLineCarbons(row([[0, 0], [1, 0], [2, 0], [3, 0]], [2, 2, 2]))).toEqual([]);
  });
});

describe("bonds stopping short of one point where nothing was read - a label lost", () => {
  /** Atoms at points, bonds between them by index, single; a bond 10 long. */
  const read = (pts: [number, number][], bonds: [number, number][], el: (k: number) => Partial<ReadAtom> = () => ({})) => ({
    atoms: pts.map(([x, y], k): ReadAtom => ({ x, y, ...el(k) })),
    bonds: bonds.map(([a, b]): ReadBond => ({ a, b, order: 1 })),
    bond: 10,
  });
  // (a ring corner at the origin, its two bonds from (-8.66, -5) and (8.66, -5), each stopping `short` of a bond before it)
  const corner = (short: number, more: [number, number][] = []) => {
    const ends: [number, number][] = [[-8.66 * short, -5 * short], [8.66 * short, -5 * short]];
    return read([[-8.66, -5], [8.66, -5], ...ends, ...more], [[0, 2], [1, 3]]);
  };

  it("marks both ends where the two bonds, carried on, cross within the reach of each", () => {
    expect(LOST_LABEL_REACH).toBe(0.75);
    expect(lostLabelEnds(corner(0.4)).sort()).toEqual([2, 3]);
    expect(lostLabelEnds(corner(0.7)).sort()).toEqual([2, 3]);
  });

  it("marks nothing where they cross farther than the reach, or where an atom was read at the point", () => {
    expect(lostLabelEnds(corner(0.8))).toEqual([]);
    expect(lostLabelEnds(corner(0.4, [[0, 0]]))).toEqual([]);
  });

  it("marks nothing where the ends point apart (two methyls on one carbon, or on two), or one end has a label", () => {
    // (a carbon at the origin, two methyls out of it, up-left and up-right: their lines carried on part)
    expect(lostLabelEnds(read([[0, 0], [-8.66, -5], [8.66, -5]], [[0, 1], [0, 2]]))).toEqual([]);
    // (two methyls on the two ends of a bond, pointing away from it)
    expect(lostLabelEnds(read([[0, 0], [10, 0], [-5, -8.66], [15, -8.66]], [[0, 1], [0, 2], [1, 3]]))).toEqual([]);
    const labelled = corner(0.4);
    labelled.atoms[3] = { ...labelled.atoms[3], label: "OH" };
    expect(lostLabelEnds(labelled)).toEqual([]);
  });
});

describe("three things a picture's read says, never reads silently", () => {
  // (bonds a unit long, as a picture's read has them in its units)
  const at = (x: number, y: number, more: Partial<ReadAtom> = {}): ReadAtom => ({ x, y, ...more });
  const bond = (a: number, b: number, order: 1 | 2 | 3 = 1): ReadBond => ({ a, b, order });
  /** A hexagon of carbons a bond across its sides, its middle at 0, 0 - atoms 0 to 5. */
  const ring = (): ReadAtom[] => Array.from({ length: 6 }, (_, k) => at(Math.sin((k * Math.PI) / 3), -Math.cos((k * Math.PI) / 3)));
  const ringBonds = (): ReadBond[] => Array.from({ length: 6 }, (_, k) => bond(k, (k + 1) % 6));

  it("a piece of two to four atoms, labels and all, within a bond of a larger piece's box: a C-OH cut off a ring", () => {
    expect(BESIDE_PIECE).toBe(4);
    // (a CH and its OH half a bond right of the ring's box: a cyclohexylmethanol whose joint was traced open)
    const read = { atoms: [...ring(), at(1.4, 0), at(2.4, 0, { label: "OH" })], bonds: [...ringBonds(), bond(6, 7)], bond: 1 };
    expect(besidePieces(read)).toEqual([6, 7]);
    // (two bonds away from the box: a second structure of the figure, not said)
    const apart = { ...read, atoms: [...ring(), at(3.2, 0), at(4.2, 0, { label: "OH" })] };
    expect(besidePieces(apart)).toEqual([]);
  });

  it("is not said of a counter-ion - charged, or one atom - nor of a piece as large as the other, nor of a structure alone", () => {
    const ion = { atoms: [...ring(), at(1.4, 0, { label: "N", charge: 1 }), at(2.4, 0)], bonds: [...ringBonds(), bond(6, 7)], bond: 1 };
    expect(besidePieces(ion)).toEqual([]);
    const sign = { atoms: [...ring(), at(1.4, 0), at(2.4, 0, { label: "O-" })], bonds: [...ringBonds(), bond(6, 7)], bond: 1 };
    expect(besidePieces(sign)).toEqual([]);
    const lone = { atoms: [...ring(), at(1.4, 0, { label: "Br" })], bonds: ringBonds(), bond: 1 };
    expect(besidePieces(lone)).toEqual([]);
    // (two ethanes side by side: neither is larger)
    const two = { atoms: [at(0, 0), at(1, 0), at(0, 0.8), at(1, 0.8)], bonds: [bond(0, 1), bond(2, 3)], bond: 1 };
    expect(besidePieces(two)).toEqual([]);
    expect(besidePieces({ atoms: ring(), bonds: ringBonds(), bond: 1 })).toEqual([]);
  });

  it("an alkali metal bonded to a carbon: the metal is said; on an oxygen, or charged, it is not", () => {
    // (sodium acetate whose O- sign was read as a bond to a carbon: Na on a CH2)
    const onCarbon = { atoms: [at(0, 0), at(1, 0, { label: "Na" }), at(-1, 0, { label: "O" })], bonds: [bond(0, 1), bond(0, 2)] };
    expect(alkaliOnCarbon(onCarbon)).toEqual([1]);
    expect(alkaliOnCarbon({ atoms: [at(0, 0, { label: "CH2" }), at(1, 0, { el: "Li" })], bonds: [bond(0, 1)] })).toEqual([1]);
    expect(alkaliOnCarbon({ atoms: [at(0, 0, { label: "O" }), at(1, 0, { label: "Na" })], bonds: [bond(0, 1)] })).toEqual([]);
    expect(alkaliOnCarbon({ atoms: [at(0, 0), at(1, 0, { label: "K", charge: 1 })], bonds: [bond(0, 1)] })).toEqual([]);
    // (magnesium on a carbon - a Grignard reagent - is no alkali metal)
    expect(alkaliOnCarbon({ atoms: [at(0, 0), at(1, 0, { label: "Mg" })], bonds: [bond(0, 1)] })).toEqual([]);
  });

  it("two atoms not bonded to each other within a third of a bond and a little: both said; bonded, or further, neither", () => {
    expect(ONE_PLACE).toBe(0.35);
    // (a ring opened at a joint: its two ends a quarter of a bond apart)
    const atoms = [...ring().slice(0, 6), at(0.25, -1)];
    const bonds = [bond(0, 1), bond(1, 2), bond(2, 3), bond(3, 4), bond(4, 5), bond(5, 6)];
    expect(atOnePlace({ atoms, bonds, bond: 1 })).toEqual([0, 6]);
    expect(atOnePlace({ atoms, bonds: [...bonds, bond(6, 0)], bond: 1 })).toEqual([]);
    expect(atOnePlace({ atoms: [...ring().slice(0, 6), at(0.4, -1)], bonds, bond: 1 })).toEqual([]);
  });
});

describe("a hetero atom written bare whose bonds leave it open", () => {
  /** Atoms by label (none for a carbon), bonds by [a, b, order]; a unit apart. */
  const mol = (labels: (Partial<ReadAtom> | string | null)[], bonds: [number, number, 1 | 2 | 3][]) => ({
    atoms: labels.map((l, k): ReadAtom => ({ x: k, y: 0, ...(typeof l === "string" ? { label: l } : (l ?? {})) })),
    bonds: bonds.map(([a, b, order]): ReadBond => ({ a, b, order })),
  });

  it("is said where an acetate's minus was not read: its O with one bond, bare, uncharged", () => {
    // (CH3-C(=O)-O, the sign lost)
    expect(openLabels(mol([null, null, "O", "O"], [[0, 1, 1], [1, 2, 2], [1, 3, 1]]))).toEqual([3]);
    // (a thiolate's S, an amide's N with one bond, an O at a long chain's end)
    expect(openLabels(mol([null, "S"], [[0, 1, 1]]))).toEqual([1]);
    expect(openLabels(mol([null, "N"], [[0, 1, 1]]))).toEqual([1]);
    expect(openLabels(mol([null, null, null, null, null, null, null, "O"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 1], [6, 7, 1]]))).toEqual([7]);
  });

  it("is not said where the label fills it: an acid's OH, an ether's O, a carbonyl's O, an amine's N, an N-oxide with its charges, alanine", () => {
    // (acetic acid)
    expect(openLabels(mol([null, null, "O", "OH"], [[0, 1, 1], [1, 2, 2], [1, 3, 1]]))).toEqual([]);
    // (dimethyl ether; a ring's O)
    expect(openLabels(mol([null, "O", null], [[0, 1, 1], [1, 2, 1]]))).toEqual([]);
    expect(openLabels(mol([null, null, "O", null, null], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 0, 1]]))).toEqual([]);
    // (trimethylamine; an imine's N; a nitrile's N)
    expect(openLabels(mol([null, "N", null, null], [[0, 1, 1], [1, 2, 1], [1, 3, 1]]))).toEqual([]);
    expect(openLabels(mol([null, "N", null], [[0, 1, 2], [1, 2, 1]]))).toEqual([]);
    expect(openLabels(mol([null, "N"], [[0, 1, 3]]))).toEqual([]);
    // (trimethylamine N-oxide drawn with its charges: N+ and O-, or charges read on the atoms)
    expect(openLabels(mol([null, "N+", null, null, "O\u2212"], [[0, 1, 1], [1, 2, 1], [1, 3, 1], [1, 4, 1]]))).toEqual([]);
    expect(openLabels(mol([null, { label: "N", charge: 1 }, null, null, { label: "O", charge: -1 }], [[0, 1, 1], [1, 2, 1], [1, 3, 1], [1, 4, 1]]))).toEqual([]);
    // (alanine: CH3-CH(NH2)-C(=O)OH)
    expect(openLabels(mol([null, null, "NH2", null, "O", "OH"], [[0, 1, 1], [1, 2, 1], [1, 3, 1], [3, 4, 2], [3, 5, 1]]))).toEqual([]);
    // (a radical's O, its dot drawn; a charge drawn in a ring by it; an aromatic ring's N, its bonds one and a half)
    expect(openLabels(mol([null, { label: "O", dots: 1 }], [[0, 1, 1]]))).toEqual([]);
    expect(openLabels(mol([null, { label: "O", marked: -1 }], [[0, 1, 1]]))).toEqual([]);
    const ring = mol([null, null, "N", null, null, null], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 0, 1]]);
    expect(openLabels({ ...ring, bonds: ring.bonds.map((b) => ({ ...b, aromatic: true as const })) })).toEqual([]);
  });
});

describe("an atom whose bonds its element cannot hold uncharged, no charge read", () => {
  const mol = (labels: (Partial<ReadAtom> | string | null)[], bonds: [number, number, 1 | 2 | 3][]) => ({
    atoms: labels.map((l, k): ReadAtom => ({ x: k, y: 0, ...(typeof l === "string" ? { label: l } : (l ?? {})) })),
    bonds: bonds.map(([a, b, order]): ReadBond => ({ a, b, order })),
  });
  const kinds = (m: ReturnType<typeof mol>) => [...valenceUnread(m)];

  it("is said with too few: a lone halogen with no bond - its minus lost, or no part of the structure - as an O with one", () => {
    expect(kinds(mol(["Cl"], []))).toEqual([[0, "few"]]);
    expect(kinds(mol(["Br"], []))).toEqual([[0, "few"]]);
    expect(kinds(mol([null, "Cl"], [[0, 1, 1]]))).toEqual([]);
    expect(kinds(mol([{ label: "Cl", charge: -1 }], []))).toEqual([]);
  });

  it("is said with too many: an N or a B with four, an O with three - a sign not read; an S with four or six and a P with five are as drawn", () => {
    // (tetramethylammonium, its plus lost; a pyridine N-oxide's N drawn with its double bonds, its plus lost)
    expect(kinds(mol([null, "N", null, null, null], [[0, 1, 1], [1, 2, 1], [1, 3, 1], [1, 4, 1]]))).toEqual([[1, "many"]]);
    // (and its O, its minus lost too, has too few)
    expect(kinds(mol([null, "N", null, "O"], [[0, 1, 2], [1, 2, 1], [1, 3, 1]]))).toEqual([[1, "many"], [3, "few"]]);
    expect(kinds(mol([null, "B", null, null, null], [[0, 1, 1], [1, 2, 1], [1, 3, 1], [1, 4, 1]]))).toEqual([[1, "many"]]);
    expect(kinds(mol([null, "O", null, null], [[0, 1, 1], [1, 2, 1], [1, 3, 1]]))).toEqual([[1, "many"]]);
    // (a sulfoxide, a sulfone, a phosphine oxide, a phosphate's P, a nitro's N drawn with two double bonds)
    expect(kinds(mol([null, "S", null, "O"], [[0, 1, 1], [1, 2, 1], [1, 3, 2]]))).toEqual([]);
    expect(kinds(mol([null, "S", null, "O", "O"], [[0, 1, 1], [1, 2, 1], [1, 3, 2], [1, 4, 2]]))).toEqual([]);
    expect(kinds(mol([null, "P", null, null, "O"], [[0, 1, 1], [1, 2, 1], [1, 3, 1], [1, 4, 2]]))).toEqual([]);
    expect(kinds(mol([null, "N", "O", "O"], [[0, 1, 1], [1, 2, 2], [1, 3, 2]]))).toEqual([]);
    // (its plus read)
    expect(kinds(mol([null, "N+", null, null, null], [[0, 1, 1], [1, 2, 1], [1, 3, 1], [1, 4, 1]]))).toEqual([]);
  });
});

describe("too many bonds, where a plain line is a dative bond or the element's valence is as drawn", () => {
  const mol = (labels: (Partial<ReadAtom> | string | null)[], bonds: [number, number, 1 | 2 | 3][]) => ({
    atoms: labels.map((l, k): ReadAtom => ({ x: k, y: 0, ...(typeof l === "string" ? { label: l } : (l ?? {})) })),
    bonds: bonds.map(([a, b, order]): ReadBond => ({ a, b, order })),
  });
  const kinds = (m: ReturnType<typeof mol>) => [...valenceUnread(m)];

  it("is not said on a donor bonded to a metal by a plain line: a pyridine's N, a phosphine's P, an ether's O", () => {
    // (a pyridine's N drawn with its double bond: C=N-C and the line to Pd)
    expect(kinds(mol([null, "N", null, "Pd"], [[0, 1, 2], [1, 2, 1], [1, 3, 1]]))).toEqual([]);
    // (Ph3P-Pd: four single bonds at P, one to the metal)
    expect(kinds(mol([null, null, null, "P", "Pd"], [[0, 3, 1], [1, 3, 1], [2, 3, 1], [3, 4, 1]]))).toEqual([]);
    // (THF's O on Mg)
    expect(kinds(mol([null, "O", null, "Mg"], [[0, 1, 1], [1, 2, 1], [1, 3, 1]]))).toEqual([]);
  });

  it("is not said on a halogen above its valence of one: an iodane's I, a perchlorate's Cl", () => {
    // (PhI(OAc)2: I with three single bonds; an IBX-like I with a double bond to O as well)
    expect(kinds(mol([null, "I", "O", "O", null, null], [[0, 1, 1], [1, 2, 1], [1, 3, 1], [2, 4, 1], [3, 5, 1]]))).toEqual([]);
    expect(kinds(mol([null, "I", "O", "O", null], [[0, 1, 1], [1, 2, 1], [1, 3, 2], [2, 4, 1]]))).toEqual([]);
    // (perchlorate drawn with three double bonds and its O-: Cl as drawn)
    expect(kinds(mol(["Cl", "O", "O", "O", { label: "O", charge: -1 }], [[0, 1, 2], [0, 2, 2], [0, 3, 2], [0, 4, 1]]))).toEqual([]);
  });

  it("is not said on an adduct drawn with a plain line, a donor on a B or an Al of four - but a B of four with no donor is", () => {
    // (an amine-borane H3N-BH3 drawn as Me3N-BMe3: N of four, B of four)
    expect(kinds(mol([null, null, null, "N", "B", null, null, null], [[0, 3, 1], [1, 3, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [4, 6, 1], [4, 7, 1]]))).toEqual([]);
    // (an etherate, Et2O-AlMe3: O of three on Al of four)
    expect(kinds(mol([null, "O", null, "Al", null, null, null], [[0, 1, 1], [1, 2, 1], [1, 3, 1], [3, 4, 1], [3, 5, 1], [3, 6, 1]]))).toEqual([]);
    // (a tetrafluoroborate, a tetraphenylborate: B of four, its minus not shown)
    expect(kinds(mol(["B", "F", "F", "F", "F"], [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]]))).toEqual([[0, "many"]]);
    expect(kinds(mol(["B", null, null, null, null], [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]]))).toEqual([[0, "many"]]);
  });

  it("says too many in one sentence, true whether the sign was drawn or not", () => {
    expect(OVER_SAID).toBe("As read, it has more bonds than its element takes without a charge, and no charge: its charge's sign is not shown or was not read.");
  });
});

describe("a lone ion's word standing apart, read as no atom", () => {
  /** Letters set from `x`, `y`, a letter 0.6 wide. */
  const letters = (text: string, x: number, y = 0) => [...text].map((c, k) => ({ c, box: [x + 0.6 * k, y - 0.35, x + 0.6 * k + 0.5, y + 0.35] as [number, number, number, number], at: null, size: 0.7 }));
  const reads = (l: string) => /^[A-Z]/.test(l);
  /** A ketone, propanone, its O double bonded, and the words given far off. */
  const ketone = (...words: string[]) => ({
    atoms: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: -1, label: "O" }] as ReadAtom[],
    bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 1, b: 3, order: 2 }] as ReadBond[],
    bond: 1,
    left: { letters: words.flatMap((w, k) => letters(w, 6 + 5 * k)) },
  });

  it("is not said by a structure read whole and neutral: a reagent's or a solvent's word, a lone Na too", () => {
    for (const w of ["NaBH4", "MeOH", "Na", "K2CO3", "Pd/C", "heat", "NaOH", "HCl", "THF", "Et3N"]) expect(wordsApart(ketone(w), reads), w).toEqual(new Map());
  });

  it("is said by a structure charged as read - an ammonium with its chloride apart, an acetate with its sodium - as its counter-ion", () => {
    const ammonium = {
      atoms: [{ x: 0, y: 0 }, { x: 1, y: 0, label: "NH3+" }] as ReadAtom[],
      bonds: [{ a: 0, b: 1, order: 1 }] as ReadBond[],
      bond: 1,
      left: { letters: letters("Cl-", 6) },
    };
    expect(wordsApart(ammonium, reads)).toEqual(new Map([[1, "Cl-"]]));
    const acetate = { ...ketone("Na"), atoms: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0, label: "O", charge: -1 }, { x: 1, y: -1, label: "O" }] as ReadAtom[] };
    expect(wordsApart(acetate, reads)).toEqual(new Map([[2, "Na"]]));
    expect(ionApartSaid("Na")).toBe('"Na" stands apart, read as no atom: it may be this ion\'s counter-ion.');
  });

  it("goes to the open atom where its structure has one: the acetate's O whose minus was lost", () => {
    const lost = { ...ketone("Na"), atoms: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0, label: "O" }, { x: 1, y: -1, label: "O" }] as ReadAtom[] };
    expect(wordsApart(lost, reads, valenceUnread(lost))).toEqual(new Map([[2, "Na"]]));
  });
});
