import { describe, expect, it } from "vitest";
import { extensionOf, knownOf, pluginWriters, WRITERS } from "./writers";
import { MANIFESTS } from "../plugins/known";

describe("the writers", () => {
  it("are Meno's own, given the page, and the plugins', each kind a plugin writes a writer of its own", () => {
    expect(Object.values(WRITERS).every((w) => w.by === "meno" && w.takes === "page")).toBe(true);
    expect(extensionOf(WRITERS.sdf)).toBe("sdf");
    const theirs = pluginWriters(MANIFESTS.filter((m) => m.id === "orbitron"));
    expect(theirs.map((w) => [w.id, w.by, w.takes, extensionOf(w)])).toEqual([["orbitron-input", "orbitron", "molecule", "orb"]]);
  });
});

describe("what Meno knows of a molecule written", () => {
  const atom = (el: string, more = {}) => ({ el, x: 0, y: 0, z: 0, ...more });

  it("is its charge, its atoms' summed; its multiplicity, from its radicals and its electrons; and its name", () => {
    const water = { name: "water", atoms: [atom("O"), atom("H"), atom("H")], bonds: [] };
    expect(knownOf(water)).toEqual({ charge: 0, multiplicity: 1, name: "water" });
    // hydroxide; the hydroxyl radical, its electrons odd; methylene, a triplet carbene
    expect(knownOf({ atoms: [atom("O", { charge: -1 }), atom("H")], bonds: [] })).toMatchObject({ charge: -1, multiplicity: 1, name: "" });
    expect(knownOf({ atoms: [atom("O"), atom("H")], bonds: [] })).toMatchObject({ charge: 0, multiplicity: 2 });
    expect(knownOf({ atoms: [atom("O", { radical: "doublet" }), atom("H")], bonds: [] })).toMatchObject({ multiplicity: 2 });
    expect(knownOf({ atoms: [atom("C", { radical: "triplet" }), atom("H"), atom("H")], bonds: [] })).toMatchObject({ multiplicity: 3 });
    expect(knownOf({ atoms: [atom("C", { radical: "singlet" }), atom("H"), atom("H")], bonds: [] })).toMatchObject({ multiplicity: 1 });
  });
});
