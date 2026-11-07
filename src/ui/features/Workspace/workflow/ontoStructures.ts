/**
 * 3D results onto structures (docs/WORKFLOWS.md, *3D results onto
 * structures*): each structure drawn that comes into *Structures*, given
 * what the set wired into *3D results* holds made of it - its conformers,
 * which name the structure by its lasting id in their lineage (`madeOf`,
 * entries `structureLineage`) - written on its record, as values any table,
 * chart, Filter or Rank after it reads as it reads any other; first on it,
 * before what it said already, in this order (`IN_3D`), so that a table
 * shows them first and a chart told no columns takes the share:
 * - `share among isomers`: its Boltzmann share, at the step's temperature,
 *   among the structures of its formula and charge alone - each of their
 *   finished conformers weighed by Populations' own rule (meno `basisOf`),
 *   with their degeneracies where each has one - their energies all of one
 *   calculation, and their free energies used only where all of them were
 *   worked out alike; none across formulas. A value of a group, as an
 *   ensemble's: at its lowest conformer's geometry and the temperature, by
 *   what worked out the energies it is of, over its own conformers;
 * - `conformers in 3D`: how many of its conformers the set holds;
 * - `E min` (Eh): the lowest electronic energy of those finished, as that
 *   conformer's energy is, where they come from one calculation;
 * - `G min` (Eh): the lowest free energy, where each finished one has one
 *   and all were worked out alike (lib/nodes `workedOutDiffer`);
 *   of E min and G min, one optimised with atoms held where they stood is
 *   none (converged `heldAt`): no stationary point - left out, and counted
 *   in the step's line; where every one finished was, why, in their place.
 *   The shares of its isomers are refused, as Populations refuses them
 *   (meno `notAllMinima`);
 * - `state in 3D`: finished, or how many of its conformers did not finish,
 *   or none in the set.
 * A value that cannot be worked out says why in its place, never a number:
 * one with no conformer finished, or none in the set, its E min and G min
 * too.
 * Matched by id alone, never by what a structure is: one with no lasting id,
 * or whose id another structure here has too, is given nothing.
 */
import type { Property } from "../../../../lib/entry";
import { workedOutDiffer } from "../../../../lib/nodes/base";
import { boltzmann } from "../../../../lib/boltzmann";
import { geometryKey } from "../../../../lib/entry";
import { calcLevel, entryOfSet, entryState, FINISHED, freeEnergyOf, madeWords, structureLineage, type DrawnEntry, type SetEntry } from "./entries";
import { basisOf, hasEnergy, notAllMinima, type DrawnOutcome } from "./meno";
import { convergedOf, heldAt } from "./converged";

/** The names the values are written under, as a table's columns name them - in the order they are written. */
export const IN_3D = { share: "share among isomers", conformers: "conformers in 3D", eMin: "E min", gMin: "G min", state: "state in 3D" } as const;

/** What a structure with none of its conformers in the set says, as its state. */
export const NO_3D = "no 3D result";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const value = (v: number | string, unit: Property["unit"] = "none"): Property => ({ value: v, unit, status: "computed" });
const notWorked = (why: string, unit: Property["unit"] = "none"): Property => ({ value: "", unit, status: { failed: why } });
const notApplicable = (why: string, unit: Property["unit"] = "none"): Property => ({ value: "", unit, status: { notApplicable: why } });

/** A molecule's formula and charge, as a key: its elements, each counted, hydrogens with the rest. */
function isomerKey(e: SetEntry): string {
  const counts = new Map<string, number>();
  for (const a of e.atoms) counts.set(a.el, (counts.get(a.el) ?? 0) + 1);
  const charge = e.charge ?? e.atoms.reduce((s, a) => s + (a.charge ?? 0), 0);
  return `${[...counts].sort(([x], [y]) => x.localeCompare(y)).map(([el, n]) => `${el}${n}`).join("")}|${charge}`;
}

