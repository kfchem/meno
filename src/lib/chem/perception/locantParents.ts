/**
 * The fused ring systems whose numbering Meno takes from a table, not from the rule (foundation part 16, A4.5): the exceptions of the 2013
 * recommendations' P-25.3.3 (anthracene, phenanthrene, acridine, carbazole, xanthene and its chalcogen analogues, purine,
 * cyclopenta[a]phenanthrene) and the common systems of three or more rings, whose orientation (P-25.3.2.3) Meno does not work out. Each is
 * entered by hand as numbers: its locants in order round its periphery, the bonds across it, and its interior atoms (P-25.3.3.3.1: the
 * nearest peripheral locant with a superscript). Cited by table and rule: Tables 2.7 and 2.8, P-25.2.2.3, P-25.3.3, P-101 (the steroid
 * skeleton's figures); an entry the text gives no full figure of is completed by the rule from its start and direction, as marked. No figure
 * is copied: the numbers are the locants the names use.
 */

/** A locant of an entry: its base and, for an interior atom, its superscript; its element where it is not carbon. */
export type EntryLocant = { base: string; sup?: string; el?: string };

export type LocantParent = {
  name: string;
  /** The atoms: the periphery in order round it, then the interior ones. */
  atoms: EntryLocant[];
  /** The bonds, by index into `atoms`: the periphery's (each atom to the next, the last to the first) are made from the order; these are the rest. */
  across: [string, string][];
  /** How the numbers are known (CHEM's check of the brief, K6 and R9). */
  known: "read" | "calculated" | "inferred";
};

const at = (spec: string): EntryLocant => {
  // ("N10" is nitrogen at 10, "3a^1" an interior atom: the base 3a, the superscript 1)
  const m = /^([A-Z][a-z]?)?(\d+[a-z]?)(?:\^(\d+))?$/.exec(spec)!;
  return { base: m[2], ...(m[3] ? { sup: m[3] } : {}), ...(m[1] ? { el: m[1] } : {}) };
};

const entry = (name: string, periphery: string, interior: string, across: string, known: LocantParent["known"] = "read"): LocantParent => ({
  name,
  atoms: [...periphery.split(" "), ...(interior ? interior.split(" ") : [])].map(at),
  across: across.split(" ").map((p) => p.split("-") as [string, string]),
  known,
});

/** A three-ring linear skeleton's periphery (anthracene's), with the element `el10` at 10 and `el9` at 9. */
const linear = (name: string, el10 = "", el9 = "") =>
  entry(name, `1 2 3 4 4a ${el10}10 10a 5 6 7 8 8a ${el9}9 9a`, "", "4a-9a 10a-8a");

export const LOCANT_PARENTS: readonly LocantParent[] = [
  linear("anthracene"),
  entry("phenanthrene", "1 2 3 4 4a 4b 5 6 7 8 8a 9 10 10a", "", "4a-10a 4b-8a"),
  linear("acridine", "N"),
  entry("9H-carbazole", "1 2 3 4 4a 4b 5 6 7 8 8a N9 9a", "", "4a-9a 4b-8a"),
  linear("9H-xanthene", "O"),
  linear("9H-thioxanthene", "S"),
  linear("9H-selenoxanthene", "Se"),
  linear("9H-telluroxanthene", "Te"),
  // (the fusion atoms 4 and 5, numbered in turn, with no letters: the periphery N1, C2, N3, C4, N9, C8, N7, C5, C6)
  entry("7H-purine", "N1 2 N3 4 N9 8 N7 5 6", "", "4-5"),
  entry("9H-fluorene", "1 2 3 4 4a 4b 5 6 7 8 8a 9 9a", "", "4a-9a 4b-8a"),
  entry("1H-phenalene", "1 2 3 3a 4 5 6 6a 7 8 9 9a", "3a^1", "3a-3a^1 6a-3a^1 9a-3a^1"),
  entry("pyrene", "1 2 3 3a 4 5 5a 6 7 8 8a 9 10 10a", "3a^1 5a^1", "3a-3a^1 10a-3a^1 3a^1-5a^1 5a-5a^1 8a-5a^1"),
  entry("chrysene", "1 2 3 4 4a 4b 5 6 6a 7 8 9 10 10a 10b 11 12 12a", "", "4a-12a 4b-10b 6a-10a"),
  entry("perylene", "1 2 3 3a 4 5 6 6a 6b 7 8 9 9a 10 11 12 12a 12b", "3a^1 6b^1", "3a-3a^1 6a-3a^1 12b-3a^1 6b-6b^1 9a-6b^1 12a-6b^1"),
  entry("phenazine", "1 2 3 4 4a N5 5a 6 7 8 9 9a N10 10a", "", "4a-10a 5a-9a"),
  entry("10H-phenoxazine", "1 2 3 4 4a O5 5a 6 7 8 9 9a N10 10a", "", "4a-10a 5a-9a"),
  entry("10H-phenothiazine", "1 2 3 4 4a S5 5a 6 7 8 9 9a N10 10a", "", "4a-10a 5a-9a"),
  entry("phenanthridine", "1 2 3 4 4a N5 6 6a 7 8 9 10 10a 10b", "", "4a-10b 6a-10a"),
  entry("1,7-phenanthroline", "N1 2 3 4 4a 5 6 6a N7 8 9 10 10a 10b", "", "4a-10b 6a-10a"),
  entry("1,10-phenanthroline", "N1 2 3 4 4a 5 6 6a 7 8 9 N10 10a 10b", "", "4a-10b 6a-10a", "calculated"),
  entry("tetracene", "1 2 3 4 4a 5 5a 6 6a 7 8 9 10 10a 11 11a 12 12a", "", "4a-12a 5a-11a 6a-10a", "calculated"),
  entry("triphenylene", "1 2 3 4 4a 4b 5 6 7 8 8a 8b 9 10 11 12 12a 12b", "", "4a-12b 4b-8a 8b-12a", "calculated"),
  entry("acenaphthylene", "1 2 2a 3 4 5 5a 6 7 8 8a", "2a^1", "2a-2a^1 5a-2a^1 8a-2a^1", "calculated"),
  entry("dibenzo[b,d]furan", "1 2 3 4 4a O5 5a 6 7 8 9 9a 9b", "", "4a-9b 5a-9a"),
  entry("dibenzo[b,d]thiophene", "1 2 3 4 4a S5 5a 6 7 8 9 9a 9b", "", "4a-9b 5a-9a", "inferred"),
  entry("9H-pyrido[3,4-b]indole", "1 N2 3 4 4a 4b 5 6 7 8 8a N9 9a", "", "4a-9a 4b-8a", "calculated"),
  // (every atom a plain number; the fusion atoms 5 and 10, 8 and 9, 13 and 14: the ring system's numbering, read on P-101's skeleton)
  entry("cyclopenta[a]phenanthrene", "1 2 3 4 5 6 7 8 14 15 16 17 13 12 11 9 10", "", "5-10 8-9 13-14"),
];
