/**
 * A group written as a condensed formula, read by rule (docs/CTFILE.md,
 * *Labels read by rule*; the maintainer, 2026-10-10): OCH3, CH2OH, CH2Ph,
 * COMe, CO2CH3, OCOMe, SO2Me, CONHMe, OCHF2, NO. A label is such a group
 * where H put before it makes a whole molecule - closed-shell, each atom
 * at a valence it has (HOCH3, HCOMe, HNO) - the group being that molecule
 * without the H, bound where the H was.
 *
 * Read left to right, as a condensed formula is written: the first atom is
 * the one bound; an element's H follow it; a group (Me, Ph, Ac...) or a
 * halogen hangs on the atom before it; an oxygen or a sulfur is either a
 * double-bonded oxygen on the atom before it (the C=O of COMe, the S=O of
 * SO2Me) or the next atom of the chain (the O of CH2OH) - whichever makes
 * every atom's valence one it has, an =O tried first, but never an O an H
 * is written right after, whose H it is (the OH of SO2H); any other element is
 * the chain's next atom; what parentheses hold, with its count, hangs on
 * the atom before it (CH(CH3)2) - an O or an S alone in them an =O, as
 * one unbracketed may be (C(O)NMe2, C(O)OMe), a group alone in them as
 * it would unbracketed (N(iPr)2). Charges, and readings with an atom at a
 * valence it does not have - CO, CH2 - are none.
 */

/** The valences each element may have in such a group: carbon four, sulfur two, four or six. */
const VALENCES: Record<string, number[]> = {
  H: [1], F: [1], Cl: [1], Br: [1], I: [1],
  O: [2], S: [2, 4, 6], Se: [2, 4, 6],
  N: [3], P: [3, 5], As: [3, 5], B: [3],
  C: [4], Si: [4], Ge: [4], Sn: [4],
};
const HALOGENS = new Set(["F", "Cl", "Br", "I"]);
const OXO = new Set(["O", "S"]);

/** A group's label, found at `i` in a text, longest first; and its SMILES, "*" first. */
export type GroupsAt = { at: (text: string, i: number) => string | undefined; smiles: (label: string) => string | undefined };

type Item = { kind: "element"; el: string } | { kind: "group"; smiles: string } | { kind: "branch"; items: Item[] };

/** The label read into elements (each as often as its count), groups and what parentheses hold, or null. */
function itemsOf(text: string, groups: GroupsAt): Item[] | null {
  const out: Item[] = [];
  let i = 0;
  while (i < text.length) {
    let found: Item[];
    let next: number;
    if (text[i] === "(") {
      let depth = 0;
      let j = i;
      for (; j < text.length; j++) {
        if (text[j] === "(") depth++;
        if (text[j] === ")" && --depth === 0) break;
      }
      if (j >= text.length) return null;
      const inner = itemsOf(text.slice(i + 1, j), groups);
      if (!inner?.length) return null;
      // (a group alone in them, with its count, hangs on the atom before as it would unbracketed: the (iPr)2 of N(iPr)2)
      found = inner.length === 1 && inner[0].kind === "group" ? inner : [{ kind: "branch", items: inner }];
      next = j + 1;
    } else {
      const g = groups.at(text, i);
      const smiles = g && groups.smiles(g);
      if (g && smiles) {
        found = [{ kind: "group", smiles }];
        next = i + g.length;
      } else {
        const m = /^[A-Z][a-z]?/.exec(text.slice(i));
        const el = m && (VALENCES[m[0]] ? m[0] : VALENCES[m[0][0]] ? m[0][0] : null);
        if (!el) return null;
        found = [{ kind: "element", el }];
        next = i + el.length;
      }
    }
    // its count
    const count = /^\d+/.exec(text.slice(next));
    const n = count ? Number(count[0]) : 1;
    if (n < 1 || n > 12) return null;
    for (let k = 0; k < n; k++) out.push(...found);
    i = next + (count ? count[0].length : 0);
  }
  return out;
}

/** An atom of the chain as it is read: its element, how many H it has, and how far its valence is taken. */
type Atom = { el: string; hs: number; used: number };
/** What is read so far: the atoms, the bonds between them (`order` 1 or 2), what hangs on each - a group's SMILES - and which atom the chain is at. */
type Read = { atoms: Atom[]; bonds: { a: number; b: number; order: number }[]; groups: { on: number; smiles: string }[]; at: number };

const copy = (r: Read): Read => ({ atoms: r.atoms.map((a) => ({ ...a })), bonds: [...r.bonds], groups: [...r.groups], at: r.at });

