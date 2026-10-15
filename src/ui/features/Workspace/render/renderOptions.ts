/**
 * Render's own choices (docs/RENDER.md), Meno's whoever renders - drawn by
 * the Render card (./RenderCard) in the general form of options
 * (lib/options) - and what a render is asked to make of them.
 *
 * What a picture looks like is one choice, its *look*: a bundle of what the
 * molecules are made of, what the surfaces are made of, how it is shaded and
 * how it is outlined. Each look fills in those parts, which are shown folded
 * under it and are the chemist's to change for the one render.
 */
import type { Option, OptionValues } from "../../../../lib/options";
import { SEE_THROUGH_LOOKS, type Finish, type Motion, type MoleculeMaterial, type Outlines, type RenderAsk, type Shading, type Shape, type Sticks, type SurfaceMaterial } from "./renderScene";

/** What a render is: a picture, or a film. */
export type Kind = RenderAsk["kind"];

/** The role Render's own choices are remembered under, for a picture and for a film (lib/settings/appSettings `options`). */
export const remembered = (kind: Kind) => `render:${kind}`;

const SHAPES: { value: Shape; label: string }[] = [
  { value: "fit", label: "Fitted to the molecules" },
  { value: "16:9", label: "16:9" },
  { value: "4:3", label: "4:3" },
  { value: "1:1", label: "Square" },
];
const MOTIONS: Record<Motion, string> = { turn: "Turning once round", frames: "Through its frames", vibration: "In the vibration shown" };
const MOLECULES: { value: MoleculeMaterial; label: string }[] = [
  { value: "meno", label: "As the 3D style draws them" },
  { value: "glossy", label: "Glossy" },
  { value: "metal", label: "Metal" },
  { value: "glass", label: "Glass" },
  { value: "matte", label: "Matte" },
  { value: "clay", label: "Clay" },
  { value: "white", label: "White" },
];
const SURFACES: { value: SurfaceMaterial; label: string }[] = [
  { value: "meno", label: "As the canvas draws them" },
  { value: "glass", label: "Glass" },
  { value: "glossy", label: "Glossy" },
  { value: "matte", label: "Matte" },
];
const SHADINGS: { value: Shading; label: string }[] = [
  { value: "lit", label: "Lit: light and shadow as a renderer finds them" },
  { value: "toon", label: "Toon: one lit band and one in shade" },
];
const STICKS: { value: Sticks; label: string }[] = [
  { value: "shown", label: "Shown, running on" },
  { value: "stopped", label: "Stopped at the surface" },
];
const OUTLINES: { value: Outlines; label: string }[] = [
  { value: "none", label: "None" },
  { value: "thin", label: "Thin, on every line" },
  { value: "outer", label: "Outer edge only" },
  { value: "mixed", label: "Outer edge thick, inner lines thin" },
];
const OUTLINE_COLOURS = [
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
  { value: "grey", label: "Grey" },
];

/** What a look is made of: each of its parts. */
export type LookParts = { molecules: MoleculeMaterial; surfaces: SurfaceMaterial; shading: Shading; outlines: Outlines; outline: number; outline_colour: "black" | "white" | "grey"; band: number; sticks: Sticks };

const PLAIN = { shading: "lit" as const, outlines: "none" as const, outline: 3, outline_colour: "black" as const, band: 0.5, sticks: "shown" as const };
/** Where the sticks of a look that is seen through read best: glass and X-ray show them running on; ice, a bubble and slime are clearer without. */
const STOPPED = new Set(["ice", "bubble", "slime"]);

/**
 * The looks Meno knows, in the order they are offered: each a bundle of
 * what the molecules and the surfaces are made of, how it is shaded and how
 * outlined. A renderer's plugin says which of them it can make
 * (`looks` in its manifest, docs/PLUGINS.md); one none can is not offered.
 */
export const LOOKS: readonly { id: string; label: string; parts: LookParts }[] = [
  { id: "meno", label: "As the canvas draws them", parts: { ...PLAIN, molecules: "meno", surfaces: "meno" } },
  { id: "glossy", label: "Glossy", parts: { ...PLAIN, molecules: "glossy", surfaces: "glossy" } },
  { id: "matte", label: "Matte", parts: { ...PLAIN, molecules: "matte", surfaces: "matte" } },
  { id: "clay", label: "Clay", parts: { ...PLAIN, molecules: "clay", surfaces: "matte" } },
  { id: "glass", label: "Glass", parts: { ...PLAIN, molecules: "glass", surfaces: "glass" } },
  { id: "metal", label: "Metal", parts: { ...PLAIN, molecules: "metal", surfaces: "glossy" } },
  { id: "cartoon", label: "Cartoon: one lit band, outlined", parts: { ...PLAIN, molecules: "meno", surfaces: "meno", shading: "toon", outlines: "mixed" } },
  { id: "lineart", label: "Line art: white fill, outlined", parts: { ...PLAIN, molecules: "white", surfaces: "matte", shading: "toon", outlines: "mixed", band: 1 } },
  // (looks a renderer makes with materials of its own, in light of its own: the molecules keep the element colours the renderer reads)
  ...(
    [
      ["gold", "Gold: polished metal"],
      ["silver", "Silver: mirror or satin"],
      ["copper", "Copper: brushed or tarnished"],
      ["bubble", "Soap bubble: clear, with thin-film colour"],
      ["wood", "Wood: varnished, in a species"],
      ["marble", "Marble: polished white stone, veined"],
      ["porcelain", "Porcelain: glazed blue-white"],
      ["slime", "Slime: see-through jelly"],
      ["ice", "Ice: cold, clear glass"],
      ["neon", "Neon: lit tubes"],
      ["xray", "X-ray: layers that add up"],
      ["fur", "Fur: long, or short and dense as velvet"],
    ] as const
  ).map(([id, label]) => ({ id, label, parts: { ...PLAIN, molecules: "meno" as const, surfaces: "meno" as const, sticks: STOPPED.has(id) ? ("stopped" as const) : ("shown" as const) } })),
];

