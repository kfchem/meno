/**
 * What a molecule in 3D says of the units it shows no R or S, E or Z on, though they are units (backlog 190; docs/WORKSPACE.md, *Told
 * apart*): where R and S are shown on it, each such unit's why (lib/chem/cip/in3d, `Molecule3D.stereo.said`) in the 2D marks' words
 * (chem/cipMarks `cipSaid`) - its groups nearly in a plane, an N that exchanges its H, the structure too large - as rows of its card,
 * under *Stereo*: the units of one why on one row, named by their atoms ("C4, C7"), counted past `SAID_NAMED_MOST`. Nothing for an atom or
 * a bond that is no unit; nothing where no R or S is shown on it.
 */
import { cipSaid, type CipNone } from "../chem/cipMarks";
import { stereoShownOf } from "../document";
import type { Molecule3D } from "../store/types";

/** The most units named on a row: past it, counted ("9 centres"). */
export const SAID_NAMED_MOST = 6;

export function stereoSaidRows(m: Pick<Molecule3D, "atoms" | "bonds" | "stereo">): { label: string; text: string }[] {
  const said = m.stereo?.said;
  const shown = stereoShownOf(m);
  if (!said || !shown || shown.atoms.length + shown.bonds.length === 0) return [];
  const name = (i: number) => `${m.atoms[i]?.el ?? "?"}${i + 1}`;
  const rows = new Map<string, { names: string[]; unit: "centre" | "bond" }>();
  const add = (text: string, n: string, unit: "centre" | "bond") => {
    const row = rows.get(text) ?? { names: [], unit };
    row.names.push(n);
    rows.set(text, row);
  };
  for (const [k, why] of Object.entries(said.atoms)) add(cipSaid(why as CipNone, "centre"), name(Number(k)), "centre");
  for (const [k, why] of Object.entries(said.bonds)) {
    const b = m.bonds[Number(k)];
    if (b) add(cipSaid(why as CipNone, "bond"), `${name(b.a1)}=${name(b.a2)}`, "bond");
  }
  return [...rows].map(([text, r]) => ({
    label: r.names.length > SAID_NAMED_MOST ? `${r.names.length} ${r.unit === "centre" ? "centres" : "double bonds"}` : r.names.join(", "),
    text,
  }));
}
