/**
 * The kinds of step Meno defines (docs/WORKFLOWS.md, *Kinds of step*):
 * what each takes and gives, what it is called and drawn as, and its
 * options where Meno does it. Plugins fill kinds; they bring none of their
 * own.
 */
import { deltaOf, levelsTyped } from "../../../../lib/energyDiagram";
import { MOST_PAIRS } from "./mostPairs";
import { numberText } from "../../../../lib/calc/results";
import { shownOptions, type Option, type OptionValues } from "../../../../lib/options";
import type { SetKind, StepKind, ValueKind } from "../../../../lib/plugins/steps";
import { renderOptions } from "../render/renderOptions";
import { keptNames, takeFramesHow, type Which } from "./takeFrames";
import { joinHow, joinNeeds } from "./joinStep";
import { barrierHow, barrierNeeds, FREE_ENERGY } from "./barrierStep";
import { addHow, addNeeds, numberHow, numberNeeds } from "./addStep";
import { ensembleHow, ensembleNeeds } from "./ensembleStep";
import { conditionsIn, conditionText, filterNeeds } from "../../../../lib/nodes/filter";
import { tagNeeds } from "../../../../lib/nodes/tag";
import { measurementName, measurementsTyped } from "../../../../lib/steps/measure";
import { atomsFromOne } from "../../../../lib/steps/compareBonding";
import { BOND_REACH, REACH_FLOOR } from "../../../../utils/structureParsers";
import { speciesNeeds, speciesTyped } from "../../../../lib/steps/species";
import { DISTANCE_STRENGTH, TORSION_STEP, type RestraintsAsked } from "../../../../lib/steps/restraints";
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

/** Which icon a kind has (workflow/icons: QuickAdd, a step's card): a stack, a trend downwards, a bolt, a signal, a cloud, a picture, a funnel, two squares, bars, shapes grouped, a pointer choosing, sparks, sliders set, a chart, levels, a tag, a plus in a circle (a charge), a link, arrows apart (a measure), a numbered list (a rank), two tables linked (a join), a number typed in a field (a number), two values summed (a sum), levels made one (an ensemble). */
export type StepIcon = "rings" | "curve" | "level" | "wave" | "cloud" | "picture" | "band" | "check" | "twins" | "copies" | "bars" | "list" | "grouped" | "fan" | "pointer" | "sparks" | "sliders" | "chart" | "levels" | "tag" | "charge" | "link" | "span" | "merge" | "rebond" | "compare" | "frames" | "path" | "saddle" | "descent" | "moved" | "mapped" | "number" | "sum" | "held" | "heldAnti" | "join" | "numbered" | "heldMinimum" | "ensemble" | "height";

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
  /**
   * The step runs with nothing wired into it (*where wanted*): an Energy
   * diagram's *Connects*, Add's *Number*. A kind's first input is never
   * so; every later one not marked is needed (`laterPortsNeed`). Its look
   * is a port's like any other: the card's line names what is needed, and
   * never this one.
   */
  optional?: true;
  /** Another optional port's id, wired with it or not at all - a saddle point's two sides: both, or neither. */
  together?: string;
};

/**
 * What a step's later inputs still need, as `isWired` says which are
 * wired: the first one not marked optional with nothing wired into it
 * ("Nothing comes into Second"), or an optional one wired without the one
 * it goes together with ("Product side is wired: wire Reactant side too,
 * or neither"). None, where they are as they may be.
 */
export function laterPortsNeed(ports: readonly StepPort[], isWired: (id: string) => boolean): string | null {
  for (const port of ports.slice(1)) {
    if (isWired(port.id)) continue;
    if (!port.optional) return `Nothing comes into ${port.name}`;
    const other = port.together ? ports.find((p) => p.id === port.together) : undefined;
    if (other && isWired(other.id)) return `${other.name} is wired: wire ${port.name} too, or neither`;
  }
  return null;
}

/**
 * An exit a kind gives. Every exit is a result set of its own, made with the
 * step and empty until it runs, each drawn under the one before it. `of`
 * marks the exit for what a step set aside or could not do, drawn with its
 * count: nothing is hidden, and it can be wired on. A kind has at most one
 * such exit; its other exits each give something of their own (a
 * Atom map's bond changes, a table).
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
  /** What it is called instead where an option counting what it keeps is 1: "The first", not "The first 1". */
  madeOne?: { option: string; name: string };
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

