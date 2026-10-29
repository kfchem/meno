/**
 * The kinds of step Meno defines (docs/WORKFLOWS.md, *Kinds of step*):
 * what each takes and gives, what it is called and drawn as, and its
 * options where Meno does it. Plugins fill kinds; they bring none of their
 * own.
 */
import { deltaOf, levelsTyped } from "../../../../lib/energyDiagram";
import { numberText } from "../../../../lib/calc/results";
import { shownOptions, type Option, type OptionValues } from "../../../../lib/options";
import type { SetKind, StepKind, ValueKind } from "../../../../lib/plugins/steps";
import { renderOptions } from "../render/renderOptions";
import { takeFramesHow, type Which } from "./takeFrames";
import { joinHow, joinNeeds } from "./joinStep";
import { conditionsIn, conditionText, filterNeeds } from "../../../../lib/nodes/filter";
import { tagNeeds } from "../../../../lib/nodes/tag";
import { measurementName, measurementsTyped } from "../../../../lib/steps/measure";
import { atomsFromOne } from "../../../../lib/steps/compareBonding";
import { speciesNeeds, speciesTyped } from "../../../../lib/steps/species";
import { listsReadAs, readLists } from "./enumerate";
import { groupsReadAs, NO_POSITIONS, positionIds, readGroups } from "./substituents";

/** What flows along a wire, and the kinds of step, by id: as plugins' manifests name them (lib/plugins/steps). */
export type { SetKind, StepKind, ValueKind };

/** The kinds of set whose entries are molecules in 3D: all but structures drawn. */
export type Holds3D = Exclude<SetKind, "structures">;

/** What a set may hold: what flows along a wire - or a chart (Meno's *Chart*, *Energy diagram*) or pictures (a Render step's), which none takes. */
export type SetHolds = ValueKind | "chart" | "pictures";

/** Whether a set holds a kind of set - structures, molecules, conformers - which the steps that work on entries take: not a table, a number, a chart or pictures. */
export const isSetKind = (h: string): h is SetKind => h === "structures" || h === "molecules" || h === "conformers";

/**
 * Whether what a set holds goes into a port that takes `takes`: one of
 * them - or molecules or conformer sets into a port that takes a table,
 * seen as one (FOUNDATION: the one view that loses nothing; lib/table
 * `moleculesAsTable`). Nothing else stands for anything else: a number is
 * no table, and a table no molecules.
 */
export function takenBy(takes: readonly ValueKind[], holds: ValueKind): boolean {
  return takes.includes(holds) || (takes.includes("table") && (holds === "molecules" || holds === "conformers"));
}

/** Which icon a kind has (workflow/icons: QuickAdd, a step's card): a stack, a trend downwards, a bolt, a signal, a cloud, a picture, a funnel, two squares, bars, shapes grouped, a pointer choosing, sparks, sliders set, a chart, levels, a tag, a plus in a circle (a charge), a link, arrows apart (a measure), two tables linked (a join). */
export type StepIcon = "rings" | "curve" | "level" | "wave" | "cloud" | "picture" | "band" | "check" | "twins" | "copies" | "bars" | "list" | "grouped" | "fan" | "pointer" | "sparks" | "sliders" | "chart" | "levels" | "tag" | "charge" | "link" | "span" | "merge" | "rebond" | "compare" | "frames" | "join";

/**
 * An input a kind takes (docs/WORKFLOWS-FOUNDATION.md, *Steps, ports and
 * exits*): named, and taking the kinds of set it does. Most kinds take one;
 * a kind that takes two or three names each - *start* and *end*, *geometry*
 * and *bonding* - and says on itself which property its entries are matched
 * on, so that nothing is matched by an implicit rule.
 */
export type StepPort = {
  id: string;
  name: string;
  takes: readonly ValueKind[];
  /** It reads what comes in as a table (lib/table `moleculesAsTable`) - each molecule as it is, a conformer set's frames its conformers - not as a step's entries: a set mixing conformer sets with other molecules goes in (`readsAsTable`). */
  asTable?: true;
};

/**
 * An exit a kind gives. Every exit is a result set of its own, made with the
 * step and empty until it runs, each drawn under the one before it. `of`
 * marks the exit for what a step set aside or could not do, drawn with its
 * count: nothing is hidden, and it can be wired on. A kind has at most one
 * such exit; its other exits each give something of their own (a
 * Reaction's bond changes, a table).
 */
