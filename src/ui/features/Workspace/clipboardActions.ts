import { useCallback, useMemo, useRef } from "react";
import { clipboardFiles, copying, openWorkspacesFrom, writeClipboard, type ClipItem } from "../../../lib/clipboard";
import { isWorkspaceFile } from "./utils/workspace";
import { styleOf } from "../../../lib/chem/style";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { chemMolblock } from "../../../lib/roles/molblock";
import { chemWorker } from "../../../lib/roles/worker";
import { forFlatReaders } from "./chem/drawing";
import { structureOnClipboard } from "./chem/fromClipboard";
import { drawnOf } from "./fileActions";
import { pictureItems } from "./picture";
import type { EditorStore } from "./store";
import type { Carried3D, Drawn } from "./store/types";
import { centredAt, clipItems, hasFlow, partToCopy, pastePlace, recordText, type PastesAt } from "./utils/copyPaste";
import { pictureOnClipboard, picturePng, pictureToAdd } from "./utils/pictures";
import { bondsAmong } from "./utils/selection";
import { carriedOf } from "./utils/workspace";
import { setMembers } from "./workflow/entries";
import { partsOf } from "./workflow/parts";

type Pt = { x: number; y: number };

/**
 * Copy, cut and paste, for the keys and the menu alike.
 *
 * - What is copied is the selection, with the reaction arrows and "+"
 *   signs among it - or, with nothing selected, the structure under the
 *   pointer - with pictures of it, drawn in the style the canvas is drawn
 *   in, for Office and other programs (picture.ts). Pictures on the page
 *   selected go with it; one alone goes as itself, for other programs too.
 * - A paste goes where it is asked to go (the pointer, or where the menu
 *   was opened), selected, so that it can be dragged straight on; one undo
 *   step. Files copied in the Finder or Explorer go there as they would
 *   dropped there (`openFiles`). A picture on the clipboard and nothing
 *   else - a screenshot, a photograph a browser copied - goes on the page
 *   as a picture.
 * - `copySmiles` puts the SMILES alone on the clipboard, as plain text.
 */
