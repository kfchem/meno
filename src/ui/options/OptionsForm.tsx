import { firstUnset, MANY_CHOICES, shownOptions, type LinesOption, type Option, type OptionValues } from "../../lib/options";
import Checkbox from "../controls/Checkbox";
import NumberField from "../controls/NumberField";
import RadioGroup from "../controls/Radio";
import Select from "../controls/Select";

/** The most lines a box of lines shows at once: past them, the box and what each line was read as scroll together. */
const MOST_ROWS = 16;

/**
 * Lines of text, each with what it was read as beside it, on the same line
 * (`LinesOption.readAs`): a line never wraps, so each reading stays beside
 * its own; a long one scrolls across.
 */
function LinesField({ option, value, onChange }: { option: LinesOption; value: string; onChange: (v: string) => void }) {
  const read = option.readAs?.(value) ?? [];
  const rows = Math.max(option.rows ?? 4, value.split(/\r?\n/).length);
  return (
    <label className="block">
      <span className="block text-xs text-gh-gray mb-1">{option.label}</span>
      {/* (20 px a line, as leading-5, and the box's own padding - and room all round for its focus ring, which the scroll would clip) */}
      <span className="-m-0.5 flex gap-2 overflow-y-auto p-0.5" style={{ maxHeight: MOST_ROWS * 20 + 10 + 4 }}>
        <textarea
          data-native-undo=""
          value={value}
          rows={rows}
          wrap="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 shrink-0 resize-none overflow-x-auto overflow-y-hidden rounded-md border border-gh-line bg-white px-2 py-1 font-mono text-xs leading-5 text-gh-black outline-none focus:border-accel-base focus:ring-2 focus:ring-accel-lightbase"
        />
        {read.length > 0 && (
          <span aria-label="Read as" className="min-w-0 flex-1 py-1 text-xs leading-5">
            {read.map((r, k) => (
              <span key={k} className={`block truncate ${r.problem ? "text-red-700" : "text-gh-gray"}`} title={r.said}>
                {r.said || "\u00a0"}
              </span>
            ))}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * A role's options, drawn from their general form (lib/options): a choice
 * as its choices, each to pick - or, of many, a list to pick from; of one,
 * said as text; a number
 * with its unit; a text; a switch; lines of text, each with what it was
 * read as beside it, where the kind says.
 * Whoever fills the role declares them - Meno, or a plugin - and this draws
 * any of them alike.
 */
export default function OptionsForm({
  options,
  values,
  onChange,
  context,
  choosing,
  onChoose,
  asks = false,
  binds,
}: {
  options: readonly Option[];
  values: OptionValues;
  onChange: (values: OptionValues) => void;
  /** Values of other options shown beside these, which an option's `when` may name. */
  context?: OptionValues;
  /** The atoms option being chosen on the drawing, by its id - none, where none is. */
  choosing?: string | null;
  /** Choosing an atoms option's atoms on the drawing begun (its id), or ended (null). Without it, an atoms option is only counted. */
  onChoose?: (id: string | null) => void;
  /** Shown to ask for what it still needs: its first number shown that holds none - a window, the chemist's own - focused as it is shown. */
  asks?: boolean;
  /**
   * Options that may take their value from a property, entry by entry (lib/boundOptions): which may (`can`), those that do, by id,
   * each with the property's name (`bound`), the names the entries coming in carry (`offered`), and an option taken so, or given
   * its own value back (null). Without it, no option is offered so.
   */
  binds?: { can: (o: Option) => boolean; bound: Readonly<Record<string, string>>; offered: readonly string[]; onBind: (id: string, name: string | null) => void };
}) {
  const set = (id: string, v: string | number | boolean) => {
    // (a choice that fills in others - a preset's parts - sets them with it)
    const option = options.find((o) => o.id === id);
    const sets = option?.type === "choice" ? option.choices.find((c) => c.value === v)?.sets : undefined;
    onChange({ ...values, ...(sets ?? {}), [id]: v });
  };
  const shown = shownOptions(options, values, context);
  // (asked for: the first number shown that holds none yet)
  const asked = asks ? firstUnset(shown, values) : undefined;
  // (those of one group folded together where the first of them is, under its name)
  const first = new Set(shown.filter((o, i) => o.group && shown.findIndex((x) => x.group === o.group) === i).map((o) => o.id));
  const field = (o: Option) => (
        <div key={o.id}>
          {o.type === "choice" && o.choices.length > MANY_CHOICES ? (
            // (its name, pressed, opens it as the button does; only as wide as they are, so that a press beside them does not -
            // at least 12rem, but never past the card's inset on the right: a step's card is narrower than that)
            <label className="block w-fit min-w-[min(12rem,100%)] max-w-full">
              <span className="block text-xs text-gh-gray mb-1">{o.label}</span>
              <Select label={o.label} value={String(values[o.id] ?? "")} options={o.choices} onChange={(v) => set(o.id, v)} size="sm" className="w-full" />
            </label>
          ) : o.type === "choice" && o.choices.length === 1 ? (
            // (a choice with only one to have - a motion's fixed renderer - said, not offered as a control with nothing to pick)
            <div>
              <span className="mb-1 block text-xs text-gh-gray">{o.label}</span>
              <span className="block text-sm text-gh-black">{o.choices[0].label}</span>
            </div>
          ) : o.type === "choice" ? (
            <RadioGroup label={o.label} value={String(values[o.id] ?? "")} options={o.choices} onChange={(v) => set(o.id, v)} />
          ) : o.type === "atoms" ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gh-gray">
              <span className="whitespace-nowrap">
                {o.label} <span className="text-gh-black tabular-nums">{String(values[o.id] ?? "").split(/[\s,]+/).filter(Boolean).length || "none"}</span>
              </span>
              {onChoose && (
                <button
                  type="button"
                  aria-pressed={choosing === o.id}
                  onClick={() => onChoose(choosing === o.id ? null : o.id)}
                  className={`h-6 shrink-0 whitespace-nowrap rounded-md border px-2 text-xs ${choosing === o.id ? "border-accel-base bg-accel-base/5 text-accel-base" : "border-gh-line bg-white text-gh-black hover:bg-gh-base"}`}
                >
                  {choosing === o.id ? "Done" : "Choose on the drawing"}
                </button>
              )}
            </div>
          ) : o.type === "lines" ? (
            <LinesField option={o} value={String(values[o.id] ?? "")} onChange={(v) => set(o.id, v)} />
          ) : o.type === "switch" ? (
            <Checkbox checked={values[o.id] === true} onChange={(v) => set(o.id, v)} className="text-sm text-gh-black">
              {o.label}
            </Checkbox>
          ) : (
            <label className="block">
              <span className="block text-xs text-gh-gray mb-1">{o.label}</span>
              {/* (a number and its unit both within the card: the field narrows to leave the unit room) */}
              <span className="flex items-center gap-1.5">
                {binds && binds.bound[o.id] != null ? (
                  // (taken from a property: its name, the names coming in offered as it is typed - the option's own value kept underneath)
                  <>
                    <span className="shrink-0 text-sm text-gh-gray">=</span>
                    <input
                      type="text"
                      aria-label={`${o.label}: the property it is taken from`}
                      placeholder="a property"
                      list={`from-${o.id}`}
                      value={binds.bound[o.id]}
                      title={binds.bound[o.id] ? (binds.offered.includes(binds.bound[o.id]) ? `${binds.bound[o.id]}: each entry's own, as it comes in` : `${binds.bound[o.id]}: no entry coming in carries it yet`) : undefined}
                      onChange={(e) => binds.onBind(o.id, e.target.value)}
                      className="h-7 w-full min-w-0 max-w-[10rem] rounded-md border border-accel-base/60 bg-white px-2 text-sm text-gh-black"
                    />
                    <datalist id={`from-${o.id}`}>
                      {binds.offered.map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                  </>
                ) : o.type === "number" ? (
                  <NumberField value={Number(values[o.id] ?? o.default)} min={o.min} max={o.max} step={o.step} whole={o.whole} onChange={(n) => set(o.id, n)} autoFocus={o.id === asked} className="min-w-0 max-w-[12rem] flex-1 text-sm" />
                ) : (
                  <input
                    type="text"
                    value={String(values[o.id] ?? "")}
                    onChange={(e) => set(o.id, e.target.value)}
                    className="h-7 w-full max-w-[12rem] rounded-md border border-gh-line bg-white px-2 text-sm text-gh-black"
                  />
                )}
                {o.type === "number" && o.unit && <span className="shrink-0 whitespace-nowrap text-xs text-gh-gray">{o.unit}</span>}
                {binds?.can(o) && (
                  <button
                    type="button"
                    title="From a property"
                    aria-label="From a property"
                    aria-pressed={binds.bound[o.id] != null}
                    tabIndex={-1}
                    onClick={(e) => {
                      e.preventDefault();
                      binds.onBind(o.id, binds.bound[o.id] != null ? null : (binds.offered[0] ?? ""));
                    }}
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${binds.bound[o.id] != null ? "bg-accel-base/10 text-accel-base" : "text-gh-gray hover:bg-gh-base hover:text-gh-black"}`}
                  >
                    {/* (two links of a chain: Heroicons' outline "link") */}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                    </svg>
                  </button>
                )}
              </span>
            </label>
          )}
          {o.note && <span className="mt-1 block text-xs text-gh-gray">{o.note}</span>}
        </div>
  );
  return (
    <div className="space-y-3">
      {shown.map((o) => {
        if (!o.group) return field(o);
        if (!first.has(o.id)) return null;
        return (
          <details key={`group-${o.group}`} className="rounded-md border border-gh-line px-2 py-1.5">
            <summary className="cursor-pointer select-none text-xs text-gh-gray">{o.group}</summary>
            <div className="mt-2 space-y-3">{shown.filter((x) => x.group === o.group).map(field)}</div>
          </details>
        );
      })}
    </div>
  );
}
