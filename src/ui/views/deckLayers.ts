import type { TabId } from "../../lib/core";

/** The tab shown, and the one just left, kept in view beneath it while it fades in. */
export type Shown = { active: TabId | null; beneath: TabId | null };

/** What is shown once `activeId` is chosen: the tab left goes beneath it at once. */
export function chosen(shown: Shown, activeId: TabId | null): Shown {
  return shown.active === activeId ? shown : { active: activeId, beneath: shown.active };
}

/** How a tab's layer is shown: chosen, beneath the chosen one, or not at all. */
export function layerOf(id: TabId, shown: Shown): "active" | "beneath" | "hidden" {
  return id === shown.active ? "active" : id === shown.beneath ? "beneath" : "hidden";
}
