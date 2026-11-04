/**
 * *Barrier* (docs/WORKFLOWS.md, *Barrier*): each saddle point's height above
 * its start - the free energy G by default, or the electronic energy E -
 * paired as the chemist says (in order, each with each, or matched on a
 * property: pairs `matchesOf`, the rule *Path search* pairs by), its start
 * known to be its by what the chain before it did, never by a rule of
 * Meno's. A pair is worked out only where both are results to stand on and
 * were worked out alike; else it goes out of *Failed*, saying why:
 * - the saddle point a converged one - an optimisation to a saddle point,
 *   or *Path search*'s point refined - with one imaginary frequency; the
 *   start a converged optimisation (workflow/converged), and, for G, with
 *   none: a free energy leaves out what is imaginary;
 * - the two the same atoms in one numbering, of one charge and spin;
 * - their energies, or their free energies, at one level, temperature,
 *   pressure, solvent and treatment (lib/nodes `workedOutAs`); a sum of
 *   parts (*Add*'s) of the same parts, each worked out alike - a standard
 *   state on one side alone among them;
 * - for G, the rotational symmetry number each was worked out with read
 *   (lib/entry `By.symmetryNumber`): a G whose sigma was not printed cannot
 *   be told. Two that differ are kept: it is so of the two molecules - and
 *   said, with each one's point group.
 * The barrier is written on the saddle point, in kcal/mol: (X(saddle point)
 * - X(start)) at the hartree's CODATA 2018 value (lib/units).
 */
import { geometryKey, type Property } from "../../../../lib/entry";
import { partValue, workedOutDiffer } from "../../../../lib/nodes/base";
import { R_GAS } from "../../../../lib/nodes/standardState";
import { convert, isUnit, sameDimension, type Unit } from "../../../../lib/units";
import { convergedOf } from "./converged";
import { compoundLetter, entryOfSet, imaginaryOf, THERMO_PROPERTIES, type SetEntry } from "./entries";
import type { Holds3D } from "./kinds";
import type { Outcome3D } from "./meno";
import { pairEntries, type Pairing } from "./pairs";

/** Which energy a barrier is of: the free energy G, or the electronic energy E. */
export type BarrierEnergy = "G" | "E";
/** How a G barrier counts each side's rotational symmetry: as each program read it, or left out - sigma 1 on both sides. */
export type BarrierSymmetry = "as-read" | "left-out";
export type BarrierOptions = { energy: BarrierEnergy; free: string; pairs: Pairing; property: string; symmetry?: BarrierSymmetry };

/** The property a barrier is written under. */
export const BARRIER = "barrier";
/** The free energy Meno reads of a calculation (entries `THERMO_PROPERTIES`), a G unless another is named. */
export const FREE_ENERGY = "thermo.free-energy";

const named = (e: SetEntry) => `${compoundLetter(e.compound)} #${e.number}`;
/** How a saddle point may have ended converged: optimised to one, or a path's point refined. */
const SADDLE_HOW: readonly string[] = ["saddle point optimisation", "highest point refined"];
/** Whether a sum's part is a thermochemical value of a calculation's, worked out with a sigma (entries `THERMO_PROPERTIES`) - read when asked: that list is another module's, made after this one is loaded. */
const thermal = (property: string) => (THERMO_PROPERTIES as readonly string[]).includes(property);

/** What a Barrier step still needs of its options: the property its G is, where G is asked. */
export function barrierNeeds(v: Record<string, string | number | boolean>): string | undefined {
  if (v.energy !== "E" && !String(v.free ?? "").trim()) return "Name the property that is its free energy G";
  if (v.pairs === "property" && !String(v.property ?? "").trim()) return "Name the property to pair them on";
  return undefined;
}

/** How a Barrier step does its work, in a line: "G (thermo.free-energy), each saddle point less its start" - or what it still needs. */
export function barrierHow(v: Record<string, string | number | boolean>): string {
  const needs = barrierNeeds(v);
  if (needs) return needs;
  const of = v.energy === "E" ? "E" : `G (${String(v.free).trim()})`;
  const pairs = v.pairs === "each" ? "each with each" : v.pairs === "property" ? `matched on ${String(v.property).trim()}` : "in order";
  return `${of}, each saddle point less its start, ${pairs}`;
}

