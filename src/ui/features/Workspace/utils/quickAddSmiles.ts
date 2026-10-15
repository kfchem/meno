import type { EditorState, Model } from "../store/types";
import { centredAt } from "./copyPaste";

/**
 * A SMILES read put down where Quick Add was opened (`asked`, the Quick Add
 * it was typed in) - unless that Quick Add has gone while it was read:
 * Escape, a press elsewhere, another opened, or the drawing of the same
 * SMILES entered twice. Before, the structure came anyway, after Escape,
 * and a quick second Enter drew it twice, one on the other. Whether it
 * was put down.
 */
export function putDownSmiles(store: { getState(): EditorState }, asked: EditorState["quickAdd"], drawn: Model): boolean {
  const st = store.getState();
  if (!asked || st.quickAdd !== asked) return false;
  st.setQuickAdd(null);
  st.pasteModel(centredAt(drawn, asked.at));
  return true;
}
