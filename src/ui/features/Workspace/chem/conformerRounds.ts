/**
 * A conformer search asked for in rounds, as many as the molecule needs
 * (docs/PLUGINS.md, *How many conformers are tried is Meno's to say*):
 * Meno's, the plugin answering each round's count and draw alone.
 *
 * - The first round tries the molecule's own count (lib/chem/conformersSought,
 *   by the bonds that turn: Ebejer, Morris and Deane 2012), or the
 *   chemist's; the second as many again, so that "nothing new" is never
 *   judged on a round smaller than the one before; then each twice the one
 *   before, so that all tried stays under twice the last round
 *   (`roundSizes`).
 * - After each round, a conformer is new where it lies within the chemist's
 *   window of the lowest found so far, by the search's own energies - its
 *   force field's - and is none of those found before, by Meno's one
 *   definition of the same conformer (workflow/sameConformer) (`RoundsSeen`).
 * - It ends where a round brings none new; where it has tried the most the
 *   chemist allows; or where the next round would take it past its time.
 * - A plugin whose search gives no other tries for another draw (its role
 *   says no `draws`) is asked once; and so is one whose conformers come with
 *   no energies, there being nothing to tell a new low conformer by.
 */
import type { Conformers } from "../../../../lib/roles/client";
import { factor } from "../../../../lib/units";
import { SAME_CONFORMER, Sameness } from "../workflow/sameConformer";

/** How long a search made on the canvas may take, in ms: ten minutes, the maintainer's ruling (2026-10-29). Said on what it made where it ended so. */
export const SEARCH_BUDGET_MS = 600_000;

const KCAL_PER_HARTREE = factor("Eh", "kcal/mol");

/** How a search in rounds ended: no new conformer in its last round; the most tried; its time; asked once, its search taking no other draw; asked once, with no energies to judge by. */
export type RoundsEnd = "settled" | "most" | "time" | "one" | "unjudged";

/** What a search in rounds did: how many it tried, in how many rounds, and how it ended. */
export type RoundsRun = { tried: number; rounds: number; ended: RoundsEnd };

/** The sizes of the rounds, in order: `first`, `first` again, then each twice the one before - the last kept to what `most` leaves. */
export function roundSizes(first: number, most: number): number[] {
  const out: number[] = [];
  let tried = 0;
  for (let k = 0; tried < most; k++) {
    const n = Math.min(first * 2 ** Math.max(0, k - 1), most - tried);
    out.push(n);
    tried += n;
  }
  return out;
}

/** Each frame's energy in hartrees, by which a round is judged: the molecule's, else its model's (`modelEnergies`) - none where neither is one for each frame. */
export function roundEnergies(c: Pick<Conformers, "frames" | "energies" | "modelEnergies">): number[] | null {
  const n = c.frames.length;
  if (c.energies?.length === n) return c.energies;
  if (c.modelEnergies?.length === n) return c.modelEnergies;
  return null;
}

/**
 * The conformers found so far, each once, that lie within `window`
 * kcal/mol of the lowest: what a round's are new against.
 */
export class RoundsSeen {
  private same: Sameness | null = null;
  private readonly kept: { frame: readonly number[]; mark: Float64Array }[] = [];
  private lowest = Number.POSITIVE_INFINITY;

  constructor(
    private readonly atoms: readonly { el: string; charge?: number }[],
    private readonly bonds: readonly { a1: number; a2: number; order: number }[],
    private readonly window: number,
  ) {}

  /**
   * How many of a round's conformers are new: within the window of the
   * lowest found so far - this round's among them - and the same as none
   * found before, nor as another of this round's. Those it counts are
   * kept, for the rounds after.
   */
  add(frames: readonly (readonly number[])[], energies: readonly number[]): number {
    const finite = energies.filter(Number.isFinite);
    if (!finite.length) return 0;
    this.lowest = Math.min(this.lowest, ...finite);
    const within = frames.map((_, i) => i).filter((i) => Number.isFinite(energies[i]) && (energies[i] - this.lowest) * KCAL_PER_HARTREE <= this.window + 1e-9);
    within.sort((x, y) => energies[x] - energies[y] || x - y);
    this.same ??= new Sameness(this.atoms, this.bonds, frames[within[0] ?? 0]);
    const same = this.same;
    let fresh = 0;
    for (const i of within) {
      const mark = same.signature(frames[i]);
      if (this.kept.some((k) => same.bound(mark, k.mark) <= SAME_CONFORMER && same.same(frames[i], k.frame))) continue;
      this.kept.push({ frame: frames[i], mark });
      fresh++;
    }
    return fresh;
  }
}

/** What judges a search's rounds: how many of a round's conformers are new (`RoundsSeen.add`), done where it is done - a worker, or here - and let go at the end. */
export type RoundsJudge = { add(frames: readonly (readonly number[])[], energies: readonly number[]): Promise<number>; end(): void };

