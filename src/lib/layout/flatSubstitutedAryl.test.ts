import { describe, expect, it } from "vitest";
import { forgetLaidOut, layout2D } from "./engine";
import { fromSmiles } from "./testdata/fromSmiles";
import { measured } from "../../testing/timeouts";

// An aryl ring is turned as a propeller's blade, in perspective, only where it carries nothing but its bond to the crowded atom
// (Brecher 2008, GR-4.3.6): turned, a ring with further groups would state a configuration of hindered rotation, ruled out
// for one that has none (Brecher 2006, ST-1.7). Such rings lie flat, the crowding cleared the other ways the layout has.

/** The atoms `smiles` lays out in depth - a turned ring's - by element and their index in the input. */
function inDepth(smiles: string): number[] {
  forgetLaidOut();
  const input = fromSmiles(smiles);
  const out = layout2D(input);
  return out.depth.flatMap((d, i) => (d != null && Math.abs(d) > 1e-6 ? [i] : []));
}

const ring = (n: string) => `c${n}ccccc${n}`;
const pph3 = `P(${ring("1")})(${ring("1")})${ring("1")}`;
const potol3 = "P(c1ccccc1C)(c1ccccc1C)c1ccccc1C";

describe("an aryl ring on a crowded atom", () => {
  it("is turned as a blade where it carries nothing else - PPh3 on a palladium, as before", () => {
    expect(inDepth(`Cl[Pd](Cl)(${pph3})${pph3}`).length).toBe(24);
  }, measured(60000));

  it("lies flat where it carries a group of its own - tri(o-tolyl)phosphine on a palladium, a mesityl - however crowded", () => {
    expect(inDepth(`Cl[Pd](Cl)(${potol3})${potol3}`)).toEqual([]);
    // (a mesityl on the metal, beside two PPh3: the PPh3's blades turned, the mesityl's ring flat; its ring closed by its own
    // digit, 2, so that the PPh3's rings, closed by 1, do not close it)
    const smiles = `Cc2cc(C)c([Pd](Cl)(${pph3})${pph3})c(C)c2`;
    forgetLaidOut();
    const input = fromSmiles(smiles);
    const out = layout2D(input);
    const mesityl = [1, 2, 3, 5, input.atoms.length - 3, input.atoms.length - 1].filter((i) => input.atoms[i].el === "C");
    for (const i of mesityl) expect(out.depth[i] ?? 0, `${i}`).toBeCloseTo(0, 9);
  }, measured(60000));
  it("lies flat where its group is far from the crowded atom too - a p-tolyl's, a 4-fluorophenyl's - while a pyridyl, with nothing of its own, is turned as a phenyl", () => {
    const ptol3 = "P(c1ccc(C)cc1)(c1ccc(C)cc1)c1ccc(C)cc1";
    const pfp3 = "P(c1ccc(F)cc1)(c1ccc(F)cc1)c1ccc(F)cc1";
    expect(inDepth(`Cl[Pd](Cl)(${ptol3})${ptol3}`)).toEqual([]);
    expect(inDepth(`Cl[Pd](Cl)(${pfp3})${pfp3}`)).toEqual([]);
    // (a ring N is a ring atom, not a group: tri(2-pyridyl)phosphine's rings may be turned, and are, as PPh3's)
    const ppy3 = "P(c1ccccn1)(c1ccccn1)c1ccccn1";
    expect(inDepth(`Cl[Pd](Cl)(${ppy3})${ppy3}`).length).toBe(24);
  }, measured(90000));
});