/** A structure's conformers' lowest energy, as that conformer's energy is - where those finished come from one calculation. */
function eMinOf(done: readonly SetEntry[]): Property {
  const withEnergy = done.filter(hasEnergy);
  if (!withEnergy.length) return notWorked("none of its finished conformers has an energy", "Eh");
  const levels = new Set(withEnergy.map((e) => calcLevel(e.calc)));
  if (levels.size > 1) return notWorked(`its conformers' energies come from different calculations (${[...new Set(withEnergy.map(madeWords))].join("; ")})`, "Eh");
  const lowest = withEnergy.reduce((a, b) => (b.energy! < a.energy! ? b : a));
  return entryOfSet(lowest, "lowest").properties.energy ?? value(lowest.energy!, "Eh");
}

/** A structure's conformers' lowest free energy, as that conformer's is - where each finished one has one, all worked out alike. */
function gMinOf(done: readonly SetEntry[]): Property {
  const g = done.map(freeEnergyOf);
  const without = done.findIndex((_, k) => !g[k]);
  if (without >= 0) return notWorked(`its conformer #${done[without].number} has no free energy`, "Eh");
  for (let k = 1; k < g.length; k++) {
    const d = workedOutDiffer(g[0]!, g[k]!);
    if (d) return notWorked(`its conformers' free energies differ in ${d[0]}: ${d[1]} (#${done[0].number}) and ${d[2]} (#${done[k].number})`, "Eh");
  }
  return g.reduce((a, b) => ((b!.value as number) < (a!.value as number) ? b : a))!;
}

/** Why a structure has no E min or G min where every one of its conformers finished was optimised with atoms held: each named. */
function allHeld(held: readonly SetEntry[]): Property {
  const which = held.map((e) => `#${e.number}`).join(", ");
  return notWorked(
    held.length === 1
      ? `its one finished conformer, ${which}, was optimised with atoms held where they stood: no stationary point - optimise it free first`
      : `its finished conformers, ${which}, were all optimised with atoms held where they stood: no stationary point - optimise them free first`,
    "Eh",
  );
}

/**
 * `rows` - the structures drawn that came into *Structures* - each with its
 * 3D results from `entries`, the set wired into *3D results* (above); the
 * shares at `kelvin`. The structures go on as they came, none set aside.
 */
