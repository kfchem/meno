import { describe, expect, it } from "vitest";
import type { SetEntry } from "./entries";
import { kindInfo } from "./kinds";
import { runMeno } from "./meno";

/** Water as a step's entry, with an energy and a calculation on it. */
const water = (number: number, dx = 0): SetEntry =>
  ({
    compound: 0,
    number,
    atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    // (O-H 0.96 Å along x; the other H at 104.5° from it)
    xyz: [dx, 0, 0, dx + 0.96, 0, 0, dx + 0.96 * Math.cos((104.5 * Math.PI) / 180), 0.96 * Math.sin((104.5 * Math.PI) / 180), 0],
    energy: -76.4,
    charge: 0,
    multiplicity: 1,
  }) as unknown as SetEntry;

const ammonia = (): SetEntry =>
  ({
    compound: 1,
    number: 1,
    atoms: [{ el: "N" }, { el: "H" }, { el: "H" }, { el: "H" }],
    bonds: [0, 1, 2].map((i) => ({ a1: 0, a2: i + 1, order: 1 })),
    xyz: [3, 0, 0, 4, 0, 0, 3, 1, 0, 3, 0, 1],
    charge: 0,
    multiplicity: 1,
  }) as unknown as SetEntry;

const ok = (o: ReturnType<typeof runMeno>) => {
  if (!o.ok) throw new Error(o.said);
  return o;
};

describe("Tag, as a step", () => {
  it("gives each entry an ID of its own under the name given, all else it held kept", () => {
    const o = ok(runMeno("tag", [water(1), water(2, 5)], "molecules", { name: "start" }));
    expect(o.kept.map((e) => e.properties?.start.value)).toEqual(["start-1", "start-2"]);
    expect(o.kept.map((e) => e.energy)).toEqual([-76.4, -76.4]);
    expect(o.aside).toEqual([]);
    expect(runMeno("tag", [water(1)], "molecules", { name: " " })).toEqual({ ok: false, said: "The tag needs a name" });
  });
});

describe("Species, as a step", () => {
  it("sets the charge and multiplicity given; the energy, of another state, goes; one left blank stays as the entry has it, and one the electrons cannot have goes out of Failed saying why", () => {
    const o = ok(runMeno("species", [water(1)], "molecules", { charge: "+1", multiplicity: "2" }));
    // (H2O+: nine electrons, a doublet)
    expect([o.kept[0].charge, o.kept[0].multiplicity, o.kept[0].energy]).toEqual([1, 2, undefined]);
    // (its singlet, given by its calculation, kept: nine electrons cannot be a singlet - never changed to fit)
    const bad = ok(runMeno("species", [water(1)], "molecules", { charge: "+1", multiplicity: "" }));
    expect(bad.kept).toEqual([]);
    expect(bad.aside[0].failed?.kind).toBe("refused");
    expect(bad.aside[0].failed?.why).toMatch(/electron/);
    expect(bad.aside[0].energy).toBe(-76.4);
    expect(bad.said).toBe("0 entries set, 1 failed");
  });

  it("gives one that came in failed - to be tried again in another state - its species, its old failure gone with the old state", () => {
    const failed = { ...water(1), failed: { kind: "not-converged" as const, why: "Its SCF did not converge" } };
    const o = ok(runMeno("species", [failed], "molecules", { charge: "+1", multiplicity: "2" }));
    expect(o.aside).toEqual([]);
    expect([o.kept[0].charge, o.kept[0].multiplicity, o.kept[0].failed]).toEqual([1, 2, undefined]);
  });

  it("refuses to run on what does not read as a charge or multiplicity, or on nothing given", () => {
    expect(runMeno("species", [water(1)], "molecules", { charge: "one" })).toEqual({ ok: false, said: 'The charge "one" is not a whole number' });
    expect(runMeno("species", [water(1)], "molecules", { multiplicity: "0" })).toEqual({ ok: false, said: 'The multiplicity "0" is not a whole number of 1 or more' });
    expect(runMeno("species", [water(1)], "molecules", {})).toEqual({ ok: false, said: "Give a charge, a multiplicity, or both" });
  });
});

describe("Combine, as a step", () => {
  it("makes the entries one complex, in the set's order, each part where it stands, its species the parts' together", () => {
    const o = ok(runMeno("combine", [water(1), ammonia()], "molecules"));
    expect(o.kept).toHaveLength(1);
    const c = o.kept[0];
    expect(c.atoms.map((a) => a.el)).toEqual(["O", "H", "H", "N", "H", "H", "H"]);
    // (the ammonia's bonds renumbered with it)
    expect(c.bonds.slice(2)).toEqual([0, 1, 2].map((i) => ({ a1: 3, a2: 4 + i, order: 1 })));
    expect(c.xyz.slice(9)).toEqual(ammonia().xyz);
    expect([c.charge, c.multiplicity, c.energy]).toEqual([0, 1, undefined]);
    expect(o.said).toMatch(/^2 parts as one complex/);
  });
});

describe("Measure, as a step", () => {
  it("puts each measurement, its atoms counted from 1, on each entry; one an entry does not have is said on it and counted", () => {
    const o = ok(runMeno("measure", [water(1)], "molecules", { measurements: "1-2, 2-1-3" }));
    const p = o.kept[0].properties!;
    expect(p["distance 1-2"].value).toBeCloseTo(0.96, 6);
    expect(p["angle 2-1-3"].value).toBeCloseTo(104.5, 6);
    expect(o.kept[0].energy).toBe(-76.4);
    const far = ok(runMeno("measure", [water(1)], "molecules", { measurements: "1-9" }));
    expect(far.kept[0].properties!["distance 1-9"].status).toEqual({ failed: expect.any(String) });
    expect(far.said).toBe("1 measurement on 1 entry, 1 not measured");
  });

  it("refuses atoms not counted from 1, or what does not read as atoms joined by '-'", () => {
    expect(runMeno("measure", [water(1)], "molecules", { measurements: "0-1" })).toEqual({ ok: false, said: '"0-1": atoms are numbered from 1' });
    expect(runMeno("measure", [water(1)], "molecules", { measurements: "1" })).toEqual({ ok: false, said: '"1" is not two, three or four atom numbers joined by "-"' });
    expect(runMeno("measure", [water(1)], "molecules", {})).toEqual({ ok: false, said: "No measurements yet" });
  });
});

describe("what each says on its card", () => {
  it("says what it will do, or what it still needs", () => {
    const how = (kind: "tag" | "species" | "measure", v: Record<string, string>) => kindInfo(kind).how!(v);
    expect(how("tag", { name: "start" })).toBe("Each its own start");
    expect(how("tag", { name: "" })).toBe("Name the tag");
    expect(how("species", { charge: "-1", multiplicity: "" })).toBe("Charge -1, its own multiplicity");
    expect(how("species", { charge: "", multiplicity: "3" })).toBe("Its own charge, multiplicity 3");
    expect(how("species", { charge: "", multiplicity: "" })).toBe("Give a charge, a multiplicity, or both");
    expect(how("measure", { measurements: "3-7, 1-2-3-4" })).toBe("distance 3-7, dihedral 1-2-3-4");
    expect(how("measure", { measurements: "" })).toBe("No measurements yet");
    expect(kindInfo("combine").how!({})).toBe("In the set's order, as one complex");
  });
});
