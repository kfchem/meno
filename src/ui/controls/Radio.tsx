import clsx from "clsx";
import { useId, useRef } from "react";
import { nextChoice } from "./keys";

/** A choice of a radio group: its value, and what it is called. */
export type RadioOption<T extends string = string> = { value: T; label: string };

/**
 * Meno's own radio buttons (docs/LOOK.md, *Controls*): a choice of a few,
 * one under another, each a small circle and its name - the chosen one's
 * circle drawn in Meno's colour with its dot, under what the group chooses
 * (a fieldset and its legend, as the browser's own were set). The group is
 * one stop of the Tab key; the arrows choose within it.
 */
export default function RadioGroup<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: readonly RadioOption<T>[];
  onChange: (value: T) => void;
  /** What the group chooses, shown over it. */
  label: string;
  className?: string;
}) {
  const group = useRef<HTMLFieldSetElement>(null);
  const id = useId();
  const chosen = options.findIndex((o) => o.value === value);
  const go = (i: number) => {
    onChange(options[i].value);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i]?.focus();
  };
  return (
    <fieldset ref={group} role="radiogroup" aria-labelledby={id} className={clsx("space-y-1", className)}>
      <legend id={id} className="mb-1 text-xs text-gh-gray">
        {label}
      </legend>
      {options.map((o, i) => {
        const on = i === chosen;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            // (the group one stop of Tab: the chosen one, or the first where none is)
            tabIndex={on || (chosen < 0 && i === 0) ? 0 : -1}
            onClick={() => !on && onChange(o.value)}
            onKeyDown={(e) => {
              const next = nextChoice(e.key, i, options.length);
              if (next == null) return;
              e.preventDefault();
              go(next);
            }}
            className="group flex items-center gap-2 py-0.5 text-sm text-gh-black outline-none"
          >
            <span
              aria-hidden
              className={clsx(
                "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border bg-white transition-colors duration-150 ease-meno",
                on ? "border-accel-base" : "border-gh-line group-hover:border-gh-gray",
                "group-focus-visible:ring-2 group-focus-visible:ring-accel-lightbase",
              )}
            >
              <span className={clsx("h-1.5 w-1.5 rounded-full bg-accel-base transition-transform duration-150 ease-meno", on ? "scale-100" : "scale-0")} />
            </span>
            {o.label}
          </button>
        );
      })}
    </fieldset>
  );
}