/** A judge that does it here, on the thread that asks: where there are no workers (tests), and for a few conformers. */
export function judgeHere(atoms: ConstructorParameters<typeof RoundsSeen>[0], bonds: ConstructorParameters<typeof RoundsSeen>[1], window: number): RoundsJudge {
  const seen = new RoundsSeen(atoms, bonds, window);
  return { add: async (frames, energies) => seen.add(frames, energies), end: () => {} };
}

/** Two rounds' conformers as one: their frames, and their energies where both rounds give them, in the order made. */
function joined(a: Conformers, b: Conformers): Conformers {
  const both = (x?: number[], y?: number[]) => (x && y ? [...x, ...y] : undefined);
  const energies = both(a.energies?.length === a.frames.length ? a.energies : undefined, b.energies?.length === b.frames.length ? b.energies : undefined);
  const modelEnergies = both(a.modelEnergies?.length === a.frames.length ? a.modelEnergies : undefined, b.modelEnergies?.length === b.frames.length ? b.modelEnergies : undefined);
  const { energies: _e, modelEnergies: _m, ...rest } = a;
  return { ...rest, frames: [...a.frames, ...b.frames], ...(energies ? { energies } : {}), ...(modelEnergies ? { modelEnergies } : {}) };
}

/**
 * What the plugin said of how each round was made (`Conformers.how`), as
 * one: a line every round said alike once, else each round's in turn -
 * its words its own, never read or summed, so that what one round kept is
 * never shown as the whole search's.
 */
export function roundsHow(hows: readonly (readonly { label: string; text: string }[] | undefined)[]): { label: string; text: string }[] {
  const labels = [...new Set(hows.flatMap((h) => (h ?? []).map((r) => r.label)))];
  return labels.map((label) => {
    const texts = hows.map((h) => h?.find((r) => r.label === label)?.text ?? "");
    return { label, text: texts.every((t) => t === texts[0]) ? texts[0] : texts.map((t, k) => `round ${k + 1}: ${t || "none said"}`).join("; ") };
  });
}

/** How a search in rounds is asked: its first round, the most it tries, its window (kcal/mol), whether its plugin gives another set for each draw, and the time it may take (ms), where it has a limit. */
export type RoundsAsked = { first: number; most: number; window: number; draws: boolean; budget?: number; now?: () => number };

/**
 * A conformer search asked for in rounds (above): `ask` the plugin for a
 * round's count and draw, judged by `judge` (a worker's, else `judgeHere`).
 * Every conformer of every round, in the order made, and what was done.
 */
export async function inRounds(
  ask: (count: number, draw: number) => Promise<Conformers>,
  o: RoundsAsked,
  judge: (c: Conformers) => RoundsJudge = (c) => judgeHere(c.atoms, c.bonds, o.window),
): Promise<{ made: Conformers; run: RoundsRun }> {
  const now = o.now ?? (() => Date.now());
  const start = now();
  let made: Conformers | null = null;
  let judging: RoundsJudge | null = null;
  let tried = 0;
  let rounds = 0;
  let ended: RoundsEnd = "most";
  const hows: Conformers["how"][] = [];
  try {
    for (const n of roundSizes(o.first, o.most)) {
      // (past its time, or where the next round, as long for each try as those before, would take it past: ended)
      if (rounds && o.budget != null) {
        const spent = now() - start;
        if (spent >= o.budget || spent + (n * spent) / tried > o.budget) {
          ended = "time";
          break;
        }
      }
      const got = await ask(n, rounds);
      tried += n;
      rounds++;
      hows.push(got.how);
      made = made ? joined(made, got) : got;
      if (!o.draws) {
        ended = "one";
        break;
      }
      const energies = roundEnergies(got);
      if (!energies) {
        ended = "unjudged";
        break;
      }
      judging ??= judge(got);
      if (!(await judging.add(got.frames, energies)) && made.frames.length) {
        ended = "settled";
        break;
      }
    }
  } finally {
    judging?.end();
  }
  // (how it was made, each round's said: the first round's alone would be one round's count for the whole)
  if (made && hows.length > 1 && hows.some((h) => h?.length)) made = { ...made, how: roundsHow(hows) };
  return { made: made!, run: { tried, rounds, ended } };
}

/**
 * How a search in rounds ended, in words, as what it made says it: "3
 * rounds, 400 tried: the last brought no new conformer within 2.5
 * kcal/mol of the lowest".
 */
export function roundsSaid(r: RoundsRun, o: Pick<RoundsAsked, "window" | "most" | "budget">): string {
  const done = `${r.rounds} round${r.rounds === 1 ? "" : "s"}, ${r.tried.toLocaleString("en")} tried`;
  switch (r.ended) {
    case "settled":
      return `${done}: the last brought no new conformer within ${o.window} kcal/mol of the lowest`;
    case "most":
      return `${done}: the most it tries (${o.most.toLocaleString("en")})`;
    case "time":
      return `${done}: the ${Math.round((o.budget ?? 0) / 60_000)} minutes a search takes at most`;
    case "one":
      return `${done}: its search gives no other conformers to a round after`;
    case "unjudged":
      return `${done}: no energies came with them to tell a new conformer by`;
  }
}
