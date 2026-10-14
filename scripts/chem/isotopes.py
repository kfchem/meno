"""Writes src/lib/chem/isotopes.ts: each nuclide's relative atomic mass, from
NIST's "Atomic Weights and Isotopic Compositions for All Elements"
(physics.nist.gov/cgi-bin/Compositions/stand_alone.pl, all isotopes, ASCII),
saved as text and given as the one argument:

    python3 scripts/chem/isotopes.py all.txt

Masses NIST marks "#" - estimated from trends, not measured - are left out;
hydrogen's D and T are hydrogen's. Python alone, no package.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src/lib/chem/isotopes.ts"

TEMPLATE = """/**
 * Each nuclide's relative atomic mass, in daltons: what a program is given
 * of an atom's isotope where its input takes a mass (docs/PLUGINS.md, *The
 * contract*). From NIST's "Atomic Weights and Isotopic Compositions for
 * All Elements" (physics.nist.gov/cgi-bin/Compositions/stand_alone.pl, all
 * isotopes), fetched 2026-10-13, as scripts/chem/isotopes.py writes it;
 * the masses NIST marks estimated ("#") are left out.
 */

/** Each element's nuclides: its symbol, then each mass number and its mass. */
const NUCLIDES = [
BODY
];

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
    """Each nuclide NIST lists: its element's symbol, its mass number, its mass as printed."""
    for block in re.split(r"\n\s*\n", text):
        fields = dict(re.findall(r"^(Atomic Symbol|Mass Number|Relative Atomic Mass) = (.*)$", block, re.M))
        if len(fields) == 3:
            yield fields["Atomic Symbol"].strip(), int(fields["Mass Number"]), fields["Relative Atomic Mass"].strip()


def main():
    text = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    table = {}
    for symbol, a, printed in records(text):
        if "#" in printed:
            continue
        mass = re.match(r"^(\d+\.\d+)", printed)
        if not mass:
            continue
        el = "H" if symbol in ("D", "T") else symbol
        table.setdefault(el, []).append((a, mass.group(1)))
    rows = [f"{el} " + " ".join(f"{a}:{m}" for a, m in sorted(found)) for el, found in table.items()]
    body = "\n".join(f'  "{r}",' for r in rows)
    OUT.write_text(TEMPLATE.replace("BODY", body), encoding="utf-8")
    print(f"{sum(len(v) for v in table.values())} nuclides of {len(table)} elements")


if __name__ == "__main__":
    main()
