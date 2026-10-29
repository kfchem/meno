/**
 * *Number* and *Add* on a page (lib/nodes `add`, `standardState`): a
 * number a step gives - the standard-state term from its temperature, or
 * one typed with its unit - and the sum of an entry's values of one
 * geometry, a number given besides, written as a new value on each entry,
 * each part as it was.
 */
import type { NumberValue } from "../../../../lib/table";
import { add, type GivenPart } from "../../../../lib/nodes/add";
import { standardStateBy, standardStateTerm } from "../../../../lib/nodes/standardState";
import { isUnit, type Unit } from "../../../../lib/units";
import { entryOfSet, type SetEntry } from "./entries";
import type { Holds3D } from "./kinds";
import type { Outcome3D } from "./meno";
import { SET_ASIDE } from "./structureSteps";

type Values = Record<string, string | number | boolean>;

/** What a Number step gives, from its options: the standard-state term at its temperature, or the number typed, with its unit - or why not. */
export function numberOf(v: Values): NumberValue | { why: string } {
  if (v.what === "typed") {
    const unit = String(v.unit ?? "").trim() || "none";
    if (unit !== "none" && !isUnit(unit)) return { why: `${unit} is no unit Meno knows` };
    if (!Number.isFinite(Number(v.value))) return { why: "Type the number" };
    return { value: Number(v.value), unit: unit as Unit | "none", by: { treatment: "typed" } };
  }
  const kelvin = Number(v.temperature);
  const term = standardStateTerm(kelvin);
  if (term == null) return { why: "The temperature must be above 0 K" };
  return { value: term, unit: "kcal/mol", by: standardStateBy(kelvin) };
}

/** What a Number step still needs of its options: nothing, or why its number cannot be given. */
export function numberNeeds(v: Values): string | undefined {
  const n = numberOf(v);
  return "why" in n ? n.why : undefined;
}

/** How a Number step does its work, in a line: "standard state at 298.15 K: 1.894 kcal/mol", or the number typed. */
export function numberHow(v: Values): string {
  const n = numberOf(v);
  if ("why" in n) return n.why;
  const shown = `${Number(n.value.toPrecision(4))}${n.unit === "none" ? "" : ` ${n.unit}`}`;
  return v.what === "typed" ? shown : `standard state at ${Number(v.temperature)} K: ${shown}`;
}

/** The parts typed, one to a line or each after a semicolon. */
const partsIn = (text: string) => text.split(/[\n;]/).map((p) => p.trim()).filter(Boolean);

/** What an Add step still needs of its options: a name for the sum, and the entries' properties to add. */
export function addNeeds(v: Values): string | undefined {
  if (!partsIn(String(v.parts ?? "")).length) return "Name the properties to add";
  if (!String(v.as ?? "").trim()) return "Name what the sum is written as";
  return undefined;
}

/** How an Add step does its work, in a line: "G-DFT = energy + thermo.g-correction", and the number wired in where one is. */
export function addHow(v: Values): string {
  return addNeeds(v) ?? `${String(v.as).trim()} = ${partsIn(String(v.parts)).join(" + ")}`;
}

/** A number a set holds as a part of a sum (`GivenPart`): named by what worked it out - the standard state - else "the number". */
export function givenOf(n: NumberValue): GivenPart {
  const standard = n.by?.treatment?.startsWith("standard state") ?? false;
  const kelvin = standard ? Number(/ at ([\d.]+) K/.exec(n.by!.treatment!)?.[1]) : NaN;
  return { name: standard ? "standard state" : "the number", value: n.value, unit: n.unit, ...(n.by ? { by: n.by } : {}), ...(Number.isFinite(kelvin) ? { kelvin } : {}) };
}

/** *Add* on a set's entries: each with the sum of its values named, and the number wired in, where one is, written under `as`; those it could not be worked out for set aside, each saying why. */
export function addedSet(entries: readonly SetEntry[], holds: Holds3D, v: Values, number?: NumberValue): Outcome3D {
  const needs = addNeeds(v);
  if (needs) return { ok: false, said: needs };
  const as = String(v.as).trim();
  const out = add(
    entries.map((e, i) => entryOfSet(e, String(i))),
    { parts: partsIn(String(v.parts)), as, ...(number ? { given: [givenOf(number)] } : {}) },
  );
  if (!out.ok) return out;
  const back = (id: string) => entries[Number(id)];
  // (each as it came, the sum among its own values)
  const kept = out.exits.done.map((e) => {
    const was = back(e.id);
    return { ...was, properties: { ...was.properties, [as]: e.properties[as] } };
  });
  const asideWhy = (e: { status: unknown }) => (typeof e.status === "object" && e.status && "aside" in e.status ? String(e.status.aside) : "");
  const aside = out.exits.rest.map((e) => {
    const was = back(e.id);
    return { ...was, properties: { ...was.properties, [SET_ASIDE]: { value: asideWhy(e), unit: "none" as const, status: "computed" as const } } };
  });
  return { ok: true, holds, kept, aside, said: out.said };
}
