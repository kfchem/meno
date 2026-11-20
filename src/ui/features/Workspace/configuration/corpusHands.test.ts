import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { AXIS_IN_6, AXIS_IN_7, CHIRO, CORPUS, CYCLOHEXYLIDENE } from "./corpus";
import { drawnOf, expected, keptAgrees, mirrorSmiles, page, read } from "./corpusCheck";

// What the corpus's entries are against one another (docs/EDITOR-2D.md, *The configuration kept*): each hand apart from its mirror
// image where it has one, a meso form one with its own, an axis held in a ring of seven and not in a ring of six - and a centre whose
// plain bonds a drag puts in line said no longer read, its configuration then open, never the other hand; with its wedge in line, still read.

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

const entry = (start: string) => CORPUS.find((e) => e.name.startsWith(start))!;

describe("the corpus's hands", () => {
  it("keeps apart each hand that has a mirror image of its own: the diazaspirononanedione, chiro-inositol, the cyclohexylidene acid", () => {
    expect(expected("O=C1CCN[C@@]12NCCC2=O")).not.toBe(expected("O=C1CCN[C@]12NCCC2=O"));
    expect(expected(CHIRO)).not.toBe(expected(mirrorSmiles(CHIRO)));
    expect(expected(CYCLOHEXYLIDENE)).not.toBe(expected(mirrorSmiles(CYCLOHEXYLIDENE)));
  });

  it("takes the cyclohexylidene acid's C=C turned for its C4 turned - one compound - and either left open for neither hand", () => {
    const other = expected(mirrorSmiles(CYCLOHEXYLIDENE));
    expect(expected("C[C@H]1CC/C(=C\\C(=O)O)CC1")).toBe(other);
    const c4Open = expected("CC1CC/C(=C/C(=O)O)CC1");
    const bondOpen = expected("C[C@H]1CCC(=CC(=O)O)CC1");
    expect(c4Open).toBe(bondOpen);
    expect([expected(CYCLOHEXYLIDENE), other]).not.toContain(c4Open);
  });

  it("reads each meso inositol as its own mirror image, and all eight inositols as different compounds", () => {
    const inositols = CORPUS.filter((e) => e.name.includes("inositol"));
    expect(inositols).toHaveLength(6);
    for (const e of inositols.filter((e) => !e.name.startsWith("chiro"))) expect(expected(mirrorSmiles(e.smiles)), e.name).toBe(expected(e.smiles));
    const all = [...inositols.map((e) => expected(e.smiles)), expected(mirrorSmiles(CHIRO))];
    expect(new Set(all).size).toBe(7);
  });

  it("holds a biaryl axis in a ring of seven, its hands apart; in a ring of six the same wedge states nothing", () => {
    const seven = entry("1,11-dimethyl");
    expect(read(drawnOf(seven))).not.toBe(read(drawnOf(seven, true)));
    expect(read(drawnOf(seven))).not.toBe(read(drawnFromSmiles(AXIS_IN_7)));
    const six = { name: "4,5-dimethyl-9,10-dihydrophenanthrene", smiles: AXIS_IN_6, kind: "axis" as const, axisWedge: [6, 1] as const };
    expect(read(drawnOf(six))).toBe(read(drawnOf(six, true)));
    expect(read(drawnOf(six))).toBe(read(drawnFromSmiles(AXIS_IN_6)));
  });
});

describe("a centre whose bonds a drag puts in line (the T)", () => {
  it("is said no longer read, its configuration open as kept and as drawn - never the other hand", async () => {
    // ((R)-butan-2-ol as Meno draws it: C2 is atom 3, its wedge to the methyl, atom 4; its CH2, atom 2 - with what it carries - dragged
    //  straight across from its O, atom 5)
    const { st, stop, notes } = page(drawnFromSmiles("CC[C@@H](C)O"));
    await vi.runAllTimersAsync();
    expect(read(st().model)).toBe(expected("CC[C@@H](C)O"));
    const at = (id: number) => st().model.atoms.find((a) => a.id === id)!;
    const [c2, o] = [at(3), at(5)];
    const to = { x: 2 * c2.x - o.x, y: 2 * c2.y - o.y };
    const [dx, dy] = [to.x - at(2).x, to.y - at(2).y];
    st().moveAtoms([1, 2].map((id) => ({ id, x: at(id).x + dx, y: at(id).y + dy })), "drag-the-t");
    await vi.runAllTimersAsync();
    expect(notes()).toHaveLength(1);
    expect(notes()[0]).toMatch(/^C\d+: no longer read: /);
    expect(read(st().model)).toBe(expected("CCC(C)O"));
    expect(read(st().model)).not.toBe(expected("CC[C@H](C)O"));
    expect(keptAgrees(st().model)).toBe(true);
    stop();
  });

  it("is still read where the wedge itself is one of the two in line: its H read in the largest free angle (Brecher 2006, ST-1.2.4)", async () => {
    // (the wedged methyl, atom 4, dragged straight across from the CH2, atom 2: a wedge 180 degrees from a plain bond)
    const { st, stop, notes } = page(drawnFromSmiles("CC[C@@H](C)O"));
    await vi.runAllTimersAsync();
    const at = (id: number) => st().model.atoms.find((a) => a.id === id)!;
    const [c1, c2] = [at(2), at(3)];
    st().moveAtoms([{ id: 4, x: 2 * c2.x - c1.x, y: 2 * c2.y - c1.y }], "drag-the-wedge-t");
    await vi.runAllTimersAsync();
    expect(notes()).toEqual([]);
    expect(read(st().model)).toBe(expected("CC[C@@H](C)O"));
    expect(keptAgrees(st().model)).toBe(true);
    stop();
  });
});
