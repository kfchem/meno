/** Small structures typed here, as MOL files, for the tests and the README's example: invented, nothing read from elsewhere. */
export type Atom = [string, number, number];

/** A V2000 MOL block: atoms (element, x, y in Angstrom) and single bonds between them, by number from 1. */
export function mol(name: string, atoms: Atom[], bonds: [number, number][]): string {
  const head = `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`;
  const a = atoms.map(([e, x, y]) => `${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}${(0).toFixed(4).padStart(10)} ${e.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  const b = bonds.map(([p, q]) => `${String(p).padStart(3)}${String(q).padStart(3)}  1  0`);
  return [name, "  typed", "", head, ...a, ...b, "M  END", ""].join("\n");
}

/** A zigzag chain of `n` carbons from `x`, every bond `length` long, its angles 120 degrees. */
export function chain(name: string, n: number, length = 1.5, x = 0): string {
  const atoms: Atom[] = Array.from({ length: n }, (_, i) => ["C", x + i * length * Math.cos(Math.PI / 6), i % 2 ? length * Math.sin(Math.PI / 6) : 0]);
  return mol(name, atoms, atoms.slice(1).map((_, i) => [i + 1, i + 2]));
}

/** A chain of four carbons bent into a U, its angles 90 degrees, its three bonds 1.5 long: nothing Meno's own layout would draw. */
export const U_SHAPE = mol("u", [["C", 0, 0], ["C", 1.5, 0], ["C", 1.5, 1.5], ["C", 0, 1.5]], [[1, 2], [2, 3], [3, 4]]);

/** A reaction: two reactants (a chain of three carbons, one of four) and a product (a chain of five), as an RXN file with its arrow. */
export function reaction(): string {
  return ["$RXN", "", "  typed", "", "  2  1", "$MOL", chain("a", 3, 1.5, 0), "$MOL", chain("b", 4, 1.5, 6), "$MOL", chain("c", 5, 1.5, 16)].join("\n");
}
