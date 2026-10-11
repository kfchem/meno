/**
 * How molecules in 3D are drawn: a list of styles - each its atoms and
 * bonds and their finish - of which one is the primary, the look every
 * molecule has to begin with, and one the secondary, a step away from it
 * (docs/WORKSPACE.md, *Styles in 3D*); and what all of them share, the
 * light molecules are seen in and how they turn. Held as data, as the 2D
 * drawing style is (./style), so that it can be set the same way; the
 * primary's defaults are the 3D viewer's look.
 */
import { getColor, getVdwRadius } from "../../utils/atomUtils";
import { chainRuns, ribbonAtoms, type Biopolymer } from "./biopolymer";

/** One style of the list: how it draws a molecule's atoms and bonds, and their finish. */
export type MoleculeLook = {
  /** Balls and sticks, or space-filling: each atom at its van der Waals radius. */
  atoms: "balls" | "space";
  /** A ball's radius, as a fraction of its atom's van der Waals radius. */
  ballScale: number;
  /** A bond's radius, in ångströms. */
  bondRadius: number;
  bondColor: string;
  /** The surface: from matt (1) to glossy (0), and how metallic. */
  roughness: number;
  metalness: number;
  /**
   * The hydrogens on carbon, shown or left out. Left out, the picture is
   * wrong - smaller and more open than the molecule - so it is never so
   * unless the chemist has said, past a warning, that they know it
   * (the maintainer, 2026-10-10: for pictures, never for research).
   */
  hydrogens: "shown" | "carbonHidden";
  /**
   * A PDB entry's chains - proteins, nucleic acids - as ribbons, what is
   * bound to them drawn as atoms; or every atom (docs/WORKSPACE.md, *Ribbons*).
   */
  biopolymers: "ribbons" | "atoms";
};

/** What every style shares: the light molecules are seen in, how they turn, a surface's colours, and how smooth they are drawn. */
export type Scene3D = {
  /** The light from all round, and the light from above right, in front. */
  ambientLight: number;
  keyLight: number;
  /** How far a drag across half the canvas turns a molecule, in radians. */
  turnPerHalfWidth: number;
  /** How much of its speed a turn left to itself loses each sixtieth of a second. */
  turnDamping: number;
  /** How smooth a ball and a bond are: the segments round them. */
  ballSegments: number;
  bondSegments: number;
  /** A surface's colours (an orbital's, a density's): an orbital's positive phase - a density's one - and its negative one. */
  surfacePlus: string;
  surfaceMinus: string;
  /** A ribbon's colours: by its helices and strands, by its chain, or along its sequence from start to end. */
  ribbonColours: "structure" | "chain" | "sequence";
};

/** Which of its two styles a molecule is drawn in. */
export type Role3D = "primary" | "secondary";

/** The 3D style in force: the primary and the secondary looks, and what they share. */
export type Style3D = Scene3D & Record<Role3D, MoleculeLook>;

/** The 3D viewer's look: Meno's ball and stick. */
export const BALL_AND_STICK: MoleculeLook = {
  atoms: "balls",
  ballScale: 0.2,
  bondRadius: 0.1,
  bondColor: "#000000",
  roughness: 1,
  metalness: 0,
  hydrogens: "shown",
  biopolymers: "ribbons",
};

/** What the styles share, as the 3D viewer had it. */
export const SCENE_3D: Scene3D = {
  ambientLight: 0.9,
  keyLight: 1,
  turnPerHalfWidth: 3,
  turnDamping: 0.1,
  ballSegments: 32,
  bondSegments: 8,
  // (a muted blue and orange: the maintainer's, 2026-10-05)
  surfacePlus: "#4f7cc4",
  surfaceMinus: "#d98a4b",
  ribbonColours: "structure",
};

/** Where the key light comes from, as seen: above right, in front. */
export const KEY_LIGHT_FROM: readonly [number, number, number] = [5, 5, 5];

// --- The styles ---------------------------------------------------------------

export type Look3DPreset = { id: string; name: string; description: string; look: MoleculeLook };

/** The styles a primary and a secondary are chosen from: Meno's own ball and stick first. */
export const LOOK_3D_PRESETS: Look3DPreset[] = [
  {
    id: "balls",
    name: "Ball and stick",
    description: "Matt balls a fifth of each atom's van der Waals size, and thin black bonds.",
    look: BALL_AND_STICK,
  },
  {
    id: "glossy",
    name: "Glossy",
    description: "Shiny balls and grey bonds.",
    look: { ...BALL_AND_STICK, roughness: 0.25, metalness: 0.1, bondColor: "#6b7280" },
  },
  {
    id: "space",
    name: "Space-filling",
    description: "Each atom as large as its van der Waals radius: the molecule's surface.",
    // (a protein space-filling, every atom: its surface, its pockets)
    look: { ...BALL_AND_STICK, atoms: "space", biopolymers: "atoms" },
  },
];

