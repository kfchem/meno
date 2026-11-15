/**
 * *Add* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*): properties of
 * one geometry summed into a new one on each entry - a single point's
 * energy, a thermal correction to G worked out at another level, and a
 * standard-state term: the free energy at the higher level (case F, steps
 * 31 and 42). Only values of the entry's own geometry are summed, each in
 * the first one's unit, at one temperature and one pressure where they say
 * them; a number given besides (a *Number*'s) has no geometry, and is
 * summed as it is. The sum keeps each part as it was (`Property.parts`):
 * its level is each part's, never one level for the whole.
 */
import { geometryKey, type By, type Entry, type Property, type PropertyPart } from "../entry";
import { convert, sameDimension, type Unit } from "../units";
import { entries as count, numberIn, setAside, tally, unitLabel, unreadable, workedOutAs, type NodeOutcome } from "./base";

/** A number given besides the entries' own values (a *Number*'s): no geometry, a temperature where it is of one. */
export type GivenPart = { name: string; value: number; unit: Unit | "none"; by?: By; kelvin?: number };

export type AddOptions = {
  /** The entries' properties summed, in order: the first one's unit is the sum's. */
  parts: readonly string[];
  /** Numbers given besides, summed as they are. */
  given?: readonly GivenPart[];
  /** The name the sum is written under. */
  as: string;
};

/** What a part is, in a few words, as its record says: "energy (wB97X-D/6-311+G(d,p), Gaussian, SMD(chloroform))". */
export function partSaid(p: PropertyPart): string {
  if (!p.at && p.by?.treatment) return `${p.property} (${p.by.treatment})`;
  const w = new Map(workedOutAs({ value: p.value, unit: p.unit, ...(p.at ? { at: p.at } : {}), ...(p.by ? { by: p.by } : {}), status: "computed" }));
  const stated = (k: string) => {
    const v = w.get(k);
    return v && v !== "not stated" && v !== "unknown" ? v : "";
  };
  const level = [stated("method"), stated("basis")].filter(Boolean).join("/");
  // (its solvent as stated - "none (gas phase)" where the output says it used none - or, of a part a program worked out at a
  //  geometry, that it was not stated, so that a sum of parts none states is never read as of one solvent; a number given
  //  besides, of no geometry, has no solvation to state)
  const solvent = stated("solvent") || (p.at ? "solvation not stated" : "");
  const words = [level, stated("program"), solvent, stated("temperature"), stated("pressure"), stated("thermal treatment")].filter(Boolean);
  return words.length ? `${p.property} (${words.join(", ")})` : p.property;
}

/**
 * *Add* on `entries`: *done*, each with the sum written under `as`, in the
 * order they came; *rest*, those it could not be worked out for, each
 * saying why. The step as a whole refuses a given number that does not
 * convert to the parts' unit, before any entry.
 */
export function add(entries: readonly Entry[], options: AddOptions): NodeOutcome<"done" | "rest"> {
  const as = options.as.trim();
  const names = options.parts.map((p) => p.trim()).filter(Boolean);
  const given = options.given ?? [];
  if (!as) return { ok: false, said: "Name what the sum is written as" };
  if (names.length + given.length < 2) return { ok: false, said: "Name two parts or more to add" };
  if (!names.length) return { ok: false, said: "Name a property of the entries to add" };
  if (new Set(names).size < names.length) return { ok: false, said: "A property is named twice" };
  const done: Entry[] = [];
  const rest: Entry[] = [];
  for (const e of entries) {
    const why = sumOf(e, names, given, as);
    if (typeof why === "string") rest.push(setAside(e, why));
    else done.push({ ...e, properties: { ...e.properties, [as]: why } });
  }
  if (done.length) {
    // (a number given that does not convert to the parts' unit is no part of any sum: the step is refused, never the entries one by one)
    const unit = done[0].properties[as].unit;
    const odd = given.find((g) => !convertible(g.unit, unit));
    if (odd) return { ok: false, said: `${odd.name} is in ${unitLabel(odd.unit)}, which does not convert to ${unitLabel(unit)}` };
  }
  const shown = [...names, ...given.map((g) => g.name)].join(" + ");
  const said = `${done.length} of ${count(entries.length)} given ${as} = ${shown}${rest.length ? ` · rest ${rest.length} (${tally(rest)})` : ""}`;
  return { ok: true, exits: { done, rest }, said };
}

const convertible = (a: Unit | "none", b: Unit | "none") => (a === "none" || b === "none" ? a === b : sameDimension(a, b));

/** The sum on `e`, as a property; or why it cannot be worked out. */
function sumOf(e: Entry, names: readonly string[], given: readonly GivenPart[], as: string): Property | string {
  if (as in e.properties) return `it has its own ${as} already`;
  if (e.geometry.kind !== "3d") return "it has no geometry in 3D to sum the values of";
  const geometry = geometryKey(e.geometry.xyz);
  const first = e.properties[names[0]];
  const firstWhy = unreadable(first, names[0]);
  if (firstWhy) return firstWhy;
  const unit = first!.unit;
  const parts: PropertyPart[] = [];
  let sum = 0;
  for (const name of names) {
    const p = e.properties[name];
    const v = numberIn(e, name, unit);
    if ("why" in v) return v.why;
    if (!p!.at?.geometry) return `its ${name} is of no geometry: only values of its own geometry are summed`;
    if (p!.at.geometry !== geometry) return `its ${name} was worked out at another geometry than its own`;
    sum += v.value;
    parts.push({ property: name, value: p!.value as number, unit: p!.unit, at: p!.at, ...(p!.by ? { by: p!.by } : {}) });
  }
  for (const g of given) {
    if (!convertible(g.unit, unit)) continue;
    sum += g.unit === "none" || unit === "none" ? g.value : convert(g.value, g.unit, unit);
    parts.push({ property: g.name, value: g.value, unit: g.unit, ...(g.by ? { by: g.by } : {}) });
  }
  // (one temperature and one pressure where the parts say them - the given numbers' temperatures among them)
  const kelvins = [
    ...parts.flatMap((p) => (p.at?.kelvin != null ? [{ name: p.property, k: p.at.kelvin }] : [])),
    ...given.flatMap((g) => (g.kelvin != null ? [{ name: g.name, k: g.kelvin }] : [])),
  ];
  const otherK = kelvins.find((x) => x.k !== kelvins[0].k);
  if (otherK) return `its parts are of different temperatures: ${kelvins[0].name} at ${kelvins[0].k} K and ${otherK.name} at ${otherK.k} K`;
  const atms = parts.flatMap((p) => (p.at?.atm != null ? [{ name: p.property, a: p.at.atm }] : []));
  const otherA = atms.find((x) => x.a !== atms[0].a);
  if (otherA) return `its parts are of different pressures: ${atms[0].name} at ${atms[0].a} atm and ${otherA.name} at ${otherA.a} atm`;
  // (the solvent the parts say, where all that say one say the same; where two differ - a single point in one, a correction in the gas phase - none: each part keeps its own)
  const solvents = [...new Set(parts.flatMap((p) => (p.at?.solvent != null ? [p.at.solvent] : [])))];
  const solvent = solvents.length === 1 ? solvents[0] : undefined;
  return {
    value: sum,
    unit,
    at: { geometry, ...(kelvins.length ? { kelvin: kelvins[0].k } : {}), ...(atms.length ? { atm: atms[0].a } : {}), ...(solvent != null ? { solvent } : {}) },
    // (no method or basis of its own: a sum of several levels claims none - each part says its own)
    by: { treatment: `sum: ${parts.map(partSaid).join(" + ")}` },
    parts,
    status: "computed",
  };
}
