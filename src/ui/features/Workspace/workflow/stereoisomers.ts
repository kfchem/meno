import { EXAMINE_MS, MOST_ISOMERS } from "../../../../lib/chem/stereoOpen";
import type { Option, OptionValues } from "../../../../lib/options";
import type { ChemClient } from "../../../../lib/roles/client";
import { anyOpen, openStereo, StereoNotRead, stereoisomersOf } from "../chem/openStereo";
import { MADE_OF_ONE, type DrawnAnswer } from "./programs";

/**
 * *Stereoisomers*' options, Meno's: what is done with a structure that
 * leaves stereo open, and its two bounds - how many stereoisomers one may
 * be made into (lib/chem/stereoOpen `MOST_ISOMERS`, its basis there; up to
 * the most a step on structures drawn makes of one, workflow/programs
 * `MADE_OF_ONE`) and how long one is looked at (`EXAMINE_MS`; up to ten
 * minutes, the most a step on structures drawn waits at once).
 */
export const STEREO_OPTIONS: readonly Option[] = [
  { id: "open", label: "Stereo left open", type: "choice", choices: [{ value: "every", label: "Every stereoisomer" }, { value: "aside", label: "Set aside" }], default: "every" },
  { id: "most", label: "At most", type: "number", default: MOST_ISOMERS, min: 1, max: MADE_OF_ONE, step: 1 },
  { id: "within", label: "Time for one", type: "number", default: EXAMINE_MS / 1000, min: 1, max: 600, step: 1, unit: "s" },
];

/**
 * *Stereoisomers* on one structure - its parts' MOL blocks, read as one -
 * asked of the plugin that finds stereoisomers (`chem`; `program`, the
 * toolkit it runs, named where it alone failed). Kept as drawn where
 * nothing is left open, or nothing it leaves open can go more than one way
 * in 3D (a bridgehead its rings fix; a strained cage none of whose forms
 * holds); else each stereoisomer that can be made in 3D, every open
 * stereocentre and double bond given, as a drawing, in a fixed order - by
 * its SMILES - or, the option says so, set aside. An allene's axis left
 * open is always set aside (no stereoisomer of it is given), and so is one
 * with more stereoisomers than `most`, whole: never some of them. One not
 * looked at within its time is set aside alone. A C=N whose E/Z is none of
 * its own is never enumerated, and said so on what it gives.
 */
export async function stereoisomersAnswer(chem: ChemClient, molblocks: readonly string[], options: OptionValues, program: string): Promise<DrawnAnswer> {
  const most = Number(options.most ?? MOST_ISOMERS);
  const within = Number(options.within ?? EXAMINE_MS / 1000);
  let open;
  try {
    open = await openStereo(chem, molblocks, undefined, program);
  } catch (e) {
    if (!(e instanceof StereoNotRead)) throw e;
    return { aside: e.message, kind: e.problem != null ? "valence" : "unreadable" };
  }
  const said = open.drawn.said;
  const note = said ? { properties: { stereo_not_enumerated: { value: said, unit: "none" as const, method: "C=N bonds whose E/Z moves by tautomerism (InChI Technical Manual v1.04)" } } } : {};
  if (!anyOpen(open.left)) return { as: "drawn", ...note };
  if (open.left.cumulenes.length) return { aside: "an allene's axis left open, which a drawing in 2D cannot give", kind: "axis" };
  const aside = options.open === "aside";
  // (a request's own two minutes past the time it is given: the plugin looks at the time between its tries, never within one)
  const made = await stereoisomersOf(chem, molblocks, open, { most, whole: true, withinMs: within * 1000, drawings: !aside }, within * 1000 + 2 * 60_000);
  if ("tooMany" in made) return { aside: `more than the ${most} stereoisomers made of one (up to ${made.tooMany.bound})`, kind: "too many" };
  if ("tooLong" in made) return { aside: `took more than ${within} s to examine`, kind: "too long" };
  if (made.isomers.length <= 1) return { as: "drawn", ...note };
  if (aside) return { aside: `stereo left open: ${made.isomers.length} stereoisomers`, kind: "stereo open" };
  const sorted = [...made.isomers].sort((p, q) => (p.smiles < q.smiles ? -1 : p.smiles > q.smiles ? 1 : 0));
  // (an adduct's drawing that cannot be written back as drawn: set aside, in the plugin's words)
  const failed = sorted.find((i) => i.error != null || i.molblock == null);
  if (failed) return { aside: failed.error ?? "what it was made into could not be drawn", kind: "drawing" };
  return { made: sorted.map((i) => i.molblock!), smiles: sorted.map((i) => i.smiles), ...note };
}
