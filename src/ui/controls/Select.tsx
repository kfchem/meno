import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DURATION } from "../theme/motion";
import { nextLit } from "./keys";

/** A choice of a Select: its value, and what it is called. */
export type SelectOption<T extends string = string> = { value: T; label: string };

/** How far below (or above) its button the list opens, and from the window's edges, in px. Its list is drawn over everything, a dialog's own pull-down included (dialogs are at z 100 and 110). */
const GAP = 4;
const EDGE = 8;

/**
 * Meno's own pull-down (docs/LOOK.md, *Controls*): a button showing the
 * choice, and a list opening under it drawn as Meno's menus are - white,
 * a line round it, a shadow, rows lit as the pointer or the keys come over
 * them, the chosen one ticked. Opened by a press, or by Enter, Space or an
 * arrow; arrows, Home, End and a letter go through it; Enter or Space
 * chooses, Escape or a press elsewhere closes it. It fades in and out.
 */
export default function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  placeholder,
  className,
  disabled = false,
  size = "xs",
}: {
  /** The choice made - none, where none is yet (`placeholder` shown). */
  value: T | null;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** What it says while nothing is chosen: "Choose…", or what choosing does. */
  placeholder?: string;
  /** What it chooses, for a reader that cannot see the label beside it. */
  label: string;
  /** Its width and where it sits, as its place asks. */
  className?: string;
  disabled?: boolean;
  /** Its letters: a control's (`xs`), or a form's whose fields are set larger (`sm`), to match those beside it. */
  size?: "xs" | "sm";
}) {
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  // (kept a moment after it closes, as it fades out)
  const [shown, setShown] = useState(false);
  const [lit, setLit] = useState(0);
  const [place, setPlace] = useState<{ left: number; top: number; minWidth: number } | null>(null);
  const chosen = options.findIndex((o) => o.value === value);
  const current = chosen >= 0 ? options[chosen] : null;

  const openList = () => {
    if (disabled || !options.length) return;
    setLit(Math.max(0, chosen));
    setOpen(true);
    setShown(true);
  };
  const close = (back = true) => {
    setOpen(false);
    if (back) button.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    close();
    if (o && o.value !== value) onChange(o.value);
  };

  useEffect(() => {
    if (open || !shown) return;
    const t = window.setTimeout(() => setShown(false), DURATION.quick * 1000);
    return () => window.clearTimeout(t);
  }, [open, shown]);

  // (under the button, as wide at least; above it where the window has no room below)
  useLayoutEffect(() => {
    if (!open) return;
    const b = button.current?.getBoundingClientRect();
    const l = list.current?.getBoundingClientRect();
    if (!b || !l) return;
    const below = b.bottom + GAP;
    const top = below + l.height > window.innerHeight - EDGE && b.top - GAP - l.height > EDGE ? b.top - GAP - l.height : below;
    setPlace({ left: Math.max(EDGE, Math.min(b.left, window.innerWidth - l.width - EDGE)), top, minWidth: b.width });
    list.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-row="${lit}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, lit]);

  useEffect(() => {
    if (!open) return;
    const onPress = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close(false);
    };
    const onAway = () => close(false);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("resize", onAway);
    window.addEventListener("blur", onAway);
    return () => {
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("resize", onAway);
      window.removeEventListener("blur", onAway);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openList();
          }
        }}
        className={clsx(
          "h-7 inline-flex min-w-0 items-center justify-between gap-1.5 rounded-md border bg-white px-2 text-gh-black outline-none",
          size === "sm" ? "text-sm" : "text-xs",
          "hover:bg-gh-base focus-visible:border-accel-base disabled:opacity-50 disabled:hover:bg-white",
          open ? "border-accel-base" : "border-gh-line",
          className,
        )}
      >
        <span className={clsx("truncate", !current && "text-gh-gray")}>{current?.label ?? placeholder ?? ""}</span>
        <ChevronUpDownIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-gh-gray" />
      </button>
      {shown &&
        createPortal(
          <div
            ref={list}
            id={id}
            role="listbox"
            aria-label={label}
            aria-activedescendant={open ? `${id}-${lit}` : undefined}
            tabIndex={-1}
            className={clsx(
              "fixed z-[120] max-h-72 overflow-y-auto rounded-md border border-gh-line bg-white py-1 shadow-lg text-sm text-gh-black outline-none",
              open ? "meno-fade-in" : "meno-fade-out pointer-events-none",
            )}
            style={place ?? { left: -9999, top: -9999 }}
            onKeyDown={(e) => {
              if (e.key === "Escape" || e.key === "Tab") {
                if (e.key === "Escape") e.preventDefault();
                close(e.key === "Escape");
                return;
              }
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                choose(lit);
                return;
              }
              const next = nextLit(e.key, lit, options.map((o) => o.label));
              if (next != null) {
                e.preventDefault();
                setLit(next);
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {options.map((o, i) => (
              <div
                key={o.value}
                id={`${id}-${i}`}
                data-row={i}
                role="option"
                aria-selected={i === chosen}
                onPointerEnter={() => setLit(i)}
                onClick={() => choose(i)}
                className={clsx(
                  "h-8 px-3 flex items-center justify-between gap-4 cursor-default select-none whitespace-nowrap transition-colors duration-150 ease-meno",
                  i === lit && "bg-gh-base",
                )}
              >
                <span>{o.label}</span>
                {i === chosen ? <CheckIcon aria-label="Chosen" className="h-4 w-4 text-gh-gray" /> : <span className="h-4 w-4" />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
