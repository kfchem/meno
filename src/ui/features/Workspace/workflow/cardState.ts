/**
 * What a step's card says of its state (docs/WORKFLOWS.md, *How it looks*):
 * its words, its icon by name - one of the page's (pageGl/icons: waiting,
 * running, stopped, done, failed) - turning while it runs, and the tone of
 * its words: Meno's colour for done and running, the attention colour for a
 * failure, grey for the rest. Its HTML (StepCard) and WebGL (pageGl/cardFace)
 * say the same.
 */
import { quietSaid } from "../../../../lib/jobs";
import { clock } from "./programs";
import type { StepState } from "./flow";

/** How a step's jobs are getting on: where they wait, their place among those waiting; where they run, since when, how many of how many have ended, and how many minutes the quietest has written nothing, where past what Settings says (lib/jobs `quietFor`). */
export type RunPlace = { place?: number; since?: number; ended: number; total: number; quiet?: number };

export type CardState = { icon?: "waiting" | "running" | "stopped" | "done" | "failed"; turning?: true; text: string; tone: "quiet" | "base" | "attention" };

/** A place in the queue, as it is said: 1st, 2nd, 3rd, 4th... */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/**
 * What `state` says: what its run said (`said`), how its jobs are getting on
 * (`run`) at `now`; where a program installed separately is found nowhere,
 * or its options still need something (`missing`), that, where Ready would be.
 */
export function cardState(state: StepState, said: string | undefined, run: RunPlace | undefined, now: number, missing?: string): CardState {
  if (missing && (state === "ready" || state === "changed")) return { icon: "failed", text: missing, tone: "quiet" };
  switch (state) {
    case "no-input":
      return { text: "No input", tone: "quiet" };
    case "ready":
      return { text: "Ready", tone: "quiet" };
    case "waiting":
      return { icon: "waiting", text: run?.place ? `Waiting · ${ordinal(run.place)}` : "Waiting", tone: "quiet" };
    case "running":
      return {
        icon: "running",
        turning: true,
        text: `${run && run.total > 1 ? `Running · ${run.ended} of ${run.total}` : `Running ${clock(run?.since != null ? now - run.since : 0)}`}${run?.quiet != null ? ` · ${quietSaid(run.quiet)}` : ""}`,
        tone: "base",
      };
    case "stopped":
      return { icon: "stopped", text: said ?? "Stopped", tone: "quiet" };
    case "done":
      return { icon: "done", text: said ?? "Done", tone: "base" };
    case "failed":
      return { icon: "failed", text: `Failed${said ? ` · ${said}` : ""}`, tone: "attention" };
    case "changed":
      return { icon: "running", text: "Changed · run again", tone: "quiet" };
  }
}

/** A wire just let go on a card that it does not take: why, said where its state is, in the attention colour. */
export const refusedState = (why: string): CardState => ({ icon: "failed", text: why, tone: "attention" });
