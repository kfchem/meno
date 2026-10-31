/**
 * Options in a general form (docs/PLUGINS.md, *Several plugins, one role*):
 * what a role takes besides its input - how a file is written, say - each a
 * choice, a number, a text or a switch, with a label and a default. Whoever
 * fills the role declares them, Meno or a plugin; Meno draws them
 * (OptionsForm) and remembers the chemist's last choices, by the role
 * (lib/settings/appSettings `options`).
 */

type OptionBase = {
  /** Known by it, among the role's options. */
  id: string;
  /** What the chemist reads beside it. */
  label: string;
  /** Shown only while another option of the role has one of these values (`shownOptions`): a part that applies to one choice only. */
  when?: { id: string; in: readonly (string | number | boolean)[] };
  /** Shown folded, under this name, with those beside it that say the same: a choice's parts, which it fills in (`sets`). */
  group?: string;
  /** Where on a card of several parts it is shown (Render's: docs/RENDER.md, *The card*); none said, with its plugin's own. */
  section?: OptionSection;
  /** What bounds it or fixes it, said under it, where the label alone does not say it - Meno's own options' alone. */
  note?: string;
};
/** The parts of Render's card, in its order: what the molecules look like, how it is rendered, the scene round them, a film's motion. */
export const OPTION_SECTIONS = ["look", "render", "scene", "motion"] as const;
export type OptionSection = (typeof OPTION_SECTIONS)[number];
/**
 * What Meno knows of what is written, which an option may start from rather
 * than from its default - the charge of the molecule written, say: given
 * afresh for what is written each time, and never remembered, since it is
 * that molecule's (`known`).
 */
export type Known = "charge" | "multiplicity" | "name";
/** One of several, each with what it is called. */
export type ChoiceOption = OptionBase & {
  type: "choice";
  /** `sets`: the values of other options that picking it fills in - a preset's parts - each still the chemist's to change. */
  choices: readonly { value: string; label: string; sets?: Readonly<Record<string, string | number | boolean>> }[];
  default: string;
};
/** `unset`: the value that sets nothing - what is left to the program ("0 leaves it to ORCA"): not said on a step's line. */
export type NumberOption = OptionBase & {
  type: "number";
  default: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  from?: Known;
  unset?: number;
};
export type TextOption = OptionBase & { type: "text"; default: string; from?: Known };
export type SwitchOption = OptionBase & { type: "switch"; default: boolean };
/**
 * Lines of text, one item to a line - Meno's own kinds' alone: a plugin's
 * manifest declares none (`acceptOptions` reads no such type) - and, where
 * the kind says, what each line was read as, shown beside it (`readAs`: one
 * for each line of the text, in order, blank for a blank one).
 */
export type LinesOption = OptionBase & {
  type: "lines";
  default: string;
  rows?: number;
  readAs?: (text: string) => readonly LineRead[];
};
/**
 * Atoms of the structure that comes in, chosen on its drawing - Meno's own
 * kinds' alone, as lines are - held as their ids apart ("12 15"): the
 * drawing's, so never remembered for the next step (`rememberable`).
 */
export type AtomsOption = OptionBase & { type: "atoms"; default: string };
/** What a line of a `LinesOption` was read as, in words - or why it could not be. */
export type LineRead = { said: string; problem?: true };
export type Option = ChoiceOption | NumberOption | TextOption | SwitchOption | LinesOption | AtomsOption;

/** The options of `options` that apply, given the values chosen of them and of `context` (other options shown with them, in another form). */
export function shownOptions<O extends Option>(options: readonly O[], values: OptionValues, context: OptionValues = {}): O[] {
  const all = { ...context, ...values };
  return options.filter((o) => !o.when || o.when.in.includes(all[o.when.id] as string | number | boolean));
}

/** How many choices are shown side by side, each to pick; more, and they are a list to pick from. */
export const MANY_CHOICES = 5;

/** A role's options' values, by their ids. */
export type OptionValues = Record<string, string | number | boolean>;

/** An option's value, where `v` is one it takes; else none. */
function fitting(o: Option, v: unknown): string | number | boolean | undefined {
  switch (o.type) {
    case "choice":
      return typeof v === "string" && o.choices.some((c) => c.value === v) ? v : undefined;
    case "number":
      return typeof v === "number" && Number.isFinite(v) && (o.min == null || v >= o.min) && (o.max == null || v <= o.max) ? v : undefined;
    case "text":
    case "lines":
    case "atoms":
      return typeof v === "string" ? v : undefined;
    case "switch":
      return typeof v === "boolean" ? v : undefined;
  }
}

/**
 * The values of `options`: an option that starts from what Meno knows of
 * what is written, that (`known`); else those remembered, where each still
 * fits its option; else each one's default.
 */
