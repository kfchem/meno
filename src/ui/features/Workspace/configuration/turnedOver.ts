/**
 * Turn over keeps every configuration, where part of a structure is turned over too (docs/EDITOR-2D.md, *The configuration kept*). A centre
 * turned with all its neighbours keeps its configuration as its wedges are exchanged (utils/selection `turnedOver`); one turned with only some
 * of them, or one that stays while a neighbour is turned, may not: its wedges are then exchanged, or kept, all together - whichever reads
 * back, on the places the move gives, as the configuration kept before it. Where neither does, the move is left as it is. Pure: no store.
 */
import { sameConfiguration } from "../../../../lib/layout/drawn";
import type { Tetrahedral } from "../../../../lib/chem/perception/stereo/types";
import { fragmentsHolding } from "../chem/cleanUp";
import { wedgesStating, wedgesTurned, withWedgeChange, type WedgeChange } from "../chem/drawing";
import { stereoOf } from "../chem/engineLayout";
import type { Bond, Model } from "../store/types";
import { keepsAny } from "./kept";

type Over = { atoms: readonly { id: number; x: number; y: number; z?: number }[]; bonds: readonly (WedgeChange & Partial<Pick<Bond, "behind">>)[] };

/** `over` - a turn over of the atoms `turned` of `model` (utils/selection `turnedOver`) - with the wedges of each centre it touches but does not turn whole set so that the centre keeps its configuration. */
export function keepingCentres(model: Model, turned: ReadonlySet<number>, over: Over): Over {
  const around = new Map<number, number[]>();
  for (const b of model.bonds) {
    (around.get(b.a) ?? around.set(b.a, []).get(b.a)!).push(b.b);
    (around.get(b.b) ?? around.set(b.b, []).get(b.b)!).push(b.a);
  }
  // (a centre touched - turned, or a neighbour of it - but not turned with all its neighbours, and the bonds read as stating it)
  const stating = wedgesStating(model);
  const touched = new Map<number, Bond[]>();
  for (const b of model.bonds) {
    const c = stating.get(b.id)?.at;
    if (c == null) continue;
    const near = around.get(c) ?? [];
    if (!(turned.has(c) || near.some((n) => turned.has(n))) || (turned.has(c) && near.every((n) => turned.has(n)))) continue;
    touched.set(c, [...(touched.get(c) ?? []), b]);
  }
  if (!touched.size) return over;
  // (only the structures holding them read)
  const ids = new Set(fragmentsHolding(model, touched.keys()).flatMap((f) => [...f]));
  const centresOf = (m: Model) => stereoOf({ atoms: m.atoms.filter((a) => ids.has(a.id)), bonds: m.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) }).centres;
  // (the configuration kept before the move - or, where none is kept, as the drawing states it)
  const keeps = keepsAny(model);
  const said = keeps ? null : centresOf(model);
  const kept = (c: number): Tetrahedral | undefined => {
    if (said) return said.get(c);
    const k = model.atoms.find((a) => a.id === c)?.config;
    return k && typeof k === "object" && "set" in k ? { neighbours: k.set.neighbours, volume: k.set.sense } : undefined;
  };
  const to = new Map(over.atoms.map((p) => [p.id, p]));
  const placed = (changes: ReadonlyMap<number, WedgeChange>): Model => ({
    atoms: model.atoms.map((a) => {
      const p = to.get(a.id);
      return p ? { ...a, x: p.x, y: p.y, ...(p.z !== undefined ? { z: p.z } : {}) } : a;
    }),
    bonds: model.bonds.map((b) => (changes.has(b.id) ? withWedgeChange(b, changes.get(b.id)!) : b)),
  });
  const plain = new Map(over.bonds.map((c) => [c.id, c]));
  // (every such centre's wedges exchanged - each narrow at its centre, the other way - or every one as it was before the move)
  const exchanged = new Map(plain);
  const asWas = new Map(plain);
  for (const [c, bonds] of touched) {
    for (const x of wedgesTurned(model, bonds.map((b) => ({ bond: b, at: c, stereo: stating.get(b.id)!.stereo })))) exchanged.set(x.id, x);
    for (const b of bonds) asWas.set(b.id, { id: b.id, stereo: b.stereo, narrow: b.narrow, display: b.display });
  }
  const readings = [plain, exchanged, asWas].map((changes) => ({ changes, centres: centresOf(placed(changes)) }));
  const out = new Map(plain);
  for (const [c, bonds] of touched) {
    const t = kept(c);
    const right = t && readings.find((r) => {
      const now = r.centres.get(c);
      return now != null && sameConfiguration(t, now);
    });
    if (!right) continue;
    for (const b of bonds) {
      const x = right.changes.get(b.id);
      if (x) out.set(b.id, { ...x, ...(plain.get(b.id)?.behind ? { behind: plain.get(b.id)!.behind } : {}) });
      else out.delete(b.id);
    }
  }
  return { atoms: over.atoms, bonds: [...out.values()] };
}
