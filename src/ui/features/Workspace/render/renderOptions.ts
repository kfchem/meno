/**
 * Render's own choices (docs/RENDER.md), Meno's whoever renders - drawn by
 * the Render card (./RenderCard) in the general form of options
 * (lib/options) - and what a render is asked to make of them.
 */
import type { Option, OptionValues } from "../../../../lib/options";
import type { Motion, MoleculeMaterial, RenderAsk, Shape, SurfaceMaterial } from "./renderScene";

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
];
const SURFACES: { value: SurfaceMaterial; label: string }[] = [
  { value: "meno", label: "As the canvas draws them" },
  { value: "glass", label: "Glass" },
  { value: "glossy", label: "Glossy" },
  { value: "matte", label: "Matte" },
];

/** Render's own choices, Meno's whoever renders: a picture's or a film's size and shape, a film's motion, length and rate, and what the molecules and surfaces are made of. */
export function renderOptions(kind: Kind, motions: readonly Motion[], surfaces: boolean): Option[] {
  const film = kind === "film";
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
    { id: "molecules", label: "Molecules made of", type: "choice", choices: MOLECULES, default: "meno" },
    ...(surfaces ? [{ id: "surfaces", label: "Surfaces made of", type: "choice" as const, choices: SURFACES, default: "meno" }] : []),
  ];
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
  };
}
