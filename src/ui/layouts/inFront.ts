import { createContext, useContext } from "react";

/**
 * Whether what is drawn here is in front: in a tab, whether that tab is the
 * one chosen (ui/views/Deck); over the window, always. A tab not in front
 * is hidden, not taken down - what is open in it, a question or a card,
 * stays as it was, waiting for the tab to come back - so what listens on
 * the window for keys asks this first: the keys are the tab's in front.
 *
 * A view is told the same as `active` (ui/views/registry); this is for what
 * is drawn deep in it, which it does not pass that to.
 */
export const InFront = createContext(true);

/** Whether what is drawn here is in front (InFront). */
export function useInFront(): boolean {
  return useContext(InFront);
}
