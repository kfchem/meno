/**
 * Drops on the page, handed to the part of it they land on. A part that
 * takes drops - the drawing now; a tab strip, a workflow's node, a 3D view
 * in time - registers as a drop zone (`useDropZone`), and a drag is routed
 * to the zone under it: the zone says whether it takes it, may start
 * reading what it carries as it comes over (Office takes back what it
 * dragged as the drag ends), and is handed the drop.
 *
 * Drags come in two ways, routed alike:
 * - as the page's own drag events, through the webview: files from the
 *   Finder or Explorer on both platforms, and on a Mac everything else too,
 *   whose data the app reads off the drag pasteboard (`readDrop`);
 * - on Windows, a drag from another program that is not of files - an
 *   object or a picture out of Word or PowerPoint. WebView2 keeps what such
 *   a drag carries from the page and from Meno, so as it comes over a zone
 *   that takes it, the app takes it from the webview with a window of its
 *   own over the zone (`drop_catch`, src-tauri/src/drop.rs), reads it, and
 *   tells the page where it goes ("native-drag"); `readDrop` reads what it
 *   read. Off the zone, the webview has it again (text dragged into a
 *   field, say).
 * A drag that starts in the page (a tab, a node) is the page's own, and is
 * not routed.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, type RefObject } from "react";
import { readDrop, type ClipItem, type Flavor } from "./clipboard";

/** What is known of a drag before it is dropped: whether it is of files. */
export type Drag = { files: boolean };

/** A drop: where it landed, in the window's coordinates, and what it brought. */
export type Dropped = {
  x: number;
  y: number;
  /** The files dropped, from the Finder or Explorer. */
  files: File[];
  /** Whatever else it brought - an object or a picture out of Word, say. */
  read: (flavors: Flavor[]) => Promise<ClipItem | null>;
};

/** A part of the page that takes drops. */
export type DropZone = {
  /** Whether it takes this drag. */
  takes(drag: Drag): boolean;
  /** The drag has come over it (to start reading what it carries, say). */
  enter?(drag: Drag): void;
  /** The drag has gone off it, not dropped there. */
  leave?(): void;
  drop(dropped: Dropped): void;
};

/** Where a drag is: an element, or anything with a parent to climb to. */
type Place<N> = { parentElement: N | null };

export type Router<N> = {
  /** The drag is over `at`: whether a zone there takes it. */
  over(at: N | null, drag: Drag): boolean;
  /** The zone the drag is over now, if one takes it. */
  current(): N | null;
  /** The drag has left the page, or ended without a drop. */
  leave(): void;
  /** Dropped at `at`: whether a zone took it. */
  drop(at: N | null, drag: Drag, dropped: Dropped): boolean;
};

/**
 * The routing itself, apart from the page: which zone a drag is over -
 * the nearest one it is in - and when it comes to one, goes off it, and is
 * dropped. `zoneOf` names a place's zone, if it is one.
 */
export function createRouter<N extends Place<N>>(zoneOf: (place: N) => (() => DropZone) | undefined): Router<N> {
  type Held = { place: N; zone: () => DropZone };
  let current: Held | null = null;
  const find = (at: N | null): Held | null => {
    for (let p = at; p; p = p.parentElement) {
      const zone = zoneOf(p);
      if (zone) return { place: p, zone };
    }
    return null;
  };
  const moveTo = (next: Held | null, drag: Drag) => {
    if (next?.place === current?.place) return;
    current?.zone().leave?.();
    current = next;
    next?.zone().enter?.(drag);
  };
  const taking = (at: N | null, drag: Drag) => {
    const found = find(at);
    return found && found.zone().takes(drag) ? found : null;
  };
  return {
    over(at, drag) {
      const found = taking(at, drag);
      moveTo(found, drag);
      return found != null;
    },
    leave() {
      moveTo(null, { files: false });
    },
    current: () => current?.place ?? null,
    drop(at, drag, dropped) {
      const found = taking(at, drag);
      // (the zone it lands on keeps what it began reading: no leave)
      if (current && current.place !== found?.place) current.zone().leave?.();
      current = null;
      found?.zone().drop(dropped);
      return found != null;
    },
  };
}