/** Each way the items from `k` on read onto `r` - the first that leaves every atom at a valence it has, or null. */
function readOn(items: Item[], k: number, r: Read): Read | null {
  if (k === items.length) return r;
  const it = items[k];
  const cur = r.atoms[r.at];
  if (it.kind === "group") {
    const n = copy(r);
    n.atoms[n.at].used += 1;
    n.groups.push({ on: n.at, smiles: it.smiles });
    return readOn(items, k + 1, n);
  }
  if (it.kind === "branch") {
    // (what parentheses hold, bound to the atom before them by its first atom)
    const first = it.items[0];
    if (first.kind !== "element" || first.el === "H") return null;
    // (an O or an S alone in them is an =O on the atom before, tried first, as one unbracketed is: the C(O) of C(O)NMe2)
    if (it.items.length === 1 && OXO.has(first.el) && cur.used + 2 <= Math.max(...VALENCES[cur.el])) {
      const n = copy(r);
      n.atoms[n.at].used += 2;
      n.atoms.push({ el: first.el, hs: 0, used: 2 });
      n.bonds.push({ a: n.at, b: n.atoms.length - 1, order: 2 });
      const done = readOn(items, k + 1, n);
      if (done) return done;
    }
    const n = copy(r);
    n.atoms[n.at].used += 1;
    n.atoms.push({ el: first.el, hs: 0, used: 1 });
    n.bonds.push({ a: n.at, b: n.atoms.length - 1, order: 1 });
    const inner = readOn(it.items, 1, { ...n, at: n.atoms.length - 1 });
    if (!inner || !closed(inner, n.atoms.length - 1)) return null;
    return readOn(items, k + 1, { ...inner, at: r.at });
  }
  const el = it.el;
  if (el === "H") {
    const n = copy(r);
    n.atoms[n.at].hs += 1;
    n.atoms[n.at].used += 1;
    return readOn(items, k + 1, n);
  }
  if (HALOGENS.has(el)) {
    const n = copy(r);
    n.atoms[n.at].used += 1;
    n.atoms.push({ el, hs: 0, used: 1 });
    n.bonds.push({ a: n.at, b: n.atoms.length - 1, order: 1 });
    return readOn(items, k + 1, n);
  }
  // an =O on the atom before - tried first - while it can take one; never one an H is written right after, which is
  // that O's own (the OH of SO2H, as of CO2H)
  const next = items[k + 1];
  const hAfter = next?.kind === "element" && next.el === "H";
  if (OXO.has(el) && !hAfter && cur.used + 2 <= Math.max(...VALENCES[cur.el])) {
    const n = copy(r);
    n.atoms[n.at].used += 2;
    n.atoms.push({ el, hs: 0, used: 2 });
    n.bonds.push({ a: n.at, b: n.atoms.length - 1, order: 2 });
    const done = readOn(items, k + 1, n);
    if (done) return done;
  }
  // the chain's next atom: the one before it done with
  if (!closed(r, r.at, 1)) return null;
  const n = copy(r);
  n.atoms[n.at].used += 1;
  n.atoms.push({ el, hs: 0, used: 1 });
  n.bonds.push({ a: n.at, b: n.atoms.length - 1, order: 1 });
  return readOn(items, k + 1, { ...n, at: n.atoms.length - 1 });
}

/** Whether an atom's valence, with `more` yet to come, is one it has. */
function closed(r: Read, i: number, more = 0): boolean {
  const a = r.atoms[i];
  return VALENCES[a.el].includes(a.used + more);
}

/**
 * A condensed formula as the group it is - its SMILES, "*" first, bonded
 * where the H put before it would be - or null where it reads as none.
 */
export function chainGroup(label: string, groups: GroupsAt): string | null {
  if (!/^[A-Z]/.test(label) || /[+\-−·\s]/.test(label)) return null;
  const items = itemsOf(label, groups);
  if (!items?.length || items[0].kind !== "element" || items[0].el === "H") return null;
  // (at least two atoms or groups besides the H: a lone element is read as an element is)
  if (items.filter((x) => !(x.kind === "element" && x.el === "H")).length < 2) return null;
  const start: Read = { atoms: [{ el: items[0].el, hs: 0, used: 1 }], bonds: [], groups: [], at: 0 };
  const read = readOn(items, 1, start);
  if (!read || !read.atoms.every((_, i) => closed(read, i))) return null;
  return "*" + smilesOf(read, 0, -1);
}

/** The SMILES of the chain from atom `i`, come to from `from`: bracket atoms with their H, groups as branches. */
function smilesOf(r: Read, i: number, from: number): string {
  const a = r.atoms[i];
  const me = `[${a.el}${a.hs ? `H${a.hs > 1 ? a.hs : ""}` : ""}]`;
  const out: string[] = [];
  for (const g of r.groups) if (g.on === i) out.push(g.smiles.slice(1));
  for (const b of r.bonds) {
    const to = b.a === i ? b.b : b.b === i ? b.a : -1;
    if (to < 0 || to === from) continue;
    out.push((b.order === 2 ? "=" : "") + smilesOf(r, to, i));
  }
  const last = out.pop();
  return me + out.map((s) => `(${s})`).join("") + (last ?? "");
}
