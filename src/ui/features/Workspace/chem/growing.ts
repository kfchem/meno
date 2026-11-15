/**
 * A 3D structure made from a drawing whose conformer search goes on after
 * its first round (docs/WORKSPACE.md, *As its search goes on*): each round
 * judged, and what the page shows of all its rounds so far made again, off
 * the thread the page runs on (growingWorker.ts) - so that the structure is
 * shown at once and grows, and nothing of it waits on the page.
 *
 * What is sent to the worker is each round as it came, its frames packed in
 * one buffer handed over whole (`packed`); what comes back is only what the
 * page shows - each conformer once - however many the rounds tried.
 */
import type { Conformers } from "../../../../lib/roles/client";
import { keptMade, type MadeChecks } from "../../../../lib/chem/metalHolds";
import { joined, roundsHow, RoundsSeen, type RoundsJudge } from "./conformerRounds";
import { withChosen, withOwnCip, type OpenStereo } from "./openStereo";
import { partsSideBySide } from "./partsApart";
import { reflectedConformers } from "./pageMirror";
import { asThePageShows } from "./pageConformers";

/** What a stereoisomer's conformers are made the page's with, beside them (make3d `conformersOf`): which of its configurations were chosen, the checks they are held to, its parts, and whether they are its mirror image's, to be reflected. */
export type ShownWith = { open: OpenStereo; checks: MadeChecks | null; parts: number[][]; reflect: boolean };

/** A row of how they were made. */
type Row = { label: string; text: string };

/**
 * A stereoisomer's conformers as the page shows them, as make3d's
 * `conformersOf` makes them of what a search gave: reflected where they are
 * its mirror image's, their R and S read from their own places
 * (`withOwnCip`), with the configurations chosen, those its checks let
 * stand, its parts side by side, each once (`asThePageShows`) - laid over
 * `onto`, where given.
 */
export function shownOf(raw: Conformers, w: ShownWith, onto?: readonly number[]): Conformers {
  const c = w.reflect ? reflectedConformers(raw) : raw;
  return asThePageShows(partsSideBySide(keptMade(withChosen(withOwnCip(c), w.open), w.checks), w.parts), onto);
}

/**
 * A search's rounds as they come, judged and kept (`add`, as a judge's
 * `RoundsJudge.add` does), and what the page shows of them all so far
 * (`shown`): laid over what it showed first, so that a lower conformer a
 * later round finds does not turn it.
 */
export class Growing {
  private readonly seen: RoundsSeen;
  private raw: Conformers | null = null;
  private readonly hows: (Row[] | undefined)[] = [];
  private onto: number[] | null = null;

  constructor(atoms: Conformers["atoms"], bonds: Conformers["bonds"], window: number, private readonly w: ShownWith) {
    this.seen = new RoundsSeen(atoms, bonds, window);
  }

  /** A round's conformers kept, and how many of them are new (`RoundsSeen.add`), judged by `energies`. */
  add(got: Conformers, energies: readonly number[]): number {
    this.raw = this.raw ? joined(this.raw, got) : got;
    this.hows.push(got.how);
    return this.seen.add(got.frames, energies);
  }

  /** What the page shows of every round so far, `more` rows said after how they were made - none where no round has come. */
  shown(more: readonly Row[] = []): Conformers | null {
    if (!this.raw) return null;
    const how = this.hows.length > 1 && this.hows.some((h) => h?.length) ? roundsHow(this.hows) : (this.raw.how ?? []);
    const shown = shownOf({ ...this.raw, how: [...how, ...more] }, this.w, this.onto ?? undefined);
    this.onto ??= shown.frames[0] ? [...shown.frames[0]] : null;
    return shown;
  }
}

/** A round's frames packed in one buffer, three numbers to an atom, frame after frame - to be handed to a worker whole, not copied. */
export function packed(frames: readonly (readonly number[])[]): Float64Array {
  const width = frames[0]?.length ?? 0;
  const out = new Float64Array(frames.length * width);
  frames.forEach((f, k) => out.set(f, k * width));
  return out;
}

