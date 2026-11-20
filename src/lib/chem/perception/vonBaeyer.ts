/**
 * A bridged ring system numbered as von Baeyer's names number it (the 2013 recommendations, P-23.2): built as a search, not looked up
 * (foundation part 16, A4.3). Every main ring with the most atoms (P-23.2.1); every main bridge as large as it can be (P-23.2.4); every
 * start and direction the rules permit; the secondary bridges after them. Each numbering writes its descriptor, and the best are kept by
 * the criteria in their order: the main ring divided as evenly as it can be (P-23.2.6.2.1), the independent secondary bridges as long as
 * they can be, the first cited first (P-23.2.6.2.2), as few dependent bridges as can be (P-23.2.6.2.3), the secondary bridgeheads' locants
 * as low as they can be as a set (P-23.2.6.2.4) and then in the order cited (P-23.2.6.2.5). The numbering itself (P-23.2.3, P-23.2.6.3):
 * from a main bridgehead round the longer segment to the other, back by the shorter, then the main bridge from the atom next to bridgehead
 * 1; the secondary bridges after, the independent before the dependent, each from the atom next to its higher-numbered bridgehead, the one
 * on the highest-numbered bridgehead first.
 */

export type VonBaeyerNumbering = {
  /** The system's atoms in the order 1 to N. */
  order: number[];
  /** Its descriptor, as a name writes it: "bicyclo[3.2.1]", "tricyclo[2.2.1.0(2,6)]" (the superscripts in parentheses). */
  descriptor: string;
};

type Bridge = { atoms: number[]; ends: [number, number]; dependent: boolean };

/** Every simple cycle of the graph with the most atoms; null where the search ran past `budget` steps. */
function longestCycles(atoms: readonly number[], nb: (a: number) => readonly number[], budget: { left: number }): number[][] | null {
  let best = 0;
  const out: number[][] = [];
  const seen = new Set<string>();
  const sorted = [...atoms].sort((p, q) => p - q);
  for (const s of sorted) {
    const path = [s];
    const on = new Set([s]);
    const walk = (): boolean => {
      if (--budget.left < 0) return false;
      const u = path[path.length - 1];
      for (const v of nb(u)) {
        if (v === s && path.length >= 3) {
          if (path.length > best) {
            best = path.length;
            out.length = 0;
            seen.clear();
          }
          if (path.length === best) {
            const key = [...path].sort((p, q) => p - q).join(",") + "|" + canonicalCycle(path);
            if (!seen.has(key)) {
              seen.add(key);
              out.push([...path]);
            }
          }
          continue;
        }
        // (each cycle found from its least atom only)
        if (on.has(v) || v < s) continue;
        path.push(v);
        on.add(v);
        if (!walk()) return false;
        path.pop();
        on.delete(v);
      }
      return true;
    };
    if (!walk()) return null;
  }
  return out;
}

/** A cycle's text, the same from any start either way round. */
function canonicalCycle(path: readonly number[]): string {
  const n = path.length;
  const k = path.indexOf(Math.min(...path));
  const fwd = Array.from({ length: n }, (_, i) => path[(k + i) % n]);
  const back = Array.from({ length: n }, (_, i) => path[(k - i + n) % n]);
  return [fwd.join(","), back.join(",")].sort()[0];
}

