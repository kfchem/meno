/**
 * A workspace's styles in 3D as plain values, apart from the hooks of ./style3d: what the drawing's own code and its workers ask
 * of them. This module reaches no React component, so a worker that reaches it is served by the dev server as the app is built
 * (ui/workers.test.ts).
 */
import type { Style3D } from "../../../lib/chem/style3d";
import { DEFAULT_WORKSPACE_3D, style3dIn } from "../../../lib/chem/workspaceStyle3d";
import { useAppSettings } from "../../../lib/settings/appSettings";
import type { EditorState } from "./store/types";
import type { WorkspaceDocument } from "./document";
import type { RunWith } from "./workflow/run";
import { reachOverFrames } from "./utils/molecule3d";

/**
 * How a workspace's molecules in 3D look and turn: its styles in 3D (its
 * looks and its light, lib/chem/workspaceStyle3d) - how a drag turns one,
 * and how very large drawings are drawn, Settings'.
 */
export function style3dOf(st: Partial<Pick<EditorState, "docStyle3d">>): Style3D {
  // (a page that is no workspace's - an abbreviation's picture: Meno's own)
  return style3dIn(st.docStyle3d ?? DEFAULT_WORKSPACE_3D, useAppSettings.getState().style3d);
}

/**
 * How far a molecule in 3D reaches on the page about its middle, in a
 * document's styles in 3D with Settings' (utils/molecule3d
 * `reachOverFrames`): what a set held off the page needs to be laid out on
 * it again (document `createWorkspaceDocument`, workflow/held).
 */
export const extentIn = (doc: Pick<WorkspaceDocument, "style3d">): RunWith["extentOf"] => {
  const style = style3dOf({ docStyle3d: doc.style3d });
  // (a molecule's reach, turned as it is made - none: worked out once for each molecule and style, as every edit asks of every set's)
  let reach = reachedIn.get(style);
  if (!reach) reachedIn.set(style, (reach = new WeakMap()));
  return (m, turn) => {
    if (turn) return reachOverFrames({ ...m, id: 0 }, style, turn);
    let found = reach!.get(m);
    if (!found) reach!.set(m, (found = reachOverFrames({ ...m, id: 0 }, style, turn)));
    return found;
  };
};

/** How far each molecule reaches, by the style in 3D it was worked out in (`extentIn`). */
const reachedIn = new WeakMap<Style3D, WeakMap<object, { x0: number; x1: number; y0: number; y1: number }>>();
