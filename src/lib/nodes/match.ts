/**
 * Two inputs matched on a property (docs/WORKFLOWS-FOUNDATION.md, *Steps,
 * ports and exits*): each entry paired with the one entry of the other
 * input that has the same value under the name the chemist types - an ID a
 * *Tag* gave, which rides along with every entry made from it - never by an
 * implicit rule. An entry with none to pair with, or more than one, is
 * paired with none, saying why. One rule for every kind that matches
 * (*Re-bond*, *Compare bonding*).
 */
import type { Entry, Property } from "../entry";
import { unitLabel, unreadable } from "./base";

/** A property's value as one to match on: a number with its unit, anything else as it is written. */
const valueKey = (p: Property) => (typeof p.value === "number" ? `${p.value} ${unitLabel(p.unit)}` : JSON.stringify(p.value));

/** What a property's value is, in a line: "start-2". */
const valueSaid = (p: Property) => (typeof p.value === "string" ? p.value : typeof p.value === "number" ? `${p.value}${p.unit === "none" ? "" : ` ${unitLabel(p.unit)}`}` : JSON.stringify(p.value));

/** Each of `entries` paired with the one of `others` whose `name` is the same, by its place among them, or why none is. */
export function matchedOn(entries: readonly Entry[], others: readonly Entry[], name: string, otherName = "the other input"): ({ index: number } | { why: string })[] {
  const byValue = new Map<string, number[]>();
  others.forEach((o, i) => {
    const p = o.properties[name];
    if (unreadable(p, name)) return;
    const k = valueKey(p!);
    byValue.set(k, [...(byValue.get(k) ?? []), i]);
  });
  return entries.map((e) => {
    const p = e.properties[name];
    const why = unreadable(p, name);
    if (why) return { why };
    const found = byValue.get(valueKey(p!)) ?? [];
    if (found.length === 1) return { index: found[0] };
    return { why: found.length ? `${found.length} entries of ${otherName} have its ${name}, ${valueSaid(p!)}` : `no entry of ${otherName} has its ${name}, ${valueSaid(p!)}` };
  });
}
