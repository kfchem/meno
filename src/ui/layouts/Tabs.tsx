import { AnimatePresence, Reorder, motion, useMotionValue } from "motion/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useEffect, useRef, type RefObject } from "react";
import { DURATION, EASE, FADE, LEAVE } from "../theme/motion";
import { dragWithin } from "./tabDrag";

export type TabMeta = { id: string; label: string; dirty?: boolean };

/**
 * The tabs in the title bar, in their order: dragged sideways to reorder,
 * pressed to choose, and closed by their ×. A tab dragged stays within the
 * strip - the room the tabs have, which ends where "+" begins - never going
 * under "+" or past the bar's start. More than the bar has room for
 * - sixteen in a window at its least - and they go on past its end, the
 * chosen one brought into view; a tab too narrow for its name and its ×
 * shows what it can of its name, the chosen one keeping both.
 */
export function TabStrip({
  tabOrder,
  tabsById,
  activeId,
  reorder,
  select,
  close,
}: {
  tabOrder: string[];
  tabsById: Record<string, TabMeta>;
  activeId: string | null;
  reorder: (order: string[]) => void;
  select: (id: string) => void;
  close: (id: string) => void;
}) {
  const draggingRef = useRef(false);
  const stripRef = useRef<HTMLUListElement>(null);
  // (where a tab dragged may go: the strip as it is seen, within its padding - its last tab's place the furthest, so
  // that one dragged never runs into the padding and the strip scrolls under it. The padding on the right as wide as
  // the chosen tab's corners: narrower, they stood past the strip's end, and the strip could be scrolled by that much -
  // as a drag held there did, the tabs shifting a few pixels)
  const roomRef = useRef<HTMLDivElement>(null);
  // (the chosen tab in view: once there were more than the bar holds, the
  // ones past its end were cut off, the chosen one too)
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !activeId) return;
    const bring = () =>
      strip.querySelector<HTMLElement>(`[data-tab="${CSS.escape(activeId)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    // (once laid out - a tab just added has its place the frame after, and
    // its coming in stops a scroll begun meanwhile - and again as the bar narrows)
    const frame = requestAnimationFrame(() => requestAnimationFrame(bring));
    const after = window.setTimeout(bring, DURATION.base * 1000 + 40);
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(bring);
    watch?.observe(strip);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(after);
      watch?.disconnect();
    };
  }, [activeId, tabOrder.length]);
  return (
    <div className="relative flex min-w-0 h-full">
      <div ref={roomRef} aria-hidden className="absolute inset-y-0 left-1.5 right-2 pointer-events-none" />
      <Reorder.Group
        ref={stripRef}
        axis="x"
        values={tabOrder}
        onReorder={reorder}
        layoutScroll
        className="flex h-full items-end space-x-1 min-w-0 pl-1.5 pr-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative"
        data-tauri-drag-region
      >
        {/* A tab comes in rising, and closed goes the same way, the others
            closing up after it. */}
        <AnimatePresence initial={false}>
          {tabOrder.map((id) => (
            <Tab
              key={id}
              tab={tabsById[id]}
              selected={id === activeId}
              draggingRef={draggingRef}
              strip={stripRef}
              within={roomRef}
              onSelect={() => select(id)}
              onClose={() => close(id)}
            />
          ))}
        </AnimatePresence>
      </Reorder.Group>
    </div>
  );
}

function Tab({
  tab,
  selected,
  draggingRef,
  strip,
  within,
  onSelect,
  onClose,
}: {
  tab: TabMeta;
  selected: boolean;
  draggingRef: RefObject<boolean>;
  /** The strip the tabs are laid in, scrolled or not. */
  strip: RefObject<HTMLUListElement | null>;
  /** The room a tab is dragged within: the strip as seen, which ends where "+" begins. */
  within: RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onClose: () => void;
}) {
  // dragged as far as the room's ends and no further - not under "+", stopped there, not pulled past and back: where
  // it is laid now (after the others have made way for it, too) from its place in the strip as scrolled
  // (motion's own dragConstraints, given the room, left a tab closed meanwhile in the strip, unseen, taking up its room)
  const x = useMotionValue(0);
  const self = useRef<HTMLLIElement>(null);
  useEffect(
    () =>
      x.on("change", (v) => {
        const el = self.current;
        const room = within.current?.getBoundingClientRect();
        const ul = strip.current;
        if (!draggingRef.current || !el || !room || !ul) return;
        const laid = ul.getBoundingClientRect().left + ul.clientLeft + el.offsetLeft - ul.scrollLeft;
        const kept = dragWithin(v, laid, el.offsetWidth, room);
        if (kept !== v) x.set(kept);
      }),
    [x, within, strip, draggingRef],
  );
  return (
    <Reorder.Item
      ref={self}
      value={tab.id}
      style={{ x }}
      data-tab={tab.id}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE } }}
      exit={{ opacity: 0, y: 20, transition: LEAVE }}
      // Chosen or not, a tab goes over in the same time and the same
      // way as its curved corners, which are drawn beside it: the
      // two change together, never one ahead of the other. The line
      // under the tabs is the bar's, drawn once: the chosen tab covers it
      // with its white and its corners turn out into it, and a tab not
      // chosen is clear, so the line runs on under it unbroken.
      className={clsx(
        "@container relative rounded-t-lg w-48 h-8.5 text-xs flex justify-between items-top0 transition-[background-color,border-color,color] duration-150 ease-meno",
        // (the chosen tab wide enough for its name; the others as narrow as there is room for, and past that the bar goes on)
        selected ? "min-w-24" : "min-w-8",
        selected
          ? "bg-white text-gh-black border border-gh-line border-b-transparent"
          : "bg-transparent text-gh-gray border border-transparent"
      )}
      onDragStart={() => (draggingRef.current = true)}
      onDragEnd={() => (draggingRef.current = false)}
      onPointerDown={() => {
        if (!draggingRef.current) onSelect();
      }}
      title={tab.label}
    >
      <Shoulders shown={selected} />
      <div
        className={clsx(
          "flex items-center w-full py-1 justify-between rounded-lg h-7 mx-0.5 px-2 transition-colors duration-150 ease-meno",
          !selected && "hover:bg-gh-gray/10"
        )}
      >
        <span className="truncate">
          <AnimatePresence initial={false}>
            {tab.dirty && (
              <motion.span
                key="dirty"
                {...FADE}
                className="mr-1 text-gh-gray"
                aria-label="Unsaved changes"
                title="Unsaved changes"
              >
                ●
              </motion.span>
            )}
          </AnimatePresence>
          {tab.label}
        </span>
        <button
          // Closing on the press made a tab easy to lose while
          // reaching to drag it: a full click closes, and the press
          // is kept from starting a drag.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={clsx(
            "h-4 w-4 rounded-full p-0.5 transition-colors duration-150 ease-meno hover:bg-gh-line shrink-0",
            // (a tab not chosen, too narrow for its name and its ×, its name; chosen, it has both)
            !selected && "@max-[5rem]:hidden",
          )}
          aria-label="Close tab"
          title="Close"
        >
          <XMarkIcon className="w-full h-full" />
        </button>
      </div>
    </Reorder.Item>
  );
}

/**
 * The curved corners at the foot of the chosen tab, where its sides turn
 * out into the line under the tabs: always there, seen on the chosen tab
 * alone.
 */
function Shoulders({ shown }: { shown: boolean }) {
  return (
    <div className={clsx("transition-opacity duration-150 ease-meno", shown ? "opacity-100" : "opacity-0")}>
      <div className="absolute -bottom-[1px] -left-2 h-2 w-2 bg-white" />
      <div className="absolute -bottom-[1px] -left-2 h-2 w-2 bg-gh-base rounded-br-xl border-b border-r border-gh-line" />
      <div className="absolute -bottom-[1px] -right-2 h-2 w-2 bg-white" />
      <div className="absolute -bottom-[1px] -right-2 h-2 w-2 bg-gh-base rounded-bl-xl border-b border-l border-gh-line" />
    </div>
  );
}

