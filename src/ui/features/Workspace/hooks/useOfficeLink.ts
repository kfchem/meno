import { useEffect } from "react";
import { styleOf } from "../../../../lib/chem/style";
import { sendToOffice } from "../../../../lib/ole";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { drawnOf } from "../fileActions";
import { structurePicture } from "../picture";
import { useEditorStore, type EditorStore } from "../store";
import type { EditorState } from "../store/types";
import { recordText } from "../utils/copyPaste";
import { carriedOf } from "../utils/workspace";

/**
 * How long the drawing is left alone before its document is given it: long
 * enough for a drag to end, short enough to look immediate.
 */
const SETTLE_MS = 250;
/** How soon after opening the view is fitted: once the canvas has been made. */
const FIT_AFTER_MS = 300;

/** Everything on the canvas, as a copy carries it: the drawing, and the molecules in 3D turned and shown as they are. */
const contentOf = (s: EditorState) => ({ ...drawnOf(s), molecules3d: carriedOf(s) });

/** What the document's picture is drawn from: its content and how it is drawn. */
const pictureKeyOf = (s: EditorState) =>
  [recordText(contentOf(s)), JSON.stringify(s.docStyle ?? null), s.aromaticEnabled, JSON.stringify(s.aromaticRings)].join("|");

/**
 * A canvas opened from a document (on Windows, a double-click on the
 * structure in Word or PowerPoint): each change goes back to the document
 * once the drawing settles - record and picture, drawn in the style the
 * canvas is - so the document shows the structure as it is being drawn.
 * The molecules in 3D go with the drawing, turned as they are; what the
 * document gave the canvas to open is not sent back until it changes.
 */
export function useOfficeLink(officeId: number | undefined) {
  const store = useEditorStore();
  useEffect(() => {
    if (officeId == null) return;
    // The whole of it in view, however it sat in the document - asked for
    // once the canvas is up: opening asks too, but before there is a view.
    const fit = window.setTimeout(() => store.getState().requestFit(), FIT_AFTER_MS);
    const stop = linkToOffice(store, (record, emf) => sendToOffice(officeId, record, emf));
    return () => {
      window.clearTimeout(fit);
      stop();
    };
  }, [store, officeId]);
}

/**
 * The link itself, on a canvas's store: each change, once it settles, given
 * to `give` as the record and the EMF - from what there is once the opening
 * has settled on, and not that itself. Returns the way to stop it.
 */
export function linkToOffice(
  store: Pick<EditorStore, "getState" | "subscribe">,
  give: (record: string, emf: Uint8Array) => Promise<unknown>,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // what the document shows already: what it gave the canvas, as it stands
  // once the opening has settled, then what was sent
  let shown: string | null = null;
  const send = () => {
    const s = store.getState();
    // (an emptied canvas leaves the document the last picture it had)
    if (!s.model.atoms.length && !s.molecules3d.length) return;
    const key = pictureKeyOf(s);
    if (shown == null || key === shown) {
      shown ??= key;
      return;
    }
    shown = key;
    const style = styleOf(s.docStyle ?? useAppSettings.getState().drawingStyle);
    structurePicture(contentOf(s), s, style)
      .then(({ record, emf }) => give(record, emf))
      .catch((e: unknown) => console.warn("the document did not take the structure", e));
  };
  const stop = store.subscribe((s, prev) => {
    const same =
      s.model === prev.model &&
      s.arrows === prev.arrows &&
      s.pluses === prev.pluses &&
      s.captions === prev.captions &&
      s.shapes === prev.shapes &&
      s.inks === prev.inks &&
      s.pushes === prev.pushes &&
      s.ringFills === prev.ringFills &&
      s.molecules3d === prev.molecules3d &&
      s.turns3d === prev.turns3d &&
      s.frames3d === prev.frames3d &&
      s.docStyle === prev.docStyle &&
      s.aromaticEnabled === prev.aromaticEnabled &&
      s.aromaticRings === prev.aromaticRings;
    if (same) return;
    clearTimeout(timer);
    timer = setTimeout(send, SETTLE_MS);
  });
  // (the opening may be done already, or still settling: either way, what
  // there is once it settles is what the document shows)
  timer = setTimeout(send, SETTLE_MS);
  return () => {
    clearTimeout(timer);
    stop();
  };
}
