/**
 * What Meno's own steps do with a vibration (docs/WORKFLOWS-FOUNDATION.md,
 * *Meno's own nodes*, Structures): *Displace* moves a geometry along one. A
 * vibration here is a mode: each atom's Cartesian displacement, x, y and z
 * in turn, as the program gives it. Nothing relies on how a program
 * normalises its modes: Displace scales by the atom moving most.
 *
 * On an entry (src/lib/entry.ts), the vibrations are its property
 * `vibrations` - a table whose first column is `FREQUENCY` (cm-1, an
 * imaginary frequency a negative number) - and their modes its property `modes`, one
 * row per vibration, in the table's order.
 */
import { FREQUENCY, ridingAlong, valueFault, type Entry } from "../entry";

/** The imaginary vibration a saddle point's checks go by: the one of negative frequency (cm-1, an imaginary one given as negative); of several, the most negative, and that is said. */
export function imaginaryVibration(frequencies: readonly number[]): { index: number; said?: string } | { failed: string } {
  const imaginary = frequencies.map((f, i) => [f, i] as const).filter(([f]) => f < 0);
  if (!imaginary.length) return { failed: "It has no imaginary vibration." };
  const [f, index] = imaginary.reduce((p, q) => (q[0] < p[0] ? q : p));
  return imaginary.length > 1 ? { index, said: `It has ${imaginary.length} imaginary vibrations; the most negative, ${f.toFixed(1)} cm⁻¹, is taken.` } : { index };
}

/**
 * *Displace*: a geometry moved along a mode by `amplitude` ångströms - the
 * mode scaled so that the atom it moves most moves exactly the amplitude,
 * every other atom in proportion; a negative amplitude, the other way.
 */
export function displaced(xyz: readonly number[], mode: readonly number[], amplitude: number): { xyz: number[] } | { failed: string } {
  if (mode.length !== xyz.length) return { failed: `The vibration has ${mode.length / 3} atoms and the geometry ${xyz.length / 3}.` };
  let most = 0;
  for (let i = 0; i < mode.length; i += 3) most = Math.max(most, Math.hypot(mode[i], mode[i + 1], mode[i + 2]));
  if (!(most > 0)) return { failed: "The vibration moves no atom." };
  const k = amplitude / most;
  return { xyz: xyz.map((v, i) => v + k * mode[i]) };
}

/** An entry's vibrations: each one's frequency (cm-1) and mode, from its `vibrations` and `modes`; or why they cannot be read. */
export function vibrationsOf(e: Entry): { frequencies: number[]; modes: number[][] } | { failed: string } {
  const t = e.properties.vibrations;
  const m = e.properties.modes;
  if (!t || !m) return { failed: "The entry has no vibrations." };
  if (t.status !== "computed" || m.status !== "computed") return { failed: "Its vibrations were not worked out." };
  if (typeof t.value !== "object" || !("table" in t.value) || typeof m.value !== "object" || !("modes" in m.value)) return { failed: "Its vibrations are not a table and its modes." };
  const fault = valueFault(t.value, e) ?? valueFault(m.value, e);
  if (fault) return { failed: `Its vibrations: ${fault}.` };
  const col = t.value.table.columns.findIndex((c) => c.name === FREQUENCY.name && c.unit === FREQUENCY.unit);
  if (col < 0) return { failed: "Its vibrations have no frequency in cm⁻¹." };
  const frequencies = t.value.table.rows.map((r) => r[col]);
  if (frequencies.some((f) => typeof f !== "number")) return { failed: "A vibration has no frequency." };
  if (m.value.modes.length !== frequencies.length) return { failed: `It has ${frequencies.length} vibrations and ${m.value.modes.length} modes.` };
  return { frequencies: frequencies as number[], modes: m.value.modes };
}

/** *Displace* on an entry: its geometry moved along its imaginary vibration, or the one given (from 0, in its table's order). Its properties ride along, each saying the geometry it was worked out at. */
export function displacedEntry(e: Entry, o: { vibration: "imaginary" | number; amplitude: number }, id: string): { entry: Entry; said?: string } | { failed: string } {
  if (e.geometry.kind !== "3d") return { failed: "The entry has no single 3D geometry to move." };
  const v = vibrationsOf(e);
  if ("failed" in v) return v;
  let k: number;
  let said: string | undefined;
  if (o.vibration === "imaginary") {
    const i = imaginaryVibration(v.frequencies);
    if ("failed" in i) return i;
    k = i.index;
    said = i.said;
  } else k = o.vibration;
  if (!Number.isInteger(k) || k < 0 || k >= v.modes.length) return { failed: `There is no vibration ${k + 1}: it has 1 to ${v.modes.length}.` };
  const moved = displaced(e.geometry.xyz, v.modes[k], o.amplitude);
  if ("failed" in moved) return moved;
  return { entry: { ...e, id, from: [e.id], geometry: { kind: "3d", xyz: moved.xyz }, properties: ridingAlong(e) }, ...(said ? { said } : {}) };
}

