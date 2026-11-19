/**
 * A structure drawn with centres in AND or OR groups, as what says whether two structures are the same asks identity
 * (chem/identityOf `withGroups`, workflow/entries `structureInputOf`): a racemate, "one or the other" and the drawn absolute are
 * three structures; what gives a structure one configuration (`identityInputOf` alone) reads no group.
 */
import { describe, expect, it } from "vitest";
import { identity } from "../../../../lib/chem/identity";
import type { StereoGroup } from "../../../../lib/chem/molecule";
import type { Model } from "../store/types";
import { structureInputOf } from "../workflow/entries";
import { identityInputOf, identityOfDrawn, withGroups } from "./identityOf";
import { drawnFromSmiles } from "./testdata/identityCases";

/** `smiles` drawn, the atoms at `at` (by place) in `group`. */
function drawn(smiles: string, group?: StereoGroup, at: readonly number[] = []): Model {
  const m = drawnFromSmiles(smiles);
  return { ...m, atoms: m.atoms.map((a, i) => (group && at.includes(i) ? { ...a, stereoGroup: group } : a)) };
}

describe("a structure drawn with AND and OR groups, as identity reads it", () => {
  const R = "C[C@H](O)CC";
  const S = "C[C@@H](O)CC";

  it("gives identity each group's centres, by place, and none for a centre drawn absolute", () => {
    const m = drawn("C[C@@H](O)[C@H](O)C", { kind: "and", n: 1 }, [1]);
    const twice = { ...m, atoms: m.atoms.map((a, i) => (i === 3 ? { ...a, stereoGroup: { kind: "or" as const, n: 2 } } : a)) };
    expect(withGroups(identityInputOf(twice).input, twice).groups).toEqual([
      { kind: "and", atoms: [1] },
      { kind: "or", atoms: [3] },
    ]);
    const abs = drawn(R, { kind: "abs" }, [1]);
    expect(withGroups(identityInputOf(abs).input, abs).groups).toBeUndefined();
  });

  it("a racemate, one or the other and the drawn absolute: three structures; a racemate of either hand: one", () => {
    const text = (m: Model) => identity(structureInputOf(m).input).text;
    const texts = [text(drawn(R)), text(drawn(R, { kind: "and", n: 1 }, [1])), text(drawn(R, { kind: "or", n: 1 }, [1]))];
    expect(new Set(texts).size).toBe(3);
    expect(text(drawn(S, { kind: "and", n: 1 }, [1]))).toBe(texts[1]);
    expect(identityOfDrawn(drawn(S, { kind: "or", n: 1 }, [1])).text).toBe(texts[2]);
  });

  it("what gives a structure one configuration reads no group", () => {
    const m = drawn(R, { kind: "and", n: 1 }, [1]);
    expect(identityInputOf(m).input.groups).toBeUndefined();
  });
});