/** The style with this id, or the first, Meno's own. */
export function look3dPreset(id: string | undefined): Look3DPreset {
  return LOOK_3D_PRESETS.find((p) => p.id === id) ?? LOOK_3D_PRESETS[0];
}

/** The 3D style as someone chose it: which style each role is, what was changed of each style, and of what they share. */
export type Style3DChoice = {
  primary: string;
  secondary: string;
  /** Each style's changes, by its id. */
  looks: Record<string, Partial<MoleculeLook>>;
  shared: Partial<Scene3D>;
};

/** Ball and stick first, space-filling a step away (the maintainer, 2026-10-10: a thin look and a thick one, side by side). */
export const DEFAULT_STYLE_3D_CHOICE: Style3DChoice = { primary: "balls", secondary: "space", looks: {}, shared: {} };

/** A style of the list, with what was changed of it. */
export function lookOfStyle(choice: Style3DChoice, id: string): MoleculeLook {
  return { ...look3dPreset(id).look, ...choice.looks[id] };
}

/** The look a choice comes to. */
export function style3dOf(choice: Style3DChoice): Style3D {
  return { ...SCENE_3D, ...choice.shared, primary: lookOfStyle(choice, choice.primary), secondary: lookOfStyle(choice, choice.secondary) };
}

/** The 3D viewer's look, Meno's: what a molecule drawn with no settings to go by is drawn in. */
export const STYLE_3D: Style3D = style3dOf(DEFAULT_STYLE_3D_CHOICE);

/** A choice with one of a style's settings changed - or, set back to its preset's value, no longer changed. */
export function withLookSetting<K extends keyof MoleculeLook>(choice: Style3DChoice, id: string, key: K, value: MoleculeLook[K]): Style3DChoice {
  const { [key]: _was, ...rest } = choice.looks[id] ?? {};
  const same = look3dPreset(id).look[key] === value;
  const changes = same ? rest : { ...rest, [key]: value };
  const { [id]: _old, ...others } = choice.looks;
  return { ...choice, looks: Object.keys(changes).length ? { ...others, [id]: changes } : others };
}

/** A choice with one shared setting changed - or, set back to Meno's value, no longer changed. */
export function withSharedSetting<K extends keyof Scene3D>(choice: Style3DChoice, key: K, value: Scene3D[K]): Style3DChoice {
  const { [key]: _was, ...rest } = choice.shared;
  return { ...choice, shared: SCENE_3D[key] === value ? rest : { ...rest, [key]: value } };
}

/**
 * A choice with a style given a role. Given the other role's style, the two
 * change places: a molecule switched to its secondary always looks other
 * than it did.
 */
export function withRole(choice: Style3DChoice, role: Role3D, id: string): Style3DChoice {
  const other: Role3D = role === "primary" ? "secondary" : "primary";
  if (choice[role] === id) return choice;
  return { ...choice, [role]: id, ...(choice[other] === id ? { [other]: choice[role] } : {}) };
}

// --- Drawing ------------------------------------------------------------------

const vdw = new Map<string, number>();
const colour = new Map<string, string>();

/** An atom's radius as a look draws it, in ångströms. */
export function atomRadius(el: string, look: MoleculeLook): number {
  if (!vdw.has(el)) vdw.set(el, getVdwRadius(el));
  return vdw.get(el)! * (look.atoms === "space" ? 1 : look.ballScale);
}

/** A bond's radius as a look draws it, in ångströms: none, space-filling - the atoms cover it. */
export function bondRadiusOf(look: MoleculeLook): number {
  return look.atoms === "space" ? 0 : look.bondRadius;
}

/** An atom's colour, by its element (an unknown one grey). */
export function atomColour(el: string): string {
  if (!colour.has(el)) colour.set(el, getColor(el));
  return colour.get(el)!;
}

/** A molecule as what it leaves out is worked out from: its atoms (where they stand, for a biopolymer's chains), bonds and biopolymer. */
type Leaving = { atoms: readonly { el: string }[]; bonds: readonly { a1: number; a2: number }[]; biopolymer?: Biopolymer };

/** Each hydrogen bonded to a carbon. */
function carbonHydrogens(m: Leaving): Uint8Array {
  const out = new Uint8Array(m.atoms.length);
  for (const b of m.bonds) {
    const a = m.atoms[b.a1]?.el;
    const c = m.atoms[b.a2]?.el;
    if (a === "H" && c === "C") out[b.a1] = 1;
    if (c === "H" && a === "C") out[b.a2] = 1;
  }
  return out;
}