export function ontoStructures(rows: readonly DrawnEntry[], entries: readonly SetEntry[], kelvin: number): DrawnOutcome {
  if (!rows.length) return { ok: false, said: "Nothing comes into Structures" };
  if (!(kelvin > 0 && Number.isFinite(kelvin))) return { ok: false, said: "The temperature must be above 0 K" };
  const name = (k: number) => `structure ${rows[k].place + 1}`;
  const ids = rows.map((r) => r.record?.id);
  const shared = new Set(ids.filter((id, k) => id && ids.indexOf(id) !== k));
  // (each row's conformers, by its lasting id in their lineage - and those made of none of them, counted)
  const mine = rows.map(() => [] as SetEntry[]);
  let unmatched = 0;
  for (const e of entries) {
    const k = ids.findIndex((id) => id && !shared.has(id) && e.madeOf?.includes(structureLineage(id)));
    if (k < 0) unmatched++;
    else mine[k].push(e);
  }
  const done = mine.map((m) => m.filter((e) => entryState(e) === FINISHED));
  // (of E min and G min, those optimised with atoms held where they stood: none - no stationary point)
  const free = done.map((d) => d.filter((e) => !heldAt(convergedOf(e))));
  const heldOut = done.reduce((n, d, k) => n + d.length - free[k].length, 0);
  const properties = rows.map((_, k): Record<string, Property> => {
    const id = ids[k];
    if (!id) return { [IN_3D.state]: notApplicable("it has no lasting id to be found by") };
    if (shared.has(id)) return { [IN_3D.state]: notApplicable(`its lasting id is another structure's here too (${rows.flatMap((_, j) => (j !== k && ids[j] === id ? [name(j)] : [])).join(", ")})`) };
    const n = mine[k].length;
    if (!n) return { [IN_3D.conformers]: value(0), [IN_3D.eMin]: notApplicable(NO_3D, "Eh"), [IN_3D.gMin]: notApplicable(NO_3D, "Eh"), [IN_3D.state]: value(NO_3D) };
    const d = done[k].length;
    const state = d === n ? FINISHED : d ? `${n - d} of ${n} conformers not finished` : `none of its ${plural(n, "conformer")} finished: ${entryState(mine[k][0])}`;
    const none = notApplicable("none of its conformers finished", "Eh");
    return {
      [IN_3D.conformers]: value(n),
      [IN_3D.eMin]: !d ? none : free[k].length ? eMinOf(free[k]) : allHeld(done[k]),
      [IN_3D.gMin]: !d ? none : free[k].length ? gMinOf(free[k]) : allHeld(done[k]),
      [IN_3D.state]: value(state),
    };
  });
  // (shares among the structures of one formula and charge alone, each of their finished conformers weighed as Populations weighs them)
  const groups = new Map<string, number[]>();
  rows.forEach((_, k) => {
    if (!done[k].length) return;
    const key = isomerKey(done[k][0]);
    groups.set(key, [...(groups.get(key) ?? []), k]);
  });
  const sharesSaid: string[] = [];
  for (const members of groups.values()) {
    const all = members.flatMap((k) => done[k]);
    // (the isomers' free energies all worked out alike, as one compound's are, to be weighed against each other; else their electronic energies, all of one calculation)
    const basis = basisOf(all, kelvin, [{ said: "its isomers'", entries: all }]);
    const levels = new Set(all.filter(hasEnergy).map((e) => calcLevel(e.calc)));
    const why =
      !basis.free && !all.every(hasEnergy)
        ? "not every finished conformer of its isomers has an energy"
        : !basis.free && levels.size > 1
          ? `its isomers' energies come from different calculations (${[...new Set(all.map(madeWords))].join("; ")})`
          : notAllMinima(all);
    if (why) {
      for (const k of members) properties[k][IN_3D.share] = notWorked(why);
      continue;
    }
    const w = boltzmann(all.map((e) => basis.energy(e)!), kelvin, all.every((e) => e.degeneracy != null) ? all.map((e) => e.degeneracy!) : undefined);
    let at = 0;
    for (const k of members) {
      const of = done[k].length;
      // (a value of its conformers together: at its lowest one's geometry and the temperature, by what worked out the energies weighed)
      const lowest = done[k].reduce((a, b) => (basis.energy(b)! < basis.energy(a)! ? b : a));
      const weighed = basis.free ? freeEnergyOf(lowest) : entryOfSet(lowest, "lowest").properties.energy;
      properties[k][IN_3D.share] = {
        ...value(w.slice(at, at + of).reduce((s, x) => s + x, 0)),
        at: { geometry: geometryKey(lowest.xyz), kelvin },
        ...(weighed?.by ? { by: { ...weighed.by } } : {}),
        ensemble: { of },
      };
      at += of;
    }
    sharesSaid.push(basis.words);
  }
  // (one with nothing finished, or none in the set: no share - said in its place, never 0)
  rows.forEach((_, k) => {
    if (ids[k] && !shared.has(ids[k]!) && !(IN_3D.share in properties[k])) properties[k][IN_3D.share] = notApplicable(mine[k].length ? "none of its conformers finished" : NO_3D);
  });
  // (first on the record, in IN_3D's order; what it said before after them)
  const order: string[] = Object.values(IN_3D);
  const kept = rows.map((r, k) => {
    const mine = Object.fromEntries(order.filter((n) => n in properties[k]).map((n) => [n, properties[k][n]]));
    const before = Object.fromEntries(Object.entries(r.record?.properties ?? {}).filter(([n]) => !(n in mine)));
    return { ...r, record: { ...r.record, properties: { ...mine, ...before } } };
  });
  const found = mine.filter((m) => m.length).length;
  const said = [
    `${found} of ${plural(rows.length, "structure")} with 3D results`,
    ...(groups.size ? [`shares at ${kelvin} K among the isomers of each formula (${plural(groups.size, "formula", "formulas")}), from ${[...new Set(sharesSaid)].join("; ") || "no energies"}`] : []),
    ...(heldOut ? [`${plural(heldOut, "conformer")} optimised with atoms held left out of E min and G min`] : []),
    ...(unmatched ? [`${plural(unmatched, "conformer")} made of none of them`] : []),
    ...(shared.size ? [`${plural(rows.filter((_, k) => ids[k] && shared.has(ids[k]!)).length, "structure")} sharing a lasting id given nothing`] : []),
  ];
  return { ok: true, holds: "structures", kept, aside: [], said: said.join(" · ") };
}
