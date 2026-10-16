import type { EditorState, Model } from "../store/types";
import { centredAt } from "./copyPaste";
import { styleOf } from "../../../../lib/chem/style";
import { cycleThings, snapToCycles } from "./cycles";

/**
 * A SMILES read put down where Quick Add was opened (`asked`, the Quick Add
 * it was typed in) - unless that Quick Add has gone while it was read:
 * Escape, a press elsewhere, another opened, or the drawing of the same
 * SMILES entered twice. Before, the structure came anyway, after Escape,
 * and a quick second Enter drew it twice, one on the other. Put down
 * near a catalytic cycle's line, it is put on the line, as one let go there
 * is (lib/chem/cycle). Whether it was put down.
 */
export function putDownSmiles(store: { getState(): EditorState }, asked: EditorState["quickAdd"], drawn: Model): boolean {
  const st = store.getState();
  if (!asked || st.quickAdd !== asked) return false;
  st.setQuickAdd(null);
  let placed = centredAt(drawn, asked.at);
  const [thing] = st.cycles.length ? cycleThings(placed, [], styleOf(st.docStyle)) : [];
  const by = thing ? snapToCycles(st.cycles, thing.box) : null;
  if (by) placed = centredAt(drawn, { x: asked.at.x + by.x, y: asked.at.y + by.y });
  st.pasteModel(placed);
  return true;
}
