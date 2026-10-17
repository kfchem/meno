import { useEffect, useRef, useState } from "react";
import { draggedMagnification, MAGNIFICATIONS, magnificationText } from "../utils/magnified";

/** How far a press moves along the mark before it is a drag, in pixels. */
const DRAG_PX = 3;

/**
 * The mark of an object shown magnified (docs/WORKSPACE.md, *Magnified
 * display*): how large it is shown - "150 %" - beside it while it is
 * hovered or selected. A press opens the magnifications offered and *Back
 * to 100 %*; a drag along it sets the magnification freely, doubling every
 * so far to the right, halving to the left - one step to undo when let go.
 */
export default function MagnifiedMark({ k, onSet, onActive }: { k: number; onSet: (k: number, gesture?: string) => void; onActive?: (active: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  // (in use - open, dragged, or under the pointer: it stays while the object is not hovered)
  const active = open || dragging != null || over;
  useEffect(() => onActive?.(active), [active, onActive]);
  const pressed = useRef<{ x: number; from: number; moved: boolean; gesture: string; id: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // (open: a press elsewhere, or Escape, closes it)
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const choose = (to: number) => {
    setOpen(false);
    onSet(to);
  };

  return (
    <div
      ref={root}
      className="relative pointer-events-auto select-none"
      onContextMenu={(e) => e.preventDefault()}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
    >
      <button
        aria-label={`Shown at ${magnificationText(dragging ?? k)}`}
        title="Magnification: press for the choices, drag sideways to set it"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          pressed.current = { x: e.clientX, from: k, moved: false, gesture: `mark-${e.timeStamp}`, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const p = pressed.current;
          if (!p || e.pointerId !== p.id) return;
          const dx = e.clientX - p.x;
          if (!p.moved && Math.abs(dx) < DRAG_PX) return;
          p.moved = true;
          const to = draggedMagnification(p.from, dx);
          setDragging(to);
          onSet(to, p.gesture);
        }}
        onPointerUp={(e) => {
          const p = pressed.current;
          pressed.current = null;
          if (!p || e.pointerId !== p.id) return;
          setDragging(null);
          if (!p.moved) setOpen((o) => !o);
        }}
        onPointerCancel={() => {
          pressed.current = null;
          setDragging(null);
        }}
        className="meno-page-chip rounded-full border border-gh-line bg-white/90 px-1.5 text-[11px] leading-[18px] text-gh-gray tabular-nums whitespace-nowrap shadow-sm cursor-ew-resize hover:text-gh-black"
      >
        {magnificationText(dragging ?? k)}
      </button>
      {open && (
        <div role="menu" aria-label="Magnification" className="absolute left-0 top-full mt-1 z-10 min-w-[8rem] rounded-md border border-gh-line bg-white py-1 shadow-lg text-sm text-gh-black meno-fade-in">
          <div className="flex flex-wrap gap-0.5 px-1.5 pb-1">
            {MAGNIFICATIONS.map((m) => (
              <button
                key={m}
                role="menuitem"
                aria-pressed={Math.abs(m - k) < 1e-6}
                onClick={() => choose(m)}
                className={`h-7 px-1.5 rounded-md text-xs tabular-nums ${Math.abs(m - k) < 1e-6 ? "bg-gh-base" : "hover:bg-gh-base"}`}
              >
                {magnificationText(m)}
              </button>
            ))}
          </div>
          <button role="menuitem" onClick={() => choose(1)} className="w-full h-8 px-3 text-left border-t border-gh-line hover:bg-gh-base">
            Back to 100 %
          </button>
        </div>
      )}
    </div>
  );
}