const zones = new Map<Element, () => DropZone>();
let listening = false;

/** `ref`'s element takes drops as `zone` says, while it is there. */
export function useDropZone(ref: RefObject<Element | null>, zone: DropZone): void {
  const latest = useRef(zone);
  latest.current = zone;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    startRouting();
    zones.set(el, () => latest.current);
    return () => {
      zones.delete(el);
    };
  }, [ref]);
}

/**
 * Whether a drag under way began in the page - from its dragstart to its
 * dragend - and so is the page's own, not routed. A dragstart the page
 * prevents begins no drag, and no dragend follows to say it is over: it is
 * not one (the workspace begins no drag-and-drop of the system's own,
 * Workspace.tsx). `settled` is told of each dragstart after the page's own
 * listeners have had it - whether one of them prevented it.
 */
export function pageDrags() {
  let inside = false;
  return {
    started: () => void (inside = true),
    settled: (e: { defaultPrevented: boolean }) => void (e.defaultPrevented && (inside = false)),
    ended: () => void (inside = false),
    inside: () => inside,
  };
}

/** The page's drag events, and the app's for drags it took from the webview: routed, once. */
function startRouting() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  const router = createRouter<Element>((el) => zones.get(el));
  // A drag begun in the page: not routed
  const own = pageDrags();
  // Whether the app takes drags the page cannot read (Windows): unknown
  // until first asked; and whether it has been asked for this drag
  let native: boolean | null = null;
  let caught = false;
  let told: boolean | null = null;
  const dragOf = (e: DragEvent): Drag => ({ files: [...(e.dataTransfer?.types ?? [])].includes("Files") });
  const catchIt = (zone: Element) => {
    if (!isTauri() || native === false || caught) return;
    caught = true;
    const { x, y, width, height } = zone.getBoundingClientRect();
    void invoke<boolean>("drop_catch", { x, y, width, height }).then(
      (does) => {
        native = does;
        if (!does) caught = false;
      },
      () => {
        native = false;
        caught = false;
      },
    );
  };
  const over = (e: DragEvent) => {
    if (own.inside()) return;
    const drag = dragOf(e);
    if (!router.over(e.target as Element, drag)) return;
    e.preventDefault();
    // A drop takes a copy: what was dragged out of Word or PowerPoint stays
    // where it was (as a move, the document would mark itself changed)
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    // (over the zone, the app takes a drag the page cannot read, on Windows)
    const zone = router.current();
    if (!drag.files && zone) catchIt(zone);
  };
  document.addEventListener("dragstart", own.started, true);
  document.addEventListener("dragstart", own.settled);
  document.addEventListener("dragend", own.ended, true);
  document.addEventListener("dragenter", over, true);
  document.addEventListener("dragover", over, true);
  // (off the page - or handed to the app's own window, on Windows, which
  // says where it goes from then on)
  document.addEventListener("dragleave", (e) => !own.inside() && !e.relatedTarget && router.leave(), true);
  document.addEventListener(
    "drop",
    (e) => {
      if (own.inside()) return;
      if (caught) {
        caught = false;
        void invoke("drop_release");
      }
      const dropped = { x: e.clientX, y: e.clientY, files: [...(e.dataTransfer?.files ?? [])], read: readDrop };
      if (router.drop(e.target as Element, dragOf(e), dropped)) e.preventDefault();
    },
    true,
  );
  if (!isTauri()) return;
  type NativeDrag = { phase: "enter" | "over" | "drop" | "leave" | "gone"; x: number; y: number };
  void listen<NativeDrag>("native-drag", ({ payload: { phase, x, y } }) => {
    const at = document.elementFromPoint(x, y);
    const drag: Drag = { files: false };
    if (phase === "enter") told = null;
    if (phase === "enter" || phase === "over") {
      const takes = router.over(at, drag);
      if (takes !== told) {
        told = takes;
        void invoke("drop_takes", { takes });
      }
      return;
    }
    caught = false;
    told = null;
    if (phase === "drop") router.drop(at, drag, { x, y, files: [], read: readDrop });
    else router.leave();
  });
}
