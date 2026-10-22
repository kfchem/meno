import { describe, expect, it } from "vitest";
import { layout2D } from "../engine";
import type { LayoutInput } from "../perceive";
import { misreadCentres, turnedDoubleBonds } from "../readBack";
import { fromSmiles } from "./fromSmiles";
import { measured } from "../../../testing/timeouts";

/**
 * What a drawing the engine makes does not show as given: its double bonds
 * the other way round (`turnedDoubleBonds`), on any drawing; and the
 * stereocentres a drawing with depth does not show as given, read as Meno reads a drawing (drawn.ts): a centre in a solid shown
 * by the drawing itself, each atom where it is and as near the viewer as it
 * is; the rest by the H's and wedges the engine places. And read as a
 * reader sees its depth where the page shows it: a centre the solid shows
 * by its shape (in a six-membered ring drawn as a chair or a boat), with
 * three bonds or more into its ring system, each to an atom drawn with
 * depth, by where those atoms are and how near. None
 * where the molecule has no centre, or the drawing is flat throughout: that
 * is read by its wedges alone, as any reader reads it
 * (scripts/layout/stereo.py has RDKit read every one).
 */
function misread(input: LayoutInput): string[] {
  const out = layout2D(input);
  const turned = turnedDoubleBonds(input, out);
  if (!input.atoms.some((a) => a.tetra) || !out.depth.some((d) => d != null)) return turned;
  return [...turned, ...misreadCentres(input, out)];
}

/**
 * Every drawing the engine makes in perspective of the molecules listed - a
 * cage, a solid, a cage with rings fused flat onto it, a flat system with a
 * bridge across a ring - shows the molecule it was given: each stereocentre
 * as it is, the faces of its ring fusions and epoxides among them. The
 * engine draws a solid only with its configurations as given; this reads
 * back the drawing it hands over. (A list to a test file, the lists side by
 * side; each with the time its slowest molecule was measured to take, which
 * sets their timeout: testing/timeouts.)
 */
export function readsBackAsGiven(list: string, molecules: readonly { name: string; smiles: string }[], slowestMs: number): void {
  describe(`a drawing, its double bonds and (in perspective) its centres, on ${list}`, () => {
    it.each(molecules.map((m) => [m.name, m.smiles]))(
      "%s reads back as the molecule given",
      (_, smiles) => {
        expect(misread(fromSmiles(smiles))).toEqual([]);
      },
      measured(slowestMs),
    );
  });
}
