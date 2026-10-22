/**
 * *Merge* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*): two or more
 * sets made one, in the inputs' order - all of them, or one entry for each
 * value of a property (an ID from *Tag*), the first met kept and the others
 * set aside, each naming the one kept. An entry with no value goes to *rest*
 * too, saying so. An entry whose ID another kept entry already has is given
 * a new one - its own with "~2", "~3"... - counted and said.
 */
import type { Entry } from "../entry";
import { entries as count, setAside, tally, unitLabel, unreadable, type NodeOutcome } from "./base";

export type MergeOptions = { keep: "all" | { onePer: string } };

/** *Merge* of `inputs`, each a set's entries in order: *done*, the entries kept, input by input; *rest*, those set aside, each saying why. */
export function merge(inputs: readonly (readonly Entry[])[], options: MergeOptions): NodeOutcome<"done" | "rest"> {
  if (inputs.length < 2) return { ok: false, said: "Merge takes two sets or more" };
  if (typeof options.keep === "object" && !options.keep.onePer) return { ok: false, said: "No property to keep one per value of" };
  const done: Entry[] = [];
  const rest: Entry[] = [];
  const first = new Map<string, string>();
  const ids = new Set<string>();
  let renamed = 0;
  for (const input of inputs) {
    for (const e of input) {
      if (typeof options.keep === "object") {
        const name = options.keep.onePer;
        const p = e.properties[name];
        const why = unreadable(p, name);
        if (why) {
          rest.push(setAside(e, why));
          continue;
        }
        const key = typeof p!.value === "number" ? `${p!.value} ${unitLabel(p!.unit)}` : JSON.stringify(p!.value);
        const kept = first.get(key);
        if (kept != null) {
          rest.push(setAside(e, `the same ${name} as ${kept}, which was kept`));
          continue;
        }
        first.set(key, e.id);
      }
      let id = e.id;
      for (let k = 2; ids.has(id); k++) id = `${e.id}~${k}`;
      if (id !== e.id) renamed++;
      ids.add(id);
      done.push(id === e.id ? e : { ...e, id });
    }
  }
  const all = inputs.reduce((n, i) => n + i.length, 0);
  const said = `${done.length} of ${count(all)} from ${inputs.length} sets` + (renamed ? ` · ${renamed} given new IDs (theirs already taken)` : "") + (rest.length ? ` · rest ${rest.length} (${tally(rest)})` : "");
  return { ok: true, exits: { done, rest }, said };
}
