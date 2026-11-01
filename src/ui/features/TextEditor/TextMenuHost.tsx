/**
 * Meno's own right-click menu on words typed or read in place (./textMenu):
 * one for the whole window, opened where it was asked for, as the canvas's
 * menus look. It never takes the keys: the words keep them - words on the
 * page are kept as soon as their field lets them go - and Escape closes it
 * alone, the words not let go of. A press elsewhere only closes it, as any
 * menu's does (Workspace utils/press `swallowPress`).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RISE } from "../../theme/motion";
import { swallowPress } from "../Workspace/utils/press";
import { clipboardHasText, outputIn, runTextMenu, structuresIn, textMenuItems, useTextMenu } from "./textMenu";

export default function TextMenuHost() {
  const at = useTextMenu((s) => s.at);
  return <AnimatePresence>{at && <TextMenu key={`${at.x},${at.y}`} {...at} />}</AnimatePresence>;
}

function TextMenu({ x, y, target }: NonNullable<ReturnType<typeof useTextMenu.getState>["at"]>) {
  const close = useTextMenu((s) => s.close);
  const ref = useRef<HTMLDivElement>(null);
  // (Paste as the clipboard is found to hold text: not to be pressed till then)
  const [pasteable, setPasteable] = useState(false);
  useEffect(() => {
    let gone = false;
    void clipboardHasText().then((yes) => !gone && setPasteable(yes));
    return () => {
      gone = true;
    };
  }, []);
  // (all of it in the window, where it was asked for as nearly as it can be)
  const [place, setPlace] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPlace({ left: Math.max(4, Math.min(x, window.innerWidth - box.width - 8)), top: Math.max(4, Math.min(y, window.innerHeight - box.height - 8)) });
  }, [x, y]);
  useEffect(() => {
    // (Escape the menu's, before the words' field hears it: they are not let go of)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    const onPress = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      swallowPress(e);
      close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("blur", close);
    };
  }, [close]);
  const items = textMenuItems(target, pasteable);
  // (3D Structures, on a column's text holding coordinates, where the workspace takes them)
  const take = useTextMenu((s) => s.structures);
  const [found] = useState(() => (take ? structuresIn(target) : []));
  // (a calculation's output: read as one opened is, by its reader - never in part as coordinates)
  const takeOutput = useTextMenu((s) => s.output);
  const [output] = useState(() => (takeOutput ? outputIn(target) : null));
  return (
    <motion.div
      ref={ref}
      {...RISE}
      role="menu"
      aria-label="Text"
      className="fixed z-50 min-w-[12rem] rounded-md border border-gh-line bg-white py-1 shadow-lg text-sm text-gh-black"
      style={place}
      // (the words keep the keys: nothing in it takes them)
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.kind}
          role="menuitem"
          tabIndex={-1}
          disabled={!item.enabled}
          onClick={() => {
            close();
            void runTextMenu(item.kind, target);
          }}
          className="w-full h-8 px-3 flex items-center justify-between gap-4 text-left whitespace-nowrap transition-colors duration-150 ease-meno hover:bg-gh-base outline-none disabled:text-gh-line disabled:hover:bg-transparent"
        >
          <span>{item.name}</span>
          <kbd className={`font-sans text-xs ${item.enabled ? "text-gh-gray" : "text-gh-line"}`}>{item.keys}</kbd>
        </button>
      ))}
      {((take && found.length > 0) || (takeOutput && output != null)) && target.text && (
        <>
          {/* (a rule only between it and what is above it: none at the top) */}
          {items.length > 0 && <div className="my-1 border-t border-gh-line" role="separator" />}
          <button
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              close();
              if (output != null) takeOutput!(output, target.text!.name);
              else take!(found, target.text!.name);
            }}
            className="w-full h-8 px-3 flex items-center text-left whitespace-nowrap transition-colors duration-150 ease-meno hover:bg-gh-base outline-none"
          >
            3D structures
          </button>
        </>
      )}
    </motion.div>
  );
}
