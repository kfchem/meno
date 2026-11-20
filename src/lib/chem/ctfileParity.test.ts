import { describe, expect, it } from "vitest";
import { atomParities } from "./ctfileParity";
import { writeMolfile, type WriterModel } from "./molWriter";

// The atom stereo parity a CTfile carries (BIOVIA, "CTfile Formats", Appendix A, *Stereo Notes*), against the text's own definition worked
// here in space, apart from the reader: the atoms round the centre numbered in increasing atom number, a hydrogen the highest; seen with
// atom 4 behind the plane of 1, 2 and 3, clockwise is 1, counterclockwise 2.

type P = { x: number; y: number; z: number };
const sub = (p: P, q: P): P => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const cross = (p: P, q: P): P => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x });
const dot = (p: P, q: P) => p.x * q.x + p.y * q.y + p.z * q.z;
const unit = (p: P): P => {
  const l = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / l, y: p.y / l, z: p.z / l };
};

/** The parity by the text's definition: each neighbour where the drawing puts it, lifted toward the viewer on a wedge and away on hashes
 *  narrow at the centre; an H not drawn opposite the three drawn. */
function byTheText(m: WriterModel, centre: number): 1 | 2 {
  const at = new Map(m.atoms.map((a, i) => [a.id, { a, i }]));
  const c = at.get(centre)!.a;
  const groups = m.bonds
    .filter((b) => b.a === centre || b.b === centre)
    .map((b) => {
      const n = b.a === centre ? b.b : b.a;
      const lift = (b.stereo === "up" || b.stereo === "down") && (b.narrow ?? centre) === centre ? (b.stereo === "up" ? 0.8 : -0.8) : 0;
      const p = at.get(n)!.a;
      return { rank: p.el === "H" ? Infinity : at.get(n)!.i, v: unit({ x: p.x - c.x, y: p.y - c.y, z: lift }) };
    });
  if (groups.length === 3) {
    const s = groups.reduce((t, g) => ({ x: t.x + g.v.x, y: t.y + g.v.y, z: t.z + g.v.z }), { x: 0, y: 0, z: 0 });
    groups.push({ rank: Infinity, v: unit({ x: -s.x, y: -s.y, z: -s.z }) });
  }
  const [v1, v2, v3, v4] = groups.sort((g, h) => g.rank - h.rank).map((g) => g.v);
  // (the plane's normal by the right hand from 1 to 2 to 3: pointing toward 4 - away from the viewer - where 1, 2, 3 turn clockwise)
  return dot(cross(sub(v2, v1), sub(v3, v1)), v4) > 0 ? 1 : 2;
}

/** A centre (id 1) with groups at the given angles, each its element, the bond `wedged` (by its place) a wedge or hashes narrow at the
 *  centre; ids from 2 in the order given, so atom numbers follow it. */
function centreWith(groups: readonly { el: string; deg: number }[], wedged: number, stereo: "up" | "down"): WriterModel {
  const atoms = [{ id: 1, el: "C", x: 0, y: 0 }, ...groups.map((g, k) => ({ id: k + 2, el: g.el, x: Math.cos((g.deg * Math.PI) / 180), y: Math.sin((g.deg * Math.PI) / 180) }))];
  const bonds = groups.map((_, k) => ({ a: 1, b: k + 2, order: 1 as const, ...(k === wedged ? { stereo, narrow: 1 } : {}) }));
  return { atoms, bonds };
}

describe("atom stereo parity, as the CTfile text defines it", () => {
  it("agrees with the text's definition worked in space: bromochlorofluoromethane both hands, its H left out and drawn, in each atom order", () => {
    const sets = [
      [{ el: "F", deg: 90 }, { el: "Cl", deg: 210 }, { el: "Br", deg: 330 }],
      [{ el: "Br", deg: 90 }, { el: "F", deg: 210 }, { el: "Cl", deg: 330 }],
      [{ el: "Cl", deg: 90 }, { el: "Br", deg: 210 }, { el: "F", deg: 330 }],
      [{ el: "F", deg: 90 }, { el: "Cl", deg: 180 }, { el: "Br", deg: 300 }, { el: "H", deg: 0 }],
      [{ el: "H", deg: 90 }, { el: "F", deg: 180 }, { el: "Cl", deg: 300 }, { el: "Br", deg: 20 }],
    ];
    const seen = new Set<number>();
    for (const groups of sets) {
      for (let w = 0; w < groups.length; w++) {
        for (const stereo of ["up", "down"] as const) {
          const m = centreWith(groups, w, stereo);
          const p = atomParities(m).get(1);
          if (p == null) continue;
          expect(p, `${groups.map((g) => g.el).join(",")} ${stereo} on ${groups[w].el}`).toBe(byTheText(m, 1));
          seen.add(p);
        }
      }
    }
    expect([...seen].sort()).toEqual([1, 2]);
  });

  it("is 3 at a centre on a wavy bond, and none where no configuration is stated", () => {
    const wavy: WriterModel = { atoms: centreWith([{ el: "F", deg: 90 }, { el: "Cl", deg: 210 }, { el: "Br", deg: 330 }], 0, "up").atoms, bonds: centreWith([{ el: "F", deg: 90 }, { el: "Cl", deg: 210 }, { el: "Br", deg: 330 }], 0, "up").bonds.map((b, k) => (k === 0 ? { ...b, stereo: "wavy" as const } : b)) };
    expect(atomParities(wavy).get(1)).toBe(3);
    const plain: WriterModel = { ...wavy, bonds: wavy.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })) };
    expect(atomParities(plain).size).toBe(0);
  });

  it("is written in the atom block: V2000's sss, the third field after the symbol, and V3000's CFG", () => {
    const m = centreWith([{ el: "F", deg: 90 }, { el: "Cl", deg: 210 }, { el: "Br", deg: 330 }], 0, "up");
    const p = atomParities(m).get(1)!;
    const v2000 = writeMolfile(m, { version: "V2000" });
    const line = v2000.split("\n").find((l) => / C {3}/.test(l.slice(30, 35)))!;
    // (xxxxx.xxxx three times, a space, the symbol in 3, dd in 2, ccc in 3, then sss: characters 40 to 42)
    expect(Number(line.slice(39, 42))).toBe(p);
    const others = v2000.split("\n").filter((l) => /^ +-?\d+\.\d{4} +-?\d+\.\d{4} +-?\d+\.\d{4} (F|Cl|Br)/.test(l));
    expect(others.map((l) => Number(l.slice(39, 42)))).toEqual([0, 0, 0]);
    const v3000 = writeMolfile(m, { version: "V3000" });
    expect(v3000.split("\n").filter((l) => / CFG=/.test(l) && /^M {2}V30 \d+ [A-Z][a-z]? /.test(l) && !/^M {2}V30 \d+ \d+ \d+ \d+/.test(l))).toEqual([expect.stringMatching(new RegExp(`^M  V30 1 C .* CFG=${p}$`))]);
  });
});
