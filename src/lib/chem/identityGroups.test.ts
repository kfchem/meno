/**
 * Identity of a structure with centres drawn in AND or OR groups (foundation part 13, its first asker; lib/chem/identity `grouped`):
 * a racemate, "one or the other" and the drawn absolute are three structures, a racemate drawn as one hand or the other is one, and
 * what a group says nothing by is no part of it. Known answers from the chemistry check's ruling (a racemate, "or" and the drawn
 * absolute: three structures).
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import { GROUP_WRITINGS, identity, type IdentityGroup, type IdentityInput } from "./identity";

const input = (smiles: string) => smilesInput(smiles) as unknown as IdentityInput;
const id = (smiles: string, groups: IdentityGroup[] = []) => identity({ ...input(smiles), ...(groups.length ? { groups } : {}) }).text;
const and = (...atoms: number[]): IdentityGroup => ({ kind: "and", atoms });
const or = (...atoms: number[]): IdentityGroup => ({ kind: "or", atoms });

/** `g` with its atoms put in the order `order` gives (the atom at `order[k]` the new k-th), every place it names moved with them. */
function reordered(g: IdentityInput, order: readonly number[]): IdentityInput {
  const to = new Map(order.map((old, k) => [old, k]));
  const at = (i: number) => (i < 0 ? i : to.get(i)!);
  return {
    atoms: order.map((old) => {
      const a = g.atoms[old];
      return a.tetra ? { ...a, tetra: { ...a.tetra, neighbours: a.tetra.neighbours.map(at) } } : a;
    }),
    bonds: g.bonds.map((b) => ({ ...b, a: at(b.a), b: at(b.b), ...(b.stereo ? { stereo: { ...b.stereo, refs: [at(b.stereo.refs[0]), at(b.stereo.refs[1])] as [number, number] } } : {}) })),
    ...(g.groups ? { groups: g.groups.map((x) => ({ ...x, atoms: x.atoms.map(at) })) } : {}),
  };
}

