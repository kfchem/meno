import {
  ArrowUturnLeftIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  inPoints,
  presetById,
  STYLE_PRESETS,
  styleOf,
  type DrawingStyle,
  type Length,
  type StyleChoice,
} from "../../../lib/chem/style";
import {
  automaticValue,
  STYLE_FIELDS,
  STYLE_GROUPS,
  withSetting,
  type ShareOf,
  type StyleField,
} from "../../../lib/chem/styleFields";
import {
  arrowSampleSvg,
  SAMPLE_BONDS,
  SAMPLE_MOLECULE,
  sampleSvg,
} from "../../../lib/chem/styleSamples";
import { useTypefaces } from "../../fonts/typefaces";
import { useAtLeastWide } from "./sideBySide";
import TypefacePicker from "./TypefacePicker";

/**
 * Every drawing setting, grouped, with a preview drawn by the same layout as
 * the canvas. Used for the application's style in Settings and for a
 * document's own on the canvas; either way it edits a `StyleChoice` - a
 * preset and what was changed from it - and hands each change on.
 */
export type StyleEditorProps = {
  choice: StyleChoice;
  /**
   * A changed choice. `setting` names the setting a change is to, so that a
   * run of changes to one setting - a slider being dragged - can be taken as
   * one.
   */
  onChange: (next: StyleChoice, setting?: string) => void;
  /** Side by side with the preview where there is room (`SIDE_BY_SIDE_PX`), or stacked for a narrow panel. */
  layout?: "wide" | "narrow";
};

