import { AnimatePresence, motion } from "motion/react";
import { RISE } from "./ui/theme/motion";
import "./App.css";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import TopBar, { type TabsController } from "./ui/layouts/TopBar";
import { usePresentingWindow } from "./ui/presenting";
import {
  reducer,
  createInitialState,
  canOpenKind,
  TOO_MANY_CANVASES,
  TabKind,
} from "./lib/core";
import { Deck, viewRegistry, type ViewEntry } from "./ui/views";
import DocumentBridge from "./ui/views/DocumentBridge";
import { openable, openedAs, openedTexts, stylesOfFile, textsOf, workspaceOfFile, type Opened, type OpenedStyles } from "./ui/views/openFile";
import StyleFileAsk from "./ui/features/StyleEditor/StyleFileAsk";
import { afterAnswer, withAsked } from "./ui/features/StyleEditor/styleAsks";
import { ownChoice, withOwnStyle2d } from "./lib/chem/styleFields";
import { withOwn3d, withRole } from "./lib/chem/style3d";
import { forgetFiles, giveFiles, type OpenedFile } from "./ui/views/files";
import { pdfTakerOf, type OpenedPdf } from "./ui/views/pdfs";
import { pictureTakerOf } from "./ui/views/pictures";
import { holdPdfPath } from "./lib/pdf/reader";
import { isPictureName } from "./lib/picture/image";
import { pictureToAdd } from "./ui/features/Workspace/utils/pictures";
import type { PictureToAdd } from "./ui/features/Workspace/store/types";
import { textTakerOf, type OpenedText } from "./ui/views/texts";
import type { Action, State, TabInstance } from "./lib/core";
import type { DocumentStore } from "./lib/doc";
import { keepClipboard, keepPageUnselected, keepSystemMenuShut, openIntent, undoIntent } from "./lib/doc/shortcuts";
import { openEachOnce, saverOf, setTabsListed } from "./lib/doc/savers";
import { useFilesAsked, useOpenAsked } from "./ui/layouts/commands";
import { isBlankDocument, type WorkspaceDocument } from "./ui/features/Workspace/document";
import { workspaceProblem } from "./ui/features/Workspace/utils/workspace";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { MENO_KINDS } from "./lib/io/kinds";
import { textOf } from "./lib/io/text";
import { kindOfFile } from "./lib/calc/probe";
import { addedReaders } from "./lib/calc/workers";
import { ALL_PLUGINS, READERS } from "./lib/calc/catalog";
import { useGuide } from "./lib/guide/guide";
import GuideCard from "./ui/guide/GuideCard";
import { computerResources, fileNow, limitsOf, stopJob, writeJobLimits } from "./lib/jobs";
import { jobsUnderWay } from "./ui/features/Workspace/workflow/flow";
import { madeStoreOf } from "./ui/features/Workspace/store";
import { stopRenders } from "./ui/features/Workspace/render/renders";
import ConfirmDiscard from "./ui/layouts/ConfirmDiscard";
import { ErrorBoundary, StoppedCard } from "./ui/layouts/ErrorBoundary";
import { loadAppSettings, useAppSettings } from "./lib/settings/appSettings";
import { firstActionDone, watchFirstEdit } from "./lib/firstAction";
import {
  applyNetworkSettings,
  startNetwork,
  useNetwork,
} from "./lib/net/network";
import { sayFailedSetUps } from "./ui/setUpSaid";
import ConsentDialog from "./ui/network/ConsentDialog";
import NetworkToasts from "./ui/network/NetworkToasts";
import UpdateNotice from "./ui/network/UpdateNotice";
import TextMenuHost from "./ui/features/TextEditor/TextMenuHost";
import { startUpdates } from "./lib/update";
import { showSettingsSection, useSettingsAsked } from "./ui/features/SettingsPanel/section";
import { letOfficeGo, officeInUse, startedForOffice, takeOfficeStructures, watchOffice } from "./lib/ole";
import { watchOpenedFiles } from "./lib/openedFiles";

/** How long a Meno started for Office waits for Office to ask it for something. */
const OFFICE_GRACE_MS = 1500;

