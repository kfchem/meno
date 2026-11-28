/**
 * A failure said to the chemist in Meno's words. What Meno itself refuses is
 * an `Error` it wrote, in words written for the screen ("RDKit was taken
 * away: add it in Settings, Plugins."). What comes from beneath it - the
 * back end's refusal, which comes as text, or a plugin's program's own words
 * (`ChemError`) - names files and how Meno works inside, and means nothing to
 * a chemist: it goes to Meno's log, and the screen says what could not be
 * done and what can be done about it (`plain`). One way for every place
 * that says a plugin was not added or not started: the plugin's row and its
 * notice in Settings, Plugins, the first start's card, Quick Add.
 */
import { ChemError } from "../roles/client";

/** What Meno's log is given for a failure said in plain words: the failure itself follows it, as the log keeps one (lib/log). */
export const FAILURE_LOGGED = "Meno: a failure was said in plain words; what came with it:";

/** Whether a failure is in Meno's own words: an Error Meno wrote, not text from the back end nor a plugin's program's words. */
export const inMenosWords = (e: unknown): e is Error => e instanceof Error && !(e instanceof ChemError);

/** A failure as the screen says it: in Meno's words where it is in them; else `plain`, and the failure to Meno's log. */
export function failureSaid(e: unknown, plain: string): string {
  if (inMenosWords(e)) return e.message;
  console.warn(FAILURE_LOGGED, e);
  return plain;
}

/** What is said where a plugin's set-up could not be finished, and what the chemist can do. */
export const setUpUnfinishedSaid = "its set-up could not be finished. Add it again in Settings, Plugins.";

/** What is said where a plugin added could not be started, and what the chemist can do. */
export const notStartedSaid = (plugin: string) => `${plugin} could not be started. Remove it and add it again in Settings, Plugins.`;

/** A plugin's start that failed, as it is passed on: in Meno's words as it came, else `notStartedSaid` (the failure to Meno's log). */
export function startFailure(plugin: string, e: unknown): Error {
  return inMenosWords(e) ? e : new Error(failureSaid(e, notStartedSaid(plugin)));
}
