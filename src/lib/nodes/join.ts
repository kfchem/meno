/**
 * *Join* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*): the entries of
 * one input, with properties of another's put on them - each matched on a
 * property both carry, an ID a *Tag* gave (`matchedOn`): the one entry of
 * the other input with the same value, never by an implicit rule. Each
 * property put on keeps its record as it is - its value, its unit, where
 * and by what it was worked out - under its own name or one given
 * ("species as first end"). An entry with none to match, or more than one,
 * goes to *rest* saying why; so does one whose match lacks a property asked
 * for, or which has its own under the name it would be put on as:
 * nothing is put on silently, nor anything of its own overwritten.
 */
import type { Entry } from "../entry";
import { entries as count, setAside, tally, unreadable, type NodeOutcome } from "./base";
import { matchedOn } from "./match";

/** A property put on: the other input's `from`, under `as` (its own name, unless another is given). */
export type Carried = { from: string; as: string };

export type JoinOptions = {
  /** The property both inputs carry, matched on. */
  on: string;
  /** What is put on. */
  carry: readonly Carried[];
};

/**
 * What to put on, as typed: one to a line, or each after a semicolon - a
 * property's name ("species"), or a name and the one it is put on as
 * ("species as first end"). Why not, where one does not read, or one name
 * is put on twice.
 */
export function carriedIn(text: string): { carry: Carried[] } | { why: string } {
  const carry: Carried[] = [];
  for (const raw of text.split(/[\n;]/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.+?)\s+as\s+(.+)$/.exec(line);
    const from = (m ? m[1] : line).trim();
    const as = (m ? m[2] : line).trim();
    if (!from || !as) return { why: `"${line}" does not read: a property, or a property "as" a name` };
    if (carry.some((c) => c.as === as)) return { why: `"${as}" is put on twice` };
    carry.push({ from, as });
  }
  return { carry };
}

/**
 * *Join* of `entries` (*joined*: each with what is put on it, in the order
 * they came) and `others`, whose properties are put on (*rest*: those of
 * `entries` with nothing put on, each saying why).
 */
export function join(entries: readonly Entry[], others: readonly Entry[], options: JoinOptions): NodeOutcome<"joined" | "rest"> {
  const on = options.on.trim();
  if (!on) return { ok: false, said: "No property to match on" };
  if (!options.carry.length) return { ok: false, said: "Nothing named to put on" };
  const joined: Entry[] = [];
  const rest: Entry[] = [];
  const used = new Set<number>();
  matchedOn(entries, others, on, "the other input").forEach((m, i) => {
    const e = entries[i];
    if ("why" in m) return void rest.push(setAside(e, m.why));
    const o = others[m.index];
    for (const c of options.carry) {
      const why = unreadable(o.properties[c.from], c.from);
      // ("its match has no species"; "its match's species failed: ...")
      if (why) return void rest.push(setAside(e, why.startsWith("it has") ? why.replace(/^it /, "its match ") : why.replace(/^its /, "its match's ")));
      if (c.as in e.properties) return void rest.push(setAside(e, `it has its own ${c.as} already`));
    }
    used.add(m.index);
    joined.push({ ...e, properties: { ...e.properties, ...Object.fromEntries(options.carry.map((c) => [c.as, o.properties[c.from]])) } });
  });
  const unused = others.length - used.size;
  const put = options.carry.map((c) => (c.as === c.from ? c.from : `${c.from} as ${c.as}`)).join(", ");
  const said =
    `${joined.length} of ${count(entries.length)} given ${put}, matched on ${on}` +
    (rest.length ? ` · rest ${rest.length} (${tally(rest)})` : "") +
    (unused ? ` · ${unused} of the other input's entries matched none` : "");
  return { ok: true, exits: { joined, rest }, said };
}
