import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { RISE } from "../theme/motion";
import { useLeaving } from "../theme/leaving";
import { longPressMs } from "../features/Workspace/longPress";
import UndoIcon from "./UndoIcon";
import { canUndo, chooseStep, hasHistory, historyRows, isLit, pressHold, undoClick, undoTip, type UndoDoc } from "./undoHistory";

/** A press on the button or the list that leaves the focus - and with it the selection - where it was: on the page, or in a field. */
export const keepFocus = (e: Pick<MouseEvent, "preventDefault" | "stopPropagation">) => {
  e.preventDefault();
  e.stopPropagation();
};

/**
 * Undo, in the title bar by Save and Settings: a click takes one step back
 * in the tab in front, as the keys and Edit > Undo do; held, or
 * right-clicked, it opens the history under it. Always there, faint with
 * nothing to take back.
 */
export default function UndoButton({ doc }: { doc: UndoDoc | undefined }) {
  const [, seen] = useReducer((n: number) => n + 1, 0);
  // (the document's steps, and the focus - a field of its own undo or not - as they change)
  useEffect(() => doc?.subscribe(seen), [doc]);
  useEffect(() => {
    window.addEventListener("focusin", seen);
    window.addEventListener("focusout", seen);
    return () => {
      window.removeEventListener("focusin", seen);
      window.removeEventListener("focusout", seen);
    };
  }, []);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const press = useRef(pressHold({ wait: longPressMs, open: () => setOpen(true) })).current;
  useEffect(() => press.cancel, [press]);
  const active = typeof document === "undefined" ? null : document.activeElement;
  const can = canUndo(doc, active);
  const listed = hasHistory(doc);
  return (
    <>
      <button
        ref={button}
        aria-label="Undo"
        aria-disabled={!can}
        aria-haspopup="menu"
        aria-expanded={open}
        data-guide="undo"
        title={undoTip(doc, active)}
        onMouseDown={keepFocus}
        onPointerDown={(e) => {
          if (e.button !== 0 || !listed) return;
          press.down();
        }}
        onPointerUp={press.cancel}
        onPointerLeave={press.cancel}
        onPointerCancel={press.cancel}
        onClick={() => {
          if (!press.click() || open) return;
          undoClick({ active: document.activeElement, doc, field: (c) => document.execCommand(c) });
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          press.rightClick(listed);
        }}
        style={{ touchAction: "manipulation" }}
        className={clsx(
          "h-7 w-7 rounded-md flex items-center justify-center text-gh-gray transition-[color,background-color,opacity] duration-150 ease-meno",
          can ? "hover:bg-gray-200 hover:text-gh-black" : "opacity-40",
          open && "bg-gray-200 text-gh-black",
        )}
      >
        <UndoIcon className="h-4.5 w-4.5" />
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>{open && doc && <HistoryMenu key="history" doc={doc} under={button.current} onClose={() => setOpen(false)} />}</AnimatePresence>,
          document.body,
        )}
    </>
  );
}

/**
 * The history, hanging from the button: the steps that can be done again,
 * faint, above the mark of now, and those that can be taken back under it,
 * the newest first. Pointing at one lights every step from now to it; a
 * click goes there in one change. Escape, or a press elsewhere, closes it.
 */
function HistoryMenu({ doc, under, onClose }: { doc: UndoDoc; under: HTMLElement | null; onClose: () => void }) {
  const { leaving, held } = useLeaving();
  const [, seen] = useReducer((n: number) => n + 1, 0);
  useEffect(() => doc.subscribe(seen), [doc]);
  const rows = historyRows(doc.steps());
  const [pointed, setPointed] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; maxHeight: number }>({ left: 0, top: 0, maxHeight: 0 });
  useLayoutEffect(() => {
    const b = under?.getBoundingClientRect();
    const w = ref.current?.offsetWidth ?? 0;
    if (!b) return;
    const top = b.bottom + 4;
    setPlace({ left: Math.max(8, Math.min(b.right - w, window.innerWidth - w - 8)), top, maxHeight: window.innerHeight - top - 8 });
    // (now in view: the steps nearest it, not the farthest to do again)
    const now = ref.current?.querySelector<HTMLElement>("[data-now]");
    if (now && ref.current) ref.current.scrollTop = Math.max(0, now.offsetTop - 4 * 32);
  }, [under]);
  // (the keys and presses taken while it is up - not while it fades: the next press is the next thing done)
  useEffect(() => {
    if (leaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        const steps = rows.filter((r) => r.offset !== 0).map((r) => r.offset);
        if (!steps.length) return;
        const at = pointed == null ? -1 : steps.indexOf(pointed);
        const next = at < 0 ? steps.indexOf(-1) >= 0 ? steps.indexOf(-1) : 0 : Math.max(0, Math.min(steps.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)));
        setPointed(steps[next]);
        return;
      }
      if (e.key === "Enter" && pointed != null) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        chooseStep(doc, pointed);
      }
    };
    const onPress = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node) || under?.contains(e.target as Node)) return;
      onClose();
    };
    const onWheel = (e: WheelEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("wheel", onWheel, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("blur", onClose);
    };
  }, [leaving, rows, pointed, doc, under, onClose]);
  return (
    <motion.div
      ref={ref}
      {...RISE}
      {...held}
      role="menu"
      aria-label="History"
      className="fixed z-50 grid content-start min-w-[12rem] max-w-[20rem] rounded-md border border-gh-line bg-white py-1 shadow-lg text-sm text-gh-black outline-none overflow-y-auto overscroll-contain"
      style={place}
      onMouseDown={keepFocus}
      onContextMenu={(e) => e.preventDefault()}
      onPointerLeave={() => setPointed(null)}
    >
      {rows.map((row) =>
        row.offset === 0 ? (
          <div key="now" data-now className="flex items-center gap-2 h-6 px-3 text-xs text-gh-gray select-none">
            <span>Now</span>
            <span className="flex-1 border-t border-gh-line" />
          </div>
        ) : (
          <button
            key={row.offset}
            role="menuitem"
            tabIndex={-1}
            onMouseDown={keepFocus}
            onPointerEnter={() => setPointed(row.offset)}
            onClick={() => {
              onClose();
              chooseStep(doc, row.offset);
            }}
            className={clsx(
              "min-w-0 h-8 px-3 text-left truncate outline-none transition-colors duration-150 ease-meno",
              isLit(row.offset, pointed) && "bg-gh-base",
              row.forward && !isLit(row.offset, pointed) && "text-gh-gray",
            )}
          >
            {row.text}
          </button>
        ),
      )}
    </motion.div>
  );
}