/** The ids of the looks Meno knows. */
export const LOOK_IDS: readonly string[] = LOOKS.map((l) => l.id);

/** The choices of a look: each fills in its parts. `only`: the looks a renderer can make; all, where it is none. */
function lookChoices(only?: readonly string[]) {
  return LOOKS.filter((l) => !only || only.includes(l.id)).map((l) => ({ value: l.id, label: l.label, sets: { ...l.parts } as Record<string, string | number | boolean> }));
}

/**
 * Render's own choices, Meno's whoever renders: a picture's or a film's size and shape, a film's motion, length and rate, its look
 * - and, folded under it, the parts the look is made of. `looks`: those the renderer can make; none given, all.
 */
export function renderOptions(kind: Kind, motions: readonly Motion[], surfaces: boolean, looks?: readonly string[]): Option[] {
  const film = kind === "film";
  const choices = lookChoices(looks);
  const adjust = "Adjust this look";
  return [
    ...(film && motions.length
      ? [{ id: "motion", label: "Moving", type: "choice" as const, choices: motions.map((m) => ({ value: m, label: MOTIONS[m] })), default: motions[0] }]
      : []),
    ...(film
      ? [
          { id: "seconds", label: "Length", type: "number" as const, default: 8, min: 1, max: 60, step: 1, unit: "s" },
          { id: "fps", label: "Frames a second", type: "choice" as const, choices: ["24", "30", "60"].map((v) => ({ value: v, label: v })), default: "30" },
        ]
      : []),
    { id: "width", label: "Width", type: "number", default: film ? 1920 : 2400, min: 16, max: film ? 3840 : 8192, step: film ? 16 : 100, unit: "px" },
    { id: "shape", label: "Shape", type: "choice", choices: SHAPES, default: film ? "16:9" : "fit" },
    { id: "look", label: "Look", type: "choice", choices, default: choices[0]?.value ?? "meno" },
    { id: "molecules", label: "Molecules made of", type: "choice", choices: MOLECULES, default: "meno", group: adjust },
    ...(surfaces ? [{ id: "surfaces", label: "Surfaces made of", type: "choice" as const, choices: SURFACES, default: "meno", group: adjust }] : []),
    { id: "sticks", label: "Sticks inside the balls", type: "choice", choices: STICKS, default: "shown", group: adjust, when: { id: "look", in: [...SEE_THROUGH_LOOKS] } },
    { id: "shading", label: "Shading", type: "choice", choices: SHADINGS, default: "lit", group: adjust },
    { id: "band", label: "Size of the lit band", type: "number", default: 0.5, min: 0.05, max: 1, step: 0.05, group: adjust, when: { id: "shading", in: ["toon"] } },
    { id: "outlines", label: "Outlines", type: "choice", choices: OUTLINES, default: "none", group: adjust },
    { id: "outline", label: "Outline width", type: "number", default: 3, min: 0.5, max: 20, step: 0.5, unit: "px", group: adjust, when: { id: "outlines", in: ["outer", "mixed"] } },
    { id: "outline_colour", label: "Outline colour", type: "choice", choices: OUTLINE_COLOURS, default: "black", group: adjust, when: { id: "outlines", in: ["thin", "outer", "mixed"] } },
  ];
}

/** How a render is lit and outlined, from Render's own choices. */
export function finishOf(v: OptionValues): Finish {
  return {
    look: typeof v.look === "string" ? v.look : "meno",
    shading: (v.shading as Shading) ?? "lit",
    outlines: (v.outlines as Outlines) ?? "none",
    outline: Number(v.outline ?? 3),
    outlineColour: (v.outline_colour as Finish["outlineColour"]) ?? "black",
    band: Number(v.band ?? 0.5),
    sticks: v.sticks === "stopped" ? "stopped" : "shown",
  };
}

/** A render's finish as an entry says it to the renderer: the look's shading and outlines, in the names its settings have. */
export function finishEntry(f: Finish | undefined) {
  const g = f ?? finishOf({});
  return { look: g.look, shading: g.shading, outlines: g.outlines, outline: g.outline, outline_colour: g.outlineColour, band: g.band };
}

/** What a render is asked to make, from Render's own choices. */
export function askOf(kind: Kind, v: OptionValues): RenderAsk {
  return {
    kind,
    width: Number(v.width),
    shape: v.shape as Shape,
    ...(kind === "film" ? { motion: v.motion as Motion, seconds: Number(v.seconds), fps: Number(v.fps) } : {}),
    molecules: (v.molecules as MoleculeMaterial) ?? "meno",
    surfaces: (v.surfaces as SurfaceMaterial) ?? "meno",
    finish: finishOf(v),
  };
}