describe("identity of a structure with AND and OR groups", () => {
  // butan-2-ol: C0 C1 O2 C3 C4, its centre atom 1
  const R = "C[C@H](O)CC";
  const S = "C[C@@H](O)CC";

  it("a racemate, one or the other and the drawn absolute are three structures", () => {
    const texts = new Set([id(R), id(R, [and(1)]), id(R, [or(1)])]);
    expect(texts.size).toBe(3);
    expect(id(R)).not.toBe(id(S));
  });

  it("a racemate drawn as one hand or as the other is one structure; so is one or the other", () => {
    expect(id(R, [and(1)])).toBe(id(S, [and(1)]));
    expect(id(R, [or(1)])).toBe(id(S, [or(1)]));
  });

  it("a group with no configuration drawn at its atoms is no group", () => {
    expect(id(R, [and(3)])).toBe(id(R));
    expect(id("CC(O)CC", [and(1)])).toBe(id("CC(O)CC"));
    // (nor counts towards the most it writes: ten such groups and one that says something, written in full)
    const long = "C[C@H](O)CCCCCCCCC";
    const many = identity({ ...input(long), groups: [and(1), ...[0, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((a) => and(a))] });
    expect(many).toEqual({ text: id(long, [and(1)]), complete: true });
  });

  it("a centre in two groups is in the first", () => {
    expect(id(R, [or(1), and(1)])).toBe(id(R, [or(1)]));
    expect(id(R, [and(1), or(1)])).toBe(id(R, [and(1)]));
  });

  it("a group's centres by their places as drawn, hydrogens drawn as atoms before them", () => {
    // (H0 O1 C2 C3 C4 C5: the centre atom 2, its O's H drawn)
    expect(id("[H]O[C@@H](C)CC", [and(2)])).toBe(id(R, [and(1)]));
  });

  // butane-2,3-diol: C0 C1 O2 C3 O4 C5, its centres atoms 1 and 3
  const RR = "C[C@@H](O)[C@H](O)C";
  const meso = "C[C@@H](O)[C@@H](O)C";
  const SS = "C[C@H](O)[C@@H](O)C";

  it("the diol's three: two hands and the meso form", () => {
    expect(new Set([id(RR), id(SS), id(meso)]).size).toBe(3);
    // (the meso form's mirror image is itself: its two centres turned over together)
    expect(id("C[C@H](O)[C@H](O)C")).toBe(id(meso));
  });

  it("a meso form's racemate is the meso form: its group says nothing", () => {
    expect(id(meso, [and(1, 3)])).toBe(id(meso));
    expect(id(meso, [or(1, 3)])).toBe(id(meso));
  });

  it("a chiral diol's racemate is one structure, apart from each hand and from one or the other", () => {
    expect(id(RR, [and(1, 3)])).toBe(id(SS, [and(1, 3)]));
    expect(new Set([id(RR), id(SS), id(RR, [and(1, 3)]), id(RR, [or(1, 3)])]).size).toBe(4);
  });

  it("two groups are told from one: each centre in a group of its own is another mixture", () => {
    expect(id(RR, [and(1), and(3)])).not.toBe(id(RR, [and(1, 3)]));
    // (each centre of its own group, the four writings are one mixture: the hands and the meso form, whichever is drawn)
    expect(id(RR, [and(1), and(3)])).toBe(id(meso, [and(1), and(3)]));
    expect(id(RR, [and(1), and(3)])).toBe(id(RR, [and(3), and(1)]));
  });

  it("the groups' kinds are told apart, and which centre is in which", () => {
    expect(id(RR, [and(1), or(3)])).not.toBe(id(RR, [and(1), and(3)]));
    // (the diol's two centres alike: its AND at the one or at the other is one structure)
    expect(id(RR, [and(1)])).toBe(id(RR, [and(3)]));
    expect(id(RR, [and(1), or(3)])).toBe(id(RR, [or(1), and(3)]));
  });

  it("a centre that sets nothing is no part of its group", () => {
    // (3-methylbutan-2-ol, its C3 wedged, with two methyls alike: C0 C1 C2 C3 O4 C5)
    const drawn = "C[C@H](C)[C@@H](O)C";
    expect(id(drawn, [and(1, 3)])).toBe(id(drawn, [and(3)]));
    expect(id(drawn, [and(1, 3)])).not.toBe(id(drawn));
    // (and a group of such centres only is none)
    expect(id(drawn, [and(1)])).toBe(id(drawn));
  });

  it("the same whatever the order of the atoms", () => {
    const g: IdentityInput = { ...input(RR), groups: [and(1), or(3)] };
    const order = [5, 3, 4, 1, 0, 2];
    expect(identity(reordered(g, order)).text).toBe(identity(g).text);
    const one: IdentityInput = { ...input(R), groups: [and(1)] };
    expect(identity(reordered(one, [4, 2, 1, 3, 0])).text).toBe(identity(one).text);
  });

  it("a centre that sets nothing as drawn still counts where another group's turning makes it set something", () => {
    // (2,3,4-trihydroxyglutaric acid, C0 C1 O2 C3 O4 C5 O6 C7 O8 C9 O10 O11: its C2 and C4 alike, C3 sets nothing; both
    //  meso forms' C3 sets something. Each centre in an AND group of its own: every stereoisomer, whichever was drawn)
    const chiral = "OC(=O)[C@H](O)[C@@H](O)[C@@H](O)C(=O)O";
    const mesoOne = "OC(=O)[C@H](O)[C@@H](O)[C@H](O)C(=O)O";
    const mesoOther = "OC(=O)[C@H](O)[C@H](O)[C@H](O)C(=O)O";
    const each = [and(3), and(5), and(7)];
    expect(new Set([id(chiral), id(mesoOne), id(mesoOther)]).size).toBe(3);
    expect(id(chiral, each)).toBe(id(mesoOne, each));
    expect(id(mesoOther, each)).toBe(id(mesoOne, each));
    // (its C2 and C4 only, C3 as drawn: turning one end or the other reaches the one meso form and the other - all four still)
    expect(id(chiral, [and(3), and(7)])).toBe(id(chiral, each));
    // (its C2 only: one hand and one meso form)
    expect(id(chiral, [and(3)])).not.toBe(id(chiral, each));
    expect(id(chiral, [and(3)])).not.toBe(id(chiral, [and(7)]));
  });

  it(`past ${GROUP_WRITINGS} stereoisomers to write, the structure as drawn, said not complete`, () => {
    // (nine centres, each in an AND group of its own: 2^9)
    const chain = "C[C@H](O)C[C@H](O)C[C@H](O)C[C@H](O)C[C@H](O)C[C@H](O)C[C@H](O)C[C@H](O)C[C@H](O)C";
    const centres = [1, 4, 7, 10, 13, 16, 19, 22, 25];
    const many = identity({ ...input(chain), groups: centres.map((c) => and(c)) });
    expect(many).toEqual({ ...identity(input(chain)), complete: false });
    expect(identity({ ...input(chain), groups: [and(...centres)] }).complete).toBe(true);
  });

  it("no group or only empty ones: the text as before", () => {
    expect(identity({ ...input(R), groups: [] }).text).toBe(id(R));
  });
});
