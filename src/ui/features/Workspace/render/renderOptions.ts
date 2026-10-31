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
import type { Option, OptionSection, OptionValues } from "../../../../lib/options";
import { MENO_MOTIONS, type FixedChoice, type LookDecl, type MotionDecl, type Shortest } from "../../../../lib/plugins/manifest";
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

/** How short a film of each of Meno's own motions can be and still be read, in seconds; those a renderer makes declare theirs. */
const MENO_SHORTEST: Record<string, Shortest> = { turn: { film: 3 }, frames: { film: 2 }, vibration: { film: 2 } };

/** Once or Loop, a film's: Meno's own, for every motion that can come back to its start - turning, and those a renderer makes. */
const ONCE_LOOP = [
  { value: "once", label: "Once: eases in and comes to rest" },
  { value: "loop", label: "Loop: seamless, over and over" },
];
const LOOPING_OWN = ["turn"];

/** Whether a film of a motion can loop: Meno's turning, or one a renderer declares. */
function loops(motion: string | undefined, declared: readonly MotionDecl[] | undefined): boolean {
  return !!motion && (LOOPING_OWN.includes(motion) || !!declared?.some((d) => d.id === motion));
}

/** The longest a film is asked to be, in seconds - unless its shortest is longer, as many molecules' changes can be. */
const LONGEST = 60;

/**
 * The shortest a film can be (docs/RENDER.md, *How long a film can be*), in whole seconds: its motion's shortest - its Loop's,
 * where it loops and that is longer - and, for a motion that changes one molecule into the next, each change's for each change:
 * one fewer than the `molecules`, or as many, where the film loops back to the first. A motion that says none, 1 s.
 */
export function shortestFilm(motion: string | undefined, declared: readonly MotionDecl[] | undefined, molecules: number, loop: boolean): number {
  const s = (motion && (MENO_SHORTEST[motion] ?? declared?.find((d) => d.id === motion)?.shortest)) || {};
  const changes = s.change ? Math.max(0, loop ? molecules : molecules - 1) : 0;
  const film = (loop ? Math.max(s.loop ?? 0, s.film ?? 0) : s.film) ?? 0;
  return Math.max(1, Math.ceil(film + (s.change ?? 0) * changes - 1e-9));
}

/** A film's length as the card bounds it: its shortest, how many molecules that is for (where it counts them), and whether a length chosen before was raised to it. */
export type Length = { shortest: number; molecules?: number; raised?: boolean };

/**
 * A film's length as the card asks it: the shortest its motion, Once or Loop and the `molecules` allow - and Render's choices
 * with the length raised to it, where it was chosen shorter. A picture's, unbounded.
 */
export function filmLength(kind: Kind, picked: OptionValues, declared: readonly MotionDecl[] | undefined, molecules: number): { length: Length; values: OptionValues } {
  if (kind !== "film") return { length: { shortest: 1 }, values: picked };
  const motion = typeof picked.motion === "string" ? picked.motion : undefined;
  const loop = picked.mode === "loop" && loops(motion, declared);
  const shortest = shortestFilm(motion, declared, molecules, loop);
  const raised = Number(picked.seconds) < shortest;
  const counted = declared?.find((d) => d.id === motion)?.shortest?.change != null;
  return { length: { shortest, ...(counted ? { molecules } : {}), raised }, values: raised ? { ...picked, seconds: shortest } : picked };
}

/**
 * Options with the choices a motion is always made with fixed (`fixed` of its declaration): each such choice offered alone,
 * saying why, and its value that one - whatever was chosen. What it names that is not among them, or not a choice of it, is
 * left as it is.
 */
export function withFixed(options: readonly Option[], values: OptionValues, fixed: readonly FixedChoice[] | undefined): { options: Option[]; values: OptionValues } {
  const out = { ...values };
  const shown = options.map((o) => {
    const f = fixed?.find((x) => x.id === o.id);
    const only = f && o.type === "choice" ? o.choices.find((c) => c.value === f.value) : undefined;
    if (!f || !only || o.type !== "choice") return o;
    out[o.id] = only.value;
    return { ...o, choices: [only], default: only.value, note: f.why };
  });
  return { options: shown, values: out };
}

/** Options by the part of the card each is shown in; those that say none, apart (`own`: the renderer's own part). */
export function bySection(options: readonly Option[]): Record<OptionSection | "own", Option[]> {
  const out: Record<OptionSection | "own", Option[]> = { look: [], render: [], scene: [], motion: [], own: [] };
  for (const o of options) out[o.section ?? "own"].push(o);
  return out;
}

/**
 * Why a film is refused before it is begun, however it was asked for - the card, or an ask saved or written: shorter than its
 * motion can be read in (`filmLength`), said with how long it needs to be. None, where it is long enough or is a picture.
 */
