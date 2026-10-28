import { describe, expect, it } from "vitest";
import { asCameSaid, drawingOf, withoutStereoOpen } from "./fromSmiles";
import { fromSmiles } from "../../../../lib/layout/testdata/fromSmiles";

/** A MOL block of a structure drawn round a circle, its bonds as SMILES gives them. */
function roundMolblock(smiles: string): string {
  const input = fromSmiles(smiles);
  const n = input.atoms.length;
  const R = (n * 1.5) / (2 * Math.PI);
  const f = (v: number) => v.toFixed(4).padStart(10);
  const atoms = input.atoms.map((a, i) => `${f(R * Math.cos((2 * Math.PI * i) / n))}${f(R * Math.sin((2 * Math.PI * i) / n))}${f(0)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  const bonds = input.bonds.map((b) => `${String(b.a + 1).padStart(3)}${String(b.b + 1).padStart(3)}${String(b.order).padStart(3)}  0`);
  return ["", "  test", "", `${String(n).padStart(3)}${String(input.bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`, ...atoms, ...bonds, "M  END", ""].join("\n");
}

describe("a plugin's drawing that cannot be laid out", () => {
  it("is drawn as it came, and says so - why, in a sentence - where it is put down", async () => {
    // (made up: the bridged macrocycle the layout puts an atom of on a bond - #685's guard refuses it)
    const drawn = await drawingOf(roundMolblock("C1CCCCC2CCC(CO2)CCCCCCCC1"));
    expect(drawn.asCame).toMatch(/one atom on another or on a bond/);
    expect(asCameSaid(drawn)).toBe("Drawn as it came: the structure could not be laid out without putting one atom on another or on a bond.");
    // (and what goes onto the page carries none of it)
    expect("asCame" in withoutStereoOpen(drawn)).toBe(false);
    // (one laid out says nothing)
    expect(asCameSaid(await drawingOf(roundMolblock("CCCC")))).toBeNull();
  });
});
