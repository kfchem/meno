import type { EditorState, Model } from "../store/types";
import { centredAt } from "./copyPaste";
import { styleOf } from "../../../../lib/chem/style";
import { cycleThings, snapToCycles } from "./cycles";
import { emptyWorkspaceDocument, expandAbbreviation } from "../document";

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

/**
 * A molecule the dictionary draws whole - typed in Quick Add, and read as
 * the dictionary's (chem/resolve, a `"label"` reading of a molecule: DMF,
 * Et3N, PdCl2) - drawn as the canvas draws its label out: one atom so
 * labelled, drawn out where it is (`expandAbbreviation`), one function for
 * both. No plugin is asked: the dictionary has its structure.
 */
export function namedDrawn(label: string): Model {
  const doc = { ...emptyWorkspaceDocument(), model: { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: label }], bonds: [] }, nextId: 2 };
  return expandAbbreviation(doc, 1).model;
}
