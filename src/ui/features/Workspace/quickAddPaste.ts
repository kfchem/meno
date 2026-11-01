import { outputKindIn } from "../../../lib/calc/probe";
import { readCoordinates, type CoordinateStructure } from "../../../lib/io/coordinates";

/**
 * What a text pasted in the SMILES field is, of what Quick Add takes there
 * (`takes`): a calculation's output, whole - read as one opened is, by its
 * reader, never in part as coordinates (lib/calc/probe `outputKindIn`); or
 * coordinates in a text, the structures they hold (lib/io/coordinates) -
 * no SMILES reads as coordinates: an atom is an element and three numbers
 * with decimal points. None where it is neither: typed in the field as it is.
 */
export function pastedAs(text: string, takes: { output: boolean; coordinates: boolean }): { output: string } | { structures: CoordinateStructure[] } | null {
  if (takes.output && outputKindIn(text)) return { output: text };
  const structures = takes.coordinates ? readCoordinates(text) : [];
  return structures.length ? { structures } : null;
}