export type StepExit = { id: string; name: string; gives: ValueKind | "chart" | "same" | "pictures"; of?: "rest" | "failed" };

/** The one input a kind takes where it declares none of its own. */
export const ONE_INPUT = "in";
/** The exit a kind gives where it declares none of its own. */
export const ONE_EXIT = "out";

export type KindInfo = {
  kind: StepKind;
  name: string;
  icon: StepIcon;
  /** What it takes: kinds of set, a table, a number. */
  takes: readonly ValueKind[];
  /** What it gives, for what it took: `same`, the kind of set that came in; a chart (Meno's), or `pictures` (Render's), which no step takes. */
  gives: ValueKind | "chart" | "same" | "pictures";
  /** Whether it runs a program (a plugin's) or works on entries alone. */
  runs: "program" | "entries";
  /** Its options, where Meno does it. */
  options?: readonly Option[];
  /** What must be known of its entries before it runs, where something must: which stereoisomer each is (`configurations`, workflow/configurations) - asked of the plugin that perceives it, every entry its own. */
  perceives?: "configurations";
  /** Where it needs them known only with some options: whether these do (Duplicates' mirror images counted in). Unsaid, always. */
  perceivesWith?: (v: OptionValues) => boolean;
  /** Meno's own choices for a kind a plugin does, whoever does it, before the plugin's (Render's: a picture's size and shape, and what its molecules and surfaces are made of). */
  own?: readonly Option[];
  /** What its result set is called; `{id}`, an option's value. */
  made: string;
  /** Its inputs, where it takes more than one, or names the one it takes otherwise than `ONE_INPUT`. */
  inputs?: readonly StepPort[];
  /** Its exits beyond the first, which is `made`, in order: entries it sets aside (*rest*), or could not do (*failed*) - at most one such - and anything else it gives. */
  others?: readonly StepExit[];
  /** How it does its work, in a line, from its options' values - where Meno does it and says it its own way (howOf). */
  how?: (values: Record<string, string | number | boolean>) => string;
  /** What it still needs of its options before it can run, where it cannot as they are: said on its card where *Ready* would be (`needsOf`), as its run would refuse. */
  needs?: (values: Record<string, string | number | boolean>) => string | undefined;
  /** Whether a plugin doing it needs whole molecules - their hydrogens there, their charge and spin known (lib/chem/skeleton): a skeleton is refused before anything is sent to it. */
  whole?: true;
};

/**
 * A program step's second exit (workflow/failures): each entry it could not
 * do, with why - as it came in, or as far as it came (an optimisation that
 * did not converge, its last geometry) - in plain view, and wired on to try
 * again. What it holds is what came in (`same`); a conformer search's, the
 * molecules it could search no conformers of.
 */
const FAILED: StepExit = { id: "failed", name: "Failed", gives: "same", of: "failed" };

