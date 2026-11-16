/**
 * The ratchet: one definition per concept, kept (foundation, design section 2 and the inventory).
 *
 * Each concept the core is to define once has its copies still standing outside it listed in `STILL_APART`, each with the part of the foundation that
 * moves it. The test fails (a) where a listed copy is no longer declared where the table says - the line must be deleted with the copy, so the list
 * only shrinks - and (b) where a declaration of one of these concepts stands outside the core and outside the table: a copy made anew.
 *
 * What it does not catch: a copy under a name that is none of the patterns, one declared inside another function, one as a method, an `interface X`
 * or an `export default`; a copy of the rule with no name of its own. That is a reviewer's to see. A new entry in the table needs a reason a reviewer accepts: a copy that stays by design
 * says why (`why`), the layout's own choice of ring set, a display.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const SRC = resolve(__dirname, "../../..");
const CORE = __dirname;
/** A path with forward slashes, as the table writes one, on Windows too. */
const slash = (p: string) => p.split(sep).join("/");

export type Copy = { concept: string; file: string; name: string; part: number | string; why?: string };

/** The names that declare each concept, as a top-level declaration: what (b) looks for. */
export const CONCEPTS: Record<string, RegExp> = {
  rings: /^(?:export )?(?:async )?(?:function|const) (inSmallRing|ringThrough|ringsThrough|smallRings|ringBonds|ringParts|smallestRings|ringsAlike|withSmallRings|smallestSets|ringSetsToTry|sixCycles|ringsOf)\b/,
  metals: /^(?:export )?(?:function|const) (METALS|isMetal|NOT_METALS|IONIC|COUNTED|BRIDGED_TO)\b/,
  valence: /^(?:export )?(?:function|const) (VALENCE|VALENCES|HIGHER|OUTER|HIGHEST|PYRAMID_VALENCE|VALENCE_ELECTRONS|D_ORBITAL_VALENCE|NORMAL_VALENCES|BONDS_LEFT|CARRIERS)\b/,
  parity: /^(?:export )?(?:function|const) (parity|permutationParity)\b/,
  volume: /^(?:export )?(?:function|const) (drawnVolume|volumeSign|handedness|signedVolume)\b/,
  "stereo types": /^(?:export )?type (Tetrahedral|CisTrans|Axial|Cumulated|ConfiguredCentre|ConfiguredDouble|NumberingCentre|RingDouble|StereoElement|Configuration)\b/,
  // a run of cumulated double bonds, and the atom an axis's or a cumulene's end runs on through (perception/stereo/runs.ts, part 4)
  runs: /^(?:export )?(?:function|const) (cumulatedRuns|runsThrough|runsOfDrawing|linearMiddle)\b/,
  // Meno's rule for an aromatic ring (perception/aromatic.ts): no copy of it outside the core
  "aromatic rule": /^(?:export )?(?:function|const) (aromaticAtoms|piElectrons|MOST_PI)\b/,
  // a structure's symmetry and canonical order: the one refinement and search (perception/symmetry.ts, part 6)
  symmetry: /^(?:export )?(?:function|const) (symmetryClasses|symmetryOrbits|canonicalRanks|canonicalText|canonicalWritten|canonicalSearched|settleBudget|withStereo|isomorphisms|coreMatches|matchedAtoms)\b/,
};

/**
 * The copies still standing outside the core, by concept, with the part of the foundation (docs: the design's section 5) that moves each. The
 * counts are the inventory's: a copy under a pattern's name that the inventory did not list is added as it is found.
 */
