import { holdPdfBytes } from "../../../../lib/pdf/reader";
import { isPictureName } from "../../../../lib/picture/image";
import { pictureToAdd } from "../utils/pictures";
import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useEffect, useRef, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { takeOpening, useEditorStore } from "../store";
import { ATOM_HOVER_RING_RADIUS_RATIO, DOUBLE_CLICK_MS } from "../constants";
import { calculateNewBondPosition } from "../utils/geometry";
import { endsDrag, movePress, startPress, type Press } from "../utils/press";
import { editorModelOf, openedPlace, opensAsText, processFileContent, type ProcessedFileResult } from "../utils/io";
import { isBlankDocument, schemeOf, type ImportedScheme, type WorkspaceDocument } from "../document";
import { structureInDrop } from "../chem/fromClipboard";
import { centredAt } from "../utils/copyPaste";
import { isWorkspaceFile, readKept, readWorkspace } from "../utils/workspace";
import { openWorkspacesFrom } from "../../../../lib/clipboard";
import { isMenoFile } from "../../../../lib/doc/menoFile";
import { askToOpenFiles, opensAsWorkspace } from "../../../layouts/commands";
import type { Drawn } from "../store/types";
import { style3dOf } from "../style3d";
import { lookOf, rowAbout, rowAfter, solidOf } from "../utils/molecule3d";
import { openedAsStack } from "../utils/stacks";
import type { DropZone, Dropped } from "../../../../lib/drop";

import { readRecord } from "../utils/copyPaste";
import { kindOf, MARK_REACH, MENO_KINDS, type Kind } from "../../../../lib/io/kinds";
import { headOfFile, textOfFile } from "../../../../lib/io/text";
import { NotRead } from "../../../../lib/calc/read";
import { kindOfFile } from "../../../../lib/calc/probe";
import { anyKindById } from "../../../../lib/calc/catalog";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { atomOfLabelAt, labelReachOf } from "../utils/labelHits";
import { placeOpened } from "../utils/freePlace";
import { styleOf } from "../../../../lib/chem/style";
import { heldEach } from "../utils/heldEach";
import { greatest } from "../../../../lib/chem/lists";
import { bondLengthFrom } from "../utils/magnified";


/** What failed to come in, as the canvas says it: and, where no plugin added reads it, the plugins a catalogue suggests, and how to read it again once one is added. */
export type ImportError = { text: string; suggest?: readonly string[]; again?: () => void };