/** The object in an Office document a tab was opened from, if it was (lib/ole). */
const officeIdOf = (tab: TabInstance | undefined) =>
  (tab?.content.data as { officeId?: number } | undefined)?.officeId;

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  // The tabs as they are, for what is registered once and called later - and
  // brought up to date at once by `act`, for what acts twice in a row.
  const stateRef = useRef<State>(state);
  stateRef.current = state;
  const act = (action: Action) => {
    stateRef.current = reducer(stateRef.current, action);
    dispatch(action);
  };
  // Shown when an action is refused, e.g. the WebGL canvas budget is full.
  const [notice, setNotice] = useState<string | null>(null);
  // (a talk given in the window: the title bar makes way for it)
  const presenting = usePresentingWindow((s) => s.on);
  // Something with unsaved changes, waiting on a yes or a no.
  const [pendingClose, setPendingClose] = useState<
    { kind: "tab"; id: string } | { kind: "window" } | null
  >(null);
  // The style files opened, each asking in turn whether its styles are to be added (docs/FILE-IO.md, *What a .meno holds*).
  const [stylesAsked, setStylesAsked] = useState<OpenedStyles[]>([]);
  const askStyles = (styles: OpenedStyles) => setStylesAsked((was) => withAsked(was, styles));
  const nextStyles = () => setStylesAsked(afterAnswer);

  // One document per tab, for the view kinds that declare `createDocument`.
  // Documents live outside React state: each is its own store and notifies
  // its subscribers, so the app shell only has to hand them out.
  const documentsRef = useRef(
    new Map<string, { kind: string; doc: DocumentStore<any> }>(),
  );
  const getDocument = useCallback((tab: TabInstance) => {
    const entry = viewRegistry[tab.content.kind];
    if (!entry?.createDocument) return undefined;
    const held = documentsRef.current.get(tab.meta.id);
    // A tab changes kind when a file is opened into it; start a fresh document.
    if (held && held.kind === tab.content.kind) return held.doc;
    const doc = entry.createDocument(tab.content.data);
    documentsRef.current.set(tab.meta.id, { kind: tab.content.kind, doc });
    // (a workspace's first edit - a structure put down, a paste - the user's first action, where nothing came before it: lib/firstAction)
    if (tab.content.kind === "workspace") watchFirstEdit(doc);
    return doc;
  }, []);

  // The plugins added on this computer, looked at once as Meno starts: the
  // kinds they bring registered (lib/io/kinds), for whatever is opened,
  // dropped or pasted, those they write offered by Export, and the kinds of
  // step they fill offered in Quick Add.
  useEffect(() => {
    if (isTauri()) void addedReaders([...READERS, ...ALL_PLUGINS.filter((p) => !READERS.some((r) => r.id === p.id))]).catch(() => {});
  }, []);

  // A plugin's set-up that ends without its being added, said wherever the chemist is, until dismissed (ui/setUpSaid).
  useEffect(() => sayFailedSetUps(), []);

  // What this computer's jobs may use, as Settings says, told to its runner
  // as Meno starts and whenever Settings changes it: those waiting take it
  // up at once (lib/jobs `limitsOf`).
  useEffect(() => {
    if (!isTauri()) return;
    let computer: { cores: number; memory: number } | null = null;
    const tell = () => {
      if (computer) void writeJobLimits(limitsOf(useAppSettings.getState().calculations, computer)).catch(() => {});
    };
    computerResources().then((c) => {
      computer = c;
      tell();
    }, () => {});
    return useAppSettings.subscribe((s, was) => {
      if (s.calculations !== was.calculations) tell();
    });
  }, []);

  // The application's settings - the drawing style among them - read once,
  // and the network brought into line with them: offline or not, and what
  // has been allowed. From then on, a change to either is saved.
  useEffect(() => {
    let stopUpdates: (() => void) | undefined;
    let gone = false;
    void (async () => {
      await startNetwork();
      await loadAppSettings();
      await applyNetworkSettings(useAppSettings.getState().network);
      // keeping Meno up to date, as the network now allows (lib/update)
      if (!gone) stopUpdates = startUpdates();
    })();
    const unwatch = useNetwork.subscribe((s, prev) => {
      if (!useAppSettings.getState().loaded) return;
      const sameGrants = s.granted.join("\n") === prev.granted.join("\n");
      if (s.offline === prev.offline && sameGrants) return;
      useAppSettings.getState().setNetwork({ offline: s.offline, granted: s.granted });
    });
    return () => {
      gone = true;
      stopUpdates?.();
      unwatch();
    };
  }, []);

  // The tabs, each with the path it was opened from and its label as the
  // tab bar shows it: a save sees whether another tab holds the file it is
  // to write (lib/doc/savers `heldElsewhere`).
  useEffect(
    () =>
      setTabsListed(() =>
        Object.values(stateRef.current.tabsById).map((t) => ({ id: t.meta.id, openedFrom: (t.content.data as { path?: string } | undefined)?.path, label: t.meta.label })),
      ),
    [],
  );

  // Undo/redo belong to the active tab, not to the app as a whole.
  const activeIdRef = useRef(state.activeId);
  useEffect(() => {
    activeIdRef.current = state.activeId;
  }, [state.activeId]);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const intent = undoIntent({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        target: e.target,
      });
      if (!intent) return;
      const id = activeIdRef.current;
      const held = id ? documentsRef.current.get(id) : undefined;
      if (!held) return;
      const changed =
        intent === "undo" ? held.doc.undo() : held.doc.redo();
      if (changed) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Ctrl/Cmd+A never selects the app's own words, and Ctrl/Cmd+C with
  // nothing to copy leaves the clipboard alone: see keepPageUnselected and
  // keepClipboard.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keepPageUnselected(e);
      keepClipboard(e, window.getSelection());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The system's own right-click menu, only where it edits words: anywhere
  // else it offers the webview's Reload (see keepSystemMenuShut). Heard
  // first, so that nothing that stops the right-click lets it through.
  useEffect(() => {
    window.addEventListener("contextmenu", keepSystemMenuShut, true);
    return () => window.removeEventListener("contextmenu", keepSystemMenuShut, true);
  }, []);

  // A tab's document let go of - its tab closed, or another put in its
  // place: a workspace's renders stopped with it, since what they make
  // would come to no page (render/renders). Resolved once they are asked.
  const letGoOf = (id: string): Promise<void> => {
    const held = documentsRef.current.get(id);
    documentsRef.current.delete(id);
    forgetFiles(id);
    const store = held?.kind === "workspace" ? madeStoreOf(held.doc as DocumentStore<WorkspaceDocument>) : undefined;
    return store ? stopRenders(store) : Promise.resolve();
  };

  // A style file's styles added to the user's own - and, asked, used: the
  // drawing style in the workspace in front, eased in as an edit it can
  // undo; the 3D one as the primary.
  const addStyles = ({ styles }: OpenedStyles, use: boolean) => {
    const s = useAppSettings.getState();
    let own = s.ownDrawingStyles;
    const drawn: string[] = [];
    for (const d of styles.drawing) {
      const made = withOwnStyle2d(own, d.name, d.style);
      own = made.own;
      drawn.push(made.id);
    }
    if (drawn.length) s.setOwnDrawingStyles(own);
    let style3d = s.style3d;
    const looks: string[] = [];
    for (const d of styles.molecules3d) {
      const made = withOwn3d(style3d, d.name, d.look);
      style3d = made.choice;
      looks.push(made.id);
    }
    if (use && looks.length) style3d = withRole(style3d, "primary", looks[0]);
    if (looks.length) s.setStyle3d(style3d);
    const held = use && drawn.length && frontWorkspace ? documentsRef.current.get(frontWorkspace) : undefined;
    if (held?.kind === "workspace") madeStoreOf(held.doc as DocumentStore<WorkspaceDocument>)?.getState().easeDocumentStyle(ownChoice(own.find((o) => o.id === drawn[0])!));
  };

  // The last tab closed, Meno goes with it - once its renders are asked to
  // stop. (Destroyed, not closed: what was unsaved has been asked about
  // already.)
  const closeTab = (id: string) => {
    const stopped = letGoOf(id);
    const last = stateRef.current.tabOrder.every((x) => x === id);
    act({ type: "CLOSE_TAB", id });
    // (asked within 2 s at most: a backend that does not answer keeps no window open)
    const asked = Promise.race([stopped.catch(() => {}), new Promise<void>((done) => setTimeout(done, 2000))]);
    if (last) void asked.then(() => getCurrentWindow().destroy()).catch(() => {});
  };

  // A canvas nothing is drawn on, nor opened into: what a file opened takes
  // the place of, and nothing to keep a Meno started for Office open.
  const isBlankTab = (t: TabInstance | undefined): t is TabInstance => {
    if (!t || t.content.kind !== "workspace" || officeIdOf(t) != null) return false;
    if ((t.content.data as { payload?: string } | undefined)?.payload) return false;
    const doc = documentsRef.current.get(t.meta.id)?.doc as DocumentStore<WorkspaceDocument> | undefined;
    return !doc || isBlankDocument(doc.getState());
  };

  // Something opened - a file, a structure from a document - in a tab of its
  // own: in place of the tab in front, if that is a blank canvas. False when
  // there is no room for another canvas.
  const openTab = (opened: Opened, inPlace = true): boolean => {
    const s = stateRef.current;
    const front = s.activeId ? s.tabsById[s.activeId] : undefined;
    const blank = inPlace && isBlankTab(front) ? front.meta.id : undefined;
    if (!canOpenKind(s, opened.kind, blank)) {
      setNotice(TOO_MANY_CANVASES);
      return false;
    }
    const made = viewRegistry[opened.kind].create(opened.label);
    const tab = { ...made, content: { ...made.content, data: opened.data } } as TabInstance;
    if (blank) {
      void letGoOf(blank);
      act({ type: "REPLACE_TAB", id: blank, tab });
    } else act({ type: "ADD_TAB", tab });
    return true;
  };

  // Texts opened - files, or a new one - held in the workspace `into`, the
  // tab that was in front as they were opened, and shown in its column; on
  // a canvas of their own where it takes none (ui/views/texts).
  const openTexts = (texts: OpenedText[], into: string | null): boolean => {
    const take = into ? textTakerOf(into) : undefined;
    if (!take) return openTab(openedTexts(texts));
    take(texts);
    return true;
  };
  // PDFs opened, likewise: on the page of the workspace in front, or on a canvas of their own (ui/views/pdfs)
  const openPdfs = (pdfs: OpenedPdf[], into: string | null): boolean => {
    const take = into ? pdfTakerOf(into) : undefined;
    if (!take) return openTab({ kind: "workspace", label: pdfs[0].name, data: { pdfs, filename: pdfs[0].name } });
    take(pdfs);
    return true;
  };
  // and pictures (ui/views/pictures)
  const openPictures = (pictures: PictureToAdd[], into: string | null): boolean => {
    const take = into ? pictureTakerOf(into) : undefined;
    if (!take) return openTab({ kind: "workspace", label: pictures[0].name, data: { pictures, filename: pictures[0].name } });
    take(pictures);
    return true;
  };

  // The workspace tab last in front - a tab's own, not a document's: where
  // files opened go while something else is in front (Settings, say).
  const lastWorkspace = useRef<string | null>(null);
  const frontTab = state.activeId ? state.tabsById[state.activeId] : undefined;
  const frontWorkspace = frontTab?.content.kind === "workspace" && officeIdOf(frontTab) == null ? frontTab.meta.id : null;
  useEffect(() => {
    if (frontWorkspace) lastWorkspace.current = frontWorkspace;
  }, [frontWorkspace]);
  // Structures' files and calculations' outputs opened: added to the
  // workspace in front, as a drop on its canvas adds them - only a
  // workspace file opens a tab of its own (the maintainer, 2026-10-13).
  // With none in front, to the one last in front, brought forward; with
  // none at all, to a canvas opened for them (ui/views/files).
  const openStructureFiles = (files: OpenedFile[], into: string | null) => {
    const s = stateRef.current;
    // (a workspace tab's own - not a document's - there still: it takes them as soon as it can, opened just now or not)
    const own = (tab: string | null): tab is string => {
      const t = tab ? s.tabsById[tab] : undefined;
      return t?.content.kind === "workspace" && officeIdOf(t) == null;
    };
    let id = own(into) ? into : null;
    const last = lastWorkspace.current;
    if (!id && own(last)) {
      act({ type: "SELECT_TAB", id: last });
      id = last;
    }
    if (!id) {
      if (!canOpenKind(s, "workspace")) {
        setNotice(TOO_MANY_CANVASES);
        return;
      }
      const tab = viewRegistry.workspace.create("Workspace");
      act({ type: "ADD_TAB", tab });
      id = tab.meta.id;
    }
    giveFiles(id, files);
  };

  // Open (Ctrl/Cmd+O, or the menu): files picked in the system's dialog,
  // by what each is (openFile) - a workspace file in a tab of its own,
  // anything else into the workspace in front. Tauri's dialog gives each file's path, which goes with it;
  // outside Tauri - the browser dev server - the page's own picker stands
  // in, and gives none.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickFiles = async () => {
    if (!isTauri()) {
      fileInputRef.current?.click();
      return;
    }
    const picked = await openDialog({
      multiple: true,
      filters: [{ name: "Files Meno opens", extensions: openable().map((ext) => ext.slice(1)) }],
    }).catch(() => null);
    await openPaths(picked ?? []);
  };
  // Files opened by their paths - picked in Open's dialog, or opened from
  // outside Meno (a workspace file double-clicked: src-tauri/src/opened.rs)
  // - by what each is.
  // (a file opened is the user's first action, where nothing came before it - once it is open: lib/firstAction)
  const openPaths = async (paths: readonly string[]) => {
    try {
      await openPathsAlone(paths);
    } finally {
      if (paths.length) firstActionDone();
    }
  };
  const openPathsAlone = async (paths: readonly string[]) => {
    // (where what is not a workspace file goes: the workspace in front as
    // Open was pressed - not the tab of a workspace file opened with it,
    // which opens as it was saved, untouched: the maintainer, 2026-10-13)
    const front = stateRef.current.activeId;
    const workspaces: { name: string; workspace: string; path: string }[] = [];
    const texts: OpenedText[] = [];
    const structures: OpenedFile[] = [];
    const pdfs: OpenedPdf[] = [];
    const pictures: PictureToAdd[] = [];
    for (const path of paths) {
      const name = path.split(/[\\/]/).pop() || path;
      // (a picture: held, and put on the page - docs/PDF.md, *A picture*)
      if (isPictureName(name)) {
        try {
          const picture = await pictureToAdd(name, await readFile(path));
          if (!picture) throw new Error("It is not a PNG or JPEG picture Meno can show.");
          pictures.push(picture);
        } catch (e) {
          setNotice(`${name} could not be read: ${e instanceof Error ? e.message : String(e)}`);
        }
        continue;
      }
      // (a PDF: held, and put on the page: docs/PDF.md)
      if (/\.pdf$/i.test(name)) {
        try {
          pdfs.push({ name, ...(await holdPdfPath(path)) });
        } catch (e) {
          setNotice(`${name} could not be read: ${e instanceof Error ? e.message : String(e)}`);
        }
        continue;
      }
      try {
        // (as it was before it was read: where its steps' job files are read from again as it is saved, while it is still as it was - workflow/keptJobs)
        const was = await fileNow(path).then((f) => (f ? { path, ...f } : undefined), () => undefined);
        const bytes = await readFile(path);
        // (a file of styles: asked whether to add them - never opened as a workspace)
        const styles = stylesOfFile(bytes);
        if (styles) {
          askStyles(styles);
          continue;
        }
        // (a workspace file: its workspace, and the outputs it keeps held)
        const workspace = workspaceOfFile(bytes, name, was);
        if (workspace != null) {
          workspaces.push({ name, workspace, path });
          continue;
        }
        const text = textOf(bytes);
        // (what it is: told by what it holds - or, where nothing tells it, by a plugin asked)
        const opened = openedAs(name, text, path, await kindOfFile(name, text));
        const asText = textsOf(opened);
        if (asText) texts.push(...asText);
        else structures.push({ name, bytes, path });
      } catch (e) {
        setNotice(`${name} could not be read: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // (a workspace file in a tab of its own - in place of a blank one in
    // front only where nothing else opened is to go there - and that one
    // brought back in front, to take the rest)
    const rest = texts.length + pdfs.length + pictures.length + structures.length > 0;
    // (one already open in a tab - by where it is saved, its one true path - brought forward, not opened again: two tabs on one file overwrite each other)
    const tabs = () => Object.values(stateRef.current.tabsById).map((t) => ({ id: t.meta.id, openedFrom: (t.content.data as { path?: string } | undefined)?.path }));
    await openEachOnce(
      workspaces,
      tabs,
      (id) => act({ type: "SELECT_TAB", id }),
      (w) => openWorkspaceTab(w.name, w.workspace, w.path, !rest),
    );
    if (rest && workspaces.length && front && stateRef.current.tabsById[front]) act({ type: "SELECT_TAB", id: front });
    if (texts.length) openTexts(texts, front);
    if (pdfs.length) openPdfs(pdfs, front);
    if (pictures.length) openPictures(pictures, front);
    if (structures.length) openStructureFiles(structures, front);
  };
  // Closing with unsaved changes: the tabs that hold them, and whether
  // each can be saved (lib/doc/savers).
  const unsavedOf = (p: { kind: "tab"; id: string } | { kind: "window" }): string[] =>
    p.kind === "tab"
      ? [p.id]
      : Object.values(stateRef.current.tabsById)
          .filter((t) => t.meta.dirty && officeIdOf(t) == null)
          .map((t) => t.meta.id);
  const savable = (p: { kind: "tab"; id: string } | { kind: "window" }) => unsavedOf(p).every((id) => saverOf(id));
  // The jobs the workspaces of these tabs have waiting or running
  // (docs/WORKFLOWS.md, *When Meno closes*): they go on without Meno - but
  // a workspace closed without being saved will not pick them up, so they
  // are stopped with it.
  const jobsIn = (ids: readonly string[]): string[] =>
    ids.flatMap((id) => {
      const held = documentsRef.current.get(id);
      return held?.kind === "workspace" ? jobsUnderWay((held.doc as DocumentStore<WorkspaceDocument>).getState()) : [];
    });
  const jobsSaid = (n: number, they: string) => (n ? `, and stops the ${n === 1 ? "job" : `${n} jobs`} ${they} running - saved first, ${n === 1 ? "it goes" : "they go"} on` : "");
  // Each saved in turn - its tab brought forward, so that it is seen which
  // is being saved - and then closed; kept open if one is not saved.
  const saveThenClose = async (p: { kind: "tab"; id: string } | { kind: "window" }) => {
    setPendingClose(null);
    for (const id of unsavedOf(p)) {
      dispatch({ type: "SELECT_TAB", id });
      if (!(await saverOf(id)?.())) return;
    }
    if (p.kind === "tab") closeTab(p.id);
    else void getCurrentWindow().destroy();
  };
  const openFiles = async (files: File[]) => {
    try {
      await openFilesAlone(files);
    } finally {
      if (files.length) firstActionDone();
    }
  };
  const openFilesAlone = async (files: File[]) => {
    const texts: OpenedText[] = [];
    const structures: OpenedFile[] = [];
    for (const f of files) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const styles = stylesOfFile(bytes);
        if (styles) {
          askStyles(styles);
          continue;
        }
        const workspace = workspaceOfFile(bytes, f.name);
        if (workspace != null) {
          openWorkspaceTab(f.name, workspace);
          continue;
        }
        const text = textOf(bytes);
        // (told as Open through the dialog tells it: a catalogue's kind too)
        const opened = openedAs(f.name, text, undefined, await kindOfFile(f.name, text));
        const asText = textsOf(opened);
        if (asText) texts.push(...asText);
        else structures.push({ name: f.name, bytes });
      } catch (e) {
        // (as Open through the dialog says it: a file that does not read - a workspace cut short - said so, not dropped unseen)
        setNotice(`${f.name} could not be read: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // (the tab in front now, as for Open's own)
    const front = stateRef.current.activeId;
    if (texts.length) openTexts(texts, front);
    if (structures.length) openStructureFiles(structures, front);
  };
  // A workspace file's workspace in a tab of its own - where it opens: one
  // that does not - saved by a newer Meno, say - is said so, and leaves no
  // empty tab named after it.
  const openWorkspaceTab = (name: string, workspace: string, path?: string, inPlace = true) => {
    const problem = workspaceProblem(workspace);
    if (problem) setNotice(`${name} could not be read: ${problem}.`);
    else openTab(openedAs(name, workspace, path, MENO_KINDS.workspace), inPlace);
  };
  // (the key listened for once; what it does is this render's)
  const pickRef = useRef(pickFiles);
  pickRef.current = pickFiles;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!openIntent(e)) return;
      e.preventDefault();
      void pickRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Closing the window - its own button, Alt+F4 - asks first when a tab
  // holds unsaved changes (a structure from a document has none: its
  // document has them already). The listener reads the tabs through a
  // ref, so it is registered once and still sees the latest ones.
  const tabsRef = useRef(state.tabsById);
  tabsRef.current = state.tabsById;
  useEffect(() => {
    // (outside Tauri - the browser dev server - there is no window to watch)
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let gone = false;
    getCurrentWindow()
      .onCloseRequested((e) => {
        if (Object.values(tabsRef.current).some((t) => t.meta.dirty && officeIdOf(t) == null)) {
          e.preventDefault();
          setPendingClose({ kind: "window" });
        }
      })
      .then((u) => (gone ? u() : (unlisten = u)))
      .catch(() => {});
    return () => {
      gone = true;
      unlisten?.();
    };
  }, []);

  // Structures from Office documents (Windows, a double-click on one): each
  // opens in a tab of its own - or brings its tab forward if it is open -
  // and the tab closes when the document is done with it. (Listened for
  // once; what it does is this render's, as the tabs are now.)
  const office = useRef<{
    openTab: (o: Opened) => boolean;
    closeTab: (id: string) => void;
    leaveIfOnlyForOffice: (closing?: string) => void;
  } | null>(null);
  useEffect(() => {
    const openTab = (o: Opened) => office.current!.openTab(o);
    const closeTab = (id: string) => office.current!.closeTab(id);
    const leaveIfOnlyForOffice = (closing?: string) => office.current!.leaveIfOnlyForOffice(closing);
    const tabOf = (officeId: number) =>
      Object.values(stateRef.current.tabsById).find((t) => officeIdOf(t) === officeId);
    const open = async () => {
      for (const s of await takeOfficeStructures()) {
        const held = tabOf(s.id);
        if (held) {
          dispatch({ type: "SELECT_TAB", id: held.meta.id });
          continue;
        }
        const label = s.name ? `${s.name} - Office` : "Structure from Office";
        // (Meno's own record, read as what it is)
        const data = { payload: s.record, kind: MENO_KINDS.record.id, officeId: s.id };
        if (!openTab({ kind: "workspace", label, data })) void letOfficeGo(s.id);
      }
    };
    void open(); // (any asked for before the page was up)
    const stop = watchOffice(
      () => void open(),
      (officeId) => {
        const held = tabOf(officeId);
        if (!held) return;
        closeTab(held.meta.id);
        leaveIfOnlyForOffice(held.meta.id);
      },
      () => leaveIfOnlyForOffice(),
    );
    // (Office also starts a Meno only to have an object's picture, and may
    // be done with it before the page is up: looked at once Office has had
    // time to ask for one)
    const idle = window.setTimeout(
      () =>
        void officeInUse().then((inUse) => {
          if (!inUse) leaveIfOnlyForOffice();
        }),
      OFFICE_GRACE_MS,
    );
    return () => {
      window.clearTimeout(idle);
      stop();
    };
  }, []);

  // A Meno Windows started for a document (a double-click on a structure
  // while Meno was not running, or Office wanting its picture) goes again
  // when the document is done with it, unless something else has been
  // opened in it meanwhile.
  const leaveIfOnlyForOffice = (closing?: string) => {
    void startedForOffice().then((forOffice) => {
      if (!forOffice) return;
      const left = Object.values(stateRef.current.tabsById).filter(
        (t) => t.meta.id !== closing && !isBlankTab(t),
      );
      if (!left.length) void getCurrentWindow().close();
    });
  };
  office.current = { openTab, closeTab, leaveIfOnlyForOffice };

  // Workspace files opened from outside Meno - a .meno double-clicked
  // (lib/openedFiles): each in a tab, as Open opens it.
  const openPathsNow = useRef(openPaths);
  openPathsNow.current = openPaths;
  useEffect(() => {
    if (!isTauri()) return;
    return watchOpenedFiles((paths) => void openPathsNow.current(paths));
  }, []);

  const ctl: TabsController = {
    tabOrder: state.tabOrder,
    tabsById: Object.fromEntries(
      Object.entries(state.tabsById).map(([k, v]) => [k, (v as any).meta])
    ),
    activeId: state.activeId,
    reorder: (order) => dispatch({ type: "REORDER", order }),
    select: (id) => dispatch({ type: "SELECT_TAB", id }),
    close: (id) => {
      // a structure from a document: its changes are in the document already
      const officeId = officeIdOf(state.tabsById[id]);
      if (officeId != null) {
        void letOfficeGo(officeId);
        closeTab(id);
        leaveIfOnlyForOffice(id);
      } else if (state.tabsById[id]?.meta.dirty) setPendingClose({ kind: "tab", id });
      else {
        // (its jobs go on, as its saved workspace says: opened again, it picks them up)
        const going = jobsIn([id]).length;
        const label = state.tabsById[id]?.meta.label ?? "this workspace";
        closeTab(id);
        if (going) setNotice(`${going === 1 ? "A job" : `${going} jobs`} of "${label}" ${going === 1 ? "goes" : "go"} on. Open it again to see what ${going === 1 ? "it gives" : "they give"}.`);
      }
    },
    // "+": a canvas, the page everything else is opened from
    add: () => {
      if (!canOpenKind(state, "workspace")) {
        setNotice(TOO_MANY_CANVASES);
        return;
      }
      dispatch({ type: "ADD_TAB", tab: viewRegistry.workspace.create("Workspace") });
    },
    openFiles: pickFiles,
    // (the workspace in front, as Ctrl/Cmd+S saves it)
    ...(state.activeId && state.tabsById[state.activeId]?.content.kind === "workspace"
      ? { save: () => void saverOf(state.activeId!)?.() }
      : {}),
    openByKind: async (kind: TabKind, opts?: { label?: string }) => {
      // There is one Settings tab: asking again brings it to the front. (Opened, it is the user's first action, where nothing came before it: lib/firstAction.)
      if (kind === "settings") {
        firstActionDone();
        const open = state.tabOrder.find(
          (id) => state.tabsById[id]?.content.kind === "settings"
        );
        if (open) {
          dispatch({ type: "SELECT_TAB", id: open });
          return;
        }
      }
      if (!canOpenKind(state, kind)) {
        setNotice(TOO_MANY_CANVASES);
        return;
      }
      const entry: ViewEntry = viewRegistry[kind] ?? viewRegistry.workspace;
      const label = opts?.label ?? "New Tab";
      const tab = entry.create(label);
      dispatch({ type: "ADD_TAB", tab });
    },
  };

  // (Settings asked for from inside a view - a step's card - opened as from the top bar)
  const ctlNow = useRef(ctl);
  ctlNow.current = ctl;
  useEffect(() => useSettingsAsked.subscribe(() => void ctlNow.current.openByKind?.("settings", { label: "Settings" })), []);
  // (Open… asked for from inside a view - the menu on empty space - as Ctrl/Cmd+O)
  useEffect(() => useOpenAsked.subscribe(() => void pickRef.current()), []);
  // (files asked to be opened from inside a view - a workspace file dropped onto a canvas - as Open opens them)
  const openFilesRef = useRef(openFiles);
  openFilesRef.current = openFiles;
  useEffect(() => useFilesAsked.subscribe((s, prev) => s.asked !== prev.asked && void openFilesRef.current([...s.files])), []);
  // (the first steps shown with no workspace in front - from Settings, General - brought to one: what they point at is a workspace's)
  const stateNow = useRef(state);
  stateNow.current = state;
  useEffect(
    () =>
      useGuide.subscribe((g, prev) => {
        if (g.open == null || prev.open != null) return;
        const s = stateNow.current;
        if (s.activeId && s.tabsById[s.activeId]?.content.kind === "workspace") return;
        const workspace = [...s.tabOrder].reverse().find((id) => s.tabsById[id]?.content.kind === "workspace");
        if (workspace) dispatch({ type: "SELECT_TAB", id: workspace });
        else ctlNow.current.add();
      }),
    [],
  );

  const resolveView = useCallback(
    (kind: string): ViewEntry | Promise<ViewEntry> => {
      if (kind in viewRegistry) return viewRegistry[kind as TabKind];
      return viewRegistry.workspace;
    },
    []
  );

  const patchData = (id: string, patch: any) => {
    if (patch?.filename) {
      dispatch({ type: "RENAME_TAB", id, label: patch.filename });
    }
    dispatch({ type: "PATCH_DATA", id, patch });
    dispatch({ type: "SET_DIRTY", id, dirty: true });
  };

  return (
    // (the window is the app: it never scrolls as a whole - fixed to the
    // window and clipped, nothing in it can scroll it, a section scrolled
    // into view in Settings included; only what is inside it scrolls)
    <div className="fixed inset-0 flex flex-col overflow-clip">
      {/* The last resort, should anything in the window fail that nothing
          nearer caught (ui/layouts/ErrorBoundary): a card in its place, and
          Reload making it all again - the tabs and their documents, held
          here, as they were. */}
      <ErrorBoundary
        part="window"
        fallback={({ error, reload }) => (
          // (the window has no frame of its own: moved by any of it meanwhile)
          <div data-tauri-drag-region className="flex-1 relative">
            <StoppedCard
              said="Meno stopped working. The open tabs are kept."
              error={error}
              actions={[
                { label: "Reload", run: reload },
                // (closed as from its own button: asked first, should a tab hold unsaved changes)
                ...(isTauri() ? [{ label: "Close Meno", run: () => void getCurrentWindow().close().catch(() => {}) }] : []),
              ]}
              className="absolute top-3 left-1/2 -translate-x-1/2"
            />
          </div>
        )}
      >
      {/* (while a talk is given, the title bar slides up out of the way: docs/PRESENTING.md) */}
      <div className="shrink-0" style={{ marginTop: presenting ? -40 : 0, transition: "margin-top 300ms cubic-bezier(0.45, 0, 0.55, 1)" }} aria-hidden={presenting || undefined}>
        <TopBar ctl={ctl} />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={openable().join(",")}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          // (the same file can be picked again)
          e.target.value = "";
          void openFiles(files);
        }}
      />
      <AnimatePresence>
      {notice && (
        <motion.div
          key="notice"
          {...RISE}
          role="alert"
          className="absolute top-12 left-1/2 -translate-x-1/2 z-50 max-w-[90%] flex items-start gap-3 rounded-md border border-gh-line bg-white/95 shadow-sm px-3 py-2 text-xs text-gh-black"
        >
          <span className="break-words">{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 underline text-gh-gray hover:text-gh-black"
          >
            OK
          </button>
        </motion.div>
      )}
      </AnimatePresence>
      <NetworkToasts
        onOpen={() => {
          showSettingsSection("network");
          void ctl.openByKind?.("settings", { label: "Settings" });
        }}
      />
      <GuideCard />
      <ConsentDialog />
      <UpdateNotice />
      {/* (the right-click menu on words typed or read in place: TextEditor/textMenu) */}
      <TextMenuHost />
      <Deck
        order={state.mountOrder}
        tabs={state.tabsById}
        activeId={state.activeId}
        resolveView={resolveView}
        patchData={patchData}
        getDocument={getDocument}
        renameTab={(id, label) => dispatch({ type: "RENAME_TAB", id, label })}
      />
      </ErrorBoundary>
      {/* (beside it, not in it: closing is asked about, and the tabs kept in
          step with their documents, whatever has failed) */}
      <AnimatePresence>
      {stylesAsked.length > 0 && (
        <StyleFileAsk
          key={`style-file-${stylesAsked.length}`}
          file={stylesAsked[0].styles}
          picture={stylesAsked[0].picture}
          canUse={frontWorkspace != null}
          onCancel={nextStyles}
          onAdd={(use) => {
            addStyles(stylesAsked[0], use);
            nextStyles();
          }}
        />
      )}
      {pendingClose && (
        <ConfirmDiscard
          key="confirm-discard"
          title={
            pendingClose.kind === "tab"
              ? `Close "${state.tabsById[pendingClose.id]?.meta.label ?? "this tab"}"?`
              : "Close Meno?"
          }
          message={
            pendingClose.kind === "tab"
              ? `Its changes have not been saved. Closing it throws them away${jobsSaid(jobsIn([pendingClose.id]).length, "it is")}.`
              : `Some tabs have changes that have not been saved. Closing the window throws them away${jobsSaid(jobsIn(unsavedOf(pendingClose)).length, "they are")}.`
          }
          discardLabel="Close without saving"
          onCancel={() => setPendingClose(null)}
          onDiscard={async () => {
            const p = pendingClose;
            setPendingClose(null);
            await Promise.all(jobsIn(unsavedOf(p)).map((j) => stopJob(j).catch(() => {})));
            if (p.kind === "tab") closeTab(p.id);
            // destroy, not close: close would only ask again.
            else void getCurrentWindow().destroy();
          }}
          onSave={savable(pendingClose) ? () => void saveThenClose(pendingClose) : undefined}
        />
      )}
      </AnimatePresence>
      {state.mountOrder.map((id) => {
        const tab = state.tabsById[id];
        const entry = tab ? viewRegistry[tab.content.kind] : undefined;
        const doc = tab ? getDocument(tab) : undefined;
        if (!tab || !entry || !doc) return null;
        return (
          <DocumentBridge
            key={id}
            id={id}
            document={doc}
            toTabData={entry.toTabData}
            dispatch={dispatch}
          />
        );
      })}
    </div>
  );
}