export const STILL_APART: Copy[] = [
  // rings: one perception, and the "smallest ring through" searches, the bridge test and the ring-system groupers onto it
  { concept: "rings", file: "lib/layout/rings.ts", name: "ringsAlike", part: 2, why: "the cycles beyond a smallest set: the layout's own question, not the set the core defines" },
  { concept: "rings", file: "lib/chem/ordersFromGeometry.ts", name: "smallRings", part: 2, why: "every simple cycle of three to six atoms, not a smallest set: its flatness test is asked of each (not moved in part 2)" },
  { concept: "rings", file: "lib/chem/protonation.ts", name: "smallRings", part: 2, why: "returns the smallest ring through each bond, each once, its atoms in order: the core's set holds two of bicyclo[2.2.2]octane's three six-rings, this returns all three, so the lists are not the same sets (not moved in part 2)" },
  { concept: "rings", file: "ui/features/Workspace/utils/expandPlace.ts", name: "ringsThrough", part: 2, why: "the rings through two neighbours of one atom, the shortest way round from one to the other, their atoms in order: another question than a smallest set (not moved in part 2)" },
  { concept: "rings", file: "ui/features/Workspace/utils/molecule3d.ts", name: "ringsOf", part: 2, why: "the smallest ring through each bond, each once (up to eight atoms), its atoms in order: the lists differ from a smallest set where rings tie, as protonation's (not moved in part 2)" },
  { concept: "rings", file: "ui/features/Workspace/utils/rings.ts", name: "ringsOf", part: 2, why: "the rings at a point of the page, for the UI: it takes its rings from the core and tests where the pointer is (display)" },
  { concept: "rings", file: "lib/layout/bridge.ts", name: "withSmallRings", part: 2, why: "the layout's own choice of ring set for a bridged system" },
  { concept: "rings", file: "lib/layout/cage.ts", name: "smallestSets", part: 2, why: "the layout's own choice of ring set for a cage" },
  { concept: "rings", file: "lib/layout/cage.ts", name: "sixCycles", part: 2, why: "the six-cycles of a cage, the layout's own search" },
  { concept: "rings", file: "lib/layout/ringSets.ts", name: "ringSetsToTry", part: 2, why: "the layout's own choice of ring sets to try" },
  // metals: every list in one file under its name (perception/elements.ts); what stands apart is a name for a set of it, or a test of its own
  { concept: "metals", file: "lib/layout/perceive.ts", name: "isMetal", part: 3, why: "the core's drawnRoundMetal under the name its importers use: a re-export, going as they move" },
  { concept: "metals", file: "lib/chem/conformersSought.ts", name: "metalByBonds", part: 3, why: "a test of its own (no most bonds), not a list: it becomes the core's metal in part 3's fixes (B4)" },
  // valence tables: one count, one table (hydrogens and valence)
  { concept: "valence", file: "lib/chem/molecule.ts", name: "VALENCE", part: 12 },
  { concept: "valence", file: "lib/chem/molecule.ts", name: "HIGHEST", part: 12 },
  { concept: "valence", file: "lib/chem/formula.ts", name: "VALENCE", part: 12 },
  { concept: "valence", file: "lib/chem/formula.ts", name: "HIGHER", part: 12 },
  { concept: "valence", file: "lib/chem/formula.ts", name: "OUTER", part: 12 },
  { concept: "valence", file: "lib/chem/chain.ts", name: "VALENCES", part: 12 },
  { concept: "valence", file: "lib/chem/lonePairCentres.ts", name: "PYRAMID_VALENCE", part: 12 },
  { concept: "valence", file: "lib/chem/cip/prepare.ts", name: "VALENCE_ELECTRONS", part: 12 },
  { concept: "valence", file: "lib/chem/cip/prepare.ts", name: "D_ORBITAL_VALENCE", part: 12 },
  { concept: "valence", file: "lib/chem/smiles.ts", name: "NORMAL_VALENCES", part: 12 },
  { concept: "valence", file: "lib/figure/read.ts", name: "BONDS_LEFT", part: 12 },
  { concept: "valence", file: "lib/chem/abbreviations.ts", name: "CARRIERS", part: 12 },
  // the types for a centre, a double bond, an axis, a whole configuration
  { concept: "stereo types", file: "lib/chem/stereoOpen.ts", name: "ConfiguredCentre", part: 14 },
  { concept: "stereo types", file: "lib/chem/stereoOpen.ts", name: "ConfiguredDouble", part: 14 },
  { concept: "stereo types", file: "lib/chem/stereoOpen.ts", name: "Configuration", part: 14 },
  { concept: "stereo types", file: "lib/chem/stereoOpen.ts", name: "StereoElement", part: 14 },
  { concept: "stereo types", file: "lib/chem/smiles.ts", name: "Configuration", part: 14 },
  { concept: "stereo types", file: "lib/entry.ts", name: "StereoElement", part: 14 },
  { concept: "stereo types", file: "lib/chem/referenceNumbering.ts", name: "NumberingCentre", part: 14 },
  { concept: "stereo types", file: "lib/layout/macrocycle.ts", name: "RingDouble", part: 14 },
  // the layout's names for what the core now defines: re-exports, staged, each going as its consumers move
  { concept: "stereo types", file: "lib/layout/stereo.ts", name: "Tetrahedral", part: 14, why: "re-exported from the core: no consumer's import line changes in the PR that made the core" },
  { concept: "stereo types", file: "lib/layout/stereo.ts", name: "Axial", part: 14, why: "re-exported from the core, as Tetrahedral" },
  { concept: "stereo types", file: "lib/layout/stereo.ts", name: "Cumulated", part: 14, why: "re-exported from the core, as Tetrahedral (part 14 A)" },
  { concept: "stereo types", file: "lib/layout/perceive.ts", name: "CisTrans", part: 14, why: "re-exported from the core, as Tetrahedral" },
  // symmetry: the layout's ranks and the Kekule ranker onto the core's refinement and search (parts 6a, 6b); the orbits of the aromatic form
  // identity's until part 13; and the matchers of two graphs, which are not the symmetry of one
  { concept: "symmetry", file: "lib/layout/ranks.ts", name: "canonicalRanks", part: "by design", why: "the layout's name for the core's canonical ranks of the input its Molecule was perceived from: written over the core's search (part 6b), not a second one" },
  { concept: "symmetry", file: "lib/chem/kekulize.ts", name: "canonicalRanks", part: "by design", why: "the Kekule choice: which N of a ring system carries an H where the structure does not say. Measured in part 6b, the core's classes in its place would draw five purines (guanine among them) as their 3H tautomers, not the 1H,9H drawn today: an answer, so it stays" },
  { concept: "symmetry", file: "lib/chem/identity.ts", name: "symmetryOrbits", part: 13, why: "the orbits of the aromatic form, over the core's orbits as drawn: identity's own until part 13" },
  { concept: "symmetry", file: "lib/chem/accelMapper.ts", name: "isomorphisms", part: "by design", why: "a matcher of two graphs, not the symmetry of one" },
  { concept: "symmetry", file: "lib/layout/scaffold.ts", name: "coreMatches", part: "by design", why: "a matcher of two graphs, not the symmetry of one" },
  { concept: "symmetry", file: "lib/layout/morph.ts", name: "matchedAtoms", part: "by design", why: "a matcher of two graphs, not the symmetry of one" },
  { concept: "runs", file: "lib/chem/stereoOpen.ts", name: "cumulatedRuns", part: "by design", why: "groups the double bonds a structure leaves open by the runs they are in: written over the core's runs (part 4), not a second finder of them" },
];

