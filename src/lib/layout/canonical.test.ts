import { describe, expect, it } from "vitest";
import { canonicalOrder, reordered } from "./canonical";
import type { LayoutInput } from "./perceive";
import { shuffled } from "./testdata/inAnyOrder";
import { fromSmiles } from "./testdata/readBack";

/** The molecule's bonds as its own order writes them: the same list for the same molecule. */
const certificate = (g: LayoutInput, way = 0) =>
  reordered(g, canonicalOrder(g, way))
    .bonds.map((b) => `${b.a}-${b.b}:${b.order}`)
    .join(" ");

describe("canonicalOrder", () => {
  // (cages of three-bonded CH whose atoms the neighbours' ranks never part,
  // though not all alike: which of them is taken first decides the order)
  const cages: Record<string, string> = {
    cuneane: "C12C3C4C3C2C5C4C51",
    basketane: "C12C3C4C5C3C2C5C4CC1",
    cubane: "C12C3C4C1C5C2C3C45",
    adamantane: "C1C2CC3CC1CC(C2)C3",
  };

  it("writes the same bonds for the same molecule however its atoms come, where ranks alone leave atoms alike that are not", () => {
    for (const [name, smiles] of Object.entries(cages)) {
      const g = fromSmiles(smiles);
      for (const way of [0, 1, 2, 3]) {
        const own = certificate(g, way);
        for (const seed of [1, 7919, 104729, 1299709]) expect(certificate(shuffled(g, seed), way), `${name} way ${way} seed ${seed}`).toBe(own);
      }
    }
  });

  it("takes the same order for a molecule with many alike groups in little time", () => {
    // (hexa-tert-butylbenzene's 18 methyls, alike in threes and sixes)
    const g = fromSmiles("CC(C)(C)c1c(C(C)(C)C)c(C(C)(C)C)c(C(C)(C)C)c(C(C)(C)C)c1C(C)(C)C");
    const t = performance.now();
    const own = certificate(g);
    expect(certificate(shuffled(g, 31))).toBe(own);
    expect(performance.now() - t).toBeLessThan(2000);
  });
});
