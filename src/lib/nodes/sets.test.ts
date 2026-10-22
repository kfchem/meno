import { describe, expect, it } from "vitest";
import type { Entry, EntryAtom, EntryBond } from "../entry";
import { group } from "./group";
import { merge } from "./merge";
import { tag } from "./tag";
import { entry, quantity } from "./testEntries";

const ids = (es: { id: string }[]) => es.map((x) => x.id);
const groupOf = (e: Entry) => e.properties.group?.value;

/** An entry of a structure: its heavy atoms and hydrogens, bonded as listed, with a charge where given. */
function molecule(id: string, atoms: (string | EntryAtom)[], bonds: [number, number][], charge = 0): Entry {
  const e = entry(id, {});
  const structure = { atoms: atoms.map((a) => (typeof a === "string" ? { el: a } : a)), bonds: bonds.map(([a1, a2]): EntryBond => ({ a1, a2, order: 1 })) };
  return { ...e, structure, species: { charge, multiplicity: 1, from: { charge: "given", multiplicity: "atoms" } } };
}
// ethanol, CH3-CH2-OH, its atoms numbered two ways; dimethyl ether, CH3-O-CH3, the same atoms
const ethanol = (id: string) => molecule(id, ["C", "C", "O", "H", "H", "H", "H", "H", "H"], [[0, 1], [1, 2], [0, 3], [0, 4], [0, 5], [1, 6], [1, 7], [2, 8]]);
const ethanolRenumbered = (id: string) => molecule(id, ["O", "H", "C", "H", "H", "C", "H", "H", "H"], [[0, 1], [0, 2], [2, 3], [2, 4], [2, 5], [5, 6], [5, 7], [5, 8]]);
const ether = (id: string) => molecule(id, ["C", "O", "C", "H", "H", "H", "H", "H", "H"], [[0, 1], [1, 2], [0, 3], [0, 4], [0, 5], [2, 6], [2, 7], [2, 8]]);

describe("Group", () => {
  it("by constitution: ethanol however numbered is one group, dimethyl ether - the same atoms - another", () => {
    const out = group([ethanol("a"), ether("b"), ethanolRenumbered("c")], { by: "constitution" });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.done.map(groupOf)).toEqual(["a", "b", "a"]);
    expect(out.said).toBe("2 groups by constitution · 3 of 3 entries");
  });

  it("by constitution: an ion and its neutral are different species, and so are isotopologues", () => {
    const deutero = molecule("d", ["C", "C", "O", "H", "H", "H", "H", "H", { el: "H", isotope: 2 }], [[0, 1], [1, 2], [0, 3], [0, 4], [0, 5], [1, 6], [1, 7], [2, 8]]);
    const anion = molecule("x", ["C", "C", { el: "O", charge: -1 }, "H", "H", "H", "H", "H"], [[0, 1], [1, 2], [0, 3], [0, 4], [0, 5], [1, 6], [1, 7]], -1);
    const out = group([ethanol("a"), deutero, anion], { by: "constitution" });
    expect(out.ok && out.exits.done.map(groupOf)).toEqual(["a", "b", "c"]);
  });

  it("by constitution: a skeleton - its hydrogens not there, no species - is grouped with its like, apart from the whole", () => {
    const skeleton = (id: string) => ({ ...molecule(id, ["C", "C", "O"], [[0, 1], [1, 2]]), species: null });
    const out = group([skeleton("s"), ethanol("a"), skeleton("t")], { by: "constitution" });
    expect(out.ok && out.exits.done.map(groupOf)).toEqual(["a", "b", "a"]);
  });

  it("by a property's value - a number with its unit, or a text - those with none set aside, and a group replaced counted", () => {
    const es = [entry("p", { charge: quantity(0, "none") }, "z"), entry("q", { charge: quantity(1, "none") }), entry("r", { charge: quantity(0, "none") }), entry("s", {})];
    const out = group(es, { by: { property: "charge" } });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.done.map(groupOf)).toEqual(["a", "b", "a"]);
    expect(out.exits.rest.map((e) => [e.id, e.status])).toEqual([["s", { aside: "it has no charge" }]]);
    expect(out.said).toBe("2 groups by charge · 3 of 4 entries · 1 had a group before · rest 1 (1: it has no charge)");
  });

  it("all together: one group", () => {
    const out = group([entry("p", {}, "x"), entry("q", {}, "y")], { by: "all together" });
    expect(out.ok && out.exits.done.map(groupOf)).toEqual(["a", "a"]);
  });
});

describe("Tag", () => {
  it("gives each an ID of its own under the name given, in the order they came, and never writes over one", () => {
    const out = tag([entry("x", {}), entry("y", {})], { name: "start" });
    if (!out.ok) throw new Error(out.said);
    expect(out.exits.done.map((e) => e.properties.start.value)).toEqual(["start-1", "start-2"]);
    expect(out.said).toBe("start: 2 entries tagged, start-1 to start-2");
    expect(tag(out.exits.done, { name: "start" })).toEqual({ ok: false, said: "2 entries already have start: give the tag another name" });
    expect(tag([entry("x", {})], { name: " " }).ok).toBe(false);
  });
});

describe("Merge", () => {
  it("makes two sets one, in the inputs' order, an ID taken given a new one, counted", () => {
    const out = merge([[entry("a", {}), entry("b", {})], [entry("a", {}), entry("c", {})]], { keep: "all" });
    if (!out.ok) throw new Error(out.said);
    expect(ids(out.exits.done)).toEqual(["a", "b", "a~2", "c"]);
    expect(out.said).toBe("4 of 4 entries from 2 sets · 1 given new IDs (theirs already taken)");
  });

  it("keeps one for each value of a property, the first met; the others and those with none set aside, saying why", () => {
    const t = (id: string, v?: string) => entry(id, v ? { start: { value: v, unit: "none", status: "computed" } } : {});
    const out = merge([[t("a", "start-1"), t("b", "start-2")], [t("c", "start-1"), t("d")]], { keep: { onePer: "start" } });
    if (!out.ok) throw new Error(out.said);
    expect(ids(out.exits.done)).toEqual(["a", "b"]);
    expect(out.exits.rest.map((e) => [e.id, e.status])).toEqual([
      ["c", { aside: "the same start as a, which was kept" }],
      ["d", { aside: "it has no start" }],
    ]);
    expect(out.exits.done.length + out.exits.rest.length).toBe(4);
  });

  it("takes two sets or more", () => {
    expect(merge([[entry("a", {})]], { keep: "all" })).toEqual({ ok: false, said: "Merge takes two sets or more" });
  });
});
