/** A structure as a V2000 MOL block, for tests: its atoms in a row along x - an element, with a charge or a radical (2, a doublet) where given - and its bonds, atoms by index, and order. */
export function v2000(atoms: (string | { el: string; charge?: number; radical?: 2 })[], bonds: [number, number, number][]): string {
  const pad = (n: number) => String(n).padStart(3);
  const as = atoms.map((a) => (typeof a === "string" ? { el: a } : a));
  const charges = as.flatMap((a, i) => (a.charge ? [`M  CHG  1${pad(i + 1)} ${pad(a.charge)}`] : []));
  const radicals = as.flatMap((a, i) => (a.radical ? [`M  RAD  1${pad(i + 1)} ${pad(a.radical)}`] : []));
  return [
    "",
    "  test",
    "",
    `${pad(as.length)}${pad(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`,
    ...as.map((a, i) => `${(1.3 * i).toFixed(4).padStart(10)}    0.0000    0.0000 ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
    ...bonds.map(([a, b, o]) => `${pad(a + 1)}${pad(b + 1)}${pad(o)}  0`),
    ...charges,
    ...radicals,
    "M  END",
  ].join("\n");
}
