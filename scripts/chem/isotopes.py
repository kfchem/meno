"""Writes src/lib/chem/isotopes.ts: each nuclide's relative atomic mass, and each
element's standard atomic weight, from NIST's "Atomic Weights and Isotopic
Compositions for All Elements"
(physics.nist.gov/cgi-bin/Compositions/stand_alone.pl, all isotopes, ASCII),
saved as text and given as the one argument:

    python3 -I scripts/chem/isotopes.py all.txt

Masses NIST marks "#" - estimated from trends, not measured - are left out;
hydrogen's D and T are hydrogen's. A standard atomic weight NIST gives as a
value with its uncertainty is that value; as an interval, [a,b] - where the
element's isotopic composition varies in normal materials - the interval's
midpoint; as a mass number alone, [A] - an element with no stable nuclide -
that nuclide's relative atomic mass; none, where it gives none. Python alone,
no package.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src/lib/chem/isotopes.ts"

TEMPLATE = """/**
 * Each nuclide's relative atomic mass, in daltons: what a program is given
 * of an atom's isotope where its input takes a mass (docs/PLUGINS.md, *The
 * contract*) - and each element's standard atomic weight: what a centre
 * of mass is taken with where a program says none of its own (lib/calc
 * output). From NIST's "Atomic Weights and Isotopic Compositions for All
 * Elements" (https://physics.nist.gov/cgi-bin/Compositions/stand_alone.pl,
 * all isotopes), as scripts/chem/isotopes.py writes it: the nuclides'
 * masses fetched 2026-10-13, the weights 2026-10-31 - the masses NIST marks
 * estimated ("#") left out; a weight NIST gives as an interval, [a,b], its
 * midpoint; as a mass number alone, [A] (no stable nuclide), that
 * nuclide's mass; none, where it gives none.
 */

/** Each element's nuclides: its symbol, then each mass number and its mass. */
const NUCLIDES = [
BODY
];

/** Each element's standard atomic weight, in daltons, by the rule above. */
const WEIGHTS: Readonly<Record<string, number>> = {
WEIGHTS_BODY
};

/** `el`'s standard atomic weight, in daltons; none, where NIST gives none. */
export const standardWeight = (el: string): number | undefined => WEIGHTS[el];

let masses: Map<string, number> | undefined;

/** The mass of `el`'s isotope of mass number `a`, in daltons; none, where NIST gives no measured one. */
export function isotopeMass(el: string, a: number): number | undefined {
  if (!masses) {
    masses = new Map();
    for (const row of NUCLIDES) {
      const [symbol, ...pairs] = row.split(" ");
      for (const pair of pairs) {
        const [n, m] = pair.split(":");
        masses.set(`${symbol}${n}`, Number(m));
      }
    }
  }
  return masses.get(`${el}${a}`);
}
"""


def records(text):
    """Each nuclide NIST lists: its element's symbol, its mass number, its mass as printed, and its element's standard
    atomic weight as printed ("" where none)."""
    for block in re.split(r"\n\s*\n", text):
        fields = dict(re.findall(r"^(Atomic Symbol|Mass Number|Relative Atomic Mass|Standard Atomic Weight) = (.*)$", block, re.M))
        if all(k in fields for k in ("Atomic Symbol", "Mass Number", "Relative Atomic Mass")):
            weight = fields.get("Standard Atomic Weight", "").replace("&nbsp;", "").strip()
            yield fields["Atomic Symbol"].strip(), int(fields["Mass Number"]), fields["Relative Atomic Mass"].strip(), weight


def weight_of(printed, masses):
    """A standard atomic weight as NIST prints it, by the rule in this file's header - its value; an interval's midpoint;
    a lone mass number's nuclide's mass, from `masses` (mass number to mass) - as written; or none."""
    value = re.fullmatch(r"(\d+\.\d+)(?:\(\d+\))?", printed)
    if value:
        return value.group(1)
    interval = re.fullmatch(r"\[(\d+\.\d+),(\d+\.\d+)\]", printed)
    if interval:
        a, b = interval.groups()
        decimals = max(len(a.split(".")[1]), len(b.split(".")[1])) + 1
        return f"{(float(a) + float(b)) / 2:.{decimals}f}".rstrip("0")
    lone = re.fullmatch(r"\[(\d+)\]", printed)
    if lone:
        return masses.get(int(lone.group(1)))
    return None


def main():
    text = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    table, weights = {}, {}
    for symbol, a, printed, weight in records(text):
        el = "H" if symbol in ("D", "T") else symbol
        if weight:
            weights.setdefault(el, weight)
        if "#" in printed:
            continue
        mass = re.match(r"^(\d+\.\d+)", printed)
        if not mass:
            continue
        table.setdefault(el, []).append((a, mass.group(1)))
    rows = [f"{el} " + " ".join(f"{a}:{m}" for a, m in sorted(found)) for el, found in table.items()]
    body = "\n".join(f'  "{r}",' for r in rows)
    taken = {el: weight_of(w, dict(table.get(el, []))) for el, w in weights.items()}
    weights_body = "\n".join(f"  {el}: {w}," for el, w in taken.items() if w)
    OUT.write_text(TEMPLATE.replace("WEIGHTS_BODY", weights_body).replace("BODY", body), encoding="utf-8")
    print(f"{sum(len(v) for v in table.values())} nuclides of {len(table)} elements; {sum(1 for w in taken.values() if w)} weights")


if __name__ == "__main__":
    main()