/** How two values were worked out differently, in a few words - "temperature: 298.15 K and 310 K" - or nothing where alike (lib/nodes `workedOutDiffer`). */
function differ(a: Property, b: Property): string | null {
  const d = workedOutDiffer(a, b);
  return d ? `${d[0]}: ${d[1]} and ${d[2]}` : null;
}

/** The value `name` of an entry, of its own geometry, worked out, an energy: or why not. */
function valueOf(e: SetEntry, name: string, who: string): Property | string {
  const p = entryOfSet(e, "x").properties[name];
  if (!p) return `${who} has no ${name}`;
  if (p.status !== "computed" || typeof p.value !== "number" || !Number.isFinite(p.value)) return `${who}'s ${name} was not worked out`;
  if (p.unit === "none" || !isUnit(p.unit) || !sameDimension(p.unit, "kcal/mol")) return `${who}'s ${name} is no energy`;
  if (p.at?.geometry != null && p.at.geometry !== geometryKey(e.xyz)) return `${who}'s ${name} is of another geometry`;
  return p;
}

/** Whether a value's level was said: the method, of a value or of each part a program worked out (a number given, its own words, none). */
const levelSaid = (p: Property): boolean => (p.parts ? p.parts.filter((q) => q.at).every((q) => !!q.by?.method) && p.parts.some((q) => q.at) : !!p.by?.method);

/** Why two free energies - or energies - cannot be set one against the other: worked out otherwise, of other parts, sigma not read; none where they can. */
function unlikeValues(s: Property, t: Property, name: string, start: string, g: boolean): string | null {
  if (!levelSaid(s) || !levelSaid(t)) return `the level ${name} was worked out at is not said of ${!levelSaid(s) ? "the saddle point's" : `its start ${start}'s`}`;
  const sp = s.parts;
  const tp = t.parts;
  if (sp || tp) {
    const said = (p: Property) => (p.parts ? p.parts.map((q) => q.property).join(" + ") : name);
    if (!sp || !tp || sp.length !== tp.length || sp.some((q, i) => q.property !== tp[i].property))
      return `${name} of the saddle point is ${said(s)}, of its start ${start} ${said(t)}: not summed of the same parts`;
    for (let i = 0; i < sp.length; i++) {
      const d = differ(partValue(sp[i]), partValue(tp[i]));
      if (d) return `their ${sp[i].property} in ${name} were not worked out alike - ${d}`;
      if (g && thermal(sp[i].property) && (sp[i].by?.symmetryNumber == null || tp[i].by?.symmetryNumber == null))
        return `the rotational symmetry number ${sp[i].property} in ${name} was worked out with was not read of ${sp[i].by?.symmetryNumber == null ? "the saddle point" : `its start ${start}`}: its rotational entropy cannot be told`;
    }
    // (a G summed of parts none of which is a calculation's thermochemistry: worked out with no rotational symmetry number to read -
    //  as read or left out, its rotational entropy cannot be told)
    if (g && !sp.some((q) => thermal(q.property)))
      return `${name} is ${said(s)}, none of them a calculation's thermochemistry: the rotational symmetry number it was worked out with cannot be read, nor its rotational entropy told`;
    return null;
  }
  const d = differ(s, t);
  if (d) return `their ${name} were not worked out alike - ${d}`;
  if (g && (s.by?.symmetryNumber == null || t.by?.symmetryNumber == null))
    return `the rotational symmetry number ${name} was worked out with was not read of ${s.by?.symmetryNumber == null ? "the saddle point" : `its start ${start}`}: its rotational entropy cannot be told`;
  return null;
}

/** The rotational symmetry number and temperature a G was worked out with - of a sum, its thermal part's. */
function sigmaOf(p: Property): { sigma?: number; kelvin?: number } {
  const part = p.parts ? p.parts.find((q) => thermal(q.property)) : undefined;
  const by = part ? part.by : p.by;
  const kelvin = part ? part.at?.kelvin : p.at?.kelvin;
  return { ...(by?.symmetryNumber != null ? { sigma: by.symmetryNumber } : {}), ...(kelvin != null ? { kelvin } : {}) };
}

/** RT ln sigma in kcal/mol: what a rotational symmetry number of sigma takes off a G's rotational entropy, at `kelvin` (R CODATA 2018, exact; the thermochemical calorie). */
const rtLnSigma = (sigma: number, kelvin: number) => ((R_GAS * kelvin) / 4184) * Math.log(sigma);

