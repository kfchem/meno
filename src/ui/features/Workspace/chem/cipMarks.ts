/**
 * R and S, E and Z on the drawing, by Meno's own reading of the CIP rules
 * (lib/chem/cip, docs/CIP.md): each structure that holds an atom or a bond
 * whose R or S, E or Z is asked for (`stereoShown`), read as identity reads
 * it (chem/identityOf, its labels drawn out), and only those units worked
 * out. A unit with no descriptor says why, in words for the drawing's tip
 * (`cipSaid`); a Z or E that turns in the mirror image (seqCis, seqTrans)
 * says that too.
 *
 * Split in two so that the work is done off the drawing's thread
 * (cipWorker.ts): `cipJobsOf` reads the drawing into plain data, here;
 * `cipMarksFrom` puts the answers back on its atoms and bonds by id.
 */
import { cipLabels, type CipResult, type CipWhy } from "../../../../lib/chem/cip";
import type { IdentityInput } from "../../../../lib/chem/identity";
import { protonatedAmineHeld } from "../../../../lib/chem/lonePairCentres";
import type { Model } from "../store/types";
import { endpointsHeld } from "../document";
import { fragmentsHolding } from "./cleanUp";
import { identityInputOf, labelsDrawnOut } from "./identityOf";

/** One structure to work out: its input, and the indices in it of the units asked for, with the ids they are on the drawing. */
export type CipJob = { input: IdentityInput; centres: { at: number; id: number }[]; bonds: { at: number; id: number }[] };

/** What the drawing's R and S, E and Z come to, by atom and bond id. */
export type CipMarks = {
  centres: Map<number, "R" | "S" | "r" | "s">;
  doubleBonds: Map<number, "E" | "Z" | "Ra" | "Sa" | "ra" | "sa">;
  /** Each unit's words for the tip over it, where it has any: why it has no descriptor, or that its Z or E turns in the mirror image - by `centre-<id>` or `bond-<id>`. */
  said: Map<string, string>;
};

/** Why a unit has none: the CIP's reasons, a protonated amine's N that keeps no configuration (`exchanges`), or a unit with none drawn (`undrawn`). */
export type CipNone = CipWhy | "exchanges" | "undrawn";
/** A unit's answer: its descriptor, or why it has none (`axis` where the unit is an allene's axis, not a double bond's E or Z). */
export type CipAnswer = CipResult | { why: CipNone; axis?: true };

/** The structures of `model` that hold a unit asked for, each read for the CIP. */
export function cipJobsOf(model: Model): CipJob[] {
  const atomsAsked = model.atoms.filter((a) => a.stereoShown).map((a) => a.id);
  const bondsAsked = model.bonds.filter((b) => b.stereoShown);
  const ends = bondsAsked.map((b) => b.a);
  if (!atomsAsked.length && !ends.length) return [];
  const askedAtoms = new Set(atomsAsked);
  const askedBonds = new Set(bondsAsked.map((b) => b.id));
  // (each structure's atoms and bonds gathered in one pass over the drawing, not a pass for each: a thousand structures took 4 s)
  const pieces = fragmentsHolding(model, [...atomsAsked, ...ends]);
  const pieceOf = new Map<number, number>();
  pieces.forEach((ids, k) => ids.forEach((id) => pieceOf.set(id, k)));
  const parts: Model[] = pieces.map(() => ({ atoms: [], bonds: [] }));
  for (const a of model.atoms) {
    const k = pieceOf.get(a.id);
    if (k != null) parts[k].atoms.push(a);
  }
  for (const b of model.bonds) {
    const k = pieceOf.get(b.a);
    if (k != null && pieceOf.get(b.b) === k) parts[k].bonds.push(b);
  }
  return parts.map((gathered) => {
    // (a haptic bond whose ring is not all in the part binds none in it: document endpointsHeld, as cleanUp `partOf`)
    const part = labelsDrawnOut(endpointsHeld(gathered));
    const { input } = identityInputOf(part);
    const centres = part.atoms.flatMap((a, at) => (askedAtoms.has(a.id) ? [{ at, id: a.id }] : []));
    const bonds = part.bonds.flatMap((b, at) => (askedBonds.has(b.id) ? [{ at, id: b.id }] : []));
    return { input, centres, bonds };
  });
}

