/**
 * The kinds of step Meno defines (docs/WORKFLOWS.md, *Kinds of step*):
 * what each takes and gives, what it is called and drawn as, and its
 * options where Meno does it. Plugins fill kinds; they bring none of their
 * own.
 */
import { numberText } from "../../../../lib/calc/results";
import type { Option } from "../../../../lib/options";
import type { SetKind, StepKind } from "../../../../lib/plugins/steps";
import { renderOptions } from "../render/renderOptions";

/** What flows along a wire, and the kinds of step, by id: as plugins' manifests name them (lib/plugins/steps). */
export type { SetKind, StepKind };

/** What a set may hold: a kind of set that flows along a wire - or pictures, a Render step's, which none takes. */
export type SetHolds = SetKind | "pictures";

/** Which icon a kind has (workflow/icons: QuickAdd, a step's card): a stack, a trend downwards, a bolt, a signal, a cloud, a picture, a funnel, two squares, bars, shapes grouped, a pointer choosing. */
export type StepIcon = "rings" | "curve" | "level" | "wave" | "cloud" | "picture" | "band" | "twins" | "bars" | "grouped" | "pointer";

export type KindInfo = {
  kind: StepKind;
  name: string;
  icon: StepIcon;
  /** The sets it takes. */
  takes: readonly SetKind[];
  /** What it gives, for what it took: `same`, the kind of set that came in; `pictures`, a set of pictures (Render's), which no step takes. */
  gives: SetKind | "same" | "pictures";
  /** Whether it runs a program (a plugin's) or works on entries alone. */
  runs: "program" | "entries";
  /** Its options, where Meno does it. */
  options?: readonly Option[];
  /** Meno's own choices for a kind a plugin does, whoever does it, before the plugin's (Render's: a picture's size and shape, and what its molecules and surfaces are made of). */
  own?: readonly Option[];
  /** What its result set is called; `{id}`, an option's value. */
  made: string;
  /** How it does its work, in a line, from its options' values - where Meno does it and says it its own way (howOf). */
  how?: (values: Record<string, string | number | boolean>) => string;
  /** Whether a plugin doing it needs whole molecules - their hydrogens there, their charge and spin known (lib/chem/skeleton): a skeleton is refused before anything is sent to it. */
  whole?: true;
};

export const KINDS: readonly KindInfo[] = [
  { kind: "conformers", name: "Conformers", icon: "rings", takes: ["structures", "molecules", "conformers"], gives: "conformers", runs: "program", made: "Conformers", whole: true },
  { kind: "optimise", name: "Optimise", icon: "curve", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Optimised", whole: true },
  { kind: "energy", name: "Energy", icon: "level", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Energies", whole: true },
  { kind: "frequencies", name: "Frequencies", icon: "wave", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Frequencies", whole: true },
  // (non-covalent interactions: each molecule with a surface coloured by how they attract or repel - docs/NCI.md)
  { kind: "nci", name: "NCI", icon: "cloud", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Non-covalent interactions", whole: true },
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
    options: [{ id: "rmsd", label: "Alike within (RMSD)", type: "number", default: 0.125, min: 0, step: 0.025, unit: "Å" }],
  },
  {
    kind: "populations",
    name: "Populations",
    icon: "bars",
    takes: ["conformers"],
    gives: "conformers",
    runs: "entries",
    made: "Populations at {temperature} K",
    options: [{ id: "temperature", label: "At", type: "number", default: 298.15, min: 1, step: 1, unit: "K" }],
  },
  { kind: "as-conformers", name: "As conformers", icon: "grouped", takes: ["molecules"], gives: "conformers", runs: "entries", made: "Conformers" },
  {
    kind: "choose",
    name: "Choose one",
    icon: "pointer",
    takes: ["conformers"],
    gives: "molecules",
    runs: "entries",
    made: "Chosen",
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
];

export const kindInfo = (kind: StepKind): KindInfo => KINDS.find((k) => k.kind === kind)!;

/** Whether a step of `kind` takes a set that holds `holds`. */
export const takes = (kind: StepKind, holds: SetKind): boolean => kindInfo(kind).takes.includes(holds);

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
