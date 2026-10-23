/**
 * The kinds of step Meno defines (docs/WORKFLOWS.md, *Kinds of step*):
 * what each takes and gives, what it is called and drawn as, and its
 * options where Meno does it. Plugins fill kinds; they bring none of their
 * own.
 */
import { numberText } from "../../../../lib/calc/results";
import type { Option, OptionValues } from "../../../../lib/options";
import type { SetKind, StepKind, ValueKind } from "../../../../lib/plugins/steps";
import { renderOptions } from "../render/renderOptions";
import { conditionsIn, conditionText } from "../../../../lib/nodes/filter";
import { listsReadAs, readLists } from "./enumerate";

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

/** Which icon a kind has (workflow/icons: QuickAdd, a step's card): a stack, a trend downwards, a bolt, a signal, a cloud, a picture, a funnel, two squares, bars, shapes grouped, a pointer choosing, sparks, sliders set, a chart. */
export type StepIcon = "rings" | "curve" | "level" | "wave" | "cloud" | "picture" | "band" | "twins" | "bars" | "grouped" | "pointer" | "sparks" | "sliders" | "chart";

/**
 * An input a kind takes (docs/WORKFLOWS-FOUNDATION.md, *Steps, ports and
 * exits*): named, and taking the kinds of set it does. Most kinds take one;
 * a kind that takes two or three names each - *start* and *end*, *geometry*
 * and *bonding* - and says on itself which property its entries are matched
 * on, so that nothing is matched by an implicit rule.
 */
export type StepPort = { id: string; name: string; takes: readonly ValueKind[] };

