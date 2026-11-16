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
  valence: /^(?:export )?(?:function|const) (VALENCE|VALENCES|HIGHER|OUTER|HIGHEST|PYRAMID_VALENCE|VALENCE_ELECTRONS|D_ORBITAL_VALENCE|NORMAL_VALENCES|BONDS_LEFT|CARRIERS|octetValence|SECOND_PERIOD)\b/,
  parity: /^(?:export )?(?:function|const) (parity|permutationParity)\b/,
  volume: /^(?:export )?(?:function|const) (drawnVolume|volumeSign|handedness|signedVolume)\b/,
  "stereo types": /^(?:export )?type (Tetrahedral|CisTrans|Axial|Cumulated|ConfiguredCentre|ConfiguredDouble|NumberingCentre|RingDouble|StereoElement|Configuration)\b/,
  "depth read": /^(?:export )?(?:function|const) (withRecognisedDepth|recogniseChair|recogniseHaworth)\b/,
  // Meno's rule for an aromatic ring (perception/aromatic.ts): no copy of it outside the core
  "aromatic rule": /^(?:export )?(?:function|const) (aromaticAtoms|piElectrons|MOST_PI)\b/,
  // an atom's hydrogens that are no atoms of their own, counted over its bonds (perception/hydrogens.ts `hydrogenCounts`)
  "hydrogen count": /^(?:export )?(?:function|const) (implicitOf|hydrogensOf|undrawnHydrogens|hydrogenCounts)\b/,
  // a plain hydrogen, the one test, and the one fold of them into the atoms they are on (perception/fold.ts)
  "plain hydrogen": /^(?:export )?(?:function|const) (isPlainH|plainH|plainHydrogen|plainHydrogenAtoms|hydrogensFolded|foldedOf)\b/,
  // other tests of a ring as aromatic, each its own by design - a ring drawn so, a ring flat in space - and none Meno's rule or its forms
  "aromatic tests": /^(?:export )?(?:function|const) (aromaticRing|aromaticBonds|isFlat)\b/,
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
  // valence tables: one count, one table (hydrogens and valence)
  { concept: "valence", file: "lib/figure/read.ts", name: "BONDS_LEFT", part: 12 },
  // the hydrogen count: each onto the core's one count, in its file's queue (the order's section 4)
  { concept: "hydrogen count", file: "lib/chem/stereoOpen.ts", name: "implicitOf", part: 12, why: "the core's hydrogenCounts as it stands, unflagged bonds: it is called through the core when stereoOpen.ts' queue reaches part 12" },
  { concept: "hydrogen count", file: "lib/chem/stereoOpen.ts", name: "hydrogensOf", part: 12, why: "implicitOf's count and the hydrogen atoms bonded: goes with implicitOf" },
  { concept: "hydrogen count", file: "lib/chem/protonation.ts", name: "hydrogensOf", part: 12, why: "a P and an S at their higher valences where the bonds pass the lower: part 12b" },
  { concept: "hydrogen count", file: "ui/features/Workspace/chem/drawing.ts", name: "undrawnHydrogens", part: 12, why: "a drawn atom's own valence first: part 12c" },
  // a plain hydrogen: each a variant for its own question, named, or onto the core's test in its file's queue
  { concept: "plain hydrogen", file: "lib/chem/substructure.ts", name: "isPlainH", part: 12, why: "a match ignores a map number (a named variant); takes a bridging H and one on a metal as plain, which the core's test does not: part 12c with those two fixes" },
  { concept: "plain hydrogen", file: "ui/features/Workspace/workflow/substituents.ts", name: "isPlainH", part: 12, why: "an option typed as H, not a drawn atom: an H, not D or T, with no charge - a question of its own: part 12c" },
  { concept: "plain hydrogen", file: "ui/features/Workspace/chem/engineLayout.ts", name: "plainH", part: 12, why: "an H with no chemistry, one on a metal too, which the core's test keeps an atom: onto the core's with that fix, its own change" },
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
  // depth recognised from a ring drawn in perspective: the reading is the core's; what asks it, by the layout's rings, is still the layout's
  { concept: "depth read", file: "lib/layout/recognised.ts", name: "withRecognisedDepth", part: 11, why: "code in motion: it finds rings by the layout's perceive, which the core may not import; it moves into perception/projection, now that the core has its rings, as a small change of its own" },
  { concept: "stereo types", file: "lib/layout/perceive.ts", name: "CisTrans", part: 14, why: "re-exported from the core, as Tetrahedral" },
  // tests of a ring as aromatic that are not Meno's rule nor its two forms (perception/aromatic.ts): each answers a question of its own
  { concept: "aromatic tests", file: "lib/chem/aromaticSides.ts", name: "aromaticRing", part: "stays", why: "display, by design: a ring drawn with its double bonds in turn, for the side its second lines are drawn on" },
  { concept: "aromatic tests", file: "lib/chem/contract.ts", name: "aromaticBonds", part: "stays", why: "by design, of a drawing: a six-ring drawn alternating, matched as a group's ring when Clean-up writes groups by their labels" },
  { concept: "aromatic tests", file: "lib/chem/reactionMap.ts", name: "aromaticBonds", part: "stays", why: "a use of the core's aromaticForm, not a rule: its bonds of order 4 as a set of atom pairs" },
  { concept: "aromatic tests", file: "lib/chem/ordersFromGeometry.ts", name: "isFlat", part: "stays", why: "from geometry, by design: a ring flat in space, where orders are read from 3D coordinates" },
  { concept: "aromatic tests", file: "lib/chem/protonation.ts", name: "isFlat", part: "stays", why: "by its bonds, by design: a five- or six-ring each of whose atoms has a multiple bond or is N, O or S - flat, for where an H goes; no count of electrons" },
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
  it("finds a new copy of a concept: a ring search, a metal list, a parity, a type for a centre, the aromatic rule, a hydrogen count, a plain hydrogen", () => {
    expect(declarationsIn("export function ringThrough(g, a) {}\nconst x = 1;\n", CONCEPTS.rings)).toEqual([{ name: "ringThrough", line: 1 }]);
    expect(declarationsIn("const METALS = new Set([]);\n", CONCEPTS.metals)).toEqual([{ name: "METALS", line: 1 }]);
    expect(declarationsIn("function parity(p: number[]) {}\n", CONCEPTS.parity)).toEqual([{ name: "parity", line: 1 }]);
    expect(declarationsIn("export type Tetrahedral = { volume: 1 | -1 };\n", CONCEPTS["stereo types"])).toEqual([{ name: "Tetrahedral", line: 1 }]);
    expect(declarationsIn("export function aromaticAtoms(rings, electrons) {}\nconst MOST_PIXELS = 1;\n", CONCEPTS["aromatic rule"])).toEqual([{ name: "aromaticAtoms", line: 1 }]);
    expect(declarationsIn("function implicitOf(atoms, bonds) {}\nconst hydrogensOfThem = 1;\n", CONCEPTS["hydrogen count"])).toEqual([{ name: "implicitOf", line: 1 }]);
    expect(declarationsIn("const isPlainH = (a) => a.el === 'H';\nconst plainHydrogens = 1;\n", CONCEPTS["plain hydrogen"])).toEqual([{ name: "isPlainH", line: 1 }]);
    expect(declarationsIn("function aromaticRing(ring) {}\nconst isFlatter = 1;\n", CONCEPTS["aromatic tests"])).toEqual([{ name: "aromaticRing", line: 1 }]);
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