export function valuesOf(
  options: readonly Option[],
  remembered: Readonly<Record<string, unknown>> = {},
  known: Partial<Record<Known, string | number>> = {},
): OptionValues {
  return Object.fromEntries(
    options.map((o) => {
      const from = o.type === "number" || o.type === "text" ? o.from : undefined;
      if (from) return [o.id, fitting(o, known[from]) ?? o.default];
      return [o.id, fitting(o, remembered[o.id]) ?? o.default];
    }),
  );
}

/** The values to remember of `values`: all but those that start from what is written (`Known`). */
export function rememberable(options: readonly Option[], values: OptionValues): OptionValues {
  const fresh = new Set(options.filter((o) => ((o.type === "number" || o.type === "text") && o.from) || o.type === "atoms").map((o) => o.id));
  return Object.fromEntries(Object.entries(values).filter(([id]) => !fresh.has(id)));
}

const OPTION_ID = /^[a-z][a-z0-9-]{0,39}$/;
const KNOWN: readonly Known[] = ["charge", "multiplicity", "name"];
const label = (v: unknown, most: number): string | null => (typeof v === "string" && v.trim() && v.length <= most ? v.trim() : null);
/** What picking a choice fills in, read as data: other options' ids, each a value of a plain kind. */
function setsOf(v: unknown): Record<string, string | number | boolean> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 20)) {
    if (OPTION_ID.test(k) && (typeof x === "string" || typeof x === "boolean" || (typeof x === "number" && Number.isFinite(x)))) out[k] = x;
  }
  return Object.keys(out).length ? out : undefined;
}
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Options as a plugin's manifest declares them, read as data - each in the
 * general form, its default one it takes - and those that do not read as
 * one left out: a plugin's options are drawn by Meno, never run.
 */
export function acceptOptions(raw: unknown): Option[] {
  if (!Array.isArray(raw)) return [];
  const out: Option[] = [];
  for (const r of raw.slice(0, 40) as Record<string, unknown>[]) {
    const id = typeof r?.id === "string" && OPTION_ID.test(r.id) ? r.id : null;
    const name = label(r?.label, 120);
    if (!id || !name || out.some((o) => o.id === id)) continue;
    const from = KNOWN.find((k) => k === r.from);
    const whenRaw = r.when as { id?: unknown; in?: unknown } | undefined;
    const whenId = typeof whenRaw?.id === "string" && OPTION_ID.test(whenRaw.id) ? whenRaw.id : null;
    const whenIn = Array.isArray(whenRaw?.in) ? (whenRaw!.in as unknown[]).filter((v): v is string | number | boolean => ["string", "number", "boolean"].includes(typeof v)).slice(0, 40) : [];
    const when = whenId && whenIn.length ? { when: { id: whenId, in: whenIn } } : {};
    const group = label(r.group, 60) ? { group: label(r.group, 60)! } : {};
    const section = (OPTION_SECTIONS as readonly unknown[]).includes(r.section) ? { section: r.section as OptionSection } : {};
    let o: Option | null = null;
    if (r.type === "choice" && Array.isArray(r.choices)) {
      const choices = (r.choices as Record<string, unknown>[])
        .slice(0, 40)
        .map((c) => ({ value: label(c?.value, 80), label: label(c?.label, 120), sets: setsOf(c?.sets) }))
        .filter((c): c is { value: string; label: string; sets: Record<string, string | number | boolean> | undefined } => c.value != null && c.label != null)
        .map(({ sets, ...c }) => (sets ? { ...c, sets } : c));
      if (choices.length) o = { id, label: name, type: "choice", choices, default: String(r.default) };
    } else if (r.type === "number") {
      o = {
        id,
        label: name,
        type: "number",
        default: num(r.default) ?? 0,
        ...(num(r.min) !== undefined ? { min: num(r.min) } : {}),
        ...(num(r.max) !== undefined ? { max: num(r.max) } : {}),
        ...(num(r.step) !== undefined ? { step: num(r.step) } : {}),
        ...(label(r.unit, 20) ? { unit: label(r.unit, 20)! } : {}),
        ...(from ? { from } : {}),
        ...(num(r.unset) !== undefined ? { unset: num(r.unset) } : {}),
      };
    } else if (r.type === "text") {
      o = { id, label: name, type: "text", default: typeof r.default === "string" ? r.default.slice(0, 200) : "", ...(from ? { from } : {}) };
    } else if (r.type === "switch") o = { id, label: name, type: "switch", default: r.default === true };
    // (its default, one it takes: else it is none)
    if (o && fitting(o, o.default) !== undefined) out.push({ ...o, ...when, ...group, ...section });
  }
  return out;
}
