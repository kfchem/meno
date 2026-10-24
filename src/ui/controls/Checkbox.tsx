import clsx from "clsx";
import type { ReactNode } from "react";
import { checkboxKey } from "./keys";

/**
 * Meno's own checkbox (docs/LOOK.md, *Controls*): a small square with
 * rounded corners, filled in Meno's colour with a white tick when it is
 * on (in the colour of attention where it accepts a warning), and what
 * it says beside it. Space turns it, as a press does; Enter does not, as
 * it does not turn the browser's own, and goes on to what holds it (./keys,
 * checkboxKey).
 */
export default function Checkbox({
  checked,
  onChange,
  label,
  children,
  className,
  disabled = false,
  tone = "base",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What it turns, for a reader, where nothing beside it says (`children`). */
  label?: string;
  /** What it says beside it. */
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  /** Meno's colour; or, where turning it accepts a warning, the colour of attention. */
  tone?: "base" | "attention";
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={children ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      onKeyDown={checkboxKey}
      className={clsx("group inline-flex items-center gap-2 text-left outline-none disabled:opacity-50", className)}
    >
      {/* (drawn as a square, not a bordered box: square at any scale - 14 px is 17.5 device pixels at 125%, its width and height rounded apart) */}
      <svg
        aria-hidden
        viewBox="0 0 14 14"
        className="h-3.5 w-3.5 shrink-0 overflow-visible rounded-[3px] group-focus-visible:ring-2 group-focus-visible:ring-accel-lightbase"
      >
        <rect
          x={0.5}
          y={0.5}
          width={13}
          height={13}
          rx={2.5}
          strokeWidth={1}
          className={clsx(
            "transition-colors duration-150 ease-meno",
            checked ? (tone === "attention" ? "fill-accel-accent stroke-accel-accent" : "fill-accel-base stroke-accel-base") : "fill-white stroke-gh-line group-hover:stroke-gh-gray",
          )}
        />
        <path
          d="M4.08 7.17l1.92 1.92 3.92-4.17"
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={clsx("stroke-accel-white transition-opacity duration-150 ease-meno", checked ? "opacity-100" : "opacity-0")}
        />
      </svg>
      {children}
    </button>
  );
}