/** The longest paths between two atoms of `held` through atoms not held (a bridge's atoms); a bond between two held atoms not yet used is a path of none. */
function longestBridges(held: ReadonlySet<number>, free: ReadonlySet<number>, nb: (a: number) => readonly number[], usedBond: (a: number, b: number) => boolean): Bridge[] {
  let best = -1;
  let out: Bridge[] = [];
  const take = (b: Bridge) => {
    if (b.atoms.length > best) {
      best = b.atoms.length;
      out = [];
    }
    if (b.atoms.length === best) out.push(b);
  };
  for (const u of held) {
    for (const v of nb(u)) {
      if (held.has(v)) {
        if (u < v && !usedBond(u, v)) take({ atoms: [], ends: [u, v], dependent: false });
        continue;
      }
      if (!free.has(v)) continue;
      const path = [v];
      const walk = () => {
        const x = path[path.length - 1];
        for (const w of nb(x)) {
          if (held.has(w) && w !== u) take({ atoms: [...path], ends: [u, w], dependent: false });
          else if (free.has(w) && !path.includes(w)) {
            path.push(w);
            walk();
            path.pop();
          }
        }
      };
      walk();
    }
  }
  // (each bridge once, not once from each end)
  const seen = new Set<string>();
  return out.filter((b) => {
    const k = [`${b.ends[0]}:${b.atoms.join(",")}:${b.ends[1]}`, `${b.ends[1]}:${[...b.atoms].reverse().join(",")}:${b.ends[0]}`].sort()[0];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** What a numbering is compared by, after the main ring's and main bridge's sizes: lower first. */
type Score = number[];

/**
 * The von Baeyer numberings of a bridged system's atoms (`atoms`, bonded as `nb` says): those the criteria keep, each with its descriptor.
 * `null` where the search ran past its budget: the system is then Meno's own.
 */
export function vonBaeyer(atoms: readonly number[], nb: (a: number) => readonly number[], budget = 200_000): VonBaeyerNumbering[] | null {
  const set = new Set(atoms);
  const nbIn = (a: number) => nb(a).filter((b) => set.has(b));
  const steps = { left: budget };
  const cycles = longestCycles(atoms, nbIn, steps);
  if (!cycles) return null;
  const edges = new Set<string>();
  for (const a of atoms) for (const b of nbIn(a)) if (a < b) edges.add(`${a},${b}`);
  const rings = edges.size - atoms.length + 1;
  const found: { order: number[]; descriptor: string; score: Score }[] = [];
  for (const main of cycles) {
    const mainSet = new Set(main);
    const free = new Set(atoms.filter((a) => !mainSet.has(a)));
    const ringBond = (a: number, b: number) => {
      const i = main.indexOf(a);
      const j = main.indexOf(b);
      return i >= 0 && j >= 0 && (Math.abs(i - j) === 1 || Math.abs(i - j) === main.length - 1);
    };
    for (const mb of longestBridges(mainSet, free, nbIn, ringBond)) {
      if (--steps.left < 0) return null;
      const [u, v] = mb.ends;
      const i = main.indexOf(u);
      const j = main.indexOf(v);
      const n = main.length;
      // (the two segments of the main ring between the bridgeheads, each from u to v)
      const segA: number[] = [];
      for (let k = (i + 1) % n; k !== j; k = (k + 1) % n) segA.push(main[k]);
      const segB: number[] = [];
      for (let k = (i - 1 + n) % n; k !== j; k = (k - 1 + n) % n) segB.push(main[k]);
      const [longer, shorter] = segA.length >= segB.length ? [segA, segB] : [segB, segA];
      const ways: { first: number; second: number; longer: number[]; shorter: number[]; bridge: number[] }[] = [];
      const add = (lo: number[], sh: number[]) => {
        ways.push({ first: u, second: v, longer: lo, shorter: [...sh].reverse(), bridge: [...mb.atoms] });
        ways.push({ first: v, second: u, longer: [...lo].reverse(), shorter: [...sh], bridge: [...mb.atoms].reverse() });
      };
      add(longer, shorter);
      if (segA.length === segB.length) add(shorter, longer);
      for (const w of ways) {
        // (main bicycle: 1, the longer segment, the second bridgehead, the shorter segment back, the main bridge from bridgehead 1's side)
        const order = [w.first, ...w.longer, w.second, ...w.shorter, ...w.bridge];
        const held = new Set(order);
        const usedBonds = new Set<string>();
        const markPath = (p: number[]) => {
          for (let k = 0; k + 1 < p.length; k++) usedBonds.add(p[k] < p[k + 1] ? `${p[k]},${p[k + 1]}` : `${p[k + 1]},${p[k]}`);
        };
        markPath([...main, main[0]]);
        markPath([u, ...mb.atoms, v]);
        const used = (a: number, b: number) => usedBonds.has(a < b ? `${a},${b}` : `${b},${a}`);
        const mainBicycle = new Set(held);
        // (the secondary bridges: the longest left each time, as the criteria want them)
        const secondary: Bridge[] = [];
        let freeLeft = new Set(atoms.filter((a) => !held.has(a)));
        for (let guard = 0; guard < rings; guard++) {
          const options = longestBridges(held, freeLeft, nbIn, used);
          if (!options.length) break;
          // (an independent one first where there is one)
          const pick = options.find((b) => mainBicycle.has(b.ends[0]) && mainBicycle.has(b.ends[1])) ?? options[0];
          const dependent = !(mainBicycle.has(pick.ends[0]) && mainBicycle.has(pick.ends[1]));
          secondary.push({ ...pick, dependent });
          for (const a of pick.atoms) held.add(a);
          markPath([pick.ends[0], ...pick.atoms, pick.ends[1]]);
          freeLeft = new Set([...freeLeft].filter((a) => !held.has(a)));
        }
        if (held.size !== atoms.length || secondary.length !== rings - 2) continue;
        // (numbered: the independent before the dependent, the one on the highest-numbered bridgehead first, each from that end)
        const place = new Map(order.map((a, k) => [a, k + 1]));
        const left = [...secondary];
        const numbered: { size: number; heads: [number, number]; dependent: boolean }[] = [];
        while (left.length) {
          const ready = left.filter((b) => place.has(b.ends[0]) && place.has(b.ends[1]));
          const pool = ready.some((b) => !b.dependent) ? ready.filter((b) => !b.dependent) : ready;
          pool.sort((p, q) => {
            const hp = Math.max(place.get(p.ends[0])!, place.get(p.ends[1])!);
            const hq = Math.max(place.get(q.ends[0])!, place.get(q.ends[1])!);
            return hq - hp || Math.min(place.get(q.ends[0])!, place.get(q.ends[1])!) - Math.min(place.get(p.ends[0])!, place.get(p.ends[1])!);
          });
          const b = pool[0];
          left.splice(left.indexOf(b), 1);
          const fromHigh = place.get(b.ends[0])! > place.get(b.ends[1])! ? b.atoms : [...b.atoms].reverse();
          for (const a of fromHigh) {
            order.push(a);
            place.set(a, order.length);
          }
          const h = [place.get(b.ends[0])!, place.get(b.ends[1])!].sort((p, q) => p - q) as [number, number];
          numbered.push({ size: b.atoms.length, heads: h, dependent: b.dependent });
        }
        // (cited in decreasing size, then by their bridgeheads)
        const cited = [...numbered].sort((p, q) => q.size - p.size || p.heads[0] - q.heads[0] || p.heads[1] - q.heads[1]);
        const prefix = ["", "", "bi", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona", "deca"][rings] ?? `${rings}-`;
        const descriptor = `${prefix}cyclo[${longer.length}.${shorter.length}.${mb.atoms.length}${cited.map((s) => `.${s.size}(${s.heads[0]},${s.heads[1]})`).join("")}]`;
        const score: Score = [
          -main.length,
          -mb.atoms.length,
          -Math.min(longer.length, shorter.length),
          ...cited.filter((s) => !s.dependent).map((s) => -s.size),
          cited.filter((s) => s.dependent).length,
          ...cited.flatMap((s) => s.heads).sort((p, q) => p - q),
          ...cited.flatMap((s) => s.heads),
        ];
        found.push({ order, descriptor, score });
      }
    }
  }
  if (!found.length) return [];
  const cmp = (p: Score, q: Score) => {
    for (let k = 0; k < Math.max(p.length, q.length); k++) {
      const d = (p[k] ?? 0) - (q[k] ?? 0);
      if (d) return d;
    }
    return 0;
  };
  let best = found[0].score;
  for (const f of found) if (cmp(f.score, best) < 0) best = f.score;
  return found.filter((f) => cmp(f.score, best) === 0).map(({ order, descriptor }) => ({ order, descriptor }));
}
