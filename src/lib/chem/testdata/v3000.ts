/**
 * A structure as a V3000 MOL block, for tests: its atoms where given (in ångströms, flat), its bonds - atoms by index, order, and a wedge
 * (`up`) or hashes (`down`) narrow at the first atom - and its collections ("CTfile Formats", *Enhanced stereochemistry*: `STERAC1`,
 * `STEREL2`, `STEABS`, each with its atoms and bonds by index).
 */
export function v3000(
  atoms: { el: string; x: number; y: number }[],
  bonds: { a: number; b: number; order: number; stereo?: "up" | "down" }[],
  collections: { name: string; atoms?: number[]; bonds?: number[] }[] = [],
): string {
  const list = (xs: number[]) => `(${xs.length} ${xs.map((i) => i + 1).join(" ")})`;
  return [
    "",
    "  test",
    "",
    "  0  0  0     0  0            999 V3000",
    "M  V30 BEGIN CTAB",
    `M  V30 COUNTS ${atoms.length} ${bonds.length} 0 0 0`,
    "M  V30 BEGIN ATOM",
    ...atoms.map((a, i) => `M  V30 ${i + 1} ${a.el} ${a.x.toFixed(4)} ${a.y.toFixed(4)} 0 0`),
    "M  V30 END ATOM",
    "M  V30 BEGIN BOND",
    ...bonds.map((b, i) => `M  V30 ${i + 1} ${b.order} ${b.a + 1} ${b.b + 1}${b.stereo ? ` CFG=${b.stereo === "up" ? 1 : 3}` : ""}`),
    "M  V30 END BOND",
    ...(collections.length
      ? [
          "M  V30 BEGIN COLLECTION",
          ...collections.map((c) => `M  V30 MDLV30/${c.name}${c.atoms?.length ? ` ATOMS=${list(c.atoms)}` : ""}${c.bonds?.length ? ` BONDS=${list(c.bonds)}` : ""}`),
          "M  V30 END COLLECTION",
        ]
      : []),
    "M  V30 END CTAB",
    "M  END",
  ].join("\n");
}

/** Six atoms round a regular hexagon of side 1.5 Å, the first at the top, going clockwise. */
export const HEXAGON = Array.from({ length: 6 }, (_, k) => ({ x: 1.5 * Math.sin((k * Math.PI) / 3), y: 1.5 * Math.cos((k * Math.PI) / 3) }));