/** The top-level declarations in a file's text that a concept's pattern names: name and line. */
export function declarationsIn(text: string, concept: RegExp): { name: string; line: number }[] {
  return text.split("\n").flatMap((l, i) => {
    const m = concept.exec(l);
    return m ? [{ name: m[1], line: i + 1 }] : [];
  });
}

/** Whether a file declares or re-exports `name`: as a top-level declaration, or in an `export type { ... }` list. */
export function declares(text: string, name: string): boolean {
  const decl = new RegExp(`^(?:export )?(?:async )?(?:function|const|type|class) ${name}\\b`, "m");
  const reexport = new RegExp(`^export type \\{[^}]*\\b${name}\\b[^}]*\\}`, "m");
  return decl.test(text) || reexport.test(text);
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" || p === CORE || name === "test" ? [] : files(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("one definition per concept: the ratchet", () => {
  it("lists each copy once, by concept, file and name", () => {
    const seen = new Set<string>();
    for (const c of STILL_APART) {
      const id = `${c.concept}|${c.file}|${c.name}`;
      expect([id, seen.has(id)]).toEqual([id, false]);
      seen.add(id);
      expect(Object.keys(CONCEPTS)).toContain(c.concept);
    }
  });

  it("finds every listed copy still declared where it is said to be: a copy that moved takes its line out of the table", () => {
    const missing = STILL_APART.filter((c) => {
      try {
        return !declares(readFileSync(join(SRC, c.file), "utf8"), c.name);
      } catch {
        return true;
      }
    }).map((c) => `${c.file} ${c.name}`);
    expect(missing).toEqual([]);
  });

  it("finds no declaration of a concept outside the core that the table does not list: a copy made anew", () => {
    const listed = new Set(STILL_APART.map((c) => `${c.file}|${c.name}`));
    const found = files(SRC).flatMap((f) => {
      const text = readFileSync(f, "utf8");
      const file = slash(relative(SRC, f));
      return Object.values(CONCEPTS).flatMap((re) => declarationsIn(text, re).map((d) => ({ file, ...d })));
    });
    const unlisted = found.filter((d) => !listed.has(`${d.file}|${d.name}`)).map((d) => `${d.file}:${d.line} ${d.name}`);
    expect(unlisted).toEqual([]);
  });

  it("gives a reason for each copy that is to stay by design, and a part for each that is to move", () => {
    for (const c of STILL_APART) expect([c.file, c.name, typeof c.part === "number" || !!c.why]).toEqual([c.file, c.name, true]);
  });
});

