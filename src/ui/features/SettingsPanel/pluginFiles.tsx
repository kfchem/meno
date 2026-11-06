/**
 * A plugin's files taken away from its card in Settings (docs/PLUGINS.md,
 * *Plugins online*): offered only for one here, not added, and used by no
 * plugin added; asked first; and why not, where they were not. Drawn as a
 * function of what was asked (`filesView`), and acted on apart
 * (`actOnFiles`), so that both are tested without a page.
 */
import type { ReactElement } from "react";
import ConfirmDiscard from "../../layouts/ConfirmDiscard";
import { removeFiles } from "../../../lib/plugins/online";

/** What was asked of a card's files: the question open, and why they were not taken away, where they were not. */
export type FilesAsked = { asking: boolean; problem?: string };

/** What the person did: clicked the button, answered Cancel, or answered *Remove its files*. */
export type FilesAct = { type: "ask" } | { type: "cancel" } | { type: "remove" };

/** Whether a card offers its plugin's files taken away: here and not added - never one another plugin added uses. */
export const filesCanGo = (state: string | undefined, usedByAdded: readonly unknown[]): boolean => state === "absent" && usedByAdded.length === 0;

const BUTTON = "h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base disabled:opacity-50";

/** The button, and - once it is clicked - the question, as what was asked has them: nothing is removed until the question is answered so. */
export function filesView(asked: FilesAsked, act: (a: FilesAct) => void, name: string, busy: boolean): { button: ReactElement; question: ReactElement | null } {
  return {
    button: (
      <button disabled={busy} onClick={() => act({ type: "ask" })} className={BUTTON}>
        Remove its files
      </button>
    ),
    question: asked.asking ? (
      <ConfirmDiscard
        title={`Remove the files of ${name}?`}
        message={`They are taken off this computer. ${name} can be got again from the plugins online.`}
        discardLabel="Remove its files"
        onCancel={() => act({ type: "cancel" })}
        onDiscard={() => act({ type: "remove" })}
      />
    ) : null,
  };
}

/**
 * What the person did, acted on: the question asked, or let go - nothing
 * removed either way - or, answered *Remove its files*, the files taken
 * away (lib/plugins/online `removeFiles`) and, where they were not, why.
 */
export async function actOnFiles(a: FilesAct, id: string, set: (asked: FilesAsked) => void, remove: (id: string) => Promise<void> = removeFiles): Promise<void> {
  if (a.type !== "remove") return set({ asking: a.type === "ask" });
  set({ asking: false });
  try {
    await remove(id);
  } catch (e) {
    set({ asking: false, problem: `Its files were not taken away: ${e instanceof Error ? e.message : String(e)}` });
  }
}
