/**
 * The steps Quick Add offers (docs/WORKFLOWS.md, *A step: from Quick
 * Add*): by who does them - each plugin added that fills any, those that
 * run a program first, then Meno - and under each the kinds it fills. For
 * a wire let go on empty space, those that take what it carries, as who
 * does them takes it; and *As
 * conformers*, the conversion taken on purpose, only there, from a
 * compound set. A kind that takes nothing in (Generate) is offered on empty
 * space alone: nothing can be wired into it. A wire out of where structures
 * that leave their stereo open come - a Generate's exit, Conformers'
 * *Failed* - offers *Stereoisomers* first (`offeredFirst`), its doer's line
 * first and it first in it: what such structures want next.
 */
import type { WireEnd } from "../store/types";
import { doersAdded, kindsOf, takesBy, takesNothingBy } from "./doers";
import { findSet, givesOf, stepOf } from "./flow";
import { kindInfo, type StepIcon, type StepKind } from "./kinds";

/** A kind of step Quick Add offers: what it is called, and its icon. */
export type QuickStep = { kind: StepKind; name: string; icon: StepIcon };
/** Who does steps, as Quick Add offers them: by its id and name, and the kinds of step it fills that are offered. */
export type QuickGroup = { by: string; name: string; steps: QuickStep[] };

type Flow = Parameters<typeof givesOf>[0];

/**
 * The kind a wire let go on empty space offers first, by where it comes
 * from: *Stereoisomers*, out of a Generate's exit - a model's SMILES as it
 * gave them, stereo left open counted on each (`stereo_open`) - or out of
 * Conformers' *Failed*, where those it could not make for their stereo left
 * open go; none otherwise.
 */
export function offeredFirst(flow: Flow, wire?: WireEnd): StepKind | null {
  const made = wire ? findSet(flow, wire.set)?.made : undefined;
  const step = made ? stepOf(flow, made.step) : undefined;
  if (!made || !step) return null;
  if (step.kind === "generate" || (step.kind === "conformers" && made.exit === "failed")) return "stereoisomers";
  return null;
}

export function offeredSteps(flow: Flow, wire?: WireEnd): QuickGroup[] {
  const set = wire ? givesOf(flow, wire) : null;
  const offered = (kind: StepKind, by: string) =>
    takesNothingBy(kind, by)
      ? !wire
      : kind === "as-conformers"
        ? !!wire && set === "molecules"
        : !wire || set == null || (set !== "pictures" && set !== "chart" && takesBy(kind, by, set));
  const first = offeredFirst(flow, wire);
  const groups = doersAdded()
    .map((d) => ({
      by: d.id,
      name: d.name,
      steps: kindsOf(d.id)
        .filter((kind) => offered(kind, d.id))
        .map((kind) => ({ kind, name: kindInfo(kind).name, icon: kindInfo(kind).icon })),
    }))
    .filter((g) => g.steps.length);
  if (!first) return groups;
  // (its doer's line first, and it first in that line; the rest as they were)
  const has = (g: QuickGroup) => g.steps.some((x) => x.kind === first);
  return [...groups.filter(has), ...groups.filter((g) => !has(g))].map((g) =>
    has(g) ? { ...g, steps: [...g.steps.filter((x) => x.kind === first), ...g.steps.filter((x) => x.kind !== first)] } : g,
  );
}
