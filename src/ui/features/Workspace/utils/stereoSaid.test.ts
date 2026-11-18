import { describe, expect, it } from "vitest";
import type { Molecule3D } from "../store/types";
import { chipDetails } from "./chipSaid";
import { SAID_NAMED_MOST, stereoSaidRows } from "./stereoSaid";
import { stereoAfter } from "./edit3d";

/** A chain of carbons in 3D, with what its stereo says. */
const chain = (n: number, stereo: Molecule3D["stereo"]): Pick<Molecule3D, "atoms" | "bonds" | "stereo"> => ({
  atoms: Array.from({ length: n }, (_, i) => ({ el: i === 2 ? "N" : "C", x: i, y: 0, z: 0 })),
  bonds: Array.from({ length: n - 1 }, (_, i) => ({ a1: i, a2: i + 1, order: i === 4 ? 2 : 1 })),
  stereo,
});

describe("what a molecule in 3D says of the units it shows no R or S on", () => {
  const said = { atoms: { 0: "flat", 3: "flat", 2: "exchanges" }, bonds: { 4: "flat" } };
  it("says each why once, its units named by their atoms, where R and S are shown on it", () => {
    const m = chain(8, { atoms: { 1: "R" }, bonds: {}, shown: { atoms: [1], bonds: [] }, said });
    expect(stereoSaidRows(m)).toEqual([
      { label: "C1, C4", text: "No R or S: its groups lie nearly in a plane here." },
      { label: "N3", text: "No R or S: this N does not keep a configuration." },
      { label: "C5=C6", text: "No E or Z: it is twisted nearly a right angle here." },
    ]);
    // (in its card, a group of its own)
    expect(chipDetails({ count: 1, frame: 0, stereoSaid: stereoSaidRows(m) }, 0).find((g) => g.group === "Stereo")?.rows).toHaveLength(3);
  });

  it("says nothing where no R or S is shown on it, nor where none has a why", () => {
    expect(stereoSaidRows(chain(8, { atoms: { 1: "R" }, bonds: {}, said }))).toEqual([]);
    expect(stereoSaidRows(chain(8, { atoms: { 1: "R" }, bonds: {}, shown: { atoms: [1], bonds: [] } }))).toEqual([]);
  });

  it("names as many as it names at most, and counts one more", () => {
    const of = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, "flat"]));
    const row = (n: number) => stereoSaidRows(chain(12, { atoms: {}, bonds: {}, shown: { atoms: [], bonds: [4] }, said: { atoms: of(n), bonds: {} } }))[0].label;
    // (the chain's third atom its N)
    expect(row(SAID_NAMED_MOST)).toBe(Array.from({ length: SAID_NAMED_MOST }, (_, i) => `${i === 2 ? "N" : "C"}${i + 1}`).join(", "));
    expect(row(SAID_NAMED_MOST + 1)).toBe(`${SAID_NAMED_MOST + 1} centres`);
  });

  it("is not kept where the molecule is edited in 3D: its places say otherwise", () => {
    const m = { ...chain(4, { atoms: { 1: "R" }, bonds: {}, said: { atoms: { 2: "flat" }, bonds: {} } }) };
    const xyz = m.atoms.flatMap((a) => [a.x, a.y, a.z]);
    expect(stereoAfter(m, xyz, xyz)?.said).toBeUndefined();
  });

  it("counts the units of one why past the most it names", () => {
    const many = Object.fromEntries(Array.from({ length: SAID_NAMED_MOST + 2 }, (_, i) => [i, "flat"]));
    const m = chain(12, { atoms: {}, bonds: {}, shown: { atoms: [], bonds: [4] }, said: { atoms: many, bonds: {} } });
    expect(stereoSaidRows(m)).toEqual([{ label: `${SAID_NAMED_MOST + 2} centres`, text: "No R or S: its groups lie nearly in a plane here." }]);
  });
});
