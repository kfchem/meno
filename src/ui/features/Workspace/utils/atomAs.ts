/** What a part is now, as far as being right goes - the mark Meno puts on what is unsure of it stays while this does. Pure. */
import type { Atom, Bond } from "../store/types";

/** An atom's element, charge and bonds: what its mark stays while (utils/figures `readMarks`). */
export function atomAs(a: Pick<Atom, "id" | "el" | "charge">, bonds: readonly Bond[]): string {
  const round = bonds
    .filter((b) => b.a === a.id || b.b === a.id)
    .map((b) => `${b.order}${b.stereo ?? ""}${b.stereo && b.stereo !== "none" ? (b.a === a.id ? "<" : ">") : ""}`)
    .sort()
    .join(",");
  return `${a.el}|${a.charge ?? 0}|${round}`;
}
