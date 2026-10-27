import { describe, expect, it } from "vitest";
import type { SetEntry } from "./entries";
import { kindInfo } from "./kinds";
import { runMenoPair } from "./meno";
import { addMolecule3d, emptyWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { addSet, addStep, connect } from "./model";
import { runStep, whyNot, type RunWith } from "./run";

/** Water as a step's entry, its second hydrogen `reach` Å from its oxygen. */
const water = (number: number, compound = 0, reach = 0.96): SetEntry =>
  ({
    compound,
    number,
    atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    xyz: [0, 0, 0, 0.96, 0, 0, reach * Math.cos((104.5 * Math.PI) / 180), reach * Math.sin((104.5 * Math.PI) / 180), 0],
    energy: -76.4,
  }) as unknown as SetEntry;

const ammonia = (compound = 0): SetEntry =>
  ({
    compound,
    number: 1,
    atoms: [{ el: "N" }, { el: "H" }, { el: "H" }, { el: "H" }],
    bonds: [0, 1, 2].map((i) => ({ a1: 0, a2: i + 1, order: 1 })),
    xyz: [0, 0, 0, 1.01, 0, 0, -0.34, 0.95, 0, -0.34, -0.47, 0.82],
  }) as unknown as SetEntry;

/** An entry with a text property, as a Tag gives one. */
const tagged = (e: SetEntry, name: string, value: string): SetEntry => ({ ...e, properties: { ...e.properties, [name]: { value, unit: "none", status: "computed" } } });

const ok = (o: ReturnType<typeof runMenoPair>) => {
  if (!o.ok) throw new Error(o.said);
  return o;
};
const text = (e: SetEntry, name: string) => e.properties?.[name]?.value;

describe("Merge, as a step", () => {
  it("makes two sets one, First's then Second's, each compound kept apart", () => {
    const o = ok(runMenoPair("merge", { entries: [water(1), water(2)], holds: "conformers" }, { entries: [water(1)], holds: "conformers" }));
    expect(o.kept.map((e) => [e.compound, e.number])).toEqual([
      [0, 1],
      [0, 2],
      [1, 1],
    ]);
    expect(o.aside).toEqual([]);
    expect(o.holds).toBe("conformers");
    // (each as it came: its charge and multiplicity, its energy, all it held)
    const cation = { ...water(1), charge: 1, multiplicity: 2 } as SetEntry;
    expect(ok(runMenoPair("merge", { entries: [cation], holds: "molecules" }, { entries: [water(1)], holds: "molecules" })).kept[0]).toBe(cation);
  });

  it("keeps one of each value of a property, the rest set aside each naming the one kept", () => {
    const first = [tagged(water(1), "start", "start-1")];
    const second = [tagged(water(1), "start", "start-1"), tagged(ammonia(), "start", "start-2")];
    const o = ok(runMenoPair("merge", { entries: first, holds: "molecules" }, { entries: second, holds: "molecules" }, { keep: "one", property: "start" }));
    expect(o.kept.map((e) => text(e, "start"))).toEqual(["start-1", "start-2"]);
    expect(o.aside.map((e) => text(e, "set_aside"))).toEqual(["the same start as a #1, which was kept"]);
    expect(runMenoPair("merge", { entries: first, holds: "molecules" }, { entries: second, holds: "molecules" }, { keep: "one", property: " " })).toEqual({
      ok: false,
      said: "Name the property to keep one of each",
    });
  });
});

describe("Re-bond, as a step", () => {
  it("gives each geometry each bonding entry's bonds, grouped by the two; one of other atoms set aside, saying why and onto what", () => {
    // (a water whose second hydrogen stands off, re-bonded as water)
    const far = water(1, 0, 2.5);
    const o = ok(runMenoPair("rebond", { entries: [far, water(2)], holds: "molecules" }, { entries: [{ ...water(1), bonds: [{ a1: 0, a2: 1, order: 1 }] } as SetEntry, ammonia(1)], holds: "molecules" }));
    expect(o.kept).toHaveLength(2);
    // (the geometry's places, the bonding's bonds; its energy, of the other bonding, not carried)
    expect(o.kept[0].xyz).toEqual(far.xyz);
    expect(o.kept[0].bonds).toEqual([{ a1: 0, a2: 1, order: 1 }]);
    expect(o.kept[0].energy).toBeUndefined();
    // (its charge and multiplicity the bonding entry's, given: a cation's onto a neutral geometry)
    const cation = { ...water(1), charge: 1, multiplicity: 2 } as SetEntry;
    expect(ok(runMenoPair("rebond", { entries: [water(1)], holds: "molecules" }, { entries: [cation], holds: "molecules" })).kept.map((e) => [e.charge, e.multiplicity])).toEqual([[1, 2]]);
    // (each geometry compound onto each bonding entry, a compound of its own)
    expect(o.kept.map((e) => [e.compound, e.number])).toEqual([
      [0, 1],
      [0, 2],
    ]);
    expect(o.aside.map((e) => text(e, "set_aside"))).toEqual([
      "onto b #1: The geometry has 3 atoms and the bonding 4: both must hold the same atoms in one numbering.",
      "onto b #1: The geometry has 3 atoms and the bonding 4: both must hold the same atoms in one numbering.",
    ]);
    expect(o.said).toMatch(/^2 entries re-bonded, each with each · 2 not re-bonded/);
  });

  it("pairs on a property where asked, one with none to pair with set aside saying so", () => {
    const geometry = [tagged(water(1), "id", "a"), tagged(water(2), "id", "b")];
    const bonding = [tagged(water(1), "id", "a")];
    const o = ok(runMenoPair("rebond", { entries: geometry, holds: "molecules" }, { entries: bonding, holds: "molecules" }, { pairs: "property", property: "id" }));
    expect(o.kept).toHaveLength(1);
    expect(o.aside.map((e) => text(e, "set_aside"))).toEqual(['not paired: no entry of Bonding has its id, b']);
  });
});

describe("Compare bonding, as a step", () => {
  it("against each reference: the same out of the first exit, the match written on it; a different one with what differs; one of other atoms not compared, counted apart", () => {
    const o = ok(runMenoPair("compare-bonding", { entries: [water(1), water(2, 0, 2.5), ammonia()], holds: "molecules" }, { entries: [water(1)], holds: "molecules" }));
    expect(o.kept.map((e) => text(e, "matches"))).toEqual(["reference 1"]);
    expect(o.aside.map((e) => text(e, "matches"))).toEqual(["none", "none"]);
    expect(String(text(o.aside[0], "bonding"))).toMatch(/^different: .*O1-H3/);
    expect(String(text(o.aside[1], "bonding"))).toMatch(/^not compared: The entry has 4 atoms and the reference 3/);
    expect(o.said).toBe("1 same · 1 different · 1 not compared");
  });

  it("names the match by the reference's value of a property, where one is chosen; pairs on a property, where asked", () => {
    const refs = [tagged(ammonia(), "species", "b"), tagged(water(1), "species", "a")];
    const named = ok(runMenoPair("compare-bonding", { entries: [water(1)], holds: "molecules" }, { entries: refs, holds: "molecules" }, { writes: "is", from: "species" }));
    expect(text(named.kept[0], "is")).toBe("a");
    const paired = ok(
      runMenoPair("compare-bonding", { entries: [tagged(water(1), "id", "x"), tagged(water(2), "id", "y")], holds: "molecules" }, { entries: [tagged(water(1), "id", "x")], holds: "molecules" }, { reference: "property", property: "id" }),
    );
    expect(paired.kept).toHaveLength(1);
    expect(text(paired.aside[0], "bonding")).toBe("not compared: no entry of Reference has its id, y");
  });

  it("passes over atoms counted from 1, and refuses ones that are not", () => {
    const o = ok(runMenoPair("compare-bonding", { entries: [water(1, 0, 2.5)], holds: "molecules" }, { entries: [water(1)], holds: "molecules" }, { atoms: "3" }));
    expect(o.kept).toHaveLength(1);
    expect(runMenoPair("compare-bonding", { entries: [water(1)], holds: "molecules" }, { entries: [water(1)], holds: "molecules" }, { atoms: "0" })).toEqual({
      ok: false,
      said: '"0" is no atom number, from 1, or run of them (7-9)',
    });
  });
});

describe("what the steps of two inputs say on their cards", () => {
  it("names their inputs and exits, and says what they still need", () => {
    for (const [kind, inputs] of [
      ["merge", ["First", "Second"]],
      ["rebond", ["Geometry", "Bonding"]],
      ["compare-bonding", ["Molecules", "Reference"]],
    ] as const)
      expect(kindInfo(kind).inputs?.map((p) => p.name)).toEqual(inputs);
    expect(kindInfo("merge").needs?.({ keep: "one", property: "" })).toBe("Name the property to keep one of each");
    expect(kindInfo("rebond").how?.({ pairs: "property", property: "id" })).toBe("Paired on id");
    expect(kindInfo("compare-bonding").how?.({ reference: "each", writes: "matches", rs: true })).toBe("Against each reference, the match as matches; R or S too");
  });
});

describe("the steps of two inputs, wired on the page", () => {
  const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
  const mol = (title: string, x: number, reach: number): Omit<Molecule3D, "id"> => ({
    at: { x, y: 0 },
    title,
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.96, y: 0, z: 0 },
      { el: "H", x: reach * Math.cos((104.5 * Math.PI) / 180), y: reach * Math.sin((104.5 * Math.PI) / 180), z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
  });
  /** Two sets - a water pulled apart, and water - each in a frame of its own, and a step of `kind`; wired into its first input only, or both. */
  function page(kind: "rebond" | "compare-bonding", both: boolean) {
    let doc = addMolecule3d(emptyWorkspaceDocument(), mol("apart", 0, 2.5));
    doc = addMolecule3d(doc, mol("water", 20, 0.96));
    const a = doc.nextWorkflowId ?? 1;
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    const b = doc.nextWorkflowId!;
    doc = addSet(doc, { x0: 17, y0: -3, x1: 23, y1: 3 });
    const step = doc.nextWorkflowId!;
    doc = addStep(doc, kind, 40, 0);
    const [first, second] = kindInfo(kind).inputs!.map((p) => p.id);
    doc = connect(doc, { set: a }, step, first);
    if (both) doc = connect(doc, { set: b }, step, second);
    return { doc, step };
  }

  it("will not run with its second input empty, naming it", () => {
    const { doc, step } = page("rebond", false);
    expect(whyNot(doc, doc.steps!.find((s) => s.id === step)!, "meno")).toBe("Nothing comes into Bonding");
  });

  it("re-bonds the one onto the other, and finds the pulled-apart water bonded otherwise than water", () => {
    const r = page("compare-bonding", true);
    const compared = runStep(r.doc, r.step, W).steps!.find((s) => s.id === r.step)!;
    expect([compared.ran?.ok, compared.ran?.said]).toEqual([true, "0 same · 1 different"]);
    const rb = page("rebond", true);
    const rebondedStep = runStep(rb.doc, rb.step, W).steps!.find((s) => s.id === rb.step)!;
    expect([rebondedStep.ran?.ok, rebondedStep.ran?.said]).toEqual([true, "1 entry re-bonded, each with each"]);
  });
});
