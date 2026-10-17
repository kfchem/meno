import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { withRules } from "../Workspace/menuRules";

/** An item of a card's menu: what it is called, what it does, whether it can be done, and a line above it. */
export type CardMenuItem = { name: string; run: () => void; disabled?: boolean; divider?: boolean };

/**
 * The menu of a card in Settings - a style's, say - where it was asked
 * for: at the pointer, by a right-click; under the card, by the menu key
 * (`byKey`), its first item lit. Arrows go through it, Enter does, Escape
 * or a press elsewhere closes it.
 */
export default function CardMenu({
  at,
  label,
  items,
  onClose,
}: {
  at: { x: number; y: number; byKey: boolean };
  label: string;
  items: CardMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const b = ref.current?.getBoundingClientRect();
    if (b) setPlace({ left: Math.max(4, Math.min(at.x, window.innerWidth - b.width - 8)), top: Math.max(4, Math.min(at.y, window.innerHeight - b.height - 8)) });
    // (opened by a key, the first item lit; by a press, none)
    if (at.byKey) ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    else ref.current?.focus();
  }, [at]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const now = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = now < 0 ? (step > 0 ? 0 : buttons.length - 1) : (now + step + buttons.length) % buttons.length;
      buttons[next]?.focus();
    };
    const onPress = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("wheel", onClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("wheel", onClose, true);
    };
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className="fixed z-50 min-w-[12rem] rounded-md border border-gh-line bg-white py-1 shadow-lg text-sm text-gh-black outline-none meno-fade-in"
      style={place}
      onContextMenu={(e) => e.preventDefault()}
    >
      {withRules(items).map((item) => (
        <div key={item.name}>
          {item.divider && <div className="my-1 border-t border-gh-line" />}
          <button
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.run();
            }}
            className="w-full h-8 px-3 text-left hover:bg-gh-base focus:bg-gh-base outline-none disabled:text-gh-gray disabled:hover:bg-transparent"
          >
            {item.name}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
