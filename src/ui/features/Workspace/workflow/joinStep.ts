/**
 * *Join* on a set's entries (lib/nodes `join`): *Onto*'s entries, each with
 * properties of *From*'s put on - matched on a property both carry, an ID a
 * *Tag* gave - each record as it was (where and by what it was worked out).
 * Each comes back as it came, with them; one with nothing put on goes to
 * *Not joined* with why written on it (`set_aside`).
 */
import { carriedIn, join } from "../../../../lib/nodes/join";
import { entryOfSet, type SetEntry } from "./entries";
import type { Holds3D } from "./kinds";
import type { Outcome3D } from "./meno";
import { SET_ASIDE } from "./structureSteps";

/** The core's words for the second input, in the port's name: "no entry of From has its path, p". */
const inPorts = (said: string) => said.replace(/\bthe other input\b/g, "From");

/** What a Join step still needs of its options: a property to match on, and what to put on, as it reads. */
export function joinNeeds(v: Record<string, string | number | boolean>): string | undefined {
  if (!String(v.on ?? "").trim()) return "Name the property to match on";
  const read = carriedIn(String(v.carry ?? ""));
  if ("why" in read) return read.why;
  return read.carry.length ? undefined : "Name what to put on";
}

/** How a Join step does its work, in a line: "species as first end, on path" - or what it still needs. */
export function joinHow(v: Record<string, string | number | boolean>): string {
  const needs = joinNeeds(v);
  if (needs) return needs;
  const read = carriedIn(String(v.carry));
  const put = "carry" in read ? read.carry.map((c) => (c.as === c.from ? c.from : `${c.from} as ${c.as}`)).join(", ") : "";
  return `${put}, on ${String(v.on).trim()}`;
}

/** *Join*: `onto`'s entries with properties of `from`'s put on, matched on `on`; `carry`, what is put on as typed. */
export function joinedSet(onto: readonly SetEntry[], from: readonly SetEntry[], holds: Holds3D, on: string, carry: string): Outcome3D {
  const needs = joinNeeds({ on, carry });
  if (needs) return { ok: false, said: needs };
  const read = carriedIn(carry);
  if ("why" in read) return { ok: false, said: read.why };
  const out = join(
    onto.map((e, i) => entryOfSet(e, String(i))),
    from.map((e, i) => entryOfSet(e, String(i))),
    { on: on.trim(), carry: read.carry },
  );
  if (!out.ok) return out;
  // (each as it came: what was put on added to its own properties, each record as it was)
  const back = (id: string) => onto[Number(id)];
  const kept = out.exits.joined.map((e) => {
    const was = back(e.id);
    return { ...was, properties: { ...was.properties, ...Object.fromEntries(read.carry.map((c) => [c.as, e.properties[c.as]])) } };
  });
  const asideWhy = (e: { status: unknown }) => (typeof e.status === "object" && e.status && "aside" in e.status ? String(e.status.aside) : "");
  const aside = out.exits.rest.map((e) => {
    const was = back(e.id);
    return { ...was, properties: { ...was.properties, [SET_ASIDE]: { value: inPorts(asideWhy(e)), unit: "none" as const, status: "computed" as const } } };
  });
  // (the line in the ports' names: what came in counted as entries of *Onto*)
  return { ok: true, holds, kept, aside, said: inPorts(out.said).replace(/^(\d+) of (\d+) entr(?:y|ies)/, (_, k, n) => `${k} of ${n} ${Number(n) === 1 ? "entry" : "entries"} of Onto`) };
}
