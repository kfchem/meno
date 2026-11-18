/**
 * *Repeat* (docs/WORKFLOWS.md, *Repeat*; the maintainer's ruling on loops: a general loop that steps a property, which any option can
 * name - workflow/kinds `bindable`, lib/boundOptions): a frame round steps, which runs them pass by pass. Its kind is a step's
 * (workflow/kinds): *In* is its input, *Again* and *Done* the inputs inside its frame that what its steps give lands on (`LANDING`),
 * *This pass* the set inside that its first steps take, and *Out* what reached *Done* over all its passes. Its frame and the steps it
 * holds are on its step (`WorkflowStep.frame`, `holds`), settled by where their cards stand (`repeatsSettled`).
 *
 * This module: its options as its card has them, what they read as, its line, and what it still needs; and the rules its frame keeps
 * - what it holds, and which wires may cross its edge (`repeatWireRefusal`).
 */
import type { Option, OptionValues } from "../../../../lib/options";
import { UNITS, unitNamed, type Unit } from "../../../../lib/units";

/** The inputs inside a Repeat's frame, which what its steps give lands on: never a way back in its flow (workflow/flow `landing`). */
export const LANDING = ["again", "done"] as const;
/** Its input from outside. */
export const REPEAT_IN = "in";
/** Its exit inside its frame - this pass's entries: a kind's first exit (workflow/kinds `ONE_EXIT`) - and the one outside it, what reached *Done*. */
export const THIS_PASS = "out";
export const REPEAT_OUT = "reached";

/** How many passes a Repeat makes, until it is told otherwise: a starting value with no basis of its own (docs/WORKFLOWS.md, *Repeat*). */
export const PASSES = 3;
/** The most passes a Repeat that runs until none goes again makes, where it is not told: ConfoTS's own cap for its rounds. */
export const MOST_PASSES = 10;

/** A Repeat's options, as its card shows them. */
export const REPEAT_OPTIONS: readonly Option[] = [
  {
    id: "repeat",
    label: "Repeat",
    type: "choice",
    choices: [
      { value: "times", label: "A number of times" },
      { value: "until", label: "Until none goes again" },
      { value: "over", label: "Over values" },
    ],
    default: "times",
  },
  { id: "times", label: "Passes", type: "number", default: PASSES, min: 1, max: 100, whole: true, when: { id: "repeat", in: ["times"] }, note: "3 is a starting value, with no basis of its own: set the passes this needs." },
  { id: "most", label: "At most, passes", type: "number", default: MOST_PASSES, min: 1, max: 100, whole: true, when: { id: "repeat", in: ["until"] } },
  { id: "variable", label: "Variable (blank: none)", type: "text", default: "" },
  { id: "from", label: "From", type: "text", default: "", when: { id: "repeat", in: ["times", "until"] } },
  { id: "step", label: "Step", type: "text", default: "", when: { id: "repeat", in: ["times", "until"] } },
  { id: "values", label: "Values, one to a line", type: "lines", default: "", when: { id: "repeat", in: ["over"] } },
  { id: "unit", label: "Unit (blank: none)", type: "text", default: "" },
  {
    id: "counted",
    label: "Counted",
    type: "choice",
    choices: [
      { value: "entry", label: "Per entry" },
      { value: "pass", label: "Per pass" },
    ],
    default: "entry",
  },
  {
    id: "starts",
    label: "Each pass starts",
    type: "choice",
    choices: [
      { value: "held", label: "From where restraints were first held" },
      { value: "last", label: "From the last pass" },
      { value: "in", label: "From what came in" },
    ],
    default: "held",
    when: { id: "repeat", in: ["times", "until"] },
  },
  {
    id: "startsOver",
    label: "Each pass starts",
    type: "choice",
    choices: [
      { value: "last", label: "From the last pass" },
      { value: "held", label: "From where restraints were first held" },
      { value: "in", label: "From what came in" },
    ],
    default: "last",
    when: { id: "repeat", in: ["over"] },
  },
];

