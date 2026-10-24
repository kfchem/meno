/**
 * A plugin's set-up that ended without its being added - declined, offline,
 * a download or uv failed - said in the corner of the window as well as on
 * its card in Settings, wherever the chemist is when it ends, and kept
 * there until dismissed: never a plugin gone back to "Add" without a word.
 * Told where the set-up failed (lib/calc/workers `onSetUpFailed`), not read
 * off a change of state.
 */
import { onSetUpFailed } from "../lib/calc/workers";
import { useNotices } from "./notices";

/** Says each set-up that fails from now on (`useNotices`, one that stays); the returned function stops it. */
export function sayFailedSetUps(): () => void {
  return onSetUpFailed((p, why) => {
    // (staying, it is put away by its own button - the notices' action, dismissing it once done)
    useNotices.getState().show({ id: `set-up ${p.id}`, title: "Plugin not added", text: why, stays: true, action: { label: "OK", run: () => undefined } });
  });
}
