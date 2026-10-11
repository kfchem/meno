import { writeMolfile, type WriterModel } from "../chem/molWriter";
import { abbreviationOf } from "../chem/abbreviations";
import { ELEMENTS } from "../chem/elements";

const SYMBOLS = new Set(ELEMENTS.map((e) => e.symbol));

/** Whether a label is an element's symbol, as written: C, Cl - not cl, Me or R. */
export function isElementSymbol(label: string): boolean {
  return SYMBOLS.has(label);
}

/**
 * The structure as a plugin is asked about it: a V3000 MOL block, with every
 * label that is not an element - an abbreviation, an R group, any text - as
 * an atom of no element ("*"), which it neither counts bonds on nor gives
 * hydrogens; and a query bond as the bond it is drawn as, since
 * what is asked about is a structure, not a search.
 */
export function chemMolblock(model: WriterModel): string {
  return writeMolfile(
    {
      // (an abbreviation is written out, as the dictionary or the file has it)
      atoms: model.atoms.map((a) =>
        isElementSymbol(a.el) || a.abbrev || abbreviationOf(a.el)
          ? a
          : { ...a, el: "*", list: undefined, rgroups: undefined },
      ),
      bonds: model.bonds.map((b) => (b.query ? { ...b, query: undefined } : b)),
    },
    { version: "V3000" },
  );
}

/**
 * Which model atom and bond each of the block's atoms and bonds is, by
 * position: the writer lists every atom in order, and every bond whose atoms
 * are both there.
 */
export function molIndex<
  A extends { id: number },
  B extends { a: number; b: number },
>(model: { atoms: A[]; bonds: B[] }): { atoms: A[]; bonds: B[] } {
  const ids = new Set(model.atoms.map((a) => a.id));
  return {
    atoms: model.atoms,
    bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)),
  };
}
