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

/**
 * What a Tag step still needs before it can run, its name as typed: a name -
 * or nothing, where it has one. What its card says where it would say
 * *Ready*, and why its run is refused.
 */
export function tagNeeds(name: string): string | undefined {
  return name.trim() ? undefined : "Name the tag";
}

/** *Tag* on `entries`: *done*, each with its ID under `name`, in the order they came. */
export function tag(entries: readonly Entry[], options: TagOptions): NodeOutcome<"done"> {
  const needs = tagNeeds(options.name);
  if (needs) return { ok: false, said: needs };
  const name = options.name.trim();
  if (!entries.length) return { ok: false, said: "Nothing came in" };
  const taken = entries.filter((e) => e.properties[name]);
  if (taken.length) return { ok: false, said: `${count(taken.length)} already ${taken.length === 1 ? "has" : "have"} ${name}: give the tag another name` };
  const done = entries.map((e, k) => ({ ...e, properties: { ...e.properties, [name]: { value: `${name}-${k + 1}`, unit: "none" as const, status: "computed" as const } } }));
  return { ok: true, exits: { done }, said: `${name}: ${count(done.length)} tagged, ${name}-1${done.length > 1 ? ` to ${name}-${done.length}` : ""}` };
}
