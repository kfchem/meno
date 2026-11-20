/**
 * Which of a structure's cage atoms the CIP labels (lib/chem/cip `cipLabels`): those of `cageAtoms` drawn with a configuration
 * that get an R, S, r or s, their places in `input` written "i,j" in order. What the R/S and E/Z menu offers at a cage
 * (chem/candidatesDrawn) - there the CIP alone decides, whatever identity's turning says, the chemistry check's ruling - and
 * worked out off the drawing thread with the identities (chem/identityOff, asked "cage labels").
 */
import { cipLabels } from "../../../../lib/chem/cip";
import type { IdentityInput } from "../../../../lib/chem/identity";
import { cageAtoms } from "../../../../lib/chem/perception/stereo/units";

export function cageLabelled(input: IdentityInput): string {
  const asked = [...cageAtoms(input)].filter((i) => input.atoms[i].tetra).sort((p, q) => p - q);
  if (!asked.length) return "";
  const { centres } = cipLabels(input, { centres: asked, bonds: [], axes: [], cumulated: [] });
  return asked
    .filter((i) => {
      const r = centres.get(i);
      return r != null && "label" in r;
    })
    .join(",");
}