describe("the ratchet's own reading, so that it bites", () => {
  it("finds a new copy of a concept: a ring search, a metal list, a parity, a type for a centre, the aromatic rule, a symmetry search", () => {
    expect(declarationsIn("export function ringThrough(g, a) {}\nconst x = 1;\n", CONCEPTS.rings)).toEqual([{ name: "ringThrough", line: 1 }]);
    expect(declarationsIn("const METALS = new Set([]);\n", CONCEPTS.metals)).toEqual([{ name: "METALS", line: 1 }]);
    expect(declarationsIn("function parity(p: number[]) {}\n", CONCEPTS.parity)).toEqual([{ name: "parity", line: 1 }]);
    expect(declarationsIn("export type Tetrahedral = { volume: 1 | -1 };\n", CONCEPTS["stereo types"])).toEqual([{ name: "Tetrahedral", line: 1 }]);
    expect(declarationsIn("export function aromaticAtoms(rings, electrons) {}\nconst MOST_PIXELS = 1;\n", CONCEPTS["aromatic rule"])).toEqual([{ name: "aromaticAtoms", line: 1 }]);
    expect(declarationsIn("export function symmetryOrbits(g) {}\nconst settleBudgets = 1;\n", CONCEPTS.symmetry)).toEqual([{ name: "symmetryOrbits", line: 1 }]);
  });

  it("leaves a use, a local and an import alone: only a declaration counts", () => {
    expect(declarationsIn("const r = ringThrough(g, a);\n  const ringsOf = 1;\nimport { isMetal } from './x';\n", CONCEPTS.rings)).toEqual([]);
    expect(declarationsIn("import type { Tetrahedral } from './x';\n", CONCEPTS["stereo types"])).toEqual([]);
  });

  it("tells a declaration from its absence, and sees a re-export", () => {
    expect(declares("export function ringThrough() {}", "ringThrough")).toBe(true);
    expect(declares("const something = 1;", "ringThrough")).toBe(false);
    expect(declares('export type { Axial, Tetrahedral };', "Axial")).toBe(true);
    expect(declares("// function ringThrough", "ringThrough")).toBe(false);
  });
});
