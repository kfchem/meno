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

/** How a search in rounds ended: no new conformer in its last round; the most tried; its time; asked once, its search taking no other draw; asked once, with no energies to judge by; stopped, what came kept; a round after its first failed, what came kept. */
export type RoundsEnd = "settled" | "most" | "time" | "one" | "unjudged" | "stopped" | "failed";

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
export type RoundsJudge = { add(frames: readonly (readonly number[])[], energies: readonly number[], got?: Conformers): Promise<number>; end(): void };

/** A judge that does it here, on the thread that asks: where there are no workers (tests), and for a few conformers. */
export function judgeHere(atoms: ConstructorParameters<typeof RoundsSeen>[0], bonds: ConstructorParameters<typeof RoundsSeen>[1], window: number): RoundsJudge {
  const seen = new RoundsSeen(atoms, bonds, window);
  return { add: async (frames, energies) => seen.add(frames, energies), end: () => {} };
}

/** Two rounds' conformers as one: their frames, and their energies where both rounds give them, in the order made. */
export function joined(a: Conformers, b: Conformers): Conformers {
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

/**
 * How a search in rounds is asked: its first round, the most it tries, its
 * window (kcal/mol), whether its plugin gives another set for each draw,
 * and the time it may take (ms), where it has a limit - or what is left of
 * it as each round is to start, where several share it. `onRound`: told,
 * after each round, all made so far and how far it has got - for what is
 * shown to grow as it goes. `stopped`: asked before each round after the
 * first, ending the search where it says so, what came kept.
 */
export type RoundsAsked = {
  first: number;
  most: number;
  window: number;
  draws: boolean;
  budget?: number | (() => number);
  now?: () => number;
  onRound?: (made: Conformers, so: Omit<RoundsRun, "ended">) => void;
  stopped?: () => boolean;
};

/**
 * A conformer search asked for in rounds (above), a round at a time: `ask`
 * the plugin for a round's count and draw, judged by `judge` (a worker's,
 * else `judgeHere`). `next` asks and judges the next round, saying whether
 * the search goes on; `made` is every conformer of every round so far, in
 * the order made; `ended` how it ended, once it has. Its time is the time
 * its rounds take, not any it waits between them - so that a search taken
 * up again later is held to the time it ran.
 */
export class RoundsSearch {
  made: Conformers | null = null;
  tried = 0;
  rounds = 0;
  ended: RoundsEnd | null = null;
  private judging: RoundsJudge | null = null;
  /** The time its rounds have taken, in ms. */
  spent = 0;
  private readonly sizes: number[];
  private readonly hows: Conformers["how"][] = [];
  private readonly now: () => number;

  constructor(
    private readonly ask: (count: number, draw: number) => Promise<Conformers>,
    private readonly o: RoundsAsked,
    private readonly judge: (c: Conformers) => RoundsJudge = (c) => judgeHere(c.atoms, c.bonds, o.window),
  ) {
    this.sizes = roundSizes(o.first, o.most);
    this.now = o.now ?? (() => Date.now());
  }

  /** The next round asked and judged: true where the search goes on, false where it has ended (`ended`). Its judge let go once it ends - and where a round fails. */
  async next(): Promise<boolean> {
    if (this.ended) return false;
    const n = this.sizes[this.rounds];
    if (n == null) return this.end("most");
    // (stopped: what came kept, its first round always)
    if (this.rounds && this.o.stopped?.()) return this.end("stopped");
    // (past its time, or where the next round, as long for each try as those before, would take it past: ended)
    const budget = typeof this.o.budget === "function" ? this.o.budget() : this.o.budget;
    if (this.rounds && budget != null && (this.spent >= budget || this.spent + (n * this.spent) / this.tried > budget)) return this.end("time");
    const t0 = this.now();
    try {
      const got = await this.ask(n, this.rounds);
      this.tried += n;
      this.rounds++;
      this.hows.push(got.how);
      this.made = this.made ? joined(this.made, got) : got;
      if (!this.o.draws) return this.end("one");
      const energies = roundEnergies(got);
      if (!energies) return this.end("unjudged");
      this.judging ??= this.judge(got);
      if (!(await this.judging.add(got.frames, energies, got)) && this.made.frames.length) return this.end("settled");
      return this.rounds < this.sizes.length || this.end("most");
    } catch (e) {
      this.judging?.end();
      throw e;
    } finally {
      this.spent += this.now() - t0;
    }
  }

  /** Every conformer made, how it was made - each round's said: the first round's alone would be one round's count for the whole - and what was done. */
  result(): { made: Conformers; run: RoundsRun } {
    const made = this.made!;
    const how = this.hows.length > 1 && this.hows.some((h) => h?.length) ? { how: roundsHow(this.hows) } : {};
    return { made: { ...made, ...how }, run: { tried: this.tried, rounds: this.rounds, ended: this.ended ?? "most" } };
  }

  /** Ended where a round failed - stopped, where it was asked to stop; else failed - what came kept. Why is its asker's to log: what a plugin's library says is no row of the chemist's. */
  failed(): void {
    if (this.ended) return;
    this.ended = this.o.stopped?.() ? "stopped" : "failed";
  }

  private end(how: RoundsEnd): false {
    this.ended = how;
    this.judging?.end();
    return false;
  }
}

/**
 * A conformer search asked for in rounds (above), to its end: every
 * conformer of every round, in the order made, and what was done - told
 * after each round it goes on from (`RoundsAsked.onRound`).
 */
export async function inRounds(
  ask: (count: number, draw: number) => Promise<Conformers>,
  o: RoundsAsked,
  judge?: (c: Conformers) => RoundsJudge,
): Promise<{ made: Conformers; run: RoundsRun }> {
  const search = new RoundsSearch(ask, o, judge);
  // (told how far it has got, where it goes on: what it ends with is the answer)
  while (await search.next()) o.onRound?.(search.made!, { tried: search.tried, rounds: search.rounds });
  return search.result();
}

/**
 * How a search in rounds ended, in words, as what it made says it: "3
 * rounds, 400 tried: the last brought no new conformer within 2.5
 * kcal/mol of the lowest".
 */
export function roundsSaid(r: RoundsRun, o: Pick<RoundsAsked, "window" | "most"> & { budget?: number }): string {
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
    case "stopped":
      return `${done}: stopped, what came kept`;
    case "failed":
      return `${done}: a round failed, what came kept`;
  }
}
