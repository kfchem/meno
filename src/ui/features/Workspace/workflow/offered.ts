/**
 * The steps Quick Add offers (docs/WORKFLOWS.md, *A step: from Quick
 * Add*): by who does them - each plugin added that fills any, those that
 * run a program first, then Meno - and under each the kinds it fills. For
 * a wire let go on empty space, those that take what it carries, as who
 * does them takes it; and *As
 * conformers*, the conversion taken on purpose, only there, from a
 * compound set. A kind that takes nothing in (Generate) is offered on empty
 * space alone: nothing can be wired into it.
 */
import type { WireEnd } from "../store/types";
import { doersAdded, kindsOf, takesBy, takesNothingBy } from "./doers";
import { givesOf } from "./flow";
import { kindInfo, type StepIcon, type StepKind } from "./kinds";

/** A kind of step Quick Add offers: what it is called, and its icon. */
export type QuickStep = { kind: StepKind; name: string; icon: StepIcon };
/** Who does steps, as Quick Add offers them: by its id and name, and the kinds of step it fills that are offered. */
export type QuickGroup = { by: string; name: string; steps: QuickStep[] };

type Flow = Parameters<typeof givesOf>[0];

export function offeredSteps(flow: Flow, wire?: WireEnd): QuickGroup[] {
  const set = wire ? givesOf(flow, wire) : null;
  const offered = (kind: StepKind, by: string) =>
    takesNothingBy(kind, by)
      ? !wire
      : kind === "as-conformers"
        ? !!wire && set === "molecules"
        : !wire || set == null || (set !== "pictures" && set !== "chart" && takesBy(kind, by, set));
  return doersAdded()
    .map((d) => ({
      by: d.id,
      name: d.name,
      steps: kindsOf(d.id)
        .filter((kind) => offered(kind, d.id))
        .map((kind) => ({ kind, name: kindInfo(kind).name, icon: kindInfo(kind).icon })),
    }))
    .filter((g) => g.steps.length);
}
