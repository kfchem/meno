/**
 * Settings' conformers sought for the page (Settings, Chemistry, 3D) as its
 * options show them, and back: kept apart from the panel that shows them.
 */
import { MOST_CONFORMERS, pageWithinGuide, RING_CONFORMERS, soughtOptions } from "../../../lib/chem/conformersSought";
import type { Option, OptionValues } from "../../../lib/options";
import { WITHIN_3D, type ChemistrySettings as Settings } from "../../../lib/settings/appSettings";

/** The page's conformers sought as Settings offers them (`soughtOptions`): in rounds where its search takes draws, the window Meno's (`WITHIN_3D`) until the chemist gives one, its guide saying so. */
export function pageSoughtOptions(rounds: boolean): Option[] {
  return soughtOptions("needed", RING_CONFORMERS, rounds ? { within: WITHIN_3D } : undefined).map((o) => (o.id === "within" ? { ...o, note: pageWithinGuide(WITHIN_3D) } : o));
}

/** Settings' conformers sought as the page's options show them (`soughtOptions`): with a search in rounds' own, where its search takes draws - a window unset shown as Meno's (`WITHIN_3D`). */
export function soughtValues(chemistry: Settings, rounds: boolean): OptionValues {
  return {
    sought: chemistry.sought3d ?? "needed",
    count: chemistry.count3d ?? RING_CONFORMERS,
    ...(rounds ? { within: chemistry.within3d ?? WITHIN_3D, first: chemistry.first3d ?? 0, most: chemistry.most3d ?? MOST_CONFORMERS } : {}),
  };
}

/** Settings with the page's conformers sought as `v` chose them: each kept to what it may be, and none kept that is Meno's own default - Meno's window among them - or, a window, none. */
export function soughtChosen(chemistry: Settings, v: OptionValues): Settings {
  const { sought3d: _s, count3d: _c, within3d: _w, first3d: _f, most3d: _m, ...rest } = chemistry;
  const many = (x: unknown, none: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(Math.max(1, Math.round(x)), MOST_CONFORMERS) : none);
  const n = many(v.count, RING_CONFORMERS);
  const first = typeof v.first === "number" && v.first >= 1 ? many(v.first, 0) : 0;
  const most = many(v.most, MOST_CONFORMERS);
  return {
    ...rest,
    ...(v.sought === "fixed" ? { sought3d: "fixed" as const } : {}),
    ...(n !== RING_CONFORMERS ? { count3d: n } : {}),
    ...(typeof v.within === "number" && Number.isFinite(v.within) && v.within >= 0 && v.within !== WITHIN_3D ? { within3d: v.within } : {}),
    ...(first ? { first3d: first } : {}),
    ...(most !== MOST_CONFORMERS ? { most3d: most } : {}),
  };
}
