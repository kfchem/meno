/**
 * What the plugins added bring the renderer through its interface, on the
 * Render card (docs/RENDER.md, *Presets*; docs/PLUGINS.md, *Presets*): their
 * looks, studios and motions offered beside Meno's and the renderer's own,
 * each shown with the options of the plugin it is of; and, of those chosen,
 * what a render's entry hands the renderer - each one's file, which Meno
 * copies into the job unread (`presets/<id>/<file>`), and its options' values.
 * Meno names no plugin and reads no file of one.
 */
import { shownOptions, type Option, type OptionValues } from "../../../../lib/options";
import { ALL_PLUGINS, stoppedOf, type Offered, type Plugin } from "../../../../lib/calc/catalog";
import { PLAIN_STUDIO, type PresetLook, type PresetMotion, type PresetStudio } from "../../../../lib/plugins/manifest";

/** What a plugin's presets' options are remembered under (lib/settings/appSettings `options`), by its id. */
export const presetOptionsKey = (id: string) => `preset:${id}`;

/** One of a plugin's presets, with the plugin it is of (`from`, by id). */
export type FromPreset<T> = T & { from: string };

/** What the card offers of the presets: each look, studio and motion, with the plugin it is of. */
export type PresetOffer = { looks: FromPreset<PresetLook>[]; studios: FromPreset<PresetStudio>[]; motions: FromPreset<PresetMotion>[] };

/** Of the three kinds of preset, which a choice of the card's is: its look, its studio, or a film's motion. */
export type PresetKind = "look" | "studio" | "motion";
const LISTS = { look: "looks", studio: "studios", motion: "motions" } as const;

/**
 * What the card offers of what the plugins added bring the renderer (`offered`, catalog `presetsFor`): each one's looks,
 * studios and motions in its order, the plugins in Meno's - none with an id offered already, by Meno or the renderer
 * (`looksTaken`, `motionsTaken`) or a plugin before it: an id is offered once.
 */
export function presetOffer(offered: readonly Offered[], looksTaken: Iterable<string> = [], motionsTaken: Iterable<string> = []): PresetOffer {
  const seen = { looks: new Set(looksTaken), studios: new Set([PLAIN_STUDIO]), motions: new Set(motionsTaken) };
  const out: PresetOffer = { looks: [], studios: [], motions: [] };
  for (const o of offered) {
    for (const k of ["looks", "studios", "motions"] as const) {
      for (const item of o.presets[k] as readonly { id: string }[]) {
        if (seen[k].has(item.id)) continue;
        seen[k].add(item.id);
        (out[k] as { id: string; from: string }[]).push({ ...item, from: o.from.id });
      }
    }
  }
  return out;
}

/** The Studio choice, where any plugin brings one: the scene as the render is asked (`asked`), then each studio brought. */
export function studioOption(studios: readonly PresetStudio[]): Option[] {
  if (!studios.length) return [];
  return [
    {
      id: "studio",
      label: "Studio",
      type: "choice",
      choices: [{ value: PLAIN_STUDIO, label: "As asked" }, ...studios.map((s) => ({ value: s.id, label: s.label }))],
      default: PLAIN_STUDIO,
      section: "scene",
    },
  ];
}

/** What is chosen of the presets kinds - the look, the studio, a film's motion - by id; none, where nothing of that kind is. */
export type Chosen = Partial<Record<PresetKind, string>>;

/** The plugin each choice of `chosen` is of, where it is one of the presets offered: by kind. */
export function chosenFrom(offer: PresetOffer, chosen: Chosen): Partial<Record<PresetKind, FromPreset<PresetLook | PresetStudio | PresetMotion>>> {
  const out: Partial<Record<PresetKind, FromPreset<PresetLook | PresetStudio | PresetMotion>>> = {};
  for (const k of ["look", "studio", "motion"] as const) {
    const item = chosen[k] === undefined ? undefined : (offer[LISTS[k]] as FromPreset<PresetLook | PresetStudio | PresetMotion>[]).find((x) => x.id === chosen[k]);
    if (item) out[k] = item;
  }
  return out;
}

/**
 * The options of the plugins whose presets are chosen, each plugin's shown only while one of its looks, studios or motions
 * is - and each `when` it says, of its own options' values (`values`, by plugin) and the card's choices (`context`).
 */
export function presetOptionsShown(offered: readonly Offered[], offer: PresetOffer, chosen: Chosen, values: Readonly<Record<string, OptionValues>>, context: OptionValues): { from: Plugin; options: Option[] }[] {
  const of = new Set(Object.values(chosenFrom(offer, chosen)).map((x) => x.from));
  return offered.filter((o) => of.has(o.from.id) && o.presets.options.length).map((o) => ({ from: o.from, options: shownOptions(o.presets.options, values[o.from.id] ?? {}, context) }));
}

