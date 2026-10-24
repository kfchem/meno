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
      <span
        aria-hidden
        className={clsx(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-150 ease-meno",
          checked ? (tone === "attention" ? "border-accel-accent bg-accel-accent" : "border-accel-base bg-accel-base") : "border-gh-line bg-white group-hover:border-gh-gray",
          "group-focus-visible:ring-2 group-focus-visible:ring-accel-lightbase",
        )}
      >
        <svg viewBox="0 0 12 12" className={clsx("h-2.5 w-2.5 text-accel-white transition-opacity duration-150 ease-meno", checked ? "opacity-100" : "opacity-0")}>
          <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {children}
    </button>
  );
}
