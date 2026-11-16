/**
 * Options from a property (docs/WORKFLOWS.md, *Options from a property*): a step's number or text option whose value each entry takes
 * from a property it carries - a Repeat's variable, a Tag's ID, a value a step worked out - rather than one value for all. The value
 * is taken in the option's unit, converted within its dimension (lib/units); a property that is not there, was not worked out, is of
 * another dimension, has no unit where the option has one (or one where it has none), or is out of the option's range sends that
 * entry to its step's *Failed*, saying why. Never a guess, never the option's own value instead.
 */
import type { Property } from "./entry";
import type { Option, OptionValues } from "./options";
import { convert, sameDimension, UNITS, unitNamed } from "./units";

/** Which of a step's options take their value from a property, by option id: the property's name. */
export type Bound = Readonly<Record<string, string>>;

/** Whether an option may take its value from a property: a number or a text, of a plugin's step, or one of Meno's marked so (`fromProperty`). */
export function bindable(o: Option, meno: boolean): boolean {
  return (o.type === "number" || o.type === "text") && !o.from && (!meno || o.fromProperty === true);
}

/** What an option is called in a line: its label, up to the comma that gives its unit ("Strength, kcal/mol/rad²": strength). */
const named = (o: Option) => (o.brief ?? o.label.split(",")[0]).replace(/\s*\(.*\)\s*$/, "").toLowerCase();

/** An option's value for one entry, from its property `name` (`p`, none where the entry has none) - or why it cannot be taken. */
export function boundValue(o: Option, name: string, p: Property | undefined): { value: number | string } | { why: string } {
  const what = named(o);
  if (!p) return { why: `It has no ${name} to take its ${what} from` };
  if (p.status !== "computed") return { why: `Its ${name} was not worked out${typeof p.status === "object" && "failed" in p.status ? `: ${p.status.failed}` : ""}` };
  const unitText = o.type === "number" || o.type === "text" ? o.unit : undefined;
  const wanted = unitText ? unitNamed(unitText) : undefined;
  // (a text with no unit takes a text or a plain number as it is)
  if (o.type === "text" && !unitText) {
    if (typeof p.value === "string") return { value: p.value };
    if (typeof p.value === "number" && p.unit === "none") return { value: String(p.value) };
    if (typeof p.value === "number") return { why: `Its ${name} is in ${UNITS[p.unit as keyof typeof UNITS]?.label ?? p.unit}; its ${what} takes a number with no unit` };
    return { why: `Its ${name} is neither a number nor a text` };
  }
  if (typeof p.value !== "number" || !Number.isFinite(p.value)) return { why: `Its ${name} is no number` };
  let n = p.value;
  if (unitText && !wanted) return { why: `Its ${what} is in ${unitText}, which Meno does not convert: type it on the card` };
  if (wanted) {
    if (p.unit === "none") return { why: `Its ${name} has no unit; its ${what} is in ${UNITS[wanted].label}` };
    if (!sameDimension(p.unit, wanted)) return { why: `Its ${name} is in ${UNITS[p.unit].label}; its ${what} is in ${UNITS[wanted].label}` };
    n = convert(n, p.unit, wanted);
  } else if (p.unit !== "none") return { why: `Its ${name} is in ${UNITS[p.unit].label}; its ${what} takes a number with no unit` };
  if (o.type === "number") {
    const said = `Its ${name}, ${round(n)}${wanted ? ` ${UNITS[wanted].label}` : ""},`;
    if (o.min != null && n < o.min) return { why: `${said} is below its ${what}'s least, ${o.min}` };
    if (o.max != null && n > o.max) return { why: `${said} is above its ${what}'s most, ${o.max}` };
    if (o.whole && !Number.isInteger(n)) return { why: `${said} is no whole number` };
    return { value: n };
  }
  return { value: String(round(n)) };
}

/** A number as a line says it: to six significant figures, no trailing noise of a conversion. */
const round = (n: number) => Number(n.toPrecision(6));

/**
 * A step's option values for one entry: `values`, each bound option's taken from the entry's `properties` (`boundValue`) - or why
 * one cannot be, the first in the options' order. With nothing bound, `values` as they are.
 */
export function boundValues(options: readonly Option[], values: OptionValues, bound: Bound | undefined, properties: Readonly<Record<string, Property>>): { values: OptionValues } | { why: string } {
  if (!bound || !Object.keys(bound).length) return { values };
  const out: OptionValues = { ...values };
  for (const o of options) {
    const name = bound[o.id];
    if (!name) continue;
    const got = boundValue(o, name, properties[name]);
    if ("why" in got) return got;
    out[o.id] = got.value;
  }
  return { values: out };
}

/**
 * Entries grouped by the values their bound options take - each group one call of a step that runs as one job over many entries,
 * in the order the groups first come - and the entries that cannot take them, each with why. With nothing bound, one group of all.
 */
export function boundGroups(
  options: readonly Option[],
  values: OptionValues,
  bound: Bound | undefined,
  propertiesOf: (entry: number) => Readonly<Record<string, Property>>,
  entries: readonly number[],
): { groups: { values: OptionValues; entries: number[] }[]; refused: { entry: number; why: string }[] } {
  if (!bound || !Object.keys(bound).length) return { groups: entries.length ? [{ values, entries: [...entries] }] : [], refused: [] };
  const groups = new Map<string, { values: OptionValues; entries: number[] }>();
  const refused: { entry: number; why: string }[] = [];
  for (const i of entries) {
    const got = boundValues(options, values, bound, propertiesOf(i));
    if ("why" in got) {
      refused.push({ entry: i, why: got.why });
      continue;
    }
    const key = JSON.stringify(Object.keys(bound).sort().map((id) => [id, got.values[id]]));
    const g = groups.get(key) ?? { values: got.values, entries: [] };
    g.entries.push(i);
    groups.set(key, g);
  }
  return { groups: [...groups.values()], refused };
}

/** How a bound option is said on a step's line and card: "= k". */
export const boundSaid = (name: string) => `= ${name}`;