export const KINDS: readonly KindInfo[] = [
  // (new structures from nothing that comes in: a generative model's, as its plugin asks it, each drawn from the SMILES it gave - no input, so no port)
  { kind: "generate", name: "Generate", icon: "sparks", takes: [], inputs: [], gives: "structures", runs: "program", made: "Generated" },
  { kind: "conformers", name: "Conformers", icon: "rings", takes: ["structures", "molecules", "conformers"], gives: "conformers", runs: "program", made: "Conformers", whole: true, others: [{ ...FAILED, gives: "molecules" }] },
  { kind: "optimise", name: "Optimise", icon: "curve", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Optimised", whole: true, others: [FAILED] },
  { kind: "energy", name: "Energy", icon: "level", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Energies", whole: true, others: [FAILED] },
  { kind: "frequencies", name: "Frequencies", icon: "wave", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Frequencies", whole: true, others: [FAILED] },
  // (non-covalent interactions: each molecule with a surface coloured by how they attract or repel - docs/NCI.md)
  { kind: "nci", name: "NCI", icon: "cloud", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Non-covalent interactions", whole: true, others: [FAILED] },
  // (each entry a picture of its own, in a set of pictures - docs/RENDER.md, *Render as a step*)
  { kind: "render", name: "Render", icon: "picture", takes: ["molecules", "conformers"], gives: "pictures", runs: "program", made: "Rendered", own: renderOptions("picture", [], true) },
  {
    kind: "energy-window",
    name: "Energy window",
    icon: "band",
    takes: ["conformers"],
    gives: "conformers",
    runs: "entries",
    made: "Within {window} kcal/mol",
    others: [{ id: "rest", name: "Outside it", gives: "same", of: "rest" }],
    options: [{ id: "window", label: "Within", type: "number", default: 3, min: 0, step: 0.5, unit: "kcal/mol" }],
  },
  {
    kind: "duplicates",
    name: "Duplicates",
    // (a plugin's comparison, of whole molecules - Meno's own, of shapes alone, takes a skeleton)
    whole: true,
    icon: "copies",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Unlike",
    others: [{ id: "rest", name: "Alike", gives: "same", of: "rest" }],
    // (alike: the one definition of the same conformer, workflow/sameConformer - no threshold of its own; the
    //  maintainer, 2026-10-21. A conformer's mirror image, in an achiral molecule: kept apart by default - an atom's
    //  average over both needs both - or counted in, its degeneracy 2 and the atoms it swaps kept: 2026-10-22)
    options: [
      {
        id: "mirrors",
        label: "Mirror images",
        type: "choice",
        choices: [
          { value: "apart", label: "Kept apart" },
          { value: "counted", label: "Counted in (degeneracy 2)" },
        ],
        default: "apart",
      },
    ],
    perceives: "configurations",
    perceivesWith: (v) => v.mirrors === "counted",
  },
  {
    kind: "populations",
    name: "Populations",
    icon: "bars",
    takes: ["conformers"],
    gives: "conformers",
    runs: "entries",
    made: "Populations at {temperature} K",
    perceives: "configurations",
    options: [{ id: "temperature", label: "At", type: "number", default: 298.15, min: 1, step: 1, unit: "K" }],
  },
  {
    // (entries kept by conditions on their properties, each with its unit - lib/nodes/filter - the rest out of the second exit, each saying why)
    kind: "filter",
    name: "Filter",
    icon: "sliders",
    // (molecules in 3D by their entries' properties; structures drawn by their records')
    takes: ["molecules", "conformers", "structures"],
    gives: "same",
    runs: "entries",
    made: "Filtered",
    others: [{ id: "rest", name: "The rest", gives: "same", of: "rest" }],
    options: [
      { id: "conditions", label: "Conditions", type: "text", default: "" },
      {
        id: "match",
        label: "Kept where",
        type: "choice",
        choices: [
          { value: "all", label: "All are met" },
          { value: "any", label: "Any is met" },
        ],
        default: "all",
      },
    ],
    how: (v) => filterHow(String(v.conditions ?? ""), v.match === "any" ? "any" : "all"),
    needs: (v) => filterNeeds(String(v.conditions ?? "")),
  },
  {
    // (from molecules with frames - a path, an optimisation's way down, a scan - the frames asked for, each a molecule of its one geometry)
    kind: "take-frames",
    name: "Take frames",
    icon: "frames",
    takes: ["molecules"],
    gives: "molecules",
    runs: "entries",
    made: "Frames",
    options: [
      {
        id: "which",
        label: "Take",
        type: "choice",
        choices: [
          { value: "highest", label: "The highest in energy" },
          { value: "first", label: "The first" },
          { value: "last", label: "The last" },
          { value: "entry", label: "Its entry frame" },
          { value: "around", label: "The highest, and either side" },
        ],
        default: "highest",
      },
      { id: "either", label: "Either side", type: "number", default: 1, min: 1, step: 1, when: { id: "which", in: ["around"] } },
    ],
    how: (v) => takeFramesHow((v.which as Which) ?? "highest", Number(v.either ?? 1)),
  },
  { kind: "as-conformers", name: "As conformers", icon: "grouped", takes: ["molecules"], gives: "conformers", runs: "entries", made: "Conformers", perceives: "configurations" },
  {
    kind: "choose",
    name: "Choose one",
    icon: "pointer",
    takes: ["conformers"],
    gives: "molecules",
    runs: "entries",
    made: "Chosen",
    others: [{ id: "rest", name: "The rest", gives: "conformers", of: "rest" }],
    options: [
      {
        id: "which",
        label: "Which",
        type: "choice",
        choices: [
          { value: "lowest", label: "Lowest in energy" },
          { value: "number", label: "By its number" },
        ],
        default: "lowest",
      },
      { id: "number", label: "Its number", type: "number", default: 1, min: 1, step: 1 },
    ],
    how: (v) => (v.which === "number" ? `Number ${v.number}` : "Lowest in energy"),
  },
  // (structures drawn looked over as they are, each kept as drawn or set aside saying why: never one changed - a plugin's, its options its own)
  {
    kind: "check-structures",
    name: "Check structures",
    icon: "check",
    takes: ["structures"],
    gives: "structures",
    runs: "program",
    made: "Checked",
    others: [{ id: "rest", name: "Set aside", gives: "structures", of: "rest" }],
  },
  // (each structure drawn that leaves stereo open as each of its stereoisomers, or set aside: a plugin's, its options its own)
  {
    kind: "stereoisomers",
    name: "Stereoisomers",
    icon: "twins",
    takes: ["structures"],
    gives: "structures",
    runs: "program",
    made: "Stereoisomers",
    others: [{ id: "rest", name: "Set aside", gives: "structures", of: "rest" }],
  },
  // (each structure drawn with numbers worked out of it as drawn - its molecular weight, logP and the like - on its record: a plugin's)
  {
    kind: "descriptors",
    name: "Descriptors",
    icon: "list",
    takes: ["structures"],
    gives: "structures",
    runs: "program",
    made: "With descriptors",
    others: [{ id: "rest", name: "Set aside", gives: "structures", of: "rest" }],
  },
  // (structures made from one drawing by rule, its R groups each given a list - Meno's own: docs/WORKFLOWS-FOUNDATION.md, *Enumerate*)
  {
    kind: "enumerate",
    name: "Enumerate",
    icon: "fan",
    takes: ["structures"],
    gives: "structures",
    runs: "entries",
    made: "Made",
    inputs: [{ id: ONE_INPUT, name: "Template", takes: ["structures"] }],
    others: [{ id: "rest", name: "Aside", gives: "same", of: "rest" }],
    options: [
      {
        id: "way",
        label: "By",
        type: "choice",
        default: "rgroups",
        choices: [
          { value: "rgroups", label: "R groups" },
          { value: "substituents", label: "Substituents" },
        ],
      },
      {
        id: "lists",
        label: "R groups",
        type: "lines",
        default: "R1:\n",
        rows: 6,
        note: "Each R and its groups, as R1: Me, Et",
        when: { id: "way", in: ["rgroups"] },
        // (read as the step runs them, beside each line - asked when shown: the reader is the canvas's)
        readAs: (text) => listsReadAs(text),
      },
      // (substituents: atoms chosen on the drawing, one list of groups, and how the positions combine - docs/WORKFLOWS-FOUNDATION.md, *Substituent swap*)
      { id: "positions", label: "Positions", type: "atoms", default: "", when: { id: "way", in: ["substituents"] } },
      {
        id: "groups",
        label: "Groups, one to a line",
        type: "lines",
        default: "",
        rows: 6,
        when: { id: "way", in: ["substituents"] },
        readAs: (text) => groupsReadAs(text),
      },
      {
        id: "combine",
        label: "Combine",
        type: "choice",
        default: "one",
        when: { id: "way", in: ["substituents"] },
        choices: [
          { value: "one", label: "One at a time" },
          { value: "together", label: "Together" },
        ],
      },
    ],
    how: (v) => {
      if (v.way === "substituents") {
        const positions = positionIds(String(v.positions ?? "")).length;
        const groups = String(v.groups ?? "").split(/\r?\n/).filter((l) => l.trim()).length;
        if (!positions) return "No positions yet";
        return `${positions} position${positions === 1 ? "" : "s"} \u00d7 ${groups} group${groups === 1 ? "" : "s"}, ${v.combine === "together" ? "together" : "one at a time"}`;
      }
      const { lists } = readLists(String(v.lists ?? ""));
      return lists.size ? [...lists].map(([n, o]) => `R${n} \u00b7 ${o.length}`).join(", ") : NO_LISTS;
    },
    needs: (v) => enumerateNeeds(v),
  },
  {
    kind: "chart",
    name: "Chart",
    icon: "chart",
    // (a table - or molecules, seen as one: lib/table moleculesAsTable; or structures drawn, seen as one: structuresTable)
    takes: ["table", "structures"],
    gives: "chart",
    runs: "entries",
    made: "Chart",
    options: [
      { id: "x", label: "Across", type: "text", default: "" },
      { id: "y", label: "Up", type: "text", default: "" },
    ],
    how: (v) => (v.x || v.y ? `${v.y || "the second column of numbers"} against ${v.x || "the first"}` : "The first two columns of numbers"),
  },
  {
    // (docs/WORKFLOWS.md, *Energy diagrams*: each level a molecule's name, at its lowest, relative to one - joined as a table says, or each to the next)
    kind: "energy-diagram",
    name: "Energy diagram",
    icon: "levels",
    takes: ["molecules", "conformers", "table"],
    gives: "chart",
    runs: "entries",
    made: "Energy diagram",
    inputs: [
      { id: "levels", name: "Levels", takes: ["molecules", "conformers"], asTable: true },
      { id: "connects", name: "Connects", takes: ["table"] },
    ],
    // (on its card, each a list of what comes into Levels - its energies, its levels: workflow/diagramOptions)
    options: [
      { id: "quantity", label: "Energy", type: "text", default: "energy" },
      { id: "levels", label: "Levels, in order", type: "lines", default: "", rows: 3, note: "Rename one by writing = and the name after it, as R = HCN" },
      { id: "reference", label: "Relative to", type: "text", default: "" },
    ],
    how: (v) => `${deltaOf(String(v.quantity || "energy"))}, relative to ${shownAs(String(v.levels ?? ""), String(v.reference ?? "")) || "the first"}`,
  },
  // (Meno's steps on structures - docs/STRUCTURE-STEPS.md - each on a set's entries as Meno's entry records, workflow/structureSteps)
  {
    // (each entry given an ID of its own under the name given, which rides along with every entry made from it: two inputs are matched on it later)
    kind: "tag",
    name: "Tag",
    icon: "tag",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Tagged",
    options: [{ id: "name", label: "Name", type: "text", default: "" }],
    how: (v) => tagNeeds(String(v.name ?? "")) ?? `Each its own ${String(v.name).trim()}`,
    needs: (v) => tagNeeds(String(v.name ?? "")),
  },
  {
    // (each entry's charge and multiplicity set - one left blank as each has it - those whose electrons cannot have them out of Failed, saying why)
    kind: "species",
    name: "Species",
    icon: "charge",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "With species",
    others: [FAILED],
    options: [
      { id: "charge", label: "Charge", type: "text", default: "" },
      { id: "multiplicity", label: "Multiplicity (blank: each entry's own)", type: "text", default: "" },
    ],
    how: (v) => speciesHow(String(v.charge ?? ""), String(v.multiplicity ?? "")),
    needs: (v) => speciesNeeds(String(v.charge ?? ""), String(v.multiplicity ?? "")),
  },
  {
    // (the entries, in the set's order, as one entry - a complex - each part where it stands; none of a part's properties carried, each named)
    kind: "combine",
    name: "Combine",
    icon: "link",
    takes: ["molecules"],
    gives: "molecules",
    runs: "entries",
    made: "Combined",
    how: () => "In the set's order, as one complex",
  },
  {
    // (distances, angles and dihedrals between atoms numbered from 1, as the card and the 3D view show them, on each entry as properties)
    kind: "measure",
    name: "Measure",
    icon: "span",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Measured",
    options: [{ id: "measurements", label: "Atoms, from 1 (3-7, 1-2-3, 1-2-3-4)", type: "text", default: "" }],
    how: (v) => measureHow(String(v.measurements ?? "")),
    needs: (v) => {
      const typed = measurementsTyped(String(v.measurements ?? ""));
      return "why" in typed ? typed.why : undefined;
    },
  },
  {
    // (two sets of one kind made one, First's then Second's - all, or one of each value of a property - the rest out of the second exit, each naming the one kept)
    kind: "merge",
    name: "Merge",
    icon: "merge",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Merged",
    inputs: [
      { id: "first", name: "First", takes: ["molecules", "conformers"] },
      { id: "second", name: "Second", takes: ["molecules", "conformers"] },
    ],
    others: [{ id: "rest", name: "The rest", gives: "same", of: "rest" }],
    options: [
      {
        id: "keep",
        label: "Keep",
        type: "choice",
        choices: [
          { value: "all", label: "All" },
          { value: "one", label: "One of each" },
        ],
        default: "all",
      },
      { id: "property", label: "Of each", type: "text", default: "", when: { id: "keep", in: ["one"] } },
    ],
    how: (v) => (v.keep === "one" ? (String(v.property ?? "").trim() ? `First's, then Second's: one of each ${String(v.property).trim()}` : "Name the property to keep one of each") : "First's, then Second's: all"),
    needs: (v) => (v.keep === "one" && !String(v.property ?? "").trim() ? "Name the property to keep one of each" : undefined),
  },
  {
    // (each geometry given a bonding entry's bonds and charges - each with each, or paired on a property - those that cannot be out of the second exit, saying why)
    kind: "rebond",
    name: "Re-bond",
    icon: "rebond",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Re-bonded",
    inputs: [
      { id: "geometry", name: "Geometry", takes: ["molecules", "conformers"] },
      { id: "bonding", name: "Bonding", takes: ["molecules", "conformers"] },
    ],
    others: [{ id: "rest", name: "Not re-bonded", gives: "same", of: "rest" }],
    options: [
      {
        id: "pairs",
        label: "Pairs",
        type: "choice",
        choices: [
          { value: "each", label: "Each with each" },
          { value: "property", label: "Matched on" },
        ],
        default: "each",
      },
      { id: "property", label: "Property", type: "text", default: "", when: { id: "pairs", in: ["property"] } },
    ],
    how: (v) => (v.pairs === "property" ? (String(v.property ?? "").trim() ? `Paired on ${String(v.property).trim()}` : "Name the property to pair them on") : "Each geometry with each bonding"),
    needs: (v) => (v.pairs === "property" && !String(v.property ?? "").trim() ? "Name the property to pair them on" : undefined),
  },
  {
    // (whether each geometry is bonded as its reference - paired on a property, or against each, the match named - the same out of the first exit, the rest with their differences out of the second)
    kind: "compare-bonding",
    name: "Compare bonding",
    icon: "compare",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Same",
    inputs: [
      { id: "molecules", name: "Molecules", takes: ["molecules", "conformers"] },
      { id: "reference", name: "Reference", takes: ["molecules", "conformers"] },
    ],
    others: [{ id: "rest", name: "Different", gives: "same", of: "rest" }],
    options: [
      {
        id: "reference",
        label: "Against",
        type: "choice",
        choices: [
          { value: "each", label: "Each reference" },
          { value: "property", label: "Matched on" },
        ],
        default: "each",
      },
      { id: "property", label: "Property", type: "text", default: "", when: { id: "reference", in: ["property"] } },
      { id: "writes", label: "The match as", type: "text", default: "matches", when: { id: "reference", in: ["each"] } },
      { id: "from", label: "Its value of (blank: its number)", type: "text", default: "", when: { id: "reference", in: ["each"] } },
      { id: "rs", label: "R or S too", type: "switch", default: false },
      { id: "ez", label: "E or Z too", type: "switch", default: false },
      { id: "atoms", label: "Pass over atoms, from 1", type: "text", default: "" },
      { id: "elements", label: "Pass over elements", type: "text", default: "" },
    ],
    how: (v) => compareHow(v),
    needs: (v) => compareNeeds(v),
  },
  {
    // (Onto's entries with properties of From's put on, matched on a property both carry - lib/nodes/join - each record as it was; those with nothing put on out of the second exit, each saying why)
    kind: "join",
    name: "Join",
    icon: "join",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Joined",
    inputs: [
      { id: "onto", name: "Onto", takes: ["molecules", "conformers"] },
      { id: "from", name: "From", takes: ["molecules", "conformers"] },
    ],
    others: [{ id: "rest", name: "Not joined", gives: "same", of: "rest" }],
    options: [
      { id: "on", label: "Matched on", type: "text", default: "" },
      { id: "carry", label: "Put on", type: "text", default: "" },
    ],
    how: (v) => joinHow(v),
    needs: (v) => joinNeeds(v),
  },
];

/** What an Enumerate with no lists says: on its card, as how it works and where it would say *Ready*. */
const NO_LISTS = "No lists yet";

/**
 * What an Enumerate step still needs of its options before it can run - as
 * its run would say it, of its options alone (its template is its input's,
 * looked at as it runs): by R groups, lists - and each read, no R listed
 * twice, none empty (enumerate `readLists`); by substituents, positions
 * chosen, and groups, each read (substituents `readGroups`). Nothing, where
 * its options are all there.
 */
export function enumerateNeeds(v: Record<string, string | number | boolean>): string | undefined {
  if (v.way === "substituents") {
    if (!positionIds(String(v.positions ?? "")).length) return NO_POSITIONS;
    return readGroups(String(v.groups ?? "")).problems[0];
  }
  const { lists, problems } = readLists(String(v.lists ?? ""));
  return lists.size ? problems[0] : NO_LISTS;
}

/** A level of an energy diagram by the name *Levels* shows it by, where it gives one (lib/energyDiagram `levelsTyped`); as it is named, else. */
function shownAs(levels: string, name: string): string {
  return levelsTyped(levels).find((l) => l?.of === name)?.as ?? name;
}

/** How a Species step does its work, in a line: what it sets, and what it leaves as each entry has it. */
export function speciesHow(charge: string, multiplicity: string): string {
  const needs = speciesNeeds(charge, multiplicity);
  const typed = speciesTyped(charge, multiplicity);
  if (needs != null || "why" in typed) return needs ?? "";
  const { charge: c, multiplicity: m } = typed.given;
  // (one left blank stays as each entry has it - the one its electrons take, where it was never given: lib/steps species)
  const said = [c != null ? `charge ${c > 0 ? `+${c}` : c}` : "its own charge", m != null ? `multiplicity ${m}` : "its own multiplicity"];
  return said.join(", ").replace(/^./, (x) => x.toUpperCase());
}

/** How a Measure step does its work, in a line: its measurements as typed, or why they do not read. */
export function measureHow(text: string): string {
  const typed = measurementsTyped(text);
  return "why" in typed ? typed.why : typed.atoms.map(measurementName).join(", ");
}

/** How a Filter step does its work, in a line: its conditions as read, and whether all or any - or why they do not read, or that there are none. */
export function filterHow(text: string, match: "all" | "any"): string {
  const needs = filterNeeds(text);
  const read = conditionsIn(text);
  if (needs != null || "why" in read) return needs ?? "";
  return read.conditions.map(conditionText).join(match === "any" ? " or " : " and ");
}

export const kindInfo = (kind: StepKind): KindInfo => KINDS.find((k) => k.kind === kind)!;
/** What step `s` still needs of its options before it can run (`KindInfo.needs`), where Meno does it; nothing, where it can run as it is. */
export const needsOf = (s: { kind: StepKind; options?: Record<string, string | number | boolean> }): string | undefined => {
  const info = kindInfo(s.kind);
  return info.needs?.(optionsOf(info.options ?? [], s.options));
};

/** Whether a step of `kind` takes a set that holds `holds`. */
export const takes = (kind: StepKind, holds: ValueKind): boolean => takenBy(kindInfo(kind).takes, holds);

/** The kinds Meno does itself (docs/WORKFLOWS.md, *Who does a step*): those on entries alone. */
export const MENO_DOES: readonly StepKind[] = KINDS.filter((k) => k.runs === "entries").map((k) => k.kind);

/** A step's options' values, its own over the defaults of the options it takes (doers `optionsFor`). */
export function optionsOf(options: readonly Option[], own: Record<string, string | number | boolean> | undefined): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {};
  for (const o of options) values[o.id] = own?.[o.id] ?? o.default;
  return values;
}

/** What a step's result set is called, its options' values put in. */
export function madeName(kind: StepKind, options: readonly Option[], own: Record<string, string | number | boolean> | undefined): string {
  const values = optionsOf(options, own);
  return kindInfo(kind).made.replace(/\{([a-z0-9-]+)\}/g, (_, id: string) => String(values[id] ?? ""));
}

/** How a step does its work, in a line: each option that applies (`shownOptions`) by its value, a number with its unit, a choice by its name - one of none, and a number that sets nothing (its `unset`), left out; or as `said` says it (a kind's `how`, where Meno does it). */
export function howOf(
  options: readonly Option[],
  own: Record<string, string | number | boolean> | undefined,
  said?: KindInfo["how"],
): string {
  const values = optionsOf(options, own);
  if (said) return said(values);
  return shownOptions(options, values)
    .flatMap((o) => {
      const v = values[o.id];
      if (o.type === "number") return o.unset !== undefined && v === o.unset ? [] : [`${typeof v === "number" ? numberText(v) : v}${o.unit ? ` ${o.unit}` : ""}`];
      if (o.type === "choice") return v === "none" ? [] : [o.choices.find((c) => c.value === v)?.label ?? String(v)];
      if (o.type === "switch") return v ? [o.label] : [];
      return v ? [String(v)] : [];
    })
    .join(" · ");
}

/**
 * The inputs a kind takes, named: its own where it declares them, else the
 * one input `ONE_INPUT`, taking what the kind takes.
 */
export function inputsOf(kind: StepKind): readonly StepPort[] {
  const info = kindInfo(kind);
  return info.inputs ?? [{ id: ONE_INPUT, name: "In", takes: info.takes }];
}

/**
 * The exits a kind gives, in order: its first, which `made` names and
 * `gives` fills, then its others where it has any.
 */
export const exitsOf = (kind: StepKind): readonly StepExit[] => exitsIn(kindInfo(kind));

/** The exits a kind's description declares (`exitsOf`). */
export function exitsIn(info: Pick<KindInfo, "made" | "gives" | "others">): readonly StepExit[] {
  return [{ id: ONE_EXIT, name: info.made, gives: info.gives }, ...(info.others ?? [])];
}

/** The exit of `kind` for what it sets aside or could not do (`StepExit.of`); none where it has none. */
export const asideExit = (kind: StepKind): StepExit | undefined => asideIn(exitsOf(kind));

/** Of `exits`, the one for what a step sets aside or could not do: the first marked so. */
export const asideIn = (exits: readonly StepExit[]): StepExit | undefined => exits.find((e) => e.of);

/**
 * What a kind's exit for what it set aside holds (`asideExit`), its first
 * holding `first`: the kind of set it declares, or - `same` - what came in,
 * which a kind whose aside exit says `same` gives from its first too. None
 * where it has no such exit.
 */
export function restHolds(kind: StepKind, first: SetKind): SetKind | undefined {
  const aside = asideExit(kind);
  if (!aside) return undefined;
  return isSetKind(aside.gives) ? aside.gives : first;
}

/** The input of `kind` named `port`, or its first where `port` is not one of its own. */
/** Whether a kind takes nothing in: no input, nothing wired to it (Generate's). */
export const takesNothing = (kind: StepKind): boolean => inputsOf(kind).length === 0;

export function portOf(kind: StepKind, port: string): StepPort {
  const inputs = inputsOf(kind);
  return inputs.find((p) => p.id === port) ?? inputs[0];
}

/** Whether an input reads what comes in as a table - one that takes a table, or says it does (`StepPort.asTable`) - rather than as a step's entries. */
export const readsAsTable = (kind: StepKind, port: string): boolean => {
  const p = portOf(kind, port);
  return !!p.asTable || p.takes.includes("table");
};

/** The exit of `kind` named `exit`, or its first where `exit` is not one of its own. */
export function exitOf(kind: StepKind, exit: string): StepExit {
  const exits = exitsOf(kind);
  return exits.find((e) => e.id === exit) ?? exits[0];
}

/** What *Compare bonding* still needs of its options before it can run: a property to pair on, or to write the match as; atoms that read. */
export function compareNeeds(v: OptionValues): string | undefined {
  if (v.reference === "property" && !String(v.property ?? "").trim()) return "Name the property to pair them on";
  if (v.reference !== "property" && !String(v.writes ?? "matches").trim()) return "Name the property the match is written as";
  const atoms = atomsFromOne(String(v.atoms ?? ""));
  return "why" in atoms ? atoms.why : undefined;
}

/** *Compare bonding*'s line: against what, and what it compares besides bonds. */
export function compareHow(v: OptionValues): string {
  const needs = compareNeeds(v);
  if (needs) return needs;
  const against = v.reference === "property" ? `Against the reference of the same ${String(v.property).trim()}` : `Against each reference, the match as ${String(v.writes ?? "matches").trim()}`;
  const also = [v.rs ? "R or S" : "", v.ez ? "E or Z" : ""].filter(Boolean);
  return also.length ? `${against}; ${also.join(" and ")} too` : against;
}
