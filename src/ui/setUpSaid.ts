/**
 * A plugin's set-up that ended without its being added - declined, offline,
 * a download or uv failed - said in the corner of the window as well as on
 * its card in Settings, wherever the chemist is when it ends, and kept
 * there until dismissed: never a plugin gone back to "Add" without a word.
 */
import { useReaders } from "../lib/calc/workers";
import { useNotices } from "./notices";

/** Says each set-up that fails from now on (`useNotices`, one that stays); the returned function stops it. */
export function sayFailedSetUps(): () => void {
  return useReaders.subscribe((s, was) => {
    for (const id of Object.keys(s.state)) {
      if (was.state[id] !== "adding" || s.state[id] !== "absent" || !s.problem[id]) continue;
      // (staying, it is put away by its own button - the notices' action, dismissing it once done)
      useNotices.getState().show({ id: `set-up ${id}`, title: "Plugin not added", text: s.problem[id], stays: true, action: { label: "OK", run: () => undefined } });
    }
  });
}
