/**
 * A plugin's set-up that ended without its being added - declined, offline,
 * a download or uv failed - said in the corner of the window as well as on
 * its card in Settings, wherever the chemist is when it ends, and kept
 * there until dismissed: never a plugin gone back to "Add" without a word.
 * Told where the set-up failed (lib/calc/workers `onSetUpFailed`), not read
 * off a change of state.
 */
import { onSetUpFailed } from "../lib/calc/workers";
import type { Say } from "../lib/plugins/usedBefore";
import { useNotices } from "./notices";

/** Says each set-up that fails from now on (`useNotices`, one that stays); the returned function stops it. */
export function sayFailedSetUps(): () => void {
  return onSetUpFailed((p, why) => {
    // (staying, it is put away by its own button - the notices' action, dismissing it once done)
    useNotices.getState().show({ id: `set-up ${p.id}`, title: "Plugin not added", text: why, stays: true, action: { label: "OK", run: () => undefined } });
  });
}

/**
 * What getting the plugins used before did not do (lib/plugins/usedBefore): what went wrong said as a set-up that
 * failed is, kept until dismissed; a no to looking them up said for a while, with the button that stops it being
 * asked again.
 */
export const sayUsedBefore: Say = (title, text, dontAskAgain) =>
  useNotices
    .getState()
    .show(
      dontAskAgain
        ? { id: "plugins used before", title, text, action: { label: "Don't ask again", run: dontAskAgain } }
        : { id: "plugins used before", title, text, stays: true, action: { label: "OK", run: () => undefined } },
    );
