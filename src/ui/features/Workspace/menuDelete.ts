/**
 * What *Delete* in a part's menu does to what was right-clicked: each kind
 * of part removed as it is by the key - a set that holds what is on no
 * page (its molecules in 3D, structures drawn it does not show) asked
 * about first, as by the key, since those go with it (store `removeSet`);
 * and the selection, where the menu was opened on it.
 */
import type { EditorState } from "./store/types";
import type { MenuTarget } from "./PartMenu";

export function deleteFromMenu(st: EditorState, menu: MenuTarget, deletePart: (kind: MenuTarget["kind"], id: number) => void): void {
  if (menu.kind === "arrow" && menu.id != null) st.removeArrow(menu.id);
  else if (menu.kind === "caption" && menu.id != null) st.removeCaption(menu.id);
  else if (menu.kind === "pdf" && menu.id != null) st.removePdf(menu.id);
  else if (menu.kind === "picture" && menu.id != null) st.removePicture(menu.id);
  else if (menu.kind === "shape" && menu.id != null) st.removeShape(menu.id);
  else if (menu.kind === "cycle" && menu.id != null) st.removeCycle(menu.id);
  else if (menu.kind === "ink" && menu.id != null) st.removeInk(menu.id);
  else if (menu.kind === "text" && menu.id != null) st.removeTexts([menu.id]);
  // (asked about where it holds what is on no page: never deleted with it unasked)
  else if (menu.kind === "set" && menu.id != null) st.removeSet(menu.id);
  else if (menu.kind === "step" && menu.id != null) st.removeStep(menu.id);
  else if (menu.kind === "wire" && menu.id != null) st.removeWire(menu.id);
  else if (menu.kind === "plus" && menu.id != null) st.removePlus(menu.id);
  else if (menu.kind === "push" && menu.id != null) st.removePush(menu.id);
  else if (menu.kind === "measure3d" && menu.id != null && menu.measure != null) st.removeMeasure3d(menu.id, menu.measure);
  else if (menu.selection === "here") st.deleteSelection();
  else if (menu.kind === "molecule3d" && menu.id != null) st.removeMolecule3d(menu.id);
  else if (menu.kind && menu.id != null) deletePart(menu.kind, menu.id);
}