export function useClipboardActions(
  store: EditorStore,
  onError: (message: string) => void,
  openFiles?: (files: File[], at: Pt) => Promise<void>,
) {
  const busy = useCallback(() => {
    const st = store.getState();
    return st.labelEdit.active || st.moveDrag.active || st.extend.active;
  }, [store]);

  // What a copy takes: the drawing's part, and the molecules in 3D - those
  // selected, or with nothing selected the one under the pointer - as they
  // are shown; and those molecules' ids, for a cut.
  // (`only`: one molecule in 3D, alone - what its own menu was opened on)
  const part = useCallback((only?: number): { part: Drawn; ids3d: number[] } | null => {
    const state = store.getState();
    const { model, hovered, hovered3d, molecules3d, selFlow } = state;
    // (a set selected takes what it holds along, selected or not - as it does when dragged)
    const held = only != null ? [] : state.sets.filter((b) => selFlow.sets.has(b.id)).map((b) => setMembers(state, b));
    // (the pictures selected go with it - and a set's, a Render step's - and the words)
    const heldPictures = new Set(held.flatMap((h) => h.pictures));
    const pictures = only != null ? [] : state.pictures.filter((p) => state.selPictures.has(p.id) || heldPictures.has(p.id));
    const words = only != null ? [] : state.captions.filter((c) => state.selCaptions.has(c.id));
    // (and the PDFs and texts' sheets selected: carried whole, by what they are)
    const pdfs = only != null ? [] : state.pdfs.filter((p) => state.selPdfs.has(p.id));
    const sheets = only != null ? [] : state.texts.filter((t) => t.at && state.selTexts.has(t.id));
    // (and the slides selected, in the talk's order; and the shapes selected, from the back, with the words in them)
    const slides = only != null ? [] : state.slides.filter((s) => state.selSlides.has(s.id));
    const shapes = only != null ? [] : state.shapes.filter((s) => state.selShapes.has(s.id));
    const inShapes = state.captions.filter((c) => c.shape != null && shapes.some((s) => s.id === c.shape) && !words.some((w) => w.id === c.id));
    words.push(...inShapes);
    // (and the arrows and "+" signs selected for themselves - one pointing at something - with the words over those arrows)
    const lone = only != null ? [] : state.arrows.filter((a) => state.selArrows.has(a.id));
    const lonePluses = only != null ? [] : state.pluses.filter((p) => state.selPluses.has(p.id));
    words.push(...state.captions.filter((c) => c.arrow != null && lone.some((a) => a.id === c.arrow) && !words.some((w) => w.id === c.id)));
    // (and the writing by hand selected, each piece whole)
    const inks = only != null ? [] : state.inks.filter((k) => state.selInks.has(k.id));
    const others = pictures.length + words.length + pdfs.length + sheets.length + slides.length + shapes.length + lone.length + lonePluses.length + inks.length > 0;
    const heldAtoms = new Set(held.flatMap((h) => h.structures.flat()));
    const sel = heldAtoms.size
      ? { atoms: new Set([...state.sel.atoms, ...heldAtoms]), bonds: new Set([...state.sel.bonds, ...bondsAmong(model, heldAtoms)]) }
      : state.sel;
    const sel3d = new Set([...state.sel3d, ...held.flatMap((h) => h.molecules)]);
    const flow = only != null || (!selFlow.sets.size && !selFlow.steps.size) ? undefined : partsOf(state, selFlow.sets, selFlow.steps);
    const around =
      hovered.atomId ?? model.bonds.find((b) => b.id === hovered.bondId)?.a ?? null;
    const drawn = only != null ? null : partToCopy(drawnOf(state), sel, flow || others ? null : around);
    const nothingSelected = !sel.atoms.size && !sel.bonds.size && !sel3d.size && !flow && !others;
    const ids3d =
      only != null ? [only] : sel3d.size ? [...sel3d] : nothingSelected && hovered3d && !drawn ? [hovered3d.id] : [];
    const carried = copiedMolecules(state, ids3d);
    if (!drawn && !carried.length && !flow && !others) return null;
    const amongWords = drawn?.captions ?? [];
    const allWords = [...amongWords, ...words.filter((c) => !amongWords.some((a) => a.id === c.id))];
    // (each arrow and "+" once: among the atoms, or selected for itself)
    const allArrows = [...(drawn?.arrows ?? []), ...lone.filter((a) => !drawn?.arrows?.some((x) => x.id === a.id))];
    const allPluses = [...(drawn?.pluses ?? []), ...lonePluses.filter((p) => !drawn?.pluses?.some((x) => x.id === p.id))];
    return {
      part: {
        ...(drawn ?? { atoms: [], bonds: [] }),
        ...(allArrows.length ? { arrows: allArrows } : {}),
        ...(allPluses.length ? { pluses: allPluses } : {}),
        ...(allWords.length ? { captions: allWords } : {}),
        ...(carried.length ? { molecules3d: carried } : {}),
        ...(flow ? { flow } : {}),
        ...(pictures.length ? { pictures } : {}),
        ...(pdfs.length ? { pdfs } : {}),
        ...(sheets.length ? { sheets } : {}),
        ...(slides.length ? { slides } : {}),
        ...(shapes.length ? { shapes } : {}),
        ...(inks.length ? { inks } : {}),
      },
      ids3d: molecules3d.filter((m) => ids3d.includes(m.id)).map((m) => m.id),
    };
  }, [store]);

  const copyNow = useCallback(async (only?: number) => {
    const taken = part(only);
    if (!taken || busy()) return false;
    const p = taken.part;
    try {
      const state = store.getState();
      // (the structure is copied, pictures or no: the drawing's and the
      // molecules' in 3D, as they are seen)
      // (a picture on the page alone: itself, for other programs)
      const alone = !p.atoms.length && !p.molecules3d?.length && !hasFlow(p) && !p.pdfs?.length && !p.sheets?.length && p.pictures?.length === 1 ? p.pictures[0] : null;
      const pictures = alone
        ? await picturePng(alone).then((png) => (png ? [{ flavor: "png" as const, bytes: png }] : [])).catch(() => [])
        : !p.atoms.length && !p.molecules3d?.length
        ? []
        : await pictureItems(
            p,
            state,
            styleOf(state.docStyle ?? useAppSettings.getState().drawingStyle),
          ).catch((e: unknown) => {
            console.warn("the structure is copied without its pictures", e);
            return [];
          });
      // (a text's sheet alone: its words too, for other programs)
      const lone = !p.atoms.length && !p.molecules3d?.length && !hasFlow(p) && !p.pictures?.length && !p.pdfs?.length && !p.captions?.length && p.sheets?.length === 1 ? p.sheets[0] : null;
      const words: ClipItem[] = lone ? [{ flavor: "text", text: lone.text }] : [];
      await writeClipboard([...clipItems(p), ...words, ...pictures]).catch(async (e: unknown) => {
        // a picture the system would not take is left out, not the structure
        if (!pictures.length) throw e;
        console.warn("the structure is copied without its pictures", e);
        await writeClipboard(clipItems(p));
      });
      return true;
    } catch (e) {
      onError(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }, [part, busy, onError, store]);
  // (what is selected now, put on the clipboard once its pictures are drawn: a paste meanwhile waits for it)
  const copy = useCallback((only?: number) => copying(() => copyNow(only)), [copyNow]);

  const cut = useCallback(async (only?: number) => {
    const taken = part(only);
    if (!taken || !(await copy(only))) return;
    // what was copied is what goes: the selection, or the structure, and
    // the arrows and pluses that went with it, and the molecules in 3D
    store.getState().deleteDrawn(taken.part, taken.ids3d);
  }, [part, copy, store]);

  // (the pastes asked for at one place: a paste there again lands a step on - utils/copyPaste#pastePlace)
  const pastes = useRef<PastesAt | null>(null);
  const paste = useCallback(
    async (asked: Pt) => {
      if (busy()) return;
      const { place: at, pastes: now } = pastePlace(pastes.current, asked);
      try {
        // (files copied in the Finder or Explorer: as they would come dropped
        // there - but a workspace file opened by its path, to be saved back to it)
        const byPath = openFiles ? await openWorkspacesFrom("clipboard") : 0;
        const files = (openFiles ? await clipboardFiles() : []).filter((f) => !byPath || !isWorkspaceFile(f.name));
        if (byPath && !files.length) {
          pastes.current = now;
          return;
        }
        if (files.length && openFiles) {
          pastes.current = now;
          await openFiles(files, at);
          return;
        }
        const found = await structureOnClipboard();
        if (!found || (!found.atoms.length && !found.molecules3d?.length && !hasFlow(found) && !found.pictures?.length && !found.captions?.length && !found.pdfs?.length && !found.sheets?.length && !found.slides?.length && !found.shapes?.length && !found.inks?.length && !found.arrows?.length && !found.pluses?.length)) {
          // (a picture, and nothing that reads as a structure: a picture on the page)
          const png = await pictureOnClipboard();
          const picture = png ? await pictureToAdd(png[0] === 0xff && png[1] === 0xd8 ? "Pasted picture.jpg" : "Pasted picture.png", png) : null;
          if (picture) {
            pastes.current = now;
            store.getState().addPictures([picture], at);
            return;
          }
          onError("There is nothing on the clipboard that reads as a structure or a picture.");
          return;
        }
        pastes.current = now;
        store.getState().pasteModel(centredAt(found, at));
      } catch (e) {
        onError(`Paste failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [busy, store, onError, openFiles],
  );

  const copySmiles = useCallback(
    () =>
      copying(async () => {
        const p = part()?.part;
        if (!p?.atoms.length) return;
        try {
          const c = await chemWorker("smiles");
          const { smiles } = await c.request("to_smiles", { molblock: chemMolblock(forFlatReaders(p)) });
          await writeClipboard([{ flavor: "text", text: smiles }]);
        } catch (e) {
          onError(`Copy as SMILES failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }),
    [part, onError],
  );

  // a picture on the page, alone: for Meno, and as itself for other programs
  const copyPicture = useCallback(
    (id: number) =>
      copying(async () => {
        const p = store.getState().pictures.find((x) => x.id === id);
        if (!p) return;
        try {
          const png = await picturePng(p);
          await writeClipboard([{ flavor: "meno", text: recordText({ atoms: [], bonds: [], pictures: [p] }) }, ...(png ? [{ flavor: "png" as const, bytes: png }] : [])]);
        } catch (e) {
          onError(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }),
    [store, onError],
  );

  // (what a copy would take - the selection, as it is seen - for Export to write)
  return useMemo(() => ({ copy, cut, paste, copySmiles, copyPicture, part }), [copy, cut, paste, copySmiles, copyPicture, part]);
}

/**
 * The molecules in 3D with these ids as a copy takes them: as they are
 * shown - turned, at the frame shown, and with the list open under each
 * and the row chosen in it, its surface or motion given - as a saved
 * workspace carries them (utils/workspace `carriedOf`), so that the
 * pictures a copy puts on the clipboard show the surface the canvas
 * shows, as an export's do.
 */
export function copiedMolecules(state: Parameters<typeof carriedOf>[0], ids: readonly number[]): Carried3D[] {
  return carriedOf(state).filter((_, i) => ids.includes(state.molecules3d[i].id));
}
