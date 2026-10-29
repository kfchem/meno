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
import { entryOfSet, entryState, FINISHED, MENO_OWN, numberShown, type SetEntry } from "./entries";
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
  return { value: term, unit: "kcal/mol", by: standardStateBy(kelvin), kelvin };
}

/** What a Number step still needs of its options: nothing, or why its number cannot be given. */
export function numberNeeds(v: Values): string | undefined {
  const n = numberOf(v);
  return "why" in n ? n.why : undefined;
}

/** The temperature a Number's standard-state term is at unless set: 298.15 K, as its option's default says. */
const STANDARD_K = 298.15;

/** How a Number step is set, in a line: "standard state", "standard state at 310 K" - the default temperature unsaid - or the number typed, as Meno writes it. */
export function numberHow(v: Values): string {
  const n = numberOf(v);
  if ("why" in n) return n.why;
  if (v.what === "typed") return numberShown(n);
  return Number(v.temperature) === STANDARD_K ? "standard state" : `standard state at ${Number(v.temperature)} K`;
}

/** The parts typed, one to a line or each after a semicolon. */
const partsIn = (text: string) => text.split(/[\n;]/).map((p) => p.trim()).filter(Boolean);

/** What an Add step still needs of its options: a name for the sum, and the entries' properties to add. */
export function addNeeds(v: Values): string | undefined {
  if (!partsIn(String(v.parts ?? "")).length) return "Name the properties to add";
  const as = String(v.as ?? "").trim();
  if (!as) return "Name what the sum is written as";
  // (a name an entry's own record gives its own values - its free energy, its energy - never a sum's: it would read as worked out at one level)
  if (MENO_OWN.has(as)) return `"${as}" is a name Meno gives an entry's own values: write the sum under another name`;
  return undefined;
}

/** How an Add step does its work, in a line: "G-DFT = energy + thermo.g-correction" - and "+ number", where a number is wired into its Number. */
export function addHow(v: Values, number = false): string {
  return addNeeds(v) ?? `${String(v.as).trim()} = ${[...partsIn(String(v.parts)), ...(number ? ["number"] : [])].join(" + ")}`;
}

/** A number a set holds as a part of a sum (`GivenPart`): named by what worked it out - the standard state - else "the number"; of the temperature it carries, where it is of one. */
export function givenOf(n: NumberValue): GivenPart {
  const standard = n.by?.treatment?.startsWith("standard state") ?? false;
  return { name: standard ? "standard state" : "the number", value: n.value, unit: n.unit, ...(n.by ? { by: n.by } : {}), ...(n.kelvin != null ? { kelvin: n.kelvin } : {}) };
}

/** *Add* on a set's entries: each with the sum of its values named, and the number wired in, where one is, written under `as`; those it could not be worked out for set aside, each saying why. */
export function addedSet(entries: readonly SetEntry[], holds: Holds3D, v: Values, number?: NumberValue): Outcome3D {
  const needs = addNeeds(v);
  if (needs) return { ok: false, said: needs };
  const as = String(v.as).trim();
  // (one that is no result - failed, not converged, its marks unread - is never summed: its values are not to be trusted)
  const unfinished = new Map<number, string>();
  entries.forEach((e, i) => {
    const state = entryState(e);
    if (state !== FINISHED) unfinished.set(i, `not added: ${state}`);
  });
  const out = add(
    entries.flatMap((e, i) => (unfinished.has(i) ? [] : [entryOfSet(e, String(i))])),
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
  const said = (value: string) => ({ value, unit: "none" as const, status: "computed" as const });
  const aside = [
    ...out.exits.rest.map((e) => {
      const was = back(e.id);
      return { ...was, properties: { ...was.properties, [SET_ASIDE]: said(asideWhy(e)) } };
    }),
    ...[...unfinished].map(([i, why]) => ({ ...entries[i], properties: { ...entries[i].properties, [SET_ASIDE]: said(why) } })),
  ];
  // (its line says what it gave - the formula is on the card above it - and the rest counted by why)
  const whys = new Map<string, number>();
  for (const e of aside) {
    const w = String(e.properties?.[SET_ASIDE]?.value ?? "");
    whys.set(w, (whys.get(w) ?? 0) + 1);
  }
  const rest = aside.length ? ` · rest ${aside.length} (${[...whys].map(([w, n]) => `${n}: ${w}`).join("; ")})` : "";
  return { ok: true, holds, kept, aside, said: `${kept.length} of ${entries.length} ${entries.length === 1 ? "entry" : "entries"} given ${as}${rest}` };
}