/** How a program step of more than one input pairs what comes into them (workflow/pairs): in order, each with each, or matched on a property. */
const PAIRS_OWN: readonly Option[] = [
  {
    id: "pairs",
    label: "Pairs",
    type: "choice",
    choices: [
      { value: "order", label: "In order" },
      { value: "each", label: "Each with each" },
      { value: "property", label: "Matched on" },
    ],
    default: "order",
  },
  { id: "property", label: "Property", type: "text", default: "", when: { id: "pairs", in: ["property"] } },
];

/** How many pairs *Path search*'s each with each makes at most: its own, as every pair is a path search run (workflow/mostPairs). */
const MOST_OWN: Option = { id: "most", label: "At most, pairs", type: "number", default: MOST_PAIRS, min: 1, step: 1, when: { id: "pairs", in: ["each"] } };

export const KINDS: readonly KindInfo[] = [
  // (new structures from nothing that comes in: a generative model's, as its plugin asks it, each drawn from the SMILES it gave - no input, so no port)
  { kind: "generate", name: "Generate", icon: "sparks", takes: [], inputs: [], gives: "structures", runs: "program", made: "Generated" },
  { kind: "conformers", name: "Conformers", icon: "rings", takes: ["structures", "molecules", "conformers"], gives: "conformers", runs: "program", made: "Conformers", whole: true, others: [{ ...FAILED, gives: "molecules" }] },
  { kind: "optimise", name: "Optimise", icon: "curve", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Optimised", whole: true, others: [FAILED] },
  // (each entry minimised in a force field with its restraints held - Restraints', Torsion restraints' - as its plugin holds them: docs/PLUGINS.md)
  { kind: "minimise", name: "Minimise with restraints", icon: "heldMinimum", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Minimised", whole: true, others: [FAILED] },
  { kind: "energy", name: "Energy", icon: "level", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Energies", whole: true, others: [FAILED] },
  { kind: "frequencies", name: "Frequencies", icon: "wave", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Frequencies", whole: true, others: [FAILED] },
  // (non-covalent interactions: each molecule with a surface coloured by how they attract or repel - docs/NCI.md)
  { kind: "nci", name: "NCI", icon: "cloud", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Non-covalent interactions", whole: true, others: [FAILED] },
  // (each entry a picture of its own, in a set of pictures - docs/RENDER.md, *Render as a step*)
  {
    // (a path between two structures of the same atoms in one numbering - each start paired with an end, as its own options say - its highest
    //  point refined: one molecule each, its frames the path, its entry the point refined; Meno judges none of them - docs/WORKFLOWS.md)
    kind: "path-search",
    name: "Path search",
    icon: "path",
    takes: ["molecules", "conformers"],
    gives: "molecules",
    runs: "program",
    made: "Refined structures",
    inputs: [
      { id: "start", name: "Start", takes: ["molecules", "conformers"] },
      { id: "end", name: "End", takes: ["molecules", "conformers"] },
    ],
    others: [FAILED],
    whole: true,
    own: [...PAIRS_OWN, MOST_OWN],
  },
  {
    // (a guess optimised to a saddle point by its program - with the reactant and product sides, where both are wired, each paired with
    //  it as its own options say: one optimisation, nothing else; Meno judges none of them a saddle point - docs/WORKFLOWS.md)
    kind: "saddle-point",
    name: "Optimise to a saddle point",
    icon: "saddle",
    takes: ["molecules"],
    gives: "molecules",
    runs: "program",
    made: "Optimised structures",
    inputs: [
      { id: "guesses", name: "Guesses", takes: ["molecules"] },
      { id: "reactant", name: "Reactant side", takes: ["molecules"], optional: true, together: "product" },
      { id: "product", name: "Product side", takes: ["molecules"], optional: true, together: "reactant" },
    ],
    others: [FAILED],
    whole: true,
    own: PAIRS_OWN,
  },
  // (from each point given - a saddle point, as its frequencies say - down both ways, as its program follows the reaction path: one molecule
  //  each, its frames the path from one end to the other, its entry the point it started from; Meno judges none of them - docs/WORKFLOWS.md)
  { kind: "reaction-path", name: "Follow the reaction path", icon: "descent", takes: ["molecules"], gives: "molecules", runs: "program", made: "Reaction paths", others: [FAILED], whole: true },
  { kind: "render", name: "Render", icon: "picture", takes: ["molecules", "conformers"], gives: "pictures", runs: "program", made: "Rendered", own: renderOptions("picture", [], true) },
  {
    kind: "energy-window",
    name: "Energy window",
    icon: "band",
    takes: ["conformers", "molecules"],
    gives: "same",
    runs: "entries",
    made: "Within {window} kcal/mol",
    others: [{ id: "rest", name: "Outside it", gives: "same", of: "rest" }],
    options: [
      { id: "window", label: "Within", type: "number", default: 3, min: 0, step: 0.5, unit: "kcal/mol" },
      // (of each compound's lowest, as it was; or of the lowest of those with one value of a property - a path, a product: never grouped by guess)
      {
        id: "within",
        label: "From the lowest in",
        type: "choice",
        choices: [
          { value: "each compound", label: "Each compound" },
          { value: "each value", label: "Each value of a property" },
        ],
        default: "each compound",
      },
      { id: "groupBy", label: "The property", type: "text", default: "", when: { id: "within", in: ["each value"] } },
    ],
    how: (v) => energyWindowHow(v),
    needs: (v) => energyWindowNeeds(v),
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
      // (each compound's conformers, or a compound set's same structures, as it was; or those with one value of a property - a product, a path - across compounds: never grouped by guess)
      {
        id: "within",
        label: "Compared within",
        type: "choice",
        choices: [
          { value: "each compound", label: "Each compound" },
          { value: "each value", label: "Each value of a property" },
        ],
        default: "each compound",
      },
      { id: "groupBy", label: "The property", type: "text", default: "", when: { id: "within", in: ["each value"] } },
    ],
    how: (v) => duplicatesHow(v),
    needs: (v) => (v.within === "each value" && !String(v.groupBy ?? "").trim() ? "Name the property whose values are the groups" : undefined),
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
    // (entries ordered by a value they carry and the first N kept - in each group, each value of a property, or of all - lib/nodes/rank; the rest saying their place)
    kind: "rank",
    name: "Rank",
    icon: "numbered",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "The first {keep}",
    madeOne: { option: "keep", name: "The first" },
    others: [{ id: "rest", name: "The rest", gives: "same", of: "rest" }],
    options: [
      { id: "property", label: "By", type: "text", default: "energy" },
      {
        id: "order",
        label: "Order",
        type: "choice",
        choices: [
          { value: "lowest first", label: "Lowest first" },
          { value: "highest first", label: "Highest first" },
        ],
        default: "lowest first",
      },
      { id: "keep", label: "Keep the first", type: "number", default: 1, min: 1, step: 1 },
      {
        id: "within",
        label: "Within",
        type: "choice",
        choices: [
          { value: "each group", label: "Each group" },
          { value: "each value", label: "Each value of a property" },
          { value: "all", label: "All together" },
        ],
        default: "each group",
      },
      { id: "groupBy", label: "The property", type: "text", default: "", when: { id: "within", in: ["each value"] } },
    ],
    how: (v) => rankHow(v),
    needs: (v) => rankNeeds(v),
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
      { id: "keep", label: "Keep from its molecule", type: "lines", default: "", rows: 2, note: "One property to a line, taken from the molecule each frame comes from. Empty: each frame keeps only its own." },
    ],
    how: (v) => takeFramesHow((v.which as Which) ?? "highest", Number(v.either ?? 1), keptNames(String(v.keep ?? ""))),
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
      { id: "connects", name: "Connects", takes: ["table"], optional: true },
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
    // (the atoms typed, or each row's of a table wired in where wanted - an Atom map's bond changes - its columns saying how they count them)
    inputs: [
      { id: ONE_INPUT, name: "Molecules", takes: ["molecules", "conformers"] },
      { id: "atoms", name: "Atoms", takes: ["table"], optional: true },
    ],
    options: [
      {
        id: "from",
        label: "Atoms",
        type: "choice",
        choices: [
          { value: "typed", label: "Typed" },
          { value: "table", label: "From the table" },
        ],
        default: "typed",
      },
      { id: "measurements", label: "Atoms, from 1 (3-7, 1-2-3, 1-2-3-4)", type: "text", default: "", when: { id: "from", in: ["typed"] } },
      { id: "rows", label: "Rows matched on (blank: every row)", type: "text", default: "", when: { id: "from", in: ["table"] } },
    ],
    how: (v) =>
      v.from === "table"
        ? String(v.rows ?? "").trim()
          ? `atoms from the table, rows by ${String(v.rows).trim()}`
          : "atoms from the table"
        : measureHow(String(v.measurements ?? "")),
    needs: (v) => {
      if (v.from === "table") return undefined;
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
      { id: "numbered", label: "Every centre by number too", type: "switch", default: false },
      { id: "atoms", label: "Pass over atoms, from 1", type: "text", default: "" },
      { id: "elements", label: "Pass over elements", type: "text", default: "" },
      { id: "reach", label: "Bonded within \u00d7 the sum of their covalent radii (Pyykk\u00f6)", type: "number", default: BOND_REACH, min: 1, max: 2, step: 0.05 },
      { id: "floor", label: "At least the sum plus, \u00c5", type: "number", default: REACH_FLOOR, min: 0, max: 1, step: 0.05 },
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
  {
    // (each saddle point's height above its start - the free energy G, or the electronic energy E - paired as Path search pairs, a conformer set's each conformer one: those it cannot have one out of Failed, each saying why)
    kind: "barrier",
    name: "Barrier",
    icon: "height",
    takes: ["molecules", "conformers"],
    gives: "molecules",
    runs: "entries",
    made: "With barriers",
    inputs: [
      { id: "saddles", name: "Saddle points", takes: ["molecules", "conformers"] },
      { id: "starts", name: "Starts", takes: ["molecules", "conformers"] },
    ],
    others: [FAILED],
    options: [
      {
        id: "energy",
        label: "Of",
        type: "choice",
        choices: [
          { value: "G", label: "Free energy G" },
          { value: "E", label: "Electronic energy E" },
        ],
        default: "G",
      },
      { id: "free", label: "G is", type: "text", default: FREE_ENERGY, when: { id: "energy", in: ["G"] } },
      {
        id: "symmetry",
        label: "Rotational symmetry",
        type: "choice",
        choices: [
          { value: "as-read", label: "As each program read it" },
          { value: "left-out", label: "Left out (σ = 1 on both sides)" },
        ],
        default: "as-read",
        when: { id: "energy", in: ["G"] },
      },
      ...PAIRS_OWN,
    ],
    how: (v) => barrierHow(v),
    needs: (v) => barrierNeeds(v),
  },
  {
    // (each entry's restraints from itself: its coordination bonds at a factor of their van der Waals radii together, pairs kept at their distance, atoms fixed - those it cannot have out of Failed, saying why)
    kind: "restraints",
    name: "Restraints",
    icon: "held",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Restrained",
    others: [FAILED],
    options: [
      { id: "coordination", label: "Coordination bonds", type: "switch", default: true },
      { id: "factor", label: "Kept at \u00d7 the sum of their van der Waals radii (Alvarez 2013)", type: "text", default: "", when: { id: "coordination", in: [true] } },
      { id: "distances", label: "Pairs kept at their distance, atoms from 1 (3-7, 1-12)", type: "text", default: "" },
      { id: "fixed", label: "Atoms fixed, from 1 (1, 4-6)", type: "text", default: "" },
      { id: "strength", label: "Strength of each distance, kcal/mol/\u00c5\u00b2", type: "text", default: String(DISTANCE_STRENGTH) },
    ],
    how: (v) => restraintsHow(v),
    needs: (v) => restraintsNeeds(v),
  },
  {
    // (each torsion trans across its reference's double bonds that is not trans in the entry held at 180, stronger each time - those already trans out of the second exit)
    kind: "torsion-restraints",
    name: "Torsion restraints",
    icon: "heldAnti",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Restrained",
    inputs: [
      { id: "molecules", name: "Molecules", takes: ["molecules", "conformers"] },
      { id: "reference", name: "Reference", takes: ["molecules", "conformers"] },
    ],
    others: [{ id: "rest", name: "Trans already", gives: "same", of: "rest" }],
    options: [
      {
        id: "reference",
        label: "Against",
        type: "choice",
        choices: [
          { value: "one", label: "The one reference" },
          { value: "property", label: "Matched on" },
        ],
        default: "one",
      },
      { id: "property", label: "Property", type: "text", default: "", when: { id: "reference", in: ["property"] } },
      { id: "step", label: "Strength added each time, kcal/mol/rad\u00b2", type: "text", default: String(TORSION_STEP) },
    ],
    how: (v) => torsionsHow(v),
    needs: (v) => torsionsNeeds(v),
  },
  {
    // (a number with its unit and what worked it out - the standard-state term from its temperature, by its formula, or one typed - for a step that takes one: Add's)
    kind: "number",
    name: "Number",
    icon: "number",
    takes: [],
    inputs: [],
    gives: "number",
    runs: "entries",
    made: "Number",
    options: [
      {
        id: "what",
        label: "Number",
        type: "choice",
        choices: [
          { value: "standard state", label: "Standard state, 1 atm to 1 mol/L" },
          { value: "typed", label: "Typed" },
        ],
        default: "standard state",
      },
      // (298.15 K: the standard temperature thermochemistry is tabulated at, as Populations' is - the chemist's to change)
      { id: "temperature", label: "At", type: "number", default: 298.15, min: 1, step: 1, unit: "K", when: { id: "what", in: ["standard state"] } },
      { id: "value", label: "Value", type: "number", default: 0, step: 0.1, when: { id: "what", in: ["typed"] } },
      { id: "unit", label: "Unit", type: "text", default: "kcal/mol", when: { id: "what", in: ["typed"] } },
    ],
    how: (v) => numberHow(v),
    needs: (v) => numberNeeds(v),
  },
  {
    // (properties of each entry's own geometry summed, a number wired in besides, into a new one - each part as it was, never one level for the sum: lib/nodes/add)
    kind: "add",
    name: "Add",
    icon: "sum",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "{as}",
    inputs: [
      { id: "in", name: "Molecules", takes: ["molecules", "conformers"] },
      { id: "number", name: "Number", takes: ["number"], optional: true },
    ],
    others: [{ id: "rest", name: "Not added", gives: "same", of: "rest" }],
    options: [
      { id: "parts", label: "Add", type: "text", default: "" },
      { id: "as", label: "As", type: "text", default: "" },
    ],
    how: (v) => addHow(v),
    needs: (v) => addNeeds(v),
  },
  {
    // (each entry mapped onto its reference, atom for atom, hydrogens too, and written in its numbering - a reaction's products onto its reactants, a species' conformers onto it - with the bonds each map forms, breaks or changes, as a table; an entry that does not map, aside with why)
    kind: "atom-map",
    name: "Atom map",
    icon: "mapped",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Mapped",
    inputs: [
      { id: "molecules", name: "Molecules", takes: ["molecules", "conformers"] },
      { id: "reference", name: "Reference", takes: ["molecules", "conformers"] },
    ],
    others: [
      { id: "rest", name: "Not mapped", gives: "same", of: "rest" },
      { id: "changes", name: "Bond changes", gives: "table" },
    ],
    options: [
      {
        id: "reference",
        label: "Against",
        type: "choice",
        choices: [
          { value: "one", label: "The one reference" },
          { value: "property", label: "Matched on" },
        ],
        default: "one",
      },
      { id: "property", label: "Property", type: "text", default: "", when: { id: "reference", in: ["property"] } },
      {
        // (no default: whether an input's entries are each a side of its own, or one side together, is the chemist's - a reaction's products, or its reactants)
        id: "moleculesAre",
        label: "Molecules",
        type: "choice",
        choices: [
          { value: "each", label: "Each its own" },
          { value: "together", label: "One side together" },
        ],
        default: "",
      },
      {
        id: "referenceIs",
        label: "Reference",
        type: "choice",
        choices: [
          { value: "each", label: "Each its own" },
          { value: "together", label: "One side together" },
        ],
        default: "",
      },
      {
        // (no default: whether its bonds may change is what the chemist maps for - a reaction, or conformers of one species)
        id: "bonds",
        label: "Bonds",
        type: "choice",
        choices: [
          { value: "change", label: "May change (a reaction)" },
          { value: "same", label: "Stay the same (conformers)" },
        ],
        default: "",
      },
      {
        id: "maps",
        label: "Maps",
        type: "choice",
        choices: [
          { value: "first", label: "First map" },
          { value: "every", label: "Every map" },
        ],
        default: "first",
      },
    ],
    how: (v) => atomMapHow(v),
    needs: (v) => atomMapNeeds(v),
  },
  {
    // (each geometry moved along a vibration - its imaginary one, or one chosen - by an amplitude, the atom moving most by exactly that; one that cannot be, aside with why)
    kind: "displace",
    name: "Displace",
    icon: "moved",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Displaced",
    others: [{ id: "rest", name: "Not displaced", gives: "same", of: "rest" }],
    options: [
      {
        id: "vibration",
        label: "Along",
        type: "choice",
        choices: [
          { value: "imaginary", label: "The imaginary vibration" },
          { value: "number", label: "A vibration by number" },
        ],
        default: "imaginary",
      },
      { id: "number", label: "Vibration, from 1", type: "number", default: 1, min: 1, step: 1, when: { id: "vibration", in: ["number"] } },
      // (0, which moves nothing, until one is given: no amplitude is right for every system, and none is given without a basis)
      { id: "amplitude", label: "Amplitude (negative: against the mode as written)", type: "number", default: 0, step: 0.05, unit: "\u00c5", unset: 0 },
    ],
    how: (v) => displaceHow(v),
    needs: (v) => displaceNeeds(v),
  },
  {
    // (each group's free energy over its members - its conformers - on the entry that stands for it, its lowest: lib/nodes/ensemble)
    kind: "ensemble",
    name: "Ensemble energy",
    icon: "ensemble",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "{as}",
    others: [{ id: "rest", name: "The rest", gives: "same", of: "rest" }],
    options: [
      { id: "property", label: "Of", type: "text", default: "" },
      { id: "as", label: "As", type: "text", default: "" },
      {
        id: "within",
        label: "Within",
        type: "choice",
        choices: [
          { value: "each group", label: "Each group" },
          { value: "each value", label: "Each value of a property" },
          { value: "all", label: "All together" },
        ],
        default: "each group",
      },
      { id: "groupBy", label: "The property", type: "text", default: "", when: { id: "within", in: ["each value"] } },
    ],
    how: (v) => ensembleHow(v),
    needs: (v) => ensembleNeeds(v),
  },
];

/** A number typed on a card, above 0, or why it is not one; null where nothing is typed. */
function aboveZero(text: string, what: string): number | { why: string } | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && /^[0-9.eE+-]+$/.test(t) ? n : { why: `${what} must be a number above 0` };
}

/** *Restraints*' options as read from its card: what it holds, or why they do not read (its run refuses the same). */
export function restraintsTyped(v: OptionValues): { asked: RestraintsAsked } | { why: string } {
  const coordination = v.coordination !== false;
  const factor = aboveZero(String(v.factor ?? ""), "The factor");
  if (coordination && factor == null) return { why: "Set the factor" };
  if (factor && typeof factor === "object") return { why: factor.why };
  const typed = String(v.distances ?? "").trim() ? measurementsTyped(String(v.distances)) : { atoms: [] };
  if ("why" in typed) return { why: typed.why };
  const pair = typed.atoms.find((a) => a.length !== 2);
  if (pair) return { why: `"${pair.map((a) => a + 1).join("-")}" is not a pair of atoms` };
  const fixed = atomsFromOne(String(v.fixed ?? ""));
  if ("why" in fixed) return { why: fixed.why };
  if (!coordination && !typed.atoms.length && !fixed.length) return { why: "Nothing to hold yet" };
  const strength = aboveZero(String(v.strength ?? DISTANCE_STRENGTH), "The strength");
  if ((coordination || typed.atoms.length) && strength == null) return { why: "Set the strength" };
  if (strength && typeof strength === "object") return { why: strength.why };
  return {
    asked: {
      ...(coordination ? { coordination: factor as number } : {}),
      ...(typed.atoms.length ? { distances: typed.atoms.map((a) => [a[0], a[1]] as const) } : {}),
      ...(fixed.length ? { fixed } : {}),
      ...(typeof strength === "number" ? { strength } : {}),
    },
  };
}

/** What a Restraints step still needs of its options: as its run would refuse them. */
export function restraintsNeeds(v: OptionValues): string | undefined {
  const typed = restraintsTyped(v);
  return "why" in typed ? typed.why : undefined;
}

/** A Restraints step's line: what it holds, and how strongly. */
export function restraintsHow(v: OptionValues): string {
  const typed = restraintsTyped(v);
  if ("why" in typed) return typed.why;
  const { coordination, distances, fixed, strength } = typed.asked;
  const said = [
    coordination != null ? `Coordination bonds at ${coordination} \u00d7 van der Waals (Alvarez 2013)` : "",
    distances?.length ? `${distances.length} ${distances.length === 1 ? "pair" : "pairs"} at their distance` : "",
    fixed?.length ? `${fixed.length} ${fixed.length === 1 ? "atom" : "atoms"} fixed` : "",
  ].filter(Boolean);
  // (the strength where it is not the default: what was chosen, said)
  return `${said.join("; ")}${strength != null && strength !== DISTANCE_STRENGTH ? `; ${strength} kcal/mol/\u00c5\u00b2` : ""}`;
}

/** What a Torsion restraints step still needs of its options. */
export function torsionsNeeds(v: OptionValues): string | undefined {
  if (v.reference === "property" && !String(v.property ?? "").trim()) return "Name the property to pair them on";
  const step = aboveZero(String(v.step ?? TORSION_STEP), "The strength added");
  if (step == null) return "Set the strength added";
  return typeof step === "object" ? step.why : undefined;
}

/** A Torsion restraints step's line: what it adds each time, and what it matches on where it does. */
export function torsionsHow(v: OptionValues): string {
  const needs = torsionsNeeds(v);
  if (needs) return needs;
  // (the one reference is the default: left unsaid)
  const matched = v.reference === "property" ? `, matched on ${String(v.property).trim()}` : "";
  // (the + says it adds each time - the option's own label says it whole)
  return `held at 180\u00b0, +${String(v.step ?? TORSION_STEP).trim()} kcal/mol/rad\u00b2${matched}`;
}

/** What an Atom map step still needs of its options. */
export function atomMapNeeds(v: OptionValues): string | undefined {
  const side = (x: unknown) => x === "each" || x === "together";
  if (!side(v.moleculesAre)) return "Choose how the molecules are taken";
  if (!side(v.referenceIs)) return "Choose how the reference is taken";
  if (v.reference === "property" && (v.moleculesAre === "together" || v.referenceIs === "together")) return "Matched on a property takes each entry on its own: set both inputs to each its own";
  if (v.reference === "property" && !String(v.property ?? "").trim()) return "Name the property to pair them on";
  if (v.bonds !== "change" && v.bonds !== "same") return "Choose whether bonds may change";
  return undefined;
}

/** An Atom map step's line: what was chosen - an input taken as one side, whether bonds may change, every map, the property matched on - an input taken each its own, and the defaults, unsaid. */
export function atomMapHow(v: OptionValues): string {
  const needs = atomMapNeeds(v);
  if (needs) return needs;
  // (an input taken each its own, the plain reading, unsaid - one taken as one side said; whether bonds may change, always)
  return [
    ...(v.moleculesAre === "together" ? ["molecules as one side"] : []),
    ...(v.referenceIs === "together" ? ["reference as one side"] : []),
    v.bonds === "same" ? "bonds stay the same" : "bonds may change",
    ...(v.maps === "every" ? ["every map"] : []),
    ...(v.reference === "property" ? [`matched on ${String(v.property).trim()}`] : []),
  ].join(", ");
}

/** *Displace*'s options as read: its amplitude (Å, not 0), and the vibration (from 0) where one is chosen by number - or what it still needs. */
export function displaceRead(v: OptionValues): { amplitude: number; vibration: "imaginary" | number } | { why: string } {
  const amplitude = Number(v.amplitude ?? 0);
  if (!Number.isFinite(amplitude) || amplitude === 0) return { why: "Give the amplitude" };
  if (v.vibration !== "number") return { amplitude, vibration: "imaginary" };
  const n = Number(v.number ?? 1);
  if (!Number.isInteger(n) || n < 1) return { why: `${n} is no vibration's number, from 1` };
  return { amplitude, vibration: n - 1 };
}
const displaceNeeds = (v: OptionValues): string | undefined => {
  const r = displaceRead(v);
  return "why" in r ? r.why : undefined;
};
/** *Displace*'s card line: its amplitude, and the vibration where it is not the imaginary one. */
function displaceHow(v: OptionValues): string {
  const r = displaceRead(v);
  if ("why" in r) return r.why;
  return `${r.amplitude} \u00c5${r.vibration === "imaginary" ? "" : ` along vibration ${r.vibration + 1}`}`;
}

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

/** What a Rank step still needs of its options: a property to rank by, and - within each value of one - which property. */
export function rankNeeds(v: Record<string, string | number | boolean>): string | undefined {
  if (!String(v.property ?? "").trim()) return "Name the property to rank by";
  if (v.within === "each value" && !String(v.groupBy ?? "").trim()) return "Name the property whose values are the groups";
  return undefined;
}

/** How a Duplicates step does its work, in a line: only what is not its default - "compared within each product", "mirror images counted as one" - and nothing at all where all is (the card says "Duplicates"). */
export function duplicatesHow(v: Record<string, string | number | boolean>): string {
  const by = String(v.groupBy ?? "").trim();
  if (v.within === "each value" && !by) return "Name the property whose values are the groups";
  return [...(v.mirrors === "counted" ? ["mirror images counted as one"] : []), ...(v.within === "each value" ? [`compared within each ${by}`] : [])].join(" · ");
}

/** What an Energy window still needs before it can run: the property, where its groups are a property's values. */
export function energyWindowNeeds(v: Record<string, string | number | boolean>): string | undefined {
  return v.within === "each value" && !String(v.groupBy ?? "").trim() ? "Name the property whose values are the groups" : undefined;
}

/** How an Energy window does its work, in a line: "within 3 kcal/mol of each compound's lowest", "within 10 kcal/mol of each path's lowest" - which energy, G or E, its line says once it has run. */
export function energyWindowHow(v: Record<string, string | number | boolean>): string {
  const needs = energyWindowNeeds(v);
  if (needs) return needs;
  return `within ${Number(v.window)} kcal/mol of each ${v.within === "each value" ? String(v.groupBy).trim() : "compound"}'s lowest`;
}

/** How a Rank step does its work, in a line: "the lowest 1 by energy in each group" - or what it still needs. */
export function rankHow(v: Record<string, string | number | boolean>): string {
  const needs = rankNeeds(v);
  if (needs) return needs;
  const within = v.within === "all" ? "of all" : v.within === "each value" ? `in each ${String(v.groupBy).trim()}` : "in each group";
  return `the ${v.order === "highest first" ? "highest" : "lowest"} ${Number(v.keep)} by ${String(v.property).trim()} ${within}`;
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
  const { made, madeOne } = kindInfo(kind);
  if (madeOne && Number(values[madeOne.option]) === 1) return madeOne.name;
  return made.replace(/\{([a-z0-9-]+)\}/g, (_, id: string) => String(values[id] ?? ""));
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

/**
 * *Compare bonding*'s line: what was chosen, defaults unsaid - matched on a
 * property, the match written under another name, a reach not the default,
 * R or S, E or Z and every centre by number, what is passed over; "against
 * each reference" where all is as it comes.
 */
export function compareHow(v: OptionValues): string {
  const needs = compareNeeds(v);
  if (needs) return needs;
  const writes = String(v.writes ?? "matches").trim();
  const reach = v.reach != null ? Number(v.reach) : BOND_REACH;
  const floor = v.floor != null ? Number(v.floor) : REACH_FLOOR;
  const atoms = String(v.atoms ?? "").trim();
  const elements = String(v.elements ?? "").trim();
  const said = [
    v.reference === "property" ? `matched on ${String(v.property).trim()}` : writes !== "matches" ? `the match as ${writes}` : "",
    reach !== BOND_REACH || floor !== REACH_FLOOR ? `bonded within ${reach} \u00d7 covalent radii${floor !== REACH_FLOOR ? `, at least +${floor} \u00c5` : ""}` : "",
    [v.rs ? "R or S" : "", v.ez ? "E or Z" : "", v.numbered ? "every centre by number" : ""].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1"),
    atoms ? `passing over atoms ${atoms}` : "",
    elements ? `passing over ${elements}` : "",
  ].filter(Boolean);
  return said.length ? said.join("; ") : "against each reference";
}
