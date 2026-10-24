import clsx from "clsx";

/**
 * Meno's own switch (docs/LOOK.md, *Controls*): a pill that slides its white
 * knob over and fills in Meno's colour when it is on - in the colour of
 * attention only where being on refuses something (working offline) - for a
 * setting turned on or off at once, beside what it says.
 */
export default function Switch({
  on,
  onChange,
  label,
  disabled = false,
  tone = "base",
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  /** What it turns, for a reader; the words beside it say it to the eye. */
  label: string;
  disabled?: boolean;
  /** Meno's colour; or, where being on refuses something, the colour of attention. */
  tone?: "base" | "attention";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={clsx(
        "relative h-6 w-11 shrink-0 rounded-full outline-none transition-colors duration-150 ease-meno disabled:opacity-50",
        "focus-visible:ring-2 focus-visible:ring-accel-lightbase",
        on ? (tone === "attention" ? "bg-accel-accent" : "bg-accel-base") : "bg-gh-line",
      )}
    >
      <span
        aria-hidden
        className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150 ease-meno", on ? "left-[1.375rem]" : "left-0.5")}
      />
    </button>
  );
}