/** The atoms a look draws as ribbons, not as atoms (lib/chem/biopolymer `ribbonAtoms`): none, where it draws atoms or the molecule is no biopolymer. */
function inRibbons(m: Leaving, look: MoleculeLook): Uint8Array | null {
  if (look.biopolymers !== "ribbons" || !m.biopolymer) return null;
  return ribbonAtoms(m.biopolymer, m.atoms as readonly { el: string; x: number; y: number; z: number }[]);
}

/** Whether a look draws a molecule's chains as ribbons: it says so, and the molecule has chains to draw. */
export function ribbonsOf(m: Leaving, look: MoleculeLook): boolean {
  return look.biopolymers === "ribbons" && !!m.biopolymer && chainRuns(m.biopolymer, m.atoms as readonly { el: string; x: number; y: number; z: number }[]).length > 0;
}

/**
 * Which atoms a look leaves out: those its ribbons stand for, where it
 * draws a biopolymer's chains as ribbons; and, with the hydrogens on
 * carbon hidden, each hydrogen bonded to a carbon (one on a heteroatom,
 * which takes part in hydrogen bonds and in reactions, stays).
 */
export function hiddenAtoms(m: Leaving, look: MoleculeLook): Uint8Array {
  const hidden = inRibbons(m, look) ?? new Uint8Array(m.atoms.length);
  if (look.hydrogens === "carbonHidden") {
    const ch = carbonHydrogens(m);
    for (let i = 0; i < ch.length; i++) if (ch[i]) hidden[i] = 1;
  }
  return hidden;
}

/** Whether a look leaves out hydrogens on carbon that it would otherwise draw: what a molecule says of itself (`HIDDEN_MARK`). */
export function hidesCarbonHydrogens(m: Leaving, look: MoleculeLook): boolean {
  if (look.hydrogens !== "carbonHidden") return false;
  const ribbons = inRibbons(m, look);
  const ch = carbonHydrogens(m);
  for (let i = 0; i < ch.length; i++) if (ch[i] && !ribbons?.[i]) return true;
  return false;
}

/** What a molecule drawn without the hydrogens on its carbons says of itself, on the canvas and in a picture of it. */
export const HIDDEN_MARK = "C\u2013H hidden";
/** The colour it is said in: Meno's accent, as a warning is. */
export const HIDDEN_MARK_COLOUR = "#cd4560";

// --- The settings, as they are shown ------------------------------------------

export type Style3DField<K extends string = string> = { key: K; group: string; label: string; description: string } & (
  | { kind: "choice"; options: { value: string; label: string }[] }
  | {
      kind: "number";
      min: number;
      max: number;
      step: number;
      /** Shown as the value times this, in `unit`, to `digits` places; or between two words, `ends`. */
      scale?: number;
      unit?: string;
      digits?: number;
      ends?: [string, string];
    }
  | { kind: "colour" }
);

/** A style's settings: each style of the list has its own. */
export const LOOK_3D_FIELDS: Style3DField<keyof MoleculeLook>[] = [
  {
    key: "atoms",
    group: "Atoms and bonds",
    label: "Atoms",
    description: "Balls joined by sticks, or each atom as large as it is.",
    kind: "choice",
    options: [
      { value: "balls", label: "Ball and stick" },
      { value: "space", label: "Space-filling" },
    ],
  },
  {
    key: "ballScale",
    group: "Atoms and bonds",
    label: "Ball size",
    description: "In ball and stick, each atom's ball, as a share of its van der Waals radius.",
    kind: "number",
    min: 0.1,
    max: 0.6,
    step: 0.01,
    scale: 100,
    unit: "%",
    digits: 0,
  },
  {
    key: "bondRadius",
    group: "Atoms and bonds",
    label: "Bond thickness",
    description: "A single bond's radius. A double or triple bond is two or three thinner lines side by side.",
    kind: "number",
    min: 0.03,
    max: 0.3,
    step: 0.01,
    unit: "Å",
    digits: 2,
  },
  { key: "bondColor", group: "Atoms and bonds", label: "Bond colour", description: "The sticks between the balls.", kind: "colour" },
  {
    key: "hydrogens",
    group: "Atoms and bonds",
    label: "Hydrogens on carbon",
    description: "Hidden, the molecule looks smaller and more open than it is: for decoration only.",
    kind: "choice",
    options: [
      { value: "shown", label: "Shown" },
      { value: "carbonHidden", label: "Hidden" },
    ],
  },
  {
    key: "biopolymers",
    group: "Proteins and nucleic acids",
    label: "Chains",
    description: "A PDB entry's chains as ribbons, what is bound to them as atoms - or every atom.",
    kind: "choice",
    options: [
      { value: "ribbons", label: "Ribbons" },
      { value: "atoms", label: "Atoms" },
    ],
  },
  {
    key: "roughness",
    group: "Surface",
    label: "Surface",
    description: "How the light shows on the balls and sticks.",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.05,
    ends: ["Glossy", "Matt"],
  },
  {
    key: "metalness",
    group: "Surface",
    label: "Metallic",
    description: "How much the surface reflects as a metal does.",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.05,
    ends: ["Not at all", "Fully"],
  },
];

