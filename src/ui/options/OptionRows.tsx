import clsx from "clsx";
import { MANY_CHOICES, type Option, type OptionValues } from "../../lib/options";
import Checkbox from "../controls/Checkbox";
import Select from "../controls/Select";

/**
 * A role's options as rows of Settings (lib/options): each its label on
 * the left and its control on the right, as the drawing style's settings
 * are - a choice as buttons side by side, or of many a list to pick from;
 * a number with its unit, a text, a switch. For rows within a card: no frame of their own.
 */
export default function OptionRows({
  options,
  values,
  onChange,
  indent = false,
}: {
  options: readonly Option[];
  values: OptionValues;
  onChange: (values: OptionValues) => void;
  /** Set in under what they belong to. */
  indent?: boolean;
}) {
  const set = (id: string, v: string | number | boolean) => onChange({ ...values, [id]: v });
  return (
    <>
      {options.map((o) => (
        <div key={o.id} className={clsx("py-2 pr-3 flex items-center gap-3", indent ? "pl-8" : "pl-3")}>
          <span className="min-w-0 flex-1 text-sm text-gh-black">{o.label}</span>
          {o.type === "choice" && o.choices.length > MANY_CHOICES ? (
            <Select label={o.label} value={String(values[o.id] ?? "")} options={o.choices} onChange={(v) => set(o.id, v)} className="shrink-0" />
          ) : o.type === "choice" ? (
            <div className="flex rounded-md border border-gh-line overflow-hidden shrink-0" role="radiogroup" aria-label={o.label}>
              {o.choices.map((c) => (
                <button
                  key={c.value}
                  role="radio"
                  aria-checked={values[o.id] === c.value}
                  onClick={() => set(o.id, c.value)}
                  className={clsx(
                    "h-7 px-2.5 text-xs border-l border-gh-line first:border-l-0",
                    values[o.id] === c.value ? "bg-accel-base text-white" : "bg-white text-gh-black hover:bg-gh-base",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : o.type === "switch" ? (
            <Checkbox label={o.label} checked={values[o.id] === true} onChange={(v) => set(o.id, v)} />
          ) : (
            <span className="shrink-0 flex items-center gap-1.5">
              <input
                type={o.type === "number" ? "number" : "text"}
                aria-label={o.label}
                value={String(values[o.id] ?? "")}
                {...(o.type === "number" ? { min: o.min, max: o.max, step: o.step } : {})}
                onChange={(e) => {
                  if (o.type !== "number") return set(o.id, e.target.value);
                  const n = Number(e.target.value);
                  if (e.target.value !== "" && Number.isFinite(n)) set(o.id, n);
                }}
                className={clsx(
                  "h-7 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black tabular-nums",
                  o.type === "number" ? "w-24 text-right" : "w-48",
                )}
              />
              {o.type === "number" && <span className="min-w-14 whitespace-nowrap text-xs text-gh-gray">{o.unit ?? ""}</span>}
            </span>
          )}
        </div>
      ))}
    </>
  );
}
