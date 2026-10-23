/**
 * An Energy diagram step's options as its card shows them (docs/WORKFLOWS.md,
 * *Energy diagrams*): each a list of what comes into its *Levels* - the
 * energies its levels carry, each by its symbol and how it was worked out
 * (lib/energyDiagram `diagramQuantities`); its levels, one to a line in the
 * order they come, each to be put in another order or shown by another name;
 * and which one the rest are relative to - so that none is typed blind. As
 * the kind declares them where nothing comes in.
 */
import { diagramQuantities, levelNamer, levelsTyped, type LevelLine } from "../../../../lib/energyDiagram";
import type { LineRead, Option } from "../../../../lib/options";
import { moleculesSeen } from "./flow";
import type { WorkflowStep } from "../store/types";

type Seen = Parameters<typeof moleculesSeen>[0];

/** Each flow's steps' options, by the step and its own Levels, worked out once for it: a flow changed is a new one. */
const made = new WeakMap<object, Map<string, readonly Option[]>>();

/** `step`'s options, `declared` as its kind declares them, each made a list of what comes into its Levels in `flow`. */
export function diagramOptions(flow: Seen, step: Pick<WorkflowStep, "id" | "options">, declared: readonly Option[]): readonly Option[] {
  const mine = made.get(flow) ?? new Map<string, readonly Option[]>();
  made.set(flow, mine);
  const levels = String(step.options?.levels ?? "");
  // (again where its Levels changed: the reference's list follows them)
  const key = `${step.id}\n${levels}`;
  const had = mine.get(key);
  if (had) return had;
  const out = listed(flow, step.id, levels, declared);
  mine.set(key, out);
  return out;
}

function listed(flow: Seen, id: number, levels: string, declared: readonly Option[]): Option[] {
  const seen = moleculesSeen(flow, id, "levels");
  if (!seen) return [...declared];
  const nameOf = levelNamer(seen.table);
  const names = [...new Set(seen.table.rows.map(nameOf))];
  const energies = diagramQuantities(seen.table);
  // (in the order Levels lists them, each by the name it gives - the rest after, as they come)
  const lines = levelsTyped(levels);
  const order: LevelLine[] = [...lines.flatMap((l) => (l && names.includes(l.of) ? [l] : [])), ...names.filter((n) => !lines.some((l) => l?.of === n)).map((of) => ({ of }))].filter(
    (l, k, all) => all.findIndex((x) => x.of === l.of) === k,
  );
  return declared.map((o): Option => {
    if (o.id === "quantity" && energies.length) return { id: o.id, label: o.label, type: "choice", choices: energies, default: energies.some((e) => e.value === "energy") ? "energy" : energies[0].value };
    if (o.id === "levels" && o.type === "lines") return { ...o, default: names.join("\n"), readAs: (text) => readAs(text, names) };
    if (o.id === "reference" && order.length) return { id: o.id, label: o.label, type: "choice", choices: order.map((l) => ({ value: l.of, label: l.as ?? l.of })), default: order[0].of };
    return o;
  });
}

/** What each line of Levels was read as: the level it puts where, and the name it shows it by; or that it names no level that comes in, or one listed already. */
function readAs(text: string, names: readonly string[]): LineRead[] {
  const seen = new Set<string>();
  let k = 0;
  return levelsTyped(text).map((l) => {
    if (!l) return { said: "" };
    if (!names.includes(l.of)) return { said: `No level "${l.of}" comes in`, problem: true };
    if (seen.has(l.of)) return { said: "Listed already", problem: true };
    seen.add(l.of);
    k += 1;
    return { said: `Level ${k}${l.as ? `, shown as ${l.as}` : ""}` };
  });
}