export default function StyleEditor({
  choice,
  onChange,
  layout = "wide",
}: StyleEditorProps) {
  const style = useMemo(() => styleOf(choice), [choice]);
  // (side by side with the preview only where there is room for both: else as in a narrow panel)
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const roomy = useAtLeastWide(box);
  const narrow = layout === "narrow" || !roomy;
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = (f: StyleField) =>
    !q ||
    f.label.toLowerCase().includes(q) ||
    f.description.toLowerCase().includes(q);
  const changedCount = Object.keys(choice.changes).length;

  const fields = (
    <div className="min-w-0 flex-1">
      <PresetPicker choice={choice} onChange={onChange} />
      <div className="mt-5 flex items-center gap-2">
        <label className="relative flex-1">
          <MagnifyingGlassIcon className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gh-gray" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a setting"
            aria-label="Find a setting"
            className="w-full h-8 rounded-md border border-gh-line bg-white pl-8 pr-2 text-sm outline-none focus:border-accel-base focus:ring-2 focus:ring-accel-lightbase"
          />
        </label>
        {changedCount > 0 && (
          <button
            onClick={() => onChange({ preset: choice.preset, changes: {} })}
            className="h-8 px-3 rounded-md border border-gh-line bg-white text-xs text-gh-black hover:bg-gh-base whitespace-nowrap"
            title={`Take all ${changedCount} changes back to ${presetById(choice.preset).name}`}
          >
            Reset all ({changedCount})
          </button>
        )}
      </div>
      {STYLE_GROUPS.map((group) => {
        const inGroup = STYLE_FIELDS.filter(
          (f) => f.group === group && shown(f),
        );
        if (!inGroup.length) return null;
        const sizes = inGroup.filter((f) => !f.rule);
        const rules = inGroup.filter((f) => f.rule);
        return (
          <section key={group} id={groupId(group)} className="mt-6 scroll-mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gh-gray">
              {group}
            </h3>
            <div className="mt-2 rounded-lg border border-gh-line divide-y divide-gh-line bg-white">
              {sizes.map((f) => (
                <FieldRow
                  key={f.key}
                  field={f}
                  choice={choice}
                  style={style}
                  onChange={onChange}
                  stacked={narrow}
                />
              ))}
              {rules.length > 0 && (
                <div className="px-3 pt-2.5 pb-1 bg-gh-base/60 text-[11px] font-medium text-gh-gray">
                  How the drawing decides
                </div>
              )}
              {rules.map((f) => (
                <FieldRow
                  key={f.key}
                  field={f}
                  choice={choice}
                  style={style}
                  onChange={onChange}
                  stacked={narrow}
                />
              ))}
            </div>
          </section>
        );
      })}
      {STYLE_FIELDS.every((f) => !shown(f)) && (
        <p className="mt-6 text-sm text-gh-gray">
          No setting matches “{query}”.
        </p>
      )}
    </div>
  );

  // (one tree at either width, only its classes changing - the preview put
  // above the fields when narrow by its order, not by moving it - so that
  // crossing from one to the other keeps the fields and the preview as they
  // are, and the search box its caret)
  return (
    <div ref={setBox} className={narrow ? "flex flex-col" : "flex gap-8 items-start"}>
      {!narrow && (
        <nav className="hidden xl:block w-44 shrink-0 sticky top-4 text-sm">
          {STYLE_GROUPS.map((g) => (
            <a
              key={g}
              href={`#${groupId(g)}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(groupId(g))
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              className="block px-2 py-1 rounded-md text-gh-gray hover:text-gh-black hover:bg-gh-base"
            >
              {g}
            </a>
          ))}
        </nav>
      )}
      <div className={narrow ? "pt-3" : "contents"}>{fields}</div>
      {/* (narrow, a little wider than the settings it lies over: a chosen preset's ring, scrolled under it, no longer shows at its sides) */}
      <div className={narrow ? "order-first sticky top-0 z-10 -mx-1 px-1 bg-white pb-3 border-b border-gh-line" : "w-[26rem] shrink-0 sticky top-4"}>
        <Preview style={style} compact={narrow} />
      </div>
    </div>
  );
}

const groupId = (g: string) =>
  `style-${g.toLowerCase().replace(/[^a-z]+/g, "-")}`;

// --- Presets -------------------------------------------------------------------

function PresetPicker({
  choice,
  onChange,
}: {
  choice: StyleChoice;
  onChange: StyleEditorProps["onChange"];
}) {
  // Picking another preset with changes made asks what to do with them.
  const [asking, setAsking] = useState<string | null>(null);
  const changes = Object.keys(choice.changes).length;
  const pick = (id: string) => {
    if (id === choice.preset) return;
    if (changes > 0) setAsking(id);
    else onChange({ preset: id, changes: {} });
  };
  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
        {STYLE_PRESETS.map((p) => {
          const on = p.id === choice.preset;
          return (
            <button
              key={p.id}
              onClick={() => pick(p.id)}
              aria-pressed={on}
              title={p.description}
              className={clsx(
                "text-left rounded-lg border px-3 py-2 transition-colors",
                on
                  ? "border-accel-base bg-accel-lightbase/40 ring-1 ring-accel-base"
                  : "border-gh-line bg-white hover:bg-gh-base",
              )}
            >
              <div className="text-sm font-medium text-gh-black">{p.name}</div>
              <div className="text-[11px] leading-snug text-gh-gray line-clamp-2">
                {p.description}
              </div>
              <div className="mt-1 text-[11px] text-gh-black/70 tabular-nums">
                {summary(p.style)}
              </div>
            </button>
          );
        })}
      </div>
      {asking && (
        <div
          role="alertdialog"
          className="mt-2 rounded-lg border border-gh-line bg-gh-base px-3 py-2 text-sm flex flex-wrap items-center gap-2 meno-fade-in"
        >
          <span className="flex-1 min-w-[12rem] text-gh-black">
            {changes === 1 ? "One setting is" : `${changes} settings are`}{" "}
            changed from {presetById(choice.preset).name}. Keep{" "}
            {changes === 1 ? "it" : "them"} on {presetById(asking).name}?
          </span>
          <button
            onClick={() => {
              onChange({ preset: asking, changes: choice.changes });
              setAsking(null);
            }}
            className="h-7 px-2.5 rounded-md border border-gh-line bg-white text-xs hover:bg-gray-100"
          >
            Keep changes
          </button>
          <button
            onClick={() => {
              onChange({ preset: asking, changes: {} });
              setAsking(null);
            }}
            className="h-7 px-2.5 rounded-md bg-accel-base text-white text-xs hover:opacity-90"
          >
            Use {presetById(asking).name} as it is
          </button>
          <button
            onClick={() => setAsking(null)}
            className="h-7 px-2 rounded-md text-xs text-gh-gray hover:text-gh-black"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/** A style's size at a glance: its bond, its line and its labels. */
function summary(style: DrawingStyle): string {
  return (
    `${fmt(style.bondLengthPt, 1)} pt bond · ` +
    `${fmt(inPoints(style.lineThickness, style), 2)} pt line · ` +
    `${style.fontFamily} ${fmt(inPoints(style.fontSize, style), 1)}`
  );
}

// --- Preview -------------------------------------------------------------------

/** "fit" scales the drawing to the box; a number is that many times its size on the page. */
type Magnification = "fit" | 1 | 2 | 4;
const MAGNIFICATIONS: Magnification[] = ["fit", 1, 2, 4];

function Preview({
  style,
  compact = false,
}: {
  style: DrawingStyle;
  compact?: boolean;
}) {
  const [mag, setMag] = useState<Magnification>("fit");
  // placed by the typeface's own letters once they have been read
  const fonts = useTypefaces(style.fontFamily);
  const molecule = useMemo(
    // Fitted, it is drawn large and scaled down to the box.
    () => sampleSvg(SAMPLE_MOLECULE, style, mag === "fit" ? 4 : mag),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fonts: see above
    [style, mag, fonts],
  );
  const bonds = useMemo(
    () => [
      ...SAMPLE_BONDS.map((s) => ({
        name: s.name,
        svg: sampleSvg(s, style, 2),
      })),
      { name: "Reaction arrow", svg: arrowSampleSvg(style, 2) },
    ],
    [style],
  );
  // (beside a narrow panel's molecule, the arrow alone)
  const arrow = useMemo(() => arrowSampleSvg(style, 1.5), [style]);
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gh-gray">
          Preview
        </span>
        <div
          className="flex rounded-md border border-gh-line overflow-hidden"
          role="group"
          aria-label="Magnification"
        >
          {MAGNIFICATIONS.map((m) => (
            <button
              key={m}
              onClick={() => setMag(m)}
              aria-pressed={m === mag}
              title={
                m === "fit"
                  ? "Scaled to the box"
                  : m === 1
                    ? "The size it has on the page"
                    : `${m} times the size it has on the page`
              }
              className={clsx(
                "h-6 px-2 text-[11px] border-l border-gh-line first:border-l-0",
                m === mag
                  ? "bg-accel-base text-white"
                  : "bg-white text-gh-gray hover:bg-gh-base",
              )}
            >
              {m === "fit" ? "Fit" : m === 1 ? "Actual" : `${m}×`}
            </button>
          ))}
        </div>
      </div>
      <div
        className={clsx(
          "mt-2 rounded-lg border border-gh-line bg-white flex overflow-auto p-3 [&>svg]:m-auto [&>svg]:shrink-0",
          mag === "fit" &&
            "[&>svg]:max-w-full [&>svg]:w-auto [&>svg]:h-auto [&>svg]:shrink",
          mag === "fit" && (compact ? "[&>svg]:max-h-40" : "[&>svg]:max-h-64"),
        )}
        style={{ minHeight: compact ? 120 : 200 }}
        // The SVG comes from our own layout, not from outside; what a
        // document's style gives it - a typeface's name - is escaped there.
        dangerouslySetInnerHTML={{ __html: molecule }}
      />
      {compact && (
        <div
          aria-label="Reaction arrow"
          className="mt-1.5 rounded-lg border border-gh-line bg-white flex justify-center py-1.5 [&>svg]:max-w-full [&>svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: arrow }}
        />
      )}
      {!compact && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {bonds.map((b) => (
            <figure
              key={b.name}
              className="rounded-md border border-gh-line bg-white flex flex-col items-center justify-end px-1 pt-2 pb-1 min-h-[3.5rem]"
            >
              <div
                className="flex-1 flex items-center [&>svg]:max-w-full [&>svg]:max-h-12 [&>svg]:w-auto [&>svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: b.svg }}
              />
              <figcaption className="text-[10px] text-gh-gray mt-1">
                {b.name}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

// --- One setting ---------------------------------------------------------------

function FieldRow({
  field,
  choice,
  style,
  onChange,
  stacked,
}: {
  field: StyleField;
  choice: StyleChoice;
  style: DrawingStyle;
  onChange: StyleEditorProps["onChange"];
  /** The control below the words rather than beside them, for a narrow panel. */
  stacked: boolean;
}) {
  const key = field.key;
  const preset = presetById(choice.preset);
  return (
    <SettingRow
      field={field}
      style={style}
      changed={key in choice.changes}
      onSet={(value) => onChange(withSetting(choice, key, value), key)}
      onReset={() => onChange(withSetting(choice, key, preset.style[key] as never), key)}
      resetTitle={`Back to ${preset.name}'s value`}
      stacked={stacked}
    />
  );
}

/**
 * One setting: its name and what it does, and a control for its value in
 * `style`. `changed` marks it as set where it is shown, over what it would
 * otherwise be, which `onReset` goes back to; `onSet` is given undefined
 * for Automatic.
 */
export function SettingRow({
  field,
  style,
  changed,
  onSet,
  onReset,
  resetTitle,
  stacked,
}: {
  field: StyleField;
  style: DrawingStyle;
  changed: boolean;
  onSet: (value: DrawingStyle[keyof DrawingStyle] | undefined) => void;
  onReset: () => void;
  resetTitle: string;
  stacked: boolean;
}) {
  const key = field.key;
  const set = (value: DrawingStyle[typeof key] | undefined) => onSet(value);
  const raw = style[key];
  const auto = field.automatic ? automaticValue(key, style) : undefined;
  const isAuto = field.automatic !== undefined && raw === undefined;
  const value = isAuto ? auto : raw;

  return (
    <div
      className={clsx(
        "px-3 py-2.5 relative",
        changed && "bg-accel-lightbase/15",
      )}
    >
      {changed && (
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accel-base"
        />
      )}
      <div
        className={clsx(
          "flex gap-3",
          stacked ? "flex-col items-stretch gap-2" : "items-start",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gh-black">{field.label}</div>
          <p className="text-xs leading-snug text-gh-gray mt-0.5">
            {field.description}
          </p>
          {field.automatic && (
            <label className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-gh-gray select-none">
              <input
                type="checkbox"
                checked={isAuto}
                onChange={(e) =>
                  set(e.target.checked ? undefined : (auto as never))
                }
                className="accent-accel-base"
              />
              Automatic: {field.automatic}
            </label>
          )}
        </div>
        <div
          className={clsx(
            "shrink-0 flex items-center gap-1.5",
            stacked ? "justify-end" : "pt-0.5",
          )}
        >
          <Control
            field={field}
            value={value}
            style={style}
            disabled={isAuto}
            onSet={set}
          />
          <button
            onClick={onReset}
            disabled={!changed}
            aria-label={`Reset ${field.label}`}
            title={changed ? resetTitle : "Not changed"}
            className="h-6 w-6 rounded-md flex items-center justify-center text-gh-gray hover:bg-gh-base hover:text-gh-black disabled:opacity-0"
          >
            <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

const SHARE_SUFFIX: Record<ShareOf, string> = {
  bond: "% of bond",
  "font size": "% of font",
  "ring radius": "% of radius",
  "arrowhead length": "% of head",
};

function Control({
  field,
  value,
  style,
  disabled,
  onSet,
}: {
  field: StyleField;
  value: unknown;
  style: DrawingStyle;
  disabled: boolean;
  onSet: (v: never) => void;
}) {
  const k = field.kind;
  const set = onSet as (v: unknown) => void;
  switch (k.type) {
    case "points": {
      const v = value as number;
      return (
        <div className="flex flex-col items-end gap-0.5">
          <Numeric
            value={v}
            min={k.min}
            max={k.max}
            step={k.step}
            digits={1}
            unit="pt"
            disabled={disabled}
            onChange={set}
            label={field.label}
          />
          <span className="text-[10px] text-gh-gray">
            = {fmt((v / 72) * 25.4, 2)} mm
          </span>
        </div>
      );
    }
    case "length": {
      const len = value as Length;
      const L = style.bondLengthPt;
      const inPt = len.unit === "pt";
      const shown = inPt ? len.value : len.value * 100;
      return (
        <div className="flex items-center gap-1">
          <Numeric
            value={shown}
            min={inPt ? k.min : (k.min / L) * 100}
            max={inPt ? k.max : (k.max / L) * 100}
            step={inPt ? k.step : 0.5}
            digits={inPt ? 2 : 1}
            disabled={disabled}
            onChange={(n) => set({ value: inPt ? n : n / 100, unit: len.unit })}
            label={field.label}
          />
          <select
            value={len.unit}
            disabled={disabled}
            aria-label={`${field.label}: unit`}
            onChange={(e) => {
              const unit = e.target.value as Length["unit"];
              if (unit === len.unit) return;
              // The same length, given the other way.
              const pts = inPt ? len.value : len.value * L;
              set(
                unit === "pt"
                  ? { value: round(pts, 2), unit }
                  : { value: round(pts / L, 4), unit },
              );
            }}
            className="h-7 rounded-md border border-gh-line bg-white px-1 text-xs text-gh-black disabled:opacity-50"
          >
            <option value="pt">pt</option>
            <option value="bond">% of bond</option>
          </select>
        </div>
      );
    }
    case "share":
      return (
        <Numeric
          value={(value as number) * 100}
          min={k.min * 100}
          max={k.max * 100}
          step={k.step * 100}
          digits={1}
          unit={SHARE_SUFFIX[k.of]}
          disabled={disabled}
          onChange={(n) => set(n / 100)}
          label={field.label}
        />
      );
    case "angle":
      return (
        <Numeric
          value={value as number}
          min={k.min}
          max={k.max}
          step={k.step}
          digits={0}
          unit="°"
          disabled={disabled}
          onChange={set}
          label={field.label}
        />
      );
    case "colour":
      return (
        <label className="flex items-center gap-1.5">
          <input
            type="color"
            value={value as string}
            aria-label={field.label}
            onChange={(e) => set(e.target.value)}
            className="h-7 w-9 rounded-md border border-gh-line bg-white p-0.5"
          />
          <span className="font-mono text-xs text-gh-gray w-16">
            {value as string}
          </span>
        </label>
      );
    case "typeface":
      return (
        <TypefacePicker
          value={value as string}
          suggested={k.suggested}
          label={field.label}
          onChange={set}
        />
      );
    case "choice":
      return (
        <Segmented
          label={field.label}
          value={value as string}
          options={k.options}
          onChange={set}
        />
      );
  }
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-md border border-gh-line overflow-hidden"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "h-7 px-3 text-xs border-l border-gh-line first:border-l-0",
            o.value === value
              ? "bg-accel-base text-white"
              : "bg-white text-gh-black hover:bg-gh-base",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A number to type or slide. What is typed is taken as soon as it is a
 * number in range, so the preview follows; leaving the box brings anything
 * out of range back into it.
 */
function Numeric({
  value,
  min,
  max,
  step,
  digits,
  unit,
  disabled,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  digits: number;
  unit?: ReactNode;
  disabled?: boolean;
  onChange: (n: number) => void;
  label: string;
}) {
  const [text, setText] = useState(fmt(value, digits));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(fmt(value, digits));
  }, [value, digits, editing]);
  const take = (t: string) => {
    const n = Number(t);
    if (t.trim() !== "" && Number.isFinite(n) && n >= min && n <= max)
      onChange(n);
  };
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        disabled={disabled}
        aria-label={`${label}: slider`}
        onChange={(e) => onChange(round(Number(e.target.value), digits + 1))}
        className="w-24 h-1 accent-accel-base disabled:opacity-40"
      />
      <span className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          aria-label={label}
          onFocus={() => setEditing(true)}
          onChange={(e) => {
            setText(e.target.value);
            take(e.target.value);
          }}
          onBlur={() => {
            setEditing(false);
            const n = Number(text);
            if (Number.isFinite(n) && text.trim() !== "") {
              const c = Math.min(max, Math.max(min, n));
              if (c !== value) onChange(c);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setText(fmt(value, digits));
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-16 h-7 rounded-md border border-gh-line bg-white px-2 text-right text-sm tabular-nums outline-none focus:border-accel-base focus:ring-2 focus:ring-accel-lightbase disabled:opacity-50"
        />
        {unit && (
          <span className="text-xs text-gh-gray min-w-[1.25rem]">{unit}</span>
        )}
      </span>
    </div>
  );
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** A number with at most `digits` decimals, and no trailing zeros. */
function fmt(n: number, digits: number): string {
  return String(round(n, digits));
}