/** What a render's entry hands the renderer of one plugin's presets: its interface and id, each of its presets chosen with its file, and its options' values. */
export type PresetHandOff = {
  interface: string;
  from: string;
  look?: { id: string; file: string };
  studio?: { id: string; file: string };
  motion?: { id: string; file: string };
  values: OptionValues;
};

/**
 * What a render hands the renderer of the presets chosen (`chosen`; a picture's motion none): for each plugin they are of, in
 * Meno's order, its presets with their files and its options' values (`values`, by plugin) - only those its options declare,
 * any other left out. None chosen, none.
 */
export function handOff(offered: readonly Offered[], offer: PresetOffer, chosen: Chosen, values: Readonly<Record<string, OptionValues>>): PresetHandOff[] {
  const from = chosenFrom(offer, chosen);
  return offered.flatMap((o) => {
    const mine = (["look", "studio", "motion"] as const).filter((k) => from[k]?.from === o.from.id);
    if (!mine.length) return [];
    const ids = new Set(o.presets.options.map((x) => x.id));
    const own = Object.fromEntries(Object.entries(values[o.from.id] ?? {}).filter(([k]) => ids.has(k)));
    return [{ interface: o.presets.interface, from: o.from.id, ...Object.fromEntries(mine.map((k) => [k, { id: from[k]!.id, file: from[k]!.file }])), values: own }];
  });
}

/**
 * A render's entry with the presets it hands the renderer (`presets`): those, and - where its look or motion is one of them -
 * the canvas's look said in its place (`plain`), and no motion of the renderer's own: the renderer makes them from the files
 * handed it. None handed, the entry as it is.
 */
export function withPresets<E extends { look?: string; motion?: string }>(entry: E, presets: readonly PresetHandOff[] | undefined, plain: string): E & { presets?: PresetHandOff[] } {
  if (!presets?.length) return entry;
  const out: E & { presets?: PresetHandOff[] } = { ...entry, presets: [...presets] };
  if (presets.some((p) => p.look && p.look.id === entry.look)) out.look = plain;
  if (presets.some((p) => p.motion && p.motion.id === entry.motion)) delete out.motion;
  return out;
}

const KIND_SAID = { look: "look", studio: "studio", motion: "motion" } as const;

/**
 * Why a choice remembered - a look, a studio, a film's motion - is not offered, as the card says it in a line before it uses
 * the first: the choice by name, and the plugin it is of, not added, or stopped and why ("Gold is a look of Tool presets, which
 * is not added: the first look is used."). None, where it is offered (`offered`, by id) or was never a plugin's.
 * `renderer`: the plugin that renders, by id; `added`: the plugins added.
 */
export function notOfferedSaid(kind: PresetKind, id: string | undefined, offeredIds: ReadonlySet<string>, renderer: string, added: ReadonlySet<string>): string | null {
  if (!id || offeredIds.has(id)) return null;
  for (const q of ALL_PLUGINS) {
    const item = (q.presets?.[LISTS[kind]] as readonly { id: string; label: string }[] | undefined)?.find((x) => x.id === id);
    if (!item) continue;
    const first = `the first ${KIND_SAID[kind]} is used`;
    if (q.presets!.for !== renderer) return `${item.label} is a ${KIND_SAID[kind]} of ${q.name}, which brings it to another renderer: ${first}.`;
    if (!added.has(q.id)) return `${item.label} is a ${KIND_SAID[kind]} of ${q.name}, which is not added: ${first}.`;
    const stopped = stoppedOf(q, added);
    return `${item.label} is a ${KIND_SAID[kind]} of ${q.name}, which is stopped (${stopped ?? "not of a version it works with"}): ${first}.`;
  }
  return null;
}

/**
 * Why a Render step is refused before it runs, its look or studio set (`given`, as the step holds them) one that nothing
 * added brings now (`looks`, `studios`: the ids offered): never the first used in its place, unsaid. None, where both are.
 */
export function stepRefused(given: Readonly<Record<string, unknown>>, looks: ReadonlySet<string>, studios: ReadonlySet<string>): string | null {
  if (typeof given.look === "string" && !looks.has(given.look)) return "This look is not offered by any added plugin";
  if (typeof given.studio === "string" && given.studio !== PLAIN_STUDIO && !studios.has(given.studio)) return "This studio is not offered by any added plugin";
  return null;
}
