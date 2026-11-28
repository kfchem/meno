// Held beside bySense.test.ts (the chemistry check's ruling, found in review): a set of bridgeheads a ring system ties together is kept
// among the frames made, all of it or none, only where turning the whole set, all else kept, makes another stereoisomer - no automorphism
// of the constitution takes the turned form onto the configured one. Quinuclidine's, DABCO's, bicyclo[2.2.2]octane's, adamantane's and
// cubane's turned are the same cage taken the other way round; Troeger's base's two N, camphor's bridgeheads and exo-norbornan-2-ol's
// are not. Bicyclo[2.2.2]octan-2-ol's pair turns back by swapping its two plain bridges: only its C2 is kept.
import { describe, expect, it } from "vitest";
import { isomersOf } from "../../../../lib/chem/isomers";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { asGiven, blocksRead } from "./menoIsomers";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "./testdata/identityCases";

/** The centres the first stereoisomer of a structure keeps among the frames made (chem/menoIsomers `asGiven`), by element. */
function kept(smiles: string): string[] {
  return keptOf(drawnFromSmiles(smiles));
}

/** The same, of a structure drawn by hand. */
function keptOf(part: Model): string[] {
  const block = writeMolfile(part);
  const read = blocksRead([block])!;
  const counted = isomersOf(read.input);
  if (!("isomers" in counted)) throw new Error("not counted");
  const { configuration } = asGiven(read, [block], counted.isomers[0]);
  return configuration.centres.map((c) => part.atoms[c.atom].el).sort();
}

describe("a set of tied bridgeheads is kept only where turning it makes another stereoisomer", () => {
  it.each([
    ["quinuclidine", "C1CN2CCC1CC2"],
    ["DABCO", "C1CN2CCN1CC2"],
    ["bicyclo[2.2.2]octane", "C1CC2CCC1CC2"],
    ["adamantane", "C1C2CC3CC1CC(C2)C3"],
  ])("%s: none kept - the turned cage is the same one", (_, smiles) => {
    expect(kept(smiles)).toEqual([]);
  });

  // (drawn by hand as a chemist draws it, one square face round the other: what is kept depends on its atoms and bonds alone, and the
  //  engine's laying out of a cube - far the longest part of drawing it from its SMILES - is not what this proves)
  it("cubane: none kept - the turned cage is the same one", () => {
    const at: [number, number][] = [
      [0, 0], [3, 0], [3, 3], [0, 3],
      [0.75, 0.75], [2.25, 0.75], [2.25, 2.25], [0.75, 2.25],
    ];
    const faces = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const cubane: Model = {
      atoms: at.map(([x, y], i) => ({ id: i + 1, el: "C", x, y, r: 0.9 })) as Model["atoms"],
      bonds: faces.map(([a, b], k) => ({ id: 1000 + k, a: a + 1, b: b + 1, order: 1 as const })),
    };
    expect(keptOf(cubane)).toEqual([]);
  });

  it("Troeger's base: both N kept", () => {
    expect(kept("CC1=CC2=C(C=C1)N3CC4=C(C=CC(=C4)C)N(C2)C3")).toEqual(["N", "N"]);
  });

  it("camphor: both bridgeheads kept", () => {
    expect(kept("CC1(C)C2CCC1(C)C(=O)C2")).toEqual(["C", "C"]);
  });

  it("exo-norbornan-2-ol: its C2 and both bridgeheads kept", () => {
    expect(kept("O[C@@H]1C[C@H]2CC[C@@H]1C2")).toEqual(["C", "C", "C"]);
  });

  it("bicyclo[2.2.2]octan-2-ol: its C2 only - its bridgeheads turned back by swapping the two plain bridges", () => {
    expect(kept("OC1CC2CCC1CC2")).toEqual(["C"]);
  });
});