/** Frames out of a buffer `packed` made: `width` numbers each. */
export function unpacked(buffer: Float64Array, width: number): number[][] {
  const out: number[][] = [];
  for (let k = 0; width > 0 && k + width <= buffer.length; k += width) out.push(Array.from(buffer.subarray(k, k + width)));
  return out;
}

/** A round as it is sent: its frames packed, its energies with them, the rest of it as it came. */
export type RoundSent = { rest: Omit<Conformers, "frames">; frames: Float64Array; width: number; energies: Float64Array };

/** A round made ready to send (`RoundSent`), and the buffers to hand over with it. */
export function roundSent(got: Conformers, energies: readonly number[]): { round: RoundSent; transfer: ArrayBuffer[] } {
  const { frames, ...rest } = got;
  const round = { rest, frames: packed(frames), width: frames[0]?.length ?? 0, energies: Float64Array.from(energies) };
  return { round, transfer: [round.frames.buffer as ArrayBuffer, round.energies.buffer as ArrayBuffer] };
}

/** A round as the worker takes it back out (`RoundSent`). */
export const roundTaken = (r: RoundSent): { got: Conformers; energies: number[] } => ({
  got: { ...r.rest, frames: unpacked(r.frames, r.width) } as Conformers,
  energies: Array.from(r.energies),
});

/** A judge of a search's rounds that also makes what the page shows of them (`Growing`), and lets it go at the end. */
export type GrowingJudge = RoundsJudge & { shown(more?: readonly Row[]): Promise<Conformers | null> };

type Answer = { kind: "added"; fresh: number } | { kind: "shown"; shown: Conformers | null } | { kind: "failed"; error: string };

/** A growing search's judge, for a molecule of `c`'s atoms within `window` kcal/mol, made the page's as `w` says: in a worker where there are workers, else here (tests). */
export function growingJudge(c: Pick<Conformers, "atoms" | "bonds">, window: number, w: ShownWith): GrowingJudge {
  if (typeof Worker === "undefined") {
    const g = new Growing(c.atoms, c.bonds, window, w);
    return { add: async (frames, energies, got) => g.add({ ...(got ?? (c as Conformers)), frames: frames.map((f) => [...f]) }, energies), shown: async (more) => g.shown(more), end: () => {} };
  }
  const worker = new Worker(new URL("./growingWorker.ts", import.meta.url), { type: "module" });
  worker.postMessage({ kind: "start", atoms: c.atoms, bonds: c.bonds, window, w });
  // (one asking at a time: each answer is the one asked for)
  let queue: Promise<unknown> = Promise.resolve();
  const ask = <T>(message: unknown, transfer: Transferable[], read: (a: Answer) => T): Promise<T> => {
    const asked = queue.then(
      () =>
        new Promise<T>((done, failWith) => {
          worker.onmessage = (e: MessageEvent<Answer>) => (e.data.kind === "failed" ? failWith(new Error(e.data.error)) : done(read(e.data)));
          worker.onerror = (e) => failWith(new Error(e.message || "the round could not be judged"));
          worker.postMessage(message, transfer);
        }),
    );
    queue = asked.catch(() => undefined);
    return asked;
  };
  return {
    // (the round's own: its frames handed over whole, the rest as it came)
    add: (frames, energies, got) => {
      const { round, transfer } = roundSent({ ...(got ?? (c as Conformers)), frames: [...frames] } as Conformers, energies);
      return ask({ kind: "add", round }, transfer, (a) => (a.kind === "added" ? a.fresh : 0));
    },
    shown: (more = []) => ask({ kind: "shown", more }, [], (a) => (a.kind === "shown" ? a.shown : null)),
    end: () => worker.terminate(),
  };
}
