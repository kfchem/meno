import { EXAMINE_MS, MOST_ISOMERS } from "../../../../lib/chem/stereoOpen";
import type { Option, OptionValues } from "../../../../lib/options";
import type { ChemClient } from "../../../../lib/roles/client";
import { anyGroup, anyOpen, halvesMade, openStereo, StereoNotRead, stereoisomersOf } from "../chem/openStereo";
import { onBondSaid } from "../chem/groupHalves";
import { MADE_OF_ONE, type DrawnAnswer, type DrawnValue } from "./programs";

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
 * counted by Meno (chem/openStereo, chem/menoIsomers) and each made by
 * the plugin that makes stereoisomers (`chem`). Kept as drawn where
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
  const bonds = open.groups.onBonds.map(onBondSaid);
  const groupsNote = (lines: string[]): Record<string, DrawnValue> =>
    lines.length ? { stereo_groups: { value: lines.join("; "), unit: "none", method: "AND and OR groups (V3000 enhanced stereo), each turned as a whole" } } : {};
  // (what Meno's count says of what it made: those differing only at an axis, a cage it does not count - chem/menoIsomers)
  let counted: string[] = [];
  const note = (lines: string[] = bonds): { properties?: Record<string, DrawnValue> } => {
    const properties: Record<string, DrawnValue> = {
      ...(said ? { stereo_not_enumerated: { value: said, unit: "none" as const, method: "C=N bonds whose E/Z moves by tautomerism (InChI Technical Manual v1.04)" } } : {}),
      ...(counted.length ? { stereoisomers_said: { value: counted.join("; "), unit: "none" as const, method: "Meno's count of stereoisomers, each made whole in 3D" } } : {}),
      ...groupsNote(lines),
    };
    return Object.keys(properties).length ? { properties } : {};
  };
  const grouped = anyGroup(open);
  if (!anyOpen(open.left) && !grouped) return { as: "drawn", ...note() };
  if (open.left.cumulenes.length) return { aside: "an allene's axis left open, which a drawing in 2D cannot give", kind: "axis" };
  // (set aside is for stereo left open: a group's halves, drawn as such, are made)
  const aside = options.open === "aside" && anyOpen(open.left);
  // (a request's own two minutes past the time it is given: the plugin looks at the time between its tries, never within one)
  const made = await stereoisomersOf(chem, molblocks, open, { most, whole: true, withinMs: within * 1000, drawings: !aside }, within * 1000 + 2 * 60_000);
  if ("tooMany" in made) return { aside: `more than the ${most} stereoisomers made of one (up to ${made.tooMany.bound})`, kind: "too many" };
  if ("tooLong" in made) return { aside: `took more than ${within} s to examine`, kind: "too long" };
  counted = made.said ?? [];
  const sorted = [...made.isomers].sort((p, q) => (p.smiles < q.smiles ? -1 : p.smiles > q.smiles ? 1 : 0));
  // (of a structure with groups: its halves, in Meno's order - each that is left open by SMILES, within it the half as drawn first -
  //  what is said of them on each: chem/groupHalves)
  const halves = grouped ? halvesMade(open, molblocks, sorted) : null;
  const ordered = halves ? halves.made.map((h) => h.isomer) : sorted;
  const lines = halves ? [...(halves.made.some((h) => h.half) ? [`in order: ${halves.made.map((h) => h.half?.plain).join("; ")}`] : []), ...halves.said, ...bonds] : bonds;
  if (ordered.length <= 1) return { as: "drawn", ...note(halves ? [...halves.said, ...bonds] : bonds) };
  if (aside) return { aside: `stereo left open: ${ordered.length} stereoisomers`, kind: "stereo open" };
  // (an adduct's drawing that cannot be written back as drawn: set aside, in the plugin's words)
  const failed = ordered.find((i) => i.error != null || i.molblock == null);
  if (failed) return { aside: failed.error ?? "what it was made into could not be drawn", kind: "drawing" };
  // (each with the configuration the plugin made it with, where it sends it: Meno lays its drawing out from that, not from its wedges)
  return {
    made: ordered.map((i) => i.molblock!),
    smiles: ordered.map((i) => i.smiles),
    ...(ordered.some((i) => i.configuration) ? { configurations: ordered.map((i) => i.configuration) } : {}),
    ...note(lines),
  };
}