/** Each one's point group and symmetry number, as its G was worked out with: "D3h, σ 6" - of a sum, its thermal part's. */
function symmetrySaid(p: Property): string {
  const by = p.parts ? p.parts.find((q) => thermal(q.property))?.by : p.by;
  return by?.symmetryNumber == null ? "not read" : `${by.pointGroup ?? "point group not read"}, σ ${by.symmetryNumber}`;
}

/** A saddle point with its start: its barrier, or why it has none. */
function barrierOf(saddle: SetEntry, start: SetEntry, o: BarrierOptions): Property | string {
  const g = o.energy !== "E";
  const s = named(saddle);
  const t = `${named(start)}`;
  // (the same atoms, in one numbering, of one charge and spin: else no barrier joins them)
  if (saddle.atoms.length !== start.atoms.length || saddle.atoms.some((a, i) => a.el !== start.atoms[i].el)) return `${s} and its start ${t} are not the same atoms in one numbering`;
  const species = (e: SetEntry) => {
    const sp = entryOfSet(e, "").species;
    return sp ? `${sp.charge}|${sp.multiplicity}` : "none";
  };
  if (species(saddle) !== species(start)) return `${s} and its start ${t} are not of one charge and spin`;
  // (each a converged result, of its geometry: the saddle point optimised to one, or a path's point refined; the start optimised)
  const sc = convergedOf(saddle);
  if (!sc || !SADDLE_HOW.includes(sc.how)) return `${s} is no converged saddle point: optimise it to a saddle point, or take Path search's point refined, then Frequencies on it`;
  const tc = convergedOf(start);
  if (!tc || tc.how !== "optimisation") return `its start ${t} is no converged optimisation: optimise it, then Frequencies on it`;
  // (one imaginary frequency on the saddle point; none on the start, for G - a free energy leaves out what is imaginary)
  const si = imaginaryOf(saddle);
  if (si === "not computed") return `${s}'s frequencies were not worked out: Frequencies on it first`;
  if (si.length !== 1) return `${s} has ${si.length} imaginary frequencies: a saddle point has one`;
  const ti = imaginaryOf(start);
  if (g && ti === "not computed") return `its start ${t}'s frequencies were not worked out: Frequencies on it first`;
  if (g && ti !== "not computed" && ti.length) return `its start ${t} has ${ti.length} imaginary ${ti.length === 1 ? "frequency" : "frequencies"}, which its free energy leaves out: choose E, or optimise it to a minimum`;
  // (the two values, of their own geometries, worked out alike)
  const name = g ? o.free.trim() : "energy";
  const sv = valueOf(saddle, name, s);
  if (typeof sv === "string") return sv;
  const tv = valueOf(start, name, `its start ${t}`);
  if (typeof tv === "string") return tv;
  const unlike = unlikeValues(sv, tv, name, t, g);
  if (unlike) return `${s}: ${unlike}`;
  const kcal = (p: Property) => convert(p.value as number, p.unit as Unit, "kcal/mol");
  // (sigma left out, where asked: each side's RT ln sigma taken off its G by Meno, at the temperature its G was worked out at - sigma 1 on both)
  const leftOut = g && o.symmetry === "left-out";
  const [ss, ts] = [sigmaOf(sv), sigmaOf(tv)];
  if (leftOut && (ss.kelvin == null || ts.kelvin == null)) return `${s}: the temperature ${name} was worked out at is not said, so its rotational symmetry cannot be left out`;
  // (and, left out, a sigma read on both sides - never a barrier of a sigma not there: no number at all)
  if (leftOut && (ss.sigma == null || ts.sigma == null)) return `${s}: the rotational symmetry number ${name} was worked out with was not read of ${ss.sigma == null ? "the saddle point" : `its start ${t}`}, so it cannot be left out`;
  const lessSigma = leftOut ? rtLnSigma(ss.sigma!, ss.kelvin!) - rtLnSigma(ts.sigma!, ts.kelvin!) : 0;
  const what = g ? `free energy G (${name}${sv.by?.treatment && !sv.parts ? `; ${sv.by.treatment}` : ""})` : "electronic energy E";
  const symmetry = g
    ? `; point group and rotational symmetry number: ${symmetrySaid(sv)} (saddle point), ${symmetrySaid(tv)} (start)${leftOut ? `; rotational symmetry left out - σ 1 on both sides, each side's RT ln σ taken off by Meno (R = ${R_GAS} J/(mol K))` : ""}`
    : "";
  const imaginary = !g && ti !== "not computed" && ti.length ? `; its start has ${ti.length} imaginary ${ti.length === 1 ? "frequency" : "frequencies"}` : "";
  const level = sv.parts ? {} : { ...(sv.by?.program ? { program: sv.by.program } : {}), ...(sv.by?.method ? { method: sv.by.method } : {}), ...(sv.by?.basis ? { basis: sv.by.basis } : {}) };
  return {
    value: kcal(sv) - kcal(tv) - lessSigma,
    unit: "kcal/mol",
    at: { geometry: geometryKey(saddle.xyz), ...(sv.at?.kelvin != null ? { kelvin: sv.at.kelvin } : {}), ...(sv.at?.atm != null ? { atm: sv.at.atm } : {}), ...(sv.at?.solvent != null ? { solvent: sv.at.solvent } : {}) },
    by: { ...level, treatment: `${what}: the saddle point's less its start ${t}'s${symmetry}${imaginary}${unstated(sv) ? "; solvation not stated" : ""}` },
    status: "computed",
  };
}

