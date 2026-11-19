/**
 * Identity of a structure with AND and OR groups at its edges: the most it writes, a search's "complete" carried, groups of a kind
 * numbered either way (found in review).
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import { identity, type IdentityGroup, type IdentityInput } from "./identity";

const input = (smiles: string) => smilesInput(smiles) as unknown as IdentityInput;
const id = (smiles: string, groups: IdentityGroup[] = []) => identity({ ...input(smiles), ...(groups.length ? { groups } : {}) }).text;
const and = (...atoms: number[]): IdentityGroup => ({ kind: "and", atoms });
const or = (...atoms: number[]): IdentityGroup => ({ kind: "or", atoms });

/** Every order of `items`. */
const orders = <T,>(items: readonly T[]): T[][] => (items.length <= 1 ? [[...items]] : items.flatMap((x, i) => orders([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest])));

describe("identity with groups: what its tests leave unheld (found in review)", () => {
  it("a search that ran out is said so for a grouped structure: forty methanes beside a ring with its centre in a group", () => {
    // (the methanes alike in every way: the search for alike groups cannot finish - identity.test.ts; atoms 0-39 the methanes, 40 the O, 41 the centre)
    const found = identity({ ...input(`${Array(40).fill("C").join(".")}.O[C@H]1CCCCC1`), groups: [and(41)] });
    expect(found.complete).toBe(false);
    expect(identity({ ...input(`${Array(40).fill("C").join(".")}.O[C@H]1CCCCC1`), groups: [or(41)] }).complete).toBe(false);
  }, 60_000);

  it("eight groups are written in full - 2^8 is the most: complete, the same text whichever hand is drawn at a centre", () => {
    const chain = (first: string) => `C[C${first}H](O)C[C@H](O)C[C@H](O)C[C@H](O)C[C@H](O)C[C@H](O)C[C@H](O)C[C@H](O)C`;
    const centres = [1, 4, 7, 10, 13, 16, 19, 22];
    const groups = centres.map((c) => and(c));
    const here = identity({ ...input(chain("@")), groups });
    expect(here.complete).toBe(true);
    // (written as drawn - past the most - the two hands would be two texts)
    expect(identity({ ...input(chain("@@")), groups }).text).toBe(here.text);
  }, 60_000);

  it("the same structure whatever order its groups of a kind are listed in", () => {
    // (a pentane-2,3,4-triol's centres are atoms 1, 3 and 5 below: three groups of each kind and of both, in every order)
    const triol = "C[C@@H](O)[C@H](O)[C@H](O)C";
    const sets: IdentityGroup[][] = [
      [or(1), or(3)],
      [or(1), or(3), or(5)],
      [and(1), and(3), and(5)],
      [and(1), or(3), or(5)],
      [or(1), and(3), or(5)],
      [and(1), and(3), or(5)],
    ];
    for (const groups of sets) {
      const texts = new Set(orders(groups).map((order) => id(triol, order)));
      expect(texts.size, JSON.stringify(groups)).toBe(1);
    }
  });

  it("two OR groups are two unknowns, each its own: not one OR group and not two AND groups", () => {
    const diol = "C[C@@H](O)[C@H](O)C";
    expect(new Set([id(diol, [or(1), or(3)]), id(diol, [or(1, 3)]), id(diol, [and(1), and(3)]), id(diol, [and(1), or(3)])]).size).toBe(4);
  });

  it("an OR group is turned, an AND group is turned, and a group of neither kind changes nothing: each kind on its own", () => {
    const butanol = "C[C@H](O)CC";
    // (one hand drawn or the other: the same; the three apart)
    expect(id(butanol, [or(1)])).not.toBe(id(butanol, [and(1)]));
    expect(id(butanol, [or(1)])).not.toBe(id(butanol));
    expect(id("C[C@@H](O)CC", [or(1)])).toBe(id(butanol, [or(1)]));
    expect(id("C[C@@H](O)CC", [and(1)])).toBe(id(butanol, [and(1)]));
  });
});