export function tooShort(ask: Pick<RenderAsk, "kind" | "motion" | "mode" | "seconds">, declared: readonly MotionDecl[] | undefined, molecules: number): string | undefined {
  if (ask.kind !== "film") return undefined;
  const { length } = filmLength("film", { motion: ask.motion ?? "", mode: ask.mode ?? "once", seconds: ask.seconds ?? 0 }, declared, molecules);
  return length.raised ? `This film needs at least ${length.shortest} s${length.molecules ? ` for ${length.molecules} molecules` : ""}` : undefined;
}

/** What the card says under a film's length: its shortest, and what it is for; or that the length was raised to it. */
export function lengthNote(l: Length): string | undefined {
  if (l.shortest <= 1) return undefined;
  const of = l.molecules ? ` for ${l.molecules} molecules` : "";
  return l.raised ? `Raised to ${l.shortest} s, the shortest${of}` : `At least ${l.shortest} s${of}`;
}

/** What a look is made of: each of its parts. */
export type LookParts = { molecules: MoleculeMaterial; surfaces: SurfaceMaterial; shading: Shading; outlines: Outlines; outline: number; outline_colour: "black" | "white" | "grey"; band: number; sticks: Sticks };

const PLAIN: LookParts = { molecules: "meno", surfaces: "meno", shading: "lit", outlines: "none", outline: 3, outline_colour: "black", band: 0.5, sticks: "shown" };

/**
 * The one look Meno has of its own: the scene as the canvas draws it, which every renderer is asked to make. Every other look is
 * declared by the plugin that makes it (`looks` of its role in its manifest, docs/PLUGINS.md): Meno keeps no list of them.
 */
export const CANVAS_LOOK: LookDecl = { id: "meno", label: "As the canvas draws them" };

/**
 * Meno's own looks besides the canvas's: each made of Meno's own parts alone - what the molecules and surfaces are made of, the
 * shading, the outlines - so any renderer that makes the parts makes them (the boundary, 2026-10-31). A renderer is asked only
 * for the parts; the look's name stays Meno's (`finishEntry`).
 */
export const MENO_LOOKS: readonly LookDecl[] = [
  { id: "glossy", label: "Lacquered: a clear coat over the element colours", description: "The element colours under a clear, glossy coat, molecules and surfaces alike.", parts: { molecules: "glossy", surfaces: "glossy" } },
  { id: "matte", label: "Flat: no shine, in the element colours", description: "The element colours with no shine at all, molecules and surfaces alike.", parts: { molecules: "matte", surfaces: "matte" } },
  { id: "glass", label: "Crystal: clear, tinted by the element colours", description: "Clear and see-through, tinted by the element colours, the sticks running on inside.", parts: { molecules: "glass", surfaces: "glass", sticks: "shown" }, seeThrough: true },
  { id: "metal", label: "Anodised: metal in the element colours", description: "Metal coloured by the elements, with glossy surfaces.", parts: { molecules: "metal", surfaces: "glossy" } },
  { id: "cartoon", label: "Cartoon: one lit band, outlined", description: "One lit band and one in shade, outlined.", parts: { shading: "toon", outlines: "mixed" } },
  { id: "lineart", label: "Line art: white fill, outlined", description: "White, outlined.", parts: { molecules: "white", surfaces: "matte", shading: "toon", outlines: "mixed", band: 1 } },
];
const MENO_LOOK_IDS = new Set([CANVAS_LOOK.id, ...MENO_LOOKS.map((l) => l.id)]);

/** What a declared look fills in: its parts over the plain ones. */
export function partsOf(look: LookDecl): LookParts {
  return { ...PLAIN, ...(look.parts as Partial<LookParts> | undefined) };
}

/**
 * The looks the card offers: the canvas's, then those the renderer declares, in the order it declares them - a look declared
 * twice once. `declared`: the render plugins' looks; none, only the canvas's.
 */
