/**
 * *Tag* (docs/WORKFLOWS-FOUNDATION.md, *Steps, ports and exits*): each entry
 * given an ID of its own - "start-1", "start-2"... in the order they came -
 * under the name the chemist gives, a property that rides along with every
 * entry made from it, so that two inputs are matched on it later, never by an
 * implicit rule. A name an entry already carries is never written over.
 */
import type { Entry } from "../entry";
import { entries as count, type NodeOutcome } from "./base";

export type TagOptions = { name: string };

/** *Tag* on `entries`: *done*, each with its ID under `name`, in the order they came. */
export function tag(entries: readonly Entry[], options: TagOptions): NodeOutcome<"done"> {
  const name = options.name.trim();
  if (!name) return { ok: false, said: "The tag needs a name" };
  if (!entries.length) return { ok: false, said: "Nothing came in" };
  const taken = entries.filter((e) => e.properties[name]);
  if (taken.length) return { ok: false, said: `${count(taken.length)} already ${taken.length === 1 ? "has" : "have"} ${name}: give the tag another name` };
  const done = entries.map((e, k) => ({ ...e, properties: { ...e.properties, [name]: { value: `${name}-${k + 1}`, unit: "none" as const, status: "computed" as const } } }));
  return { ok: true, exits: { done }, said: `${name}: ${count(done.length)} tagged, ${name}-1${done.length > 1 ? ` to ${name}-${done.length}` : ""}` };
}