/** A Repeat's options as they read: how many passes, its variable's values, how they are counted, and where each pass starts. */
export type RepeatRead = {
  /** `times`: that many passes; `until`: until nothing lands on *Again*, at most `passes`; `over`: one pass for each value. */
  repeat: "times" | "until" | "over";
  passes: number;
  /** Its variable, where it has one: its name, the value of each count from 0 (`valueAt`), and its unit. */
  variable?: { name: string; from: number; step: number; values?: number[]; unit: Unit | "none" };
  counted: "entry" | "pass";
  starts: "held" | "last" | "in";
};

/** A number typed on its card: a finite one, or null. */
const numberIn = (t: string): number | null => {
  const s = t.trim();
  if (!s || !/^[0-9.eE+-]+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** A Repeat's options read, or why they do not read: what its card says where *Ready* would be. */
export function repeatRead(v: OptionValues): RepeatRead | { why: string } {
  const repeat = v.repeat === "until" || v.repeat === "over" ? v.repeat : "times";
  const counted = v.counted === "pass" ? "pass" : "entry";
  const starts = String(repeat === "over" ? (v.startsOver ?? "last") : (v.starts ?? "held"));
  const start = starts === "last" || starts === "in" ? starts : "held";
  const name = String(v.variable ?? "").trim();
  const unitText = String(v.unit ?? "").trim();
  const unit = unitText ? unitNamed(unitText) : "none";
  if (!unit) return { why: `${unitText} is no unit Meno knows: leave it blank, or give one of its units (kcal/mol/rad², K, Å...)` };
  if (name && !/^[A-Za-z][A-Za-z0-9_.-]{0,39}$/.test(name)) return { why: "Name the variable with a letter first, then letters, digits, _ . or -" };
  if (repeat === "over") {
    const lines = String(v.values ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return { why: "Give the values, one to a line" };
    const values = lines.map(numberIn);
    const bad = lines.find((_, k) => values[k] == null);
    if (bad != null) return { why: `"${bad}" is no number` };
    if (!name) return { why: "Name the variable the values are given as" };
    return { repeat, passes: values.length, variable: { name, from: values[0]!, step: 0, values: values as number[], unit }, counted, starts: start };
  }
  const passes = Number(repeat === "until" ? (v.most ?? MOST_PASSES) : (v.times ?? PASSES));
  if (!Number.isInteger(passes) || passes < 1) return { why: repeat === "until" ? "Give at most how many passes" : "Give how many passes" };
  if (!name) return { repeat, passes, counted, starts: start };
  const from = numberIn(String(v.from ?? ""));
  const step = numberIn(String(v.step ?? ""));
  if (from == null) return { why: `Give ${name}'s first value, From` };
  if (step == null) return { why: `Give how much ${name} goes up each time, Step` };
  return { repeat, passes, variable: { name, from, step, unit }, counted, starts: start };
}

/** The variable's value at `count` (from 0): From and `count` Steps, or the `count`th of the values given (none past the last). */
export function valueAt(variable: NonNullable<RepeatRead["variable"]>, count: number): number | undefined {
  if (variable.values) return variable.values[count];
  return Number((variable.from + count * variable.step).toPrecision(12));
}

/** What a Repeat still needs of its options before it can run, as its card says it: none where they read. */
export const repeatNeeds = (v: OptionValues): string | undefined => {
  const r = repeatRead(v);
  return "why" in r ? r.why : undefined;
};

/** A Repeat's line: how many passes, its variable and its values, how they are counted - "3 passes; k from 50 by 50 kcal/mol/rad², counted per entry". */
export function repeatHow(v: OptionValues): string {
  const r = repeatRead(v);
  if ("why" in r) return r.why;
  const passes = r.repeat === "until" ? `until none goes again, at most ${r.passes} passes` : `${r.passes} ${r.passes === 1 ? "pass" : "passes"}`;
  if (!r.variable) return passes;
  const unit = r.variable.unit === "none" ? "" : ` ${UNITS[r.variable.unit].label}`;
  const values = r.variable.values ? `${r.variable.name} over ${r.variable.values.join(", ")}${unit}` : `${r.variable.name} from ${r.variable.from} by ${r.variable.step}${unit}`;
  return `${passes}; ${values}, counted per ${r.counted}`;
}