export function looksOffered(declared?: readonly LookDecl[]): readonly LookDecl[] {
  const seen = new Set(MENO_LOOK_IDS);
  const out: LookDecl[] = [CANVAS_LOOK, ...MENO_LOOKS];
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
export function renderOptions(
  kind: Kind,
  motions: readonly Motion[],
  surfaces: boolean,
  declared?: readonly LookDecl[],
  declaredMotions?: readonly MotionDecl[],
  length: Length = { shortest: 1 },
): Option[] {
  const film = kind === "film";
  // (Meno's own motions the molecules can make, then those the renderer declares, in its order: Meno keeps no list of them)
  const moving = [...motions.map((m) => ({ value: m, label: MOTIONS[m] ?? m })), ...(declaredMotions ?? []).filter((d) => !motions.includes(d.id)).map((d) => ({ value: d.id, label: d.label }))];
  const offered = looksOffered(declared);
  const choices = lookChoices(offered);
  const seeThrough = offered.filter((l) => l.seeThrough).map((l) => l.id);
  const adjust = "Adjust this look";
  const looping = moving.map((m) => m.value).filter((m) => loops(m, declaredMotions));
  return [
    ...(film && moving.length ? [{ id: "motion", label: "Moving", type: "choice" as const, choices: moving, default: moving[0].value, section: "motion" as const }] : []),
    ...(film && looping.length
      ? [{ id: "mode", label: "Once or Loop", type: "choice" as const, choices: ONCE_LOOP, default: "once", section: "motion" as const, when: { id: "motion", in: looping } }]
      : []),
    ...(film
      ? [
          {
            id: "seconds",
            label: "Length",
            type: "number" as const,
            default: Math.max(8, length.shortest),
            min: length.shortest,
            max: Math.max(LONGEST, length.shortest),
            step: 1,
            unit: "s",
            section: "motion" as const,
            ...(lengthNote(length) ? { note: lengthNote(length) } : {}),
          },
          { id: "fps", label: "Frames a second", type: "choice" as const, choices: ["24", "30", "60"].map((v) => ({ value: v, label: v })), default: "30", section: "motion" as const },
        ]
      : []),
    { id: "width", label: "Width", type: "number", default: film ? 1920 : 2400, min: 16, max: film ? 3840 : 8192, step: film ? 16 : 100, unit: "px", section: "render" },
    { id: "shape", label: "Shape", type: "choice", choices: SHAPES, default: film ? "16:9" : "fit", section: "render" },
    { id: "look", label: "Look", type: "choice", choices, default: choices[0]?.value ?? "meno", section: "look" },
    { id: "molecules", label: "Molecules made of", type: "choice", choices: MOLECULES, default: "meno", group: adjust, section: "look" },
    ...(surfaces ? [{ id: "surfaces", label: "Surfaces made of", type: "choice" as const, choices: SURFACES, default: "meno", group: adjust, section: "look" as const }] : []),
    ...(seeThrough.length ? [{ id: "sticks", label: "Sticks inside the balls", type: "choice" as const, choices: STICKS, default: "shown", group: adjust, section: "look" as const, when: { id: "look", in: seeThrough } }] : []),
    { id: "shading", label: "Shading", type: "choice", choices: SHADINGS, default: "lit", group: adjust, section: "look" },
    { id: "band", label: "Size of the lit band", type: "number", default: 0.5, min: 0.05, max: 1, step: 0.05, group: adjust, section: "look", when: { id: "shading", in: ["toon"] } },
    { id: "outlines", label: "Outlines", type: "choice", choices: OUTLINES, default: "none", group: adjust, section: "look" },
    { id: "outline", label: "Outline width", type: "number", default: 3, min: 0.5, max: 20, step: 0.5, unit: "px", group: adjust, section: "look", when: { id: "outlines", in: ["outer", "mixed"] } },
    { id: "outline_colour", label: "Outline colour", type: "choice", choices: OUTLINE_COLOURS, default: "black", group: adjust, section: "look", when: { id: "outlines", in: ["thin", "outer", "mixed"] } },
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
  // (a look of Meno's own is its parts alone, which the renderer is asked for: it is told the canvas's, not the name)
  return { look: MENO_LOOK_IDS.has(g.look) ? CANVAS_LOOK.id : g.look, shading: g.shading, outlines: g.outlines, outline: g.outline, outline_colour: g.outlineColour, band: g.band };
}

/** A film's motion as an entry says it to the renderer: a motion it declares, by id, which it makes itself, and Once or Loop; none for Meno's own, keyed into the scene. */
export function motionEntry(ask: Pick<RenderAsk, "kind" | "motion" | "mode">): { motion?: string; mode?: "once" | "loop" } {
  return ask.kind === "film" && ask.motion && !(MENO_MOTIONS as readonly string[]).includes(ask.motion) ? { motion: ask.motion, mode: ask.mode ?? "once" } : {};
}

/** What a render is asked to make, from Render's own choices. */
export function askOf(kind: Kind, v: OptionValues): RenderAsk {
  return {
    kind,
    width: Number(v.width),
    shape: v.shape as Shape,
    ...(kind === "film" ? { motion: v.motion as Motion, mode: v.mode === "loop" ? ("loop" as const) : ("once" as const), seconds: Number(v.seconds), fps: Number(v.fps) } : {}),
    molecules: (v.molecules as MoleculeMaterial) ?? "meno",
    surfaces: (v.surfaces as SurfaceMaterial) ?? "meno",
    finish: finishOf(v),
  };
}
