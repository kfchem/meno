import { describe, expect, it } from "vitest";
import type { Property } from "../../../../lib/entry";
import type { SetEntry } from "./entries";
import { howOf, kindInfo, needsOf } from "./kinds";
import { runMenoPair } from "./meno";
import { SET_ASIDE } from "./structureSteps";

/** Water as a step's entry, numbered in its compound, with the properties given. */
const water = (number: number, properties: Record<string, Property> = {}, compound = 0): SetEntry =>
  ({
    compound,
    number,
    atoms: [{ el: "O" }, { el: "H" }, { el: "H" }],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    xyz: [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0],
    energy: -76.4,
    properties,
  }) as unknown as SetEntry;

const text = (value: string): Property => ({ value, unit: "none", status: "computed" });
const ok = (o: ReturnType<typeof runMenoPair>) => {
  if (!o.ok) throw new Error(o.said);
  return o;
};

describe("Join, as a step", () => {
  it("puts From's properties on Onto's entries, matched on a property both carry - the first end of each path's saddle point named [F27]", () => {
    const saddles = [water(1, { path: text("a→b") }), water(2, { path: text("a→c") })];
    // (the first frames of the reaction paths, each named by Compare bonding)
    const firsts = [water(1, { path: text("a→c"), species: text("a") }, 4), water(2, { path: text("a→b"), species: text("a") }, 4)];
    const o = ok(runMenoPair("join", { entries: saddles, holds: "molecules" }, { entries: firsts, holds: "molecules" }, { on: "path", carry: "species as first end" }));
    expect(o.kept.map((e) => [e.number, e.properties?.["first end"]?.value])).toEqual([
      [1, "a"],
      [2, "a"],
    ]);
    // (each as it came: its own properties, its energy, its place)
    expect(o.kept[0]).toMatchObject({ compound: 0, number: 1, energy: -76.4, properties: { path: text("a→b") } });
    expect(o.said).toBe("2 of 2 entries of Onto given species as first end, matched on path");
  });

  it("puts nothing on an entry with no match, or more than one, and says why on it - From's unmatched counted", () => {
    const onto = [water(1, { path: text("p") }), water(2, { path: text("q") })];
    const from = [water(1, { path: text("q"), species: text("b") }), water(2, { path: text("q"), species: text("c") }), water(3, { path: text("r"), species: text("d") })];
    const o = ok(runMenoPair("join", { entries: onto, holds: "molecules" }, { entries: from, holds: "molecules" }, { on: "path", carry: "species" }));
    expect(o.kept).toEqual([]);
    expect(o.aside.map((e) => e.properties?.[SET_ASIDE]?.value)).toEqual(["no entry of From has its path, p", "2 entries of From have its path, q"]);
    expect(o.said).toBe("0 of 2 entries of Onto given species, matched on path · rest 2 (1: no entry of From has its path, p; 1: 2 entries of From have its path, q) · 3 of From's entries matched none");
  });

  it("never puts one on under a name of Meno's own, nor one an entry has: energy stays its own", () => {
    const o = ok(runMenoPair("join", { entries: [water(1, { path: text("p") })], holds: "molecules" }, { entries: [water(1, { path: text("p"), e: { value: -1, unit: "Eh", status: "computed" } })], holds: "molecules" }, { on: "path", carry: "e as energy" }));
    expect(o.aside.map((e) => e.properties?.[SET_ASIDE]?.value)).toEqual(["it has its own energy already"]);
  });

  it("says on its card what it does, and what it still needs before it can run", () => {
    const info = kindInfo("join");
    expect(howOf(info.options!, { on: "path", carry: "species as first end; g" }, info.how)).toBe("species as first end, g, matched on path");
    expect(needsOf({ kind: "join", options: {} })).toBe("Name the property to match on");
    expect(needsOf({ kind: "join", options: { on: "path" } })).toBe("Name what to put on");
    expect(needsOf({ kind: "join", options: { on: "path", carry: "a as x; b as x" } })).toBe('"x" is put on twice');
    expect([info.name, info.inputs?.map((p) => p.name), info.others?.map((x) => x.name)]).toEqual(["Join", ["Onto", "From"], ["Not joined"]]);
  });
});
