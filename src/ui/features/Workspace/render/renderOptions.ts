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
import { MENO_MOTIONS, type LookDecl, type MotionDecl } from "../../../../lib/plugins/manifest";
import type { Finish, Motion, MoleculeMaterial, Outlines, RenderAsk, Shading, Shape, Sticks, SurfaceMaterial } from "./renderScene";

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
/** Meno's own motions, what the card calls them; those a renderer makes are its manifest's (`motions`), with their own labels. */
const MOTIONS: Record<string, string> = { turn: "Turning once round", frames: "Through its frames", vibration: "In the vibration shown" };
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

const PLAIN: LookParts = { molecules: "meno", surfaces: "meno", shading: "lit", outlines: "none", outline: 3, outline_colour: "black", band: 0.5, sticks: "shown" };

/**
 * The one look Meno has of its own: the scene as the canvas draws it, which every renderer is asked to make. Every other look is
 * declared by the plugin that makes it (`looks` of its role in its manifest, docs/PLUGINS.md): Meno keeps no list of them.
 */
export const CANVAS_LOOK: LookDecl = { id: "meno", label: "As the canvas draws them" };

/** What a declared look fills in: its parts over the plain ones. */
export function partsOf(look: LookDecl): LookParts {
  return { ...PLAIN, ...(look.parts as Partial<LookParts> | undefined) };
}

/**
 * The looks the card offers: the canvas's, then those the renderer declares, in the order it declares them - a look declared
 * twice once. `declared`: the render plugins' looks; none, only the canvas's.
 */
export function looksOffered(declared?: readonly LookDecl[]): readonly LookDecl[] {
  const seen = new Set([CANVAS_LOOK.id]);
  const out: LookDecl[] = [CANVAS_LOOK];
  for (const l of declared ?? []) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    out.push(l);
  }
  return out;
}

/** The choices of a look: each fills in its parts. */
function lookChoices(looks: readonly LookDecl[]) {
  return looks.map((l) => ({
    value: l.id,
    label: l.label,
    sets: { ...partsOf(l) } as Record<string, string | number | boolean>,
  }));
}

/**
 * Render's own choices, Meno's whoever renders: a picture's or a film's size and shape, a film's motion, length and rate, its look
 * - and, folded under it, the parts the look is made of. `looks`: those the renderer can make; none given, all.
 */
export function renderOptions(kind: Kind, motions: readonly Motion[], surfaces: boolean, declared?: readonly LookDecl[], declaredMotions?: readonly MotionDecl[]): Option[] {
  const film = kind === "film";
  // (Meno's own motions the molecules can make, then those the renderer declares, in its order: Meno keeps no list of them)
  const moving = [...motions.map((m) => ({ value: m, label: MOTIONS[m] ?? m })), ...(declaredMotions ?? []).filter((d) => !motions.includes(d.id)).map((d) => ({ value: d.id, label: d.label }))];
  const offered = looksOffered(declared);
  const choices = lookChoices(offered);
  const seeThrough = offered.filter((l) => l.seeThrough).map((l) => l.id);
  const adjust = "Adjust this look";
  return [
    ...(film && moving.length ? [{ id: "motion", label: "Moving", type: "choice" as const, choices: moving, default: moving[0].value }] : []),
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
    ...(seeThrough.length ? [{ id: "sticks", label: "Sticks inside the balls", type: "choice" as const, choices: STICKS, default: "shown", group: adjust, when: { id: "look", in: seeThrough } }] : []),
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

/** A film's motion as an entry says it to the renderer: a motion it declares, by id, which it makes itself; none for Meno's own, keyed into the scene. */
export function motionEntry(ask: Pick<RenderAsk, "kind" | "motion">): { motion?: string } {
  return ask.kind === "film" && ask.motion && !(MENO_MOTIONS as readonly string[]).includes(ask.motion) ? { motion: ask.motion } : {};
}

/**
 * What a render plugin's options are shown by, each `when` its manifest says:
 * the card's own options as chosen, and whether a picture or a film is made
 * (`kind`) - so that a plugin's option for a film alone says so itself, and
 * core names none of them.
 */
export function renderContext(v: OptionValues, kind: Kind): OptionValues {
  return { ...v, kind };
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