/**
 * An exit a kind gives. Every exit is a result set of its own, made with the
 * step and empty until it runs. `of` marks a second exit - what a step set
 * aside or could not do - drawn under the first with its count: nothing is
 * hidden, and it can be wired on.
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
  /** Its exits beyond the first, which is `made`: entries it sets aside (*rest*), or could not do (*failed*). */
  second?: StepExit;
  /** How it does its work, in a line, from its options' values - where Meno does it and says it its own way (howOf). */
  how?: (values: Record<string, string | number | boolean>) => string;
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
  { kind: "conformers", name: "Conformers", icon: "rings", takes: ["structures", "molecules", "conformers"], gives: "conformers", runs: "program", made: "Conformers", whole: true, second: { ...FAILED, gives: "molecules" } },
  { kind: "optimise", name: "Optimise", icon: "curve", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Optimised", whole: true, second: FAILED },
  { kind: "energy", name: "Energy", icon: "level", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Energies", whole: true, second: FAILED },
  { kind: "frequencies", name: "Frequencies", icon: "wave", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Frequencies", whole: true, second: FAILED },
  // (non-covalent interactions: each molecule with a surface coloured by how they attract or repel - docs/NCI.md)
  { kind: "nci", name: "NCI", icon: "cloud", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Non-covalent interactions", whole: true, second: FAILED },
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
    second: { id: "rest", name: "Outside it", gives: "same", of: "rest" },
    options: [{ id: "window", label: "Within", type: "number", default: 3, min: 0, step: 0.5, unit: "kcal/mol" }],
  },
  {
    kind: "duplicates",
    name: "Duplicates",
    // (a plugin's comparison, of whole molecules - Meno's own, of shapes alone, takes a skeleton)
    whole: true,
    icon: "twins",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Unlike",
    second: { id: "rest", name: "Alike", gives: "same", of: "rest" },
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
    second: { id: "rest", name: "The rest", gives: "same", of: "rest" },
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
    second: { id: "rest", name: "The rest", gives: "conformers", of: "rest" },
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
    icon: "band",
    takes: ["structures"],
    gives: "structures",
    runs: "program",
    made: "Checked",
    second: { id: "rest", name: "Set aside", gives: "structures", of: "rest" },
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
    second: { id: "rest", name: "Set aside", gives: "structures", of: "rest" },
  },
  // (each structure drawn with numbers worked out of it as drawn - its molecular weight, logP and the like - on its record: a plugin's)
  {
    kind: "descriptors",
    name: "Descriptors",
    icon: "bars",
    takes: ["structures"],
    gives: "structures",
    runs: "program",
    made: "With descriptors",
    second: { id: "rest", name: "Set aside", gives: "structures", of: "rest" },
  },
  // (structures made from one drawing by rule, its R groups each given a list - Meno's own: docs/WORKFLOWS-FOUNDATION.md, *Enumerate*)
  {
    kind: "enumerate",
    name: "Enumerate",
    icon: "grouped",
    takes: ["structures"],
    gives: "structures",
    runs: "entries",
    made: "Made",
    inputs: [{ id: ONE_INPUT, name: "Template", takes: ["structures"] }],
    second: { id: "rest", name: "Aside", gives: "same", of: "rest" },
    options: [
      {
        id: "lists",
        label: "R groups, one to a line",
        type: "lines",
        default: "R1:\n",
        rows: 6,
        // (read as the step runs them, beside each line - asked when shown: the reader is the canvas's)
        readAs: (text) => listsReadAs(text),
      },
    ],
    how: (v) => {
      const { lists } = readLists(String(v.lists ?? ""));
      return lists.size ? [...lists].map(([n, o]) => `R${n} \u00b7 ${o.length}`).join(", ") : "No lists yet";
    },
  },
  {
    kind: "chart",
    name: "Chart",
    icon: "chart",
    // (a table - or molecules, seen as one: lib/table moleculesAsTable)
    takes: ["table"],
    gives: "chart",
    runs: "entries",
    made: "Chart",
    options: [
      { id: "x", label: "Across", type: "text", default: "" },
      { id: "y", label: "Up", type: "text", default: "" },
    ],
    how: (v) => (v.x || v.y ? `${v.y || "the second column of numbers"} against ${v.x || "the first"}` : "The first two columns of numbers"),
  },
];

/** How a Filter step does its work, in a line: its conditions as read, and whether all or any - or why they do not read, or that there are none. */
export function filterHow(text: string, match: "all" | "any"): string {
  const read = conditionsIn(text);
  if ("why" in read) return read.why;
  if (!read.conditions.length) return "No conditions yet";
  return read.conditions.map(conditionText).join(match === "any" ? " or " : " and ");
}

export const kindInfo = (kind: StepKind): KindInfo => KINDS.find((k) => k.kind === kind)!;

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

/** How a step does its work, in a line: each option's value, a number with its unit, a choice by its name - one of none left out; or as `said` says it (a kind's `how`, where Meno does it). */
export function howOf(
  options: readonly Option[],
  own: Record<string, string | number | boolean> | undefined,
  said?: KindInfo["how"],
): string {
  const values = optionsOf(options, own);
  if (said) return said(values);
  return options
    .flatMap((o) => {
      const v = values[o.id];
      if (o.type === "number") return [`${typeof v === "number" ? numberText(v) : v}${o.unit ? ` ${o.unit}` : ""}`];
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
 * The exits a kind gives: its first, which `made` names and `gives` fills,
 * and its second where it has one.
 */
export function exitsOf(kind: StepKind): readonly StepExit[] {
  const info = kindInfo(kind);
  const first: StepExit = { id: ONE_EXIT, name: info.made, gives: info.gives };
  return info.second ? [first, info.second] : [first];
}

/**
 * What a kind's second exit holds, its first holding `first`: the kind of
 * set it declares, or - `same` - what came in, which a kind whose second
 * exit says `same` gives from its first too. None where it has no second.
 */
export function restHolds(kind: StepKind, first: SetKind): SetKind | undefined {
  const second = exitsOf(kind)[1];
  if (!second) return undefined;
  return isSetKind(second.gives) ? second.gives : first;
}

/** The input of `kind` named `port`, or its first where `port` is not one of its own. */
/** Whether a kind takes nothing in: no input, nothing wired to it (Generate's). */
export const takesNothing = (kind: StepKind): boolean => inputsOf(kind).length === 0;

export function portOf(kind: StepKind, port: string): StepPort {
  const inputs = inputsOf(kind);
  return inputs.find((p) => p.id === port) ?? inputs[0];
}

/** Whether an input reads what comes in as a table (lib/table `moleculesAsTable`) - each molecule as it is, a conformer set's frames its conformers - rather than as a step's entries: one that takes a table. A set mixing conformer sets with other molecules goes into it. */
export const readsAsTable = (kind: StepKind, port: string): boolean => portOf(kind, port).takes.includes("table");

/** The exit of `kind` named `exit`, or its first where `exit` is not one of its own. */
export function exitOf(kind: StepKind, exit: string): StepExit {
  const exits = exitsOf(kind);
  return exits.find((e) => e.id === exit) ?? exits[0];
}