export function useStructureEvents(
  initialPayload?: string,
  initialFilename?: string,
  /** The payload is a file opened by its name - not a document's object - which Save As then suggests. */
  openedFile?: boolean,
  /** What the payload is, where whoever opened it said (lib/io/kinds); otherwise told here. */
  initialKind?: string,
  /** Where the file opened is, where Open said: a workspace's is where Save writes it back. */
  initialPath?: string,
) {
  const store = useEditorStore();

  // Refs
  const camRef = useRef<THREE.OrthographicCamera | THREE.PerspectiveCamera | null>(null);
  const domRef = useRef<HTMLCanvasElement | null>(null);
  // The press the next click ends, and whether it has travelled (utils/press)
  const pressRef = useRef<Press | null>(null);
  // Where the pointer is over the drawing, in the window; null off it
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  // Last import failure, shown in the canvas until dismissed or replaced:
  // where no plugin added reads the file, with the plugins a catalogue
  // suggests, each to add - and the file read again once one is.
  const [importError, setImportError] = useState<ImportError | null>(null);
  // (a drop being read: where it was dropped, in the window's pixels - marked there until what it brings is placed, or fails)
  const [dropping, setDropping] = useState<{ x: number; y: number; key: number } | null>(null);
  const reportImportError = (what: string, err: unknown, again?: () => void) => {
    console.warn(`${what} import failed`, err);
    const text = err instanceof Error ? err.message : String(err);
    setImportError(err instanceof NotRead && err.suggest.length && again ? { text, suggest: err.suggest, again } : { text });
  };

  // Helper: Client to World conversion
  const clientToWorld = (clientX: number, clientY: number) => {
    if (!camRef.current || !domRef.current)
      return null as { x: number; y: number } | null;
    const rect = domRef.current.getBoundingClientRect();
    const v = new THREE.Vector3(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
      0,
    );
    const p = pageAt(v.x, v.y, camRef.current);
    return { x: p.x, y: p.y };
  };

  // An import is one undo step: the model goes into the document as a whole,
  // rather than being replayed atom by atom.
  const toModel = editorModelOf;

  // A file's reaction arrow and pluses, moved by (dx, dy) along with its
  // atoms, and its molecules in 3D standing in a row about `at`: placed in
  // the same edit as its atoms are.
  const importedScheme = (
    result: Pick<ProcessedFileResult, "arrow" | "pluses" | "molecules3d"> & { model?: ProcessedFileResult["model"] },
    dx: number,
    dy: number,
    at: { x: number; y: number } = { x: 0, y: 0 },
  ): ImportedScheme => {
    const a = result.arrow;
    const solids = (result.molecules3d ?? []).map((m) => ({ ...m, id: 0, at }));
    const style = style3dOf(store.getState());
    // (several - an SD file's records - a stack, standing in one place, one
    // shown at a time: utils/stacks; numbered as the document's own when added.
    // An output's jobs stand side by side)
    const stacked = openedAsStack(solids);
    const reaches = solids.map((m) => solidOf(m, style).reach[lookOf(m)]);
    const room = stacked ? [greatest(reaches)] : reaches;
    // (beside a drawing the same file brings, to its right)
    const drawn = result.model?.atoms ?? [];
    const row = drawn.length
      ? rowAfter(
          greatest(drawn.map((a) => a.x)) + dx + 2 * NOMINAL_BOND_LENGTH,
          drawn.reduce((y, a) => y + a.y, 0) / drawn.length + dy,
          room,
        )
      : rowAbout(at, room);
    const places = stacked ? solids.map(() => row[0]) : row;
    return {
      ...(solids.length
        ? { molecules3d: solids.map(({ id: _id, ...m }, i) => ({ ...m, at: places[i], ...(stacked ? { stack: { id: 1 } } : {}) })) }
        : {}),
      arrows: a
        ? [
            {
              x: (a.x1 + a.x2) / 2 + dx,
              y: (a.y1 + a.y2) / 2 + dy,
              angle: Math.atan2(a.y2 - a.y1, a.x2 - a.x1),
              length: Math.hypot(a.x2 - a.x1, a.y2 - a.y1),
            },
          ]
        : [],
      pluses: (result.pluses ?? []).map((p) => ({ x: p.x + dx, y: p.y + dy })),
    };
  };

  // Effect: Initial Payload
  useEffect(() => {
    (async () => {
      // One import per store: this effect runs twice under StrictMode, and
      // again when the canvas is made again after it failed (ui/layouts/
      // ErrorBoundary) - importing twice would leave two undo steps for a
      // single file, or put the file back over everything done since.
      if (!takeOpening(store)) return;
      if (!initialPayload) {
        // (a canvas opened for a text: Save suggests its name, beside it)
        if (openedFile && initialFilename) store.getState().markOpenedOver(initialPath ?? initialFilename);
        return;
      }
      // what it is, as whoever opened it said (lib/io/kinds) - or told now
      const kind = (initialKind ? anyKindById(initialKind) : undefined) ?? kindOf(initialFilename ?? "", initialPayload);
      // A workspace file, as it was saved
      if (kind?.id === MENO_KINDS.workspace.id) {
        const saved = readWorkspace(initialPayload);
        if (saved) {
          // (its texts read from its file, held as it was opened - and its pictures: any that cannot be read, named)
          const { ws, missing } = await readKept(saved);
          store.getState().openWorkspace(ws, true);
          if (missing.length) reportImportError("initial payload", new Error(`${missing.join(", ")} could not be read from the workspace.`));
          // (opened from its own file, it is saved back to it; else Save asks where)
          if (openedFile && initialPath && isWorkspaceFile(initialPath)) store.getState().markSavedAs(initialPath);
          else if (openedFile && initialFilename) store.getState().markOpenedOver(initialPath ?? initialFilename);
        } else reportImportError("initial payload", new Error("The workspace could not be read."));
        return;
      }
      // Meno's own record of a structure - one from a document (lib/ole) - taken as it is
      if (kind?.id === MENO_KINDS.record.id) {
        const record = readRecord(initialPayload);
        if (record) store.getState().openModel(record, schemeOf(record));
        else reportImportError("initial payload", new Error("The structure could not be read."));
        return;
      }
      await openPayload(kind);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The file the tab was opened with, read as its kind - again, once a plugin that reads it is added.
  const openPayload = async (kind: Kind | null) => {
      if (!initialPayload) return;
      try {
        const result = await processFileContent(
          initialFilename || "",
          initialPayload,
          kind,
          initialPath,
        );
        const st = store.getState();
        const { add, dx, dy } = openedPlace(isBlankDocument(st as unknown as WorkspaceDocument), st.model.atoms, result);
        const shifted = {
          atoms: result.model.atoms.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })),
          bonds: result.model.bonds,
        };
        // The file the tab was opened with is where its document starts:
        // nothing to undo, nothing unsaved - unless the canvas was drawn on
        // as it was read: then it is added beside that, one step to undo.
        if (add) st.appendModel(toModel(shifted), importedScheme(result, dx, dy));
        else st.openModel(toModel(shifted), importedScheme(result, dx, dy));
        if (openedFile && initialFilename) store.getState().markOpenedOver(initialPath ?? initialFilename);
        setImportError(null);
      } catch (e) {
        reportImportError("initial payload", e, () => void openPayload(kind && (anyKindById(kind.id) ?? kind)));
      }
  };

  // Effect: Keydown Listener
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const st = store.getState();
      if (st.labelEdit.active) return;
      const t = ev.target as Element | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          (t as HTMLElement).isContentEditable)
      ) {
        return;
      }
      // Future key handling logic here
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);

  // Event Handlers

  const handleDoubleClick = (e: any) => {
    try {
      (e as any).stopPropagation?.();
    } catch {}
    if (!camRef.current || !domRef.current) return;
    // (twice on a molecule in 3D: nothing drawn on the page under it - nor on a mark, put back by it, nor on a measurement's value)
    if (store.getState().hovered3d || store.getState().hoveredMark || store.getState().hoveredMeasure3d) return;
    // (Ctrl or ⌘, or Shift, clicked twice: the selection's, not a bond drawn)
    if (addsToSelection(e) || e.shiftKey) return;
    const stNow = store.getState();
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (stNow.suppressDblClickUntil && nowMs < stNow.suppressDblClickUntil)
      return;
    if (stNow.extend.active) return;

    const rect = domRef.current.getBoundingClientRect();
    const ndc = new THREE.Vector3(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      0,
    );
    ndc.copy(pageAt(ndc.x, ndc.y, camRef.current));

    const st = store.getState();
    // (twice on a text's sheet, nothing drawn over it: read in the column - docs/PDF.md, *A text*)
    if (st.hoveredText != null && st.hovered.atomId == null && st.hovered.bondId == null && st.hoveredPicture == null && st.texts.some((t) => t.id === st.hoveredText && t.at)) {
      st.readText(st.hoveredText);
      return;
    }
    // (twice on a PDF, nothing drawn over it: read in the column - docs/PDF.md)
    const overPdf = st.hoveredPdf != null && st.hovered.atomId == null && st.hovered.bondId == null;
    if (overPdf && st.hoveredArrow == null && st.hoveredPlus == null && st.hoveredCaption == null) {
      st.readPdf(st.hoveredPdf!);
      return;
    }
    const atoms = st.model.atoms;
    const bonds = st.model.bonds;

    const id2 = new Map<number, { x: number; y: number }>();
    for (const a of atoms) id2.set(a.id, { x: a.x, y: a.y });
    // (as long as the bonds of the structure drawn on are shown)
    const L = bondLengthFrom(atoms, st.hovered.atomId);

    const hoveredAtomId = st.hovered.atomId;
    if (hoveredAtomId != null) {
      const base = atoms.find((a) => a.id === hoveredAtomId);
      if (base) {
        // A double-click slower than the drawing's own reckoning of one
        // (the system's double-click time can be set longer) may find its
        // first click already editing this atom's label, nothing typed yet:
        // it was a double-click, so that edit is taken back.
        const edit = st.labelEdit;
        if (
          edit.active &&
          edit.atomId === base.id &&
          edit.opened &&
          nowMs - edit.opened.at < 2 * DOUBLE_CLICK_MS &&
          edit.value === edit.opened.value
        ) {
          st.cancelLabelEdit();
        }
        const neighbors: { x: number; y: number }[] = [];
        for (const b of bonds) {
          if (b.a === base.id || b.b === base.id) {
            const otherId = b.a === base.id ? b.b : b.a;
            const p = id2.get(otherId);
            if (p) neighbors.push(p);
          }
        }

        const newPos = calculateNewBondPosition(
          base,
          neighbors,
          atoms,
          { x: ndc.x, y: ndc.y },
          L,
        );
        const nx = newPos.x;
        const ny = newPos.y;

        const near = store
          .getState()
          .findAtomNear(nx, ny, NOMINAL_BOND_LENGTH * 0.3, base.id);
        // One gesture, one undo step: the atom and its bond together.
        if (near != null) {
          st.connectAtoms(base.id, near, 1);
        } else {
          st.addAtomBonded(base.id, nx, ny, "C", 1);
        }
        return;
      }
    }
    // (on empty space, two clicks begin a chain: Selection2D)
  };

  const handleWrapperMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (pressRef.current && (e.buttons & 1) !== 0)
      pressRef.current = movePress(pressRef.current, e.clientX, e.clientY);
    const st = store.getState();
    // Over a button or a card, nothing on the drawing is under the pointer,
    // whatever is drawn beneath it: a key pressed there must not reach it.
    if (e.target !== domRef.current) {
      pointerRef.current = null;
      st.clearAtomHover();
      return;
    }
    pointerRef.current = { x: e.clientX, y: e.clientY };
    // A molecule in 3D stands over the page: what is drawn under it is not
    // under the pointer.
    if (st.hovered3d) {
      st.clearAtomHover();
      return;
    }
    const p = clientToWorld(e.clientX, e.clientY);
    if (!p) return;
    const tol = ATOM_HOVER_RING_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
    // (or on a label's other letters: the H of HO is the O - utils/labelHits)
    const id = st.findAtomNear(p.x, p.y, tol, null) ?? atomOfLabelAt(labelReachOf(store), p);
    if (id != null) st.setHoveredFromId(id);
    else st.clearAtomHover();
  };

  const handleWrapperMouseLeave = () => {
    pointerRef.current = null;
    try {
      store.getState().clearAtomHover();
      store.getState().clearBondHover();
    } catch {}
  };

  const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // The end of a drag - a bond or a chain drawn, an atom moved, the view
    // panned - edits nothing, wherever it lets go: on the atom it has just
    // drawn, say.
    const press = pressRef.current;
    pressRef.current = null;
    if (endsDrag(press, e.clientX, e.clientY)) return;
    // A click with Ctrl (⌘) or Shift works the selection, and edits nothing
    if (addsToSelection(e) || e.shiftKey) return;
    // (nor one on a charge, an R or S, an E or Z: the mark's, taken hold of to be moved)
    if (store.getState().hoveredMark) return;
    // A click on nothing lets the selection go (not the end of a turn of it)
    const stClick = store.getState();
    const nowClick =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    // (the click that ends a gesture - a long press let go, a box drawn, a
    // turn - is held off as it comes: it lets nothing go)
    const heldOff =
      !!stClick.suppressDblClickUntil && nowClick < stClick.suppressDblClickUntil;
    if (
      e.target === domRef.current &&
      stClick.hovered.atomId == null &&
      stClick.hovered.bondId == null &&
      // (a click on a text's sheet, or on a PDF, selects it: not a click on nothing)
      stClick.hoveredText == null &&
      stClick.hoveredPdf == null &&
      !heldOff
    )
      stClick.clearSel();
  };

  // What is being dragged is read as it comes over the drawing: by the time
  // it is dropped, Word or PowerPoint may already have taken it back (on a
  // Mac, the drag pasteboard is emptied as the drag ends).
  const dropReading = useRef<Promise<Drawn | null> | null>(null);
  // The drawing as a drop zone (lib/drop): it takes files and whatever
  // else is dragged to it, and reads the latter as it comes - but nothing
  // while a talk is given, which edits nothing on the page (the talk's
  // layer lies within the drawing's place, and a drop there would)
  const dropZone: DropZone = {
    takes: () => store.getState().presenting == null,
    enter: (drag) => {
      // (a file from the Finder or Explorer is read when dropped, as ever)
      if (dropReading.current || drag.files) return;
      dropReading.current = structureInDrop().catch(() => null);
    },
    // off the drawing: the drag may end anywhere now
    leave: () => {
      dropReading.current = null;
    },
    drop: (d) => void dropAppend(d),
  };

  const dropAppend = async (drop: Dropped) => {
    const { x, y } = drop;
    let { files } = drop;
    // (a workspace file dragged from the Finder: opened by its path, to be saved back to it - where Meno is told it)
    if (files.some((g) => isWorkspaceFile(g.name)) && (await openWorkspacesFrom("drag"))) {
      files = files.filter((g) => !isWorkspaceFile(g.name));
      if (!files.length) return;
    }
    const reading = dropReading.current;
    dropReading.current = null;
    const key = performance.now();
    setDropping({ x, y, key });
    // (the mark painted before what is dropped is read: a large file's reading may hold the page a while)
    await new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 0)));
    try {
      await readDrop(drop, files, reading);
    } finally {
      setDropping((d) => (d?.key === key ? null : d));
    }
  };

  const readDrop = async (drop: Dropped, files: File[], reading: Promise<Drawn | null> | null) => {
    const { x, y } = drop;
    const dropped = files[0];
    const at = clientToWorld(x, y) || { x: 0, y: 0 };
    // What a file dropped is, from its start (lib/io/kinds): nothing need be
    // read of a large picture to know it is none of Meno's kinds
    const head = dropped ? await headOfFile(dropped, MARK_REACH) : "";
    const kind = dropped ? await kindOfFile(dropped.name, head) : null;
    // None of them: a picture or an object dragged out of Word or
    // PowerPoint, perhaps, whose structure goes where it was dropped,
    // selected - as a paste would
    if (!kind) {
      // (read again if nothing was to be had as it came: a program may
      // hand over what it drags only once it is dropped)
      const found =
        (reading && (await reading.catch(() => null))) || (await structureInDrop().catch(() => null));
      if (found?.atoms.length || found?.molecules3d?.length) {
        store.getState().pasteModel(centredAt(found, at));
        setImportError(null);
        return;
      }
    }
    if (!dropped) return;
    await openFilesAt(files, at, () => void dropAppend(drop));
  };

  /**
   * Files put on the page at `at`, dropped or pasted - copied in the Finder
   * or Explorer - or opened: PDFs and pictures held and laid there; a
   * record's drawing, a text's sheet, or a structure read from its file,
   * there, selected; a workspace file opened as Open opens it, in a tab of
   * its own. Opened (`free`), a structure's file goes in free space near
   * `at` rather than over what is drawn there, and its path - where Open
   * said it is - goes with a calculation's output read from it.
   */
  const openFilesAt = async (files: File[], at: { x: number; y: number }, again?: () => void, opened?: { path?: string; free?: boolean }): Promise<boolean> => {
    const f = files[0];
    if (!f) return false;
    const head = await headOfFile(f, MARK_REACH);
    const kind = await kindOfFile(f.name, head);
    // PDFs: held, and put on the page where they were dropped (docs/PDF.md)
    const pdfs = files.filter((g) => /\.pdf$/i.test(g.name) || g.type === "application/pdf");
    if (pdfs.length) {
      // (each held where it can be: one refused, named with why, keeps none of the rest off the page)
      const { held, refused } = await heldEach(pdfs, async (g) => ({ name: g.name, ...(await holdPdfBytes(new Uint8Array(await g.arrayBuffer()))) }));
      if (held.length) store.getState().addPdfs(held, at);
      if (refused) reportImportError("append", new Error(refused));
      else setImportError(null);
      return held.length > 0;
    }
    // pictures: held, and put on the page where they were dropped (docs/PDF.md, *A picture*)
    const images = files.filter((g) => isPictureName(g.name) || g.type === "image/png" || g.type === "image/jpeg");
    if (images.length) {
      try {
        const held = await Promise.all(images.map(async (g) => pictureToAdd(g.name, new Uint8Array(await g.arrayBuffer()))));
        const pictures = held.filter((p) => p != null);
        if (!pictures.length) throw new Error(`${images[0].name} is not a PNG or JPEG picture Meno can show.`);
        store.getState().addPictures(pictures, at);
        setImportError(null);
      } catch (e) {
        reportImportError("append", e);
        return false;
      }
      return true;
    }
    // a workspace file: opened as Open opens it - in a tab of its own - not pasted in part (the maintainer, 2026-10-12)
    if (opensAsWorkspace(isMenoFile(new Uint8Array(await f.slice(0, 128).arrayBuffer())), kind?.id, MENO_KINDS.workspace.id)) {
      askToOpenFiles(files.filter((g) => g === f || isWorkspaceFile(g.name)));
      setImportError(null);
      return true;
    }
    // a text: held in the workspace, its sheet on the page where it was dropped, shown in its column
    if (!kind && opensAsText(f.name, head)) {
      store.getState().addTexts([{ name: f.name, text: await textOfFile(f) }], at);
      setImportError(null);
      return true;
    }
    const text = await textOfFile(f);
    // a record dropped: what it holds, beside what is drawn, selected
    if (kind?.id === MENO_KINDS.record.id) {
      const drawn = readRecord(text);
      if (drawn) {
        store.getState().pasteModel(centredAt(drawn, at));
        setImportError(null);
        return true;
      }
      reportImportError("append", new Error(`${f.name} could not be read.`));
      return false;
    }
    try {
      const result = await processFileContent(f.name, text, kind, opened?.path);
      // (opened rather than dropped: in free space near the middle of the view)
      const st = store.getState();
      const drawingStyle = styleOf(st.docStyle);
      const place = opened?.free ? placeOpened(st, result, importedScheme(result, -result.centroid.x, -result.centroid.y), at, drawingStyle) : at;
      const dx = place.x - result.centroid.x;
      const dy = place.y - result.centroid.y;

      const shifted = {
        atoms: result.model.atoms.map((a) => ({
          ...a,
          x: a.x + dx,
          y: a.y + dy,
        })),
        bonds: result.model.bonds,
      };

      store
        .getState()
        .appendModel(toModel(shifted), importedScheme(result, dx, dy, place));
      // (put past the edge of a page wider than the view: the view goes to show it, eased - modelSlice `appendModel`)
      setImportError(null);
      return true;
    } catch (err) {
      reportImportError("append", err, again);
      return false;
    }
  };

  const dismissImportError = () => setImportError(null);

  const handleMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    pressRef.current = startPress(e.clientX, e.clientY);
    // A press takes back the edit a click before it was about to begin: it
    // is the second click of a double-click - a chain dragged out of the
    // atom, perhaps - or the start of something else.
    const st = store.getState();
    if (!st.labelEdit.active) return;
    const tgt = e.target as Element | null;
    const isInput =
      !!tgt && (tgt.tagName === "INPUT" || !!tgt.closest("input"));
    if (!isInput) {
      try {
        st.commitLabelEdit();
      } catch {}
      try {
        st.suppressDoubleClick(320);
      } catch {}
    }
  };

  /** The middle of what can be seen: the column over the canvas's right side left out. */
  const viewMiddle = () => {
    const cam = camRef.current;
    const cover = store.getState().cover;
    return { x: (cam?.position.x ?? 0) - (cam?.zoom ? cover / 2 / cam.zoom : 0), y: cam?.position.y ?? 0 };
  };
  /** Where a paste goes: the pointer, over the drawing; else the middle of the view. */
  const pasteTarget = () => {
    const p = pointerRef.current && clientToWorld(pointerRef.current.x, pointerRef.current.y);
    return p ?? viewMiddle();
  };

  return {
    camRef,
    domRef,
    clientToWorld,
    pasteTarget,
    viewMiddle,
    handleDoubleClick,
    handleWrapperMouseMove,
    handleWrapperMouseLeave,
    handleWrapperClick,
    dropZone,
    dropping,
    openFilesAt,
    importError,
    dismissImportError,
    handleMouseDownCapture,
  };
}