/** Whether a value says no solvation, its own or any part a program worked out: one side's matched the other's as not stated, never silently. */
const unstated = (p: Property): boolean => (p.parts ? p.parts.some((q) => q.at && q.at.solvent == null) : p.at?.solvent == null);

/** The level and conditions a barrier is of, in a few words: "G at GFN2-xTB, 298.15 K" - of a sum, its parts. */
function ofWords(p: Property, energy: BarrierEnergy, free: string): string {
  const level = p.by?.method ? [p.by.method, p.by.basis].filter(Boolean).join("/") : free;
  const of = energy === "E" ? `E at ${level}` : p.parts ? `G = ${p.parts.map((q) => q.property).join(" + ")}` : `G at ${level}`;
  return [of, p.at?.kelvin != null && energy !== "E" ? `${p.at.kelvin} K` : ""].filter(Boolean).join(", ");
}

/** *Barrier*: each saddle point, paired with its start as `o` says, with its barrier written on it; those it cannot have one out of Failed, saying why. */
export function barrierSet(saddles: readonly SetEntry[], starts: readonly SetEntry[], holds: Holds3D, o: BarrierOptions): Outcome3D {
  const needs = barrierNeeds({ energy: o.energy, free: o.free, pairs: o.pairs, property: o.property });
  if (needs) return { ok: false, said: needs };
  const paired = pairEntries(saddles, starts, o.pairs, o.property, { first: "Saddle points", second: "Starts", one: "saddle point", other: "start", unlike: () => null });
  if ("why" in paired) return { ok: false, said: paired.why };
  const kept: SetEntry[] = [];
  const aside: SetEntry[] = [];
  const refused = new Map(paired.refused.map((r) => [r.entry, r.why]));
  paired.entries.forEach((p, k) => {
    const { end, ...saddle } = p;
    const got = refused.get(k) ?? (end ? barrierOf(saddle, end, o) : `${named(saddle)} is paired with no start`);
    if (typeof got === "string") aside.push({ ...saddle, failed: { kind: "refused", why: got } });
    else kept.push({ ...saddle, properties: { ...saddle.properties, [BARRIER]: got } });
  });
  const symbol = o.energy === "E" ? "ΔE‡" : "ΔG‡";
  const values = kept.map((e) => e.properties![BARRIER].value as number);
  const first = kept[0]?.properties?.[BARRIER];
  const of = first ? ofWords(entryOfSet(kept[0], "x").properties[o.energy === "E" ? "energy" : o.free.trim()] ?? first, o.energy, o.free.trim()) + (o.energy !== "E" && o.symmetry === "left-out" ? ", σ left out" : "") : "";
  const shown =
    values.length === 1
      ? `${symbol} ${values[0].toFixed(2)} kcal/mol (${of})`
      : values.length
        ? `${values.length} of ${paired.entries.length} given ${symbol}, ${Math.min(...values).toFixed(2)} to ${Math.max(...values).toFixed(2)} kcal/mol (${of})`
        : `none of ${paired.entries.length} given ${symbol}`;
  return { ok: true, holds, kept, aside, said: `${shown}${aside.length ? ` · failed ${aside.length}` : ""}` };
}