/** What every style shares. */
export const SCENE_3D_FIELDS: Style3DField<keyof Scene3D>[] = [
  {
    key: "ambientLight",
    group: "Light",
    label: "Light from all round",
    description: "Lights every side alike: more of it, and the shading is fainter.",
    kind: "number",
    min: 0,
    max: 2,
    step: 0.05,
    digits: 2,
  },
  {
    key: "keyLight",
    group: "Light",
    label: "Light from above right",
    description: "Lights the molecule from above right, in front: what shades it.",
    kind: "number",
    min: 0,
    max: 3,
    step: 0.05,
    digits: 2,
  },
  {
    key: "surfacePlus",
    group: "Orbitals and densities",
    label: "Positive phase",
    description: "An orbital's surface where its values are positive, and a density's surface.",
    kind: "colour",
  },
  {
    key: "surfaceMinus",
    group: "Orbitals and densities",
    label: "Negative phase",
    description: "An orbital's surface where its values are negative.",
    kind: "colour",
  },
  {
    key: "ribbonColours",
    group: "Ribbons",
    label: "Coloured by",
    description: "Helices and strands, each chain, or along the chain from start to end.",
    kind: "choice",
    options: [
      { value: "structure", label: "Structure" },
      { value: "chain", label: "Chain" },
      { value: "sequence", label: "Sequence" },
    ],
  },
  {
    key: "turnPerHalfWidth",
    group: "Turning",
    label: "Turning speed",
    description: "How far a drag across half the canvas turns a molecule.",
    kind: "number",
    min: 1,
    max: 6,
    step: 0.1,
    scale: 180 / Math.PI,
    unit: "°",
    digits: 0,
  },
  {
    key: "turnDamping",
    group: "Turning",
    label: "Let go while turning",
    description: "A molecule let go while it is being turned turns on, slowing to a stop.",
    kind: "number",
    min: 0.02,
    max: 1,
    step: 0.01,
    ends: ["Turns on long", "Stops at once"],
  },
];

/** The settings of `raw` that `fields` read, each within its bounds. */
function acceptFields(raw: unknown, fields: readonly Style3DField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = fields.find((f) => f.key === key);
    if (!field) continue;
    if (field.kind === "choice" && field.options.some((o) => o.value === value)) out[key] = value;
    else if (field.kind === "colour" && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) out[key] = value.toLowerCase();
    else if (field.kind === "number" && typeof value === "number" && Number.isFinite(value) && value >= field.min && value <= field.max)
      out[key] = value;
  }
  return out;
}

/** A 3D style as the settings file holds it: what does not read is left as its preset has it. */
export function acceptStyle3dChoice(raw: unknown): Style3DChoice {
  if (typeof raw !== "object" || raw === null) return DEFAULT_STYLE_3D_CHOICE;
  const r = raw as Record<string, unknown>;
  const known = (id: unknown) => LOOK_3D_PRESETS.some((p) => p.id === id);
  let primary = known(r.primary) ? (r.primary as string) : DEFAULT_STYLE_3D_CHOICE.primary;
  let secondary = known(r.secondary) ? (r.secondary as string) : DEFAULT_STYLE_3D_CHOICE.secondary;
  // (never the same style twice: the secondary would not be a second look)
  if (primary === secondary) [primary, secondary] = [DEFAULT_STYLE_3D_CHOICE.primary, DEFAULT_STYLE_3D_CHOICE.secondary];
  const looks: Record<string, Partial<MoleculeLook>> = {};
  if (typeof r.looks === "object" && r.looks !== null) {
    for (const [id, changes] of Object.entries(r.looks as Record<string, unknown>)) {
      if (!known(id)) continue;
      const read = acceptFields(changes, LOOK_3D_FIELDS);
      if (Object.keys(read).length) looks[id] = read as Partial<MoleculeLook>;
    }
  }
  return { primary, secondary, looks, shared: acceptFields(r.shared, SCENE_3D_FIELDS) as Partial<Scene3D> };
}