/** The answers for a job's units, in its order: its centres', then its bonds'. A protonated amine's N that keeps no configuration is not asked of the CIP. */
export function cipAnswersOf(job: CipJob): CipAnswer[] {
  const held = protonatedAmineHeld(job.input.atoms, job.input.bonds);
  const exchanges = new Set(job.centres.filter((c) => held(c.at) === false).map((c) => c.at));
  // (a bond that is an axis - a biaryl's - or one of a run of cumulated double bonds - an allene's, a butatriene's -
  // asked for as its axis or its cis or trans: the run's ends)
  // (the run a bond is in: its two ends, and how many double bonds it has - a plain bond's run itself, one)
  const runOf = (at: number): { ends: [number, number]; doubles: number } => {
    const { a, b, order } = job.input.bonds[at];
    if (order !== 2) return { ends: [a, b], doubles: 1 };
    const doubles = (x: number) => job.input.bonds.filter((d) => d.order === 2 && (d.a === x || d.b === x));
    const walk = (from: number, x: number): [number, number] => {
      let steps = 0;
      for (; doubles(x).length === 2 && steps < job.input.atoms.length; steps++) {
        const next = doubles(x).map((d) => (d.a === x ? d.b : d.a)).find((y) => y !== from)!;
        [from, x] = [x, next];
      }
      return [x, steps];
    };
    const [[p, s], [q, t]] = [walk(b, a), walk(a, b)];
    return { ends: [p, q], doubles: s + t + 1 };
  };
  const ends = (at: number) => runOf(at).ends;
  // (an even run of cumulated double bonds - an allene's - is an axis, whether or not one is drawn)
  const allene = (at: number) => runOf(at).doubles % 2 === 0;
  const unit = (units: readonly { atoms: readonly [number, number] }[] | undefined, [p, q]: [number, number]) =>
    (units ?? []).findIndex((x) => (x.atoms[0] === p && x.atoms[1] === q) || (x.atoms[0] === q && x.atoms[1] === p));
  const axes = job.bonds.map((b) => unit(job.input.axes, ends(b.at)));
  const runs = job.bonds.map((b) => unit(job.input.cumulated, ends(b.at)));
  const r = cipLabels(job.input, {
    centres: job.centres.map((c) => c.at).filter((at) => !exchanges.has(at)),
    bonds: job.bonds.map((b) => b.at),
    axes: axes.filter((k) => k >= 0),
    cumulated: runs.filter((k) => k >= 0),
  });
  return [
    ...job.centres.map((c): CipAnswer => (exchanges.has(c.at) ? { why: "exchanges" } : (r.centres.get(c.at) ?? { why: "undrawn" }))),
    ...job.bonds.map((b, k): CipAnswer => {
      const said = r.bonds.get(b.at) ?? (axes[k] >= 0 ? r.axes.get(axes[k]) : runs[k] >= 0 ? r.cumulated.get(runs[k]) : undefined) ?? { why: "undrawn" as const };
      return "why" in said && allene(b.at) ? { ...said, axis: true } : said;
    }),
  ];
}

/** An axis's descriptor as the page shows it (docs/CIP.md, *Axes*). */
const AXIS_SHOWN: Record<string, "Ra" | "Sa" | "ra" | "sa" | undefined> = { M: "Ra", P: "Sa", m: "ra", p: "sa" };

/** The drawing's marks from its jobs and their answers (`cipAnswersOf`, each job's in its order). */
export function cipMarksFrom(jobs: readonly CipJob[], answers: readonly (readonly CipAnswer[])[]): CipMarks {
  const out: CipMarks = { centres: new Map(), doubleBonds: new Map(), said: new Map() };
  jobs.forEach((job, j) => {
    const a = answers[j] ?? [];
    job.centres.forEach((c, k) => {
      const r = a[k];
      if (!r) return;
      if ("label" in r) {
        if (r.label === "R" || r.label === "S" || r.label === "r" || r.label === "s") out.centres.set(c.id, r.label);
      } else out.said.set(`centre-${c.id}`, cipSaid(r.why, "centre"));
    });
    job.bonds.forEach((b, k) => {
      const r = a[job.centres.length + k];
      if (!r) return;
      if ("label" in r) {
        // (an axis's M or P shown as its labels have it, (R)-BINAP: M is Ra and P is Sa - m and p, pseudoasymmetric, ra and sa)
        const shown = AXIS_SHOWN[r.label];
        if (shown) out.doubleBonds.set(b.id, shown);
        if (r.label !== "E" && r.label !== "Z") return;
        out.doubleBonds.set(b.id, r.label);
        if (r.turns) out.said.set(`bond-${b.id}`, turnsSaid(r.label));
      } else out.said.set(`bond-${b.id}`, cipSaid(r.why, "axis" in r && r.axis ? "axis" : "bond"));
    });
  });
  return out;
}

/** The drawing's marks, worked out here: for tests, and where there are no workers. */
export function cipMarksOf(model: Model): CipMarks {
  const jobs = cipJobsOf(model);
  return cipMarksFrom(jobs, jobs.map(cipAnswersOf));
}

/** Why a unit has no descriptor, as its tip says it. */
export function cipSaid(why: CipNone, unit: "centre" | "bond" | "axis"): string {
  const what = unit === "centre" ? "R or S" : unit === "axis" ? "Ra or Sa" : "E or Z";
  switch (why) {
    case "alike":
      return unit === "centre" ? "No R or S: two of its groups are the same." : `No ${what}: the two groups at one of its ends are the same.`;
    case "open":
      return `No ${what} until the double bond it depends on is drawn E or Z.`;
    case "unsure":
      return `No ${what}: a group it depends on cannot be told from the drawing.`;
    case "large":
      return `No ${what}: the structure is too large to work it out.`;
    case "exchanges":
      return "No R or S: this N gives up its H and takes one back, turning over as it does.";
    case "undrawn":
      return unit === "centre" ? "No R or S: no configuration is drawn here." : `No ${what}: none is drawn here.`;
  }
}

/** What a Z or E that turns in the mirror image (seqCis, seqTrans) says over it. */
export function turnsSaid(label: "E" | "Z"): string {
  return `This ${label} becomes ${label === "Z" ? "E" : "Z"} in the mirror image: the two groups at one of its ends are mirror images of each other.`;
}
