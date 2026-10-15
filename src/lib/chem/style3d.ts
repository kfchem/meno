/**
 * How molecules in 3D are drawn: a list of styles - each its atoms and
 * bonds and their finish - of which one is the primary, the look every
 * molecule has to begin with, and one the secondary, a step away from it
 * (docs/WORKSPACE.md, *Styles in 3D*); and what all of them share, the
 * light molecules are seen in and how they turn. Held as data, as the 2D
 * drawing style is (./style), so that it can be set the same way; the
 * primary's defaults are the 3D viewer's look.
 */
import { elementColour, elementOf, vdwRadius } from "./elements";
import { chainRuns, ribbonAtoms, type Biopolymer } from "./biopolymer";
import { isOwnStyleId, newOwnStyleId } from "./style";

/** One style of the list: how it draws a molecule's atoms and bonds, and their finish. */
export type MoleculeLook = {
  /** Balls and sticks; sticks alone, each atom a ball as thick as a stick (licorice); or space-filling, each atom at its van der Waals radius. */
  atoms: "balls" | "sticks" | "space";
  /** A ball's radius, as a fraction of its atom's van der Waals radius. */
  ballScale: number;
  /** A bond's radius, in ångströms. */
  bondRadius: number;
  bondColor: string;
  /** The surface: from matt (1) to glossy (0), and how metallic. */
  roughness: number;
  metalness: number;
  /**
   * How the hollows are shaded - where atoms crowd round, less of the light
   * from all round reaches: not at all; per atom, worked out once for each
   * shape a molecule takes, never as it turns (Workspace/utils/occlusion3d);
   * or on the screen, as it is seen, molecules shading one another too
   * (Workspace/utils/screenShade, three.js's GTAO). Meno's own: a picture
   * rendered elsewhere finds its own.
   */
  occlusionBy: "none" | "atoms" | "screen";
  /** And how deep: from faint (0.1) to all of it (1). */
  occlusion: number;
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
  /**
   * A thin line round every ball and every stick, in ångströms - growing
   * and shrinking with the molecule as it is zoomed, never thinner on the
   * screen than `LINE_LEAST_PX` - none at 0; and its colour.
   */
  outline: number;
  outlineColor: string;
  /**
   * How far what lies further back in a molecule fades toward the page,
   * from none (0) to strong (1), so that its front reads first (`fadeAt`).
   */
  depthFade: number;
  /** The sticks in one colour (`bondColor`), or each half in its atom's colour. */
  bondColouring: "single" | "byAtom";
  /**
   * How a double bond's lines, and a triple bond's, end at an atom nothing
   * else joins, where its ball is drawn smaller than they reach - in
   * practice, sticks alone (`BondEnds`).
   */
  doubleEnds: BondEnds;
  tripleEnds: BondEnds;
  /** A double or triple bond as two or three thinner lines side by side, or as one stick, as thick as a single bond's (the maintainer, 2026-10-15). */
  multipleBonds: "lines" | "one";
  /**
   * Lines on the balls: great circles about the molecule's own axes - two
   * or three, crossing as a globe's equator and meridians do, turning with
   * it - on every atom's ball, every one's but hydrogen's, or carbon's
   * alone; in ångströms wide, as the outline is (`lineWidth`), and in a
   * colour.
   */
  ballLines: "none" | "two" | "three";
  ballLinesOn: "all" | "heavy" | "carbon";
  ballLinesWidth: number;
  ballLinesColor: string;
  /** The set of element colours it draws its atoms in (`COLOUR_SETS_3D`, by id). */
  colourSet: string;
  /** Colours of its own, by element (#rrggbb), over the set's (`atomColour`). */
  colours: Readonly<Record<string, string>>;
};

/**
 * How a multiple bond's lines end at a lone atom drawn smaller than they
 * reach: "plain", side by side to its centre; "curve", side by side, then
 * turning round there as one tube, a half circle - a triple bond's middle
 * one running straight in - as thick throughout, no ball; "joint", its ball as large as takes all their ends in; "main", one
 * full stick on the bond's axis, the others thinner beside it and short of
 * both atoms; "fork", each from where it stands at the other atom straight
 * to its centre.
 */
export type BondEnds = "plain" | "curve" | "joint" | "main" | "fork";

/** What every style shares: the light molecules are seen in, how they turn, a surface's colours, and how smooth they are drawn. */
export type Scene3D = {
  /** The light from all round, and the light from above right, in front. */
  ambientLight: number;
  keyLight: number;
  /**
   * How dark the shadows the light from above right casts are, from none
   * (0) to as dark as the light from all round leaves them (1): a
   * molecule's on itself and on another, never on the page. Meno's own, as
   * the hollows' shade is.
   */
  shadows: number;
  /**
   * With very many atoms on the canvas: "lighter" - no shadows, and hollows
   * shaded per atom where a style shades them on the screen, so that
   * turning stays smooth (a picture keeps them as set) - or "asSet".
   */
  largeDrawings: "lighter" | "asSet";
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
  occlusionBy: "atoms",
  occlusion: 0.6,
  hydrogens: "shown",
  biopolymers: "ribbons",
  outline: 0,
  outlineColor: "#1c1c1c",
  depthFade: 0,
  bondColouring: "single",
  doubleEnds: "plain",
  tripleEnds: "plain",
  multipleBonds: "lines",
  ballLines: "none",
  ballLinesOn: "all",
  ballLinesWidth: 0.01,
  ballLinesColor: "#1c1c1c",
  colourSet: "jmol",
  colours: {},
};

/**
 * The Bright set's colours, where they are not Jmol's: carbon a mid grey,
 * hydrogen white, oxygen a bright red, sulfur yellow, fluorine and
 * chlorine light green, the alkali metals lavender.
 */
const BRIGHT_COLOURS: Readonly<Record<string, string>> = {
  C: "#a6a6a6",
  H: "#ffffff",
  N: "#3a62d8",
  O: "#ff1f1f",
  S: "#efe02a",
  F: "#8de06a",
  Cl: "#6cd65a",
  Li: "#c6a8ee",
  Na: "#c6a8ee",
  K: "#c6a8ee",
  Rb: "#c6a8ee",
  Cs: "#c6a8ee",
};

/** What the styles share, as the 3D viewer had it. */
export const SCENE_3D: Scene3D = {
  ambientLight: 0.9,
  keyLight: 1,
  shadows: 0.4,
  largeDrawings: "lighter",
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
    look: { ...BALL_AND_STICK, ballScale: 0.18, roughness: 0.25, metalness: 0.1, bondColor: "#6b7280" },
  },
  {
    id: "outlined",
    name: "Outlined",
    description: "Glossy balls and thin near-black sticks, each drawn round with a dark line; what lies further back fades toward the page.",
    look: {
      ...BALL_AND_STICK,
      ballScale: 0.15,
      bondRadius: 0.07,
      bondColor: "#2a2a2a",
      roughness: 0.3,
      metalness: 0.05,
      occlusion: 0.35,
      outline: 0.015,
      outlineColor: "#161616",
      depthFade: 0.5,
      // (the circles on the balls offered, not drawn: the maintainer, 2026-10-15)
      ballLines: "none",
      ballLinesOn: "all",
      ballLinesWidth: 0.01,
      ballLinesColor: "#161616",
      colourSet: "bright",
      multipleBonds: "one",
    },
  },
  {
    id: "print",
    name: "Print",
    description: "Matt balls in greys, black sticks and a dark line round each, the back fading: for figures printed in black and white.",
    look: {
      ...BALL_AND_STICK,
      ballScale: 0.18,
      bondRadius: 0.08,
      bondColor: "#141414",
      roughness: 0.85,
      occlusion: 0.5,
      outline: 0.02,
      outlineColor: "#000000",
      depthFade: 0.45,
      colourSet: "greys",
    },
  },
  {
    id: "pastel",
    name: "Pastel",
    description: "Soft matt balls in pale colours and light grey sticks, the hollows gently shaded.",
    look: { ...BALL_AND_STICK, ballScale: 0.18, bondRadius: 0.09, bondColor: "#b4b4b4", roughness: 1, occlusion: 0.45, colourSet: "pastel" },
  },
  {
    id: "modelKit",
    name: "Model kit",
    description: "Glossy plastic balls and thick sticks, each half in its atom's colour.",
    look: { ...BALL_AND_STICK, ballScale: 0.18, bondRadius: 0.14, bondColouring: "byAtom", roughness: 0.18, metalness: 0, occlusion: 0.4, colourSet: "bright" },
  },
  {
    id: "licorice",
    name: "Sticks",
    description: "Sticks alone, as thick as they are round each atom, each half in its atom's colour; a double or triple bond's curving in to a lone atom.",
    look: { ...BALL_AND_STICK, atoms: "sticks", bondRadius: 0.16, bondColouring: "byAtom", roughness: 0.45, metalness: 0, occlusion: 0.5, doubleEnds: "curve", tripleEnds: "curve" },
  },
  {
    id: "space",
    name: "Space-filling",
    description: "Each atom as large as its van der Waals radius: the molecule's surface.",
    // (a protein space-filling, every atom: its surface, its pockets -
    // its hollows the deepest, and the most telling of its shape)
    look: { ...BALL_AND_STICK, atoms: "space", biopolymers: "atoms", occlusion: 0.8 },
  },
];

/** The style with this id, or the first, Meno's own. */
export function look3dPreset(id: string | undefined): Look3DPreset {
  return LOOK_3D_PRESETS.find((p) => p.id === id) ?? LOOK_3D_PRESETS[0];
}

/** A style of the user's own: made by duplicating another, named, and set as a whole - kept in the app's settings, not in a workspace. */
export type Own3D = { id: string; name: string; look: MoleculeLook };

/**
 * The 3D style as someone chose it: which style each role is, what was
 * changed of each built-in style, the user's own styles, and what they all
 * share.
 */
export type Style3DChoice = {
  primary: string;
  secondary: string;
  /** Each built-in style's changes, by its id. */
  looks: Record<string, Partial<MoleculeLook>>;
  shared: Partial<Scene3D>;
  /** The user's own styles, in the order they were made. */
  own: Own3D[];
};

/** Ball and stick first, space-filling a step away (the maintainer, 2026-10-10: a thin look and a thick one, side by side). */
export const DEFAULT_STYLE_3D_CHOICE: Style3DChoice = { primary: "balls", secondary: "space", looks: {}, shared: {}, own: [] };

/** One of the user's own styles, by its id; none where it is not one. */
export function ownStyle3d(choice: Style3DChoice, id: string): Own3D | undefined {
  return choice.own.find((o) => o.id === id);
}

/** A style of the list, the built-in ones' and the user's own: its id, name and description, and whether it is the user's. */
export type Listed3D = { id: string; name: string; description: string; own: boolean };

/** Every style, the built-in ones first, then the user's own in the order they were made. */
export function styles3d(choice: Style3DChoice): Listed3D[] {
  return [
    ...LOOK_3D_PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description, own: false })),
    ...choice.own.map((o) => ({ id: o.id, name: o.name, description: "", own: true })),
  ];
}

/** A style's name: the user's own's, or a built-in one's (Meno's own, for an id that is neither). */
export function styleName3d(choice: Style3DChoice, id: string): string {
  return ownStyle3d(choice, id)?.name ?? look3dPreset(id).name;
}

/** A style of the list as it is set: a built-in one with what was changed of it - its atoms' colours over its preset's - or the user's own. */
export function lookOfStyle(choice: Style3DChoice, id: string): MoleculeLook {
  const own = ownStyle3d(choice, id);
  if (own) return own.look;
  const preset = look3dPreset(id).look;
  const changes = choice.looks[id];
  return { ...preset, ...changes, colours: { ...preset.colours, ...changes?.colours } };
}

/** The look a choice comes to. */
export function style3dOf(choice: Style3DChoice): Style3D {
  return { ...SCENE_3D, ...choice.shared, primary: lookOfStyle(choice, choice.primary), secondary: lookOfStyle(choice, choice.secondary) };
}

/** The 3D viewer's look, Meno's: what a molecule drawn with no settings to go by is drawn in. */
export const STYLE_3D: Style3D = style3dOf(DEFAULT_STYLE_3D_CHOICE);

/** A choice with one of a style's settings changed - a built-in one's, set back to its preset's value, no longer changed; the user's own, set. */
export function withLookSetting<K extends keyof MoleculeLook>(choice: Style3DChoice, id: string, key: K, value: MoleculeLook[K]): Style3DChoice {
  if (ownStyle3d(choice, id)) return withOwnLook(choice, id, (look) => ({ ...look, [key]: value }));
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
  if (!vdw.has(el)) vdw.set(el, vdwRadius(el));
  if (look.atoms === "sticks") return look.bondRadius;
  return vdw.get(el)! * (look.atoms === "space" ? 1 : look.ballScale);
}

/** A bond's radius as a look draws it, in ångströms: none, space-filling - the atoms cover it. */
export function bondRadiusOf(look: MoleculeLook): number {
  return look.atoms === "space" ? 0 : look.bondRadius;
}

/** A set of element colours a style draws its atoms in: its id, its name and what it is, and each element's colour. */
export type ColourSet3D = { id: string; name: string; description: string; colour: (el: string) => string };

/** An element's colour in Jmol's set: elements.ts's (an unknown element grey). */
function jmolColour(el: string): string {
  if (!colour.has(el)) colour.set(el, elementColour(el));
  return colour.get(el)!;
}

/** A colour taken `share` of the way to white, #rrggbb. */
export function paler(hex: string, share: number): string {
  const v = parseInt(hex.slice(1), 16);
  const to = (c: number) => Math.round(c + (255 - c) * share).toString(16).padStart(2, "0");
  return `#${to((v >> 16) & 255)}${to((v >> 8) & 255)}${to(v & 255)}`;
}

/** A colour as a grey as light as it is (its relative luminance, as sRGB weighs it), #rrggbb. */
export function greyOf(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const y = 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  const g = Math.round(255 * (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055));
  return `#${g.toString(16).padStart(2, "0").repeat(3)}`;
}

/**
 * The sets of element colours a style chooses from: Jmol's, Meno's from
 * its first release; Bright, brighter and plainer; and Greys, each element
 * as light as its Jmol colour, for figures printed in black and white.
 */
export const COLOUR_SETS_3D: readonly ColourSet3D[] = [
  { id: "jmol", name: "Jmol", description: "Jmol's default element colours.", colour: jmolColour },
  {
    id: "bright",
    name: "Bright",
    description: "Carbon a mid grey, oxygen a bright red, sulfur yellow, fluorine and chlorine light green, the alkali metals lavender; the others as Jmol's.",
    colour: (el) => BRIGHT_COLOURS[el] ?? jmolColour(el),
  },
  { id: "greys", name: "Greys", description: "Each element a grey as light as its Jmol colour: for black and white.", colour: (el) => greyOf(jmolColour(el)) },
  { id: "pastel", name: "Pastel", description: "Each element's Jmol colour taken two fifths of the way to white.", colour: (el) => paler(jmolColour(el), 0.4) },
];

/** The colour set with this id, or Jmol's. */
export function colourSet3d(id: string | undefined): ColourSet3D {
  return COLOUR_SETS_3D.find((c) => c.id === id) ?? COLOUR_SETS_3D[0];
}

/** An atom's colour, by its element (an unknown one grey): the look's own where it has one, else its colour set's - Jmol's, given no look. */
export function atomColour(el: string, look?: Pick<MoleculeLook, "colours" | "colourSet">): string {
  return look?.colours[el] ?? colourSet3d(look?.colourSet).colour(el);
}

/** Whether a look draws its lines on an atom's ball (`ballLinesOn`), by its element. */
export function linedBall(el: string, look: Pick<MoleculeLook, "ballLines" | "ballLinesOn">): boolean {
  if (look.ballLines === "none") return false;
  return look.ballLinesOn === "all" || (look.ballLinesOn === "heavy" ? el !== "H" : el === "C");
}

/** How many circles a look draws on a ball: none, two or three. */
export function ballCircles(look: Pick<MoleculeLook, "ballLines">): 0 | 2 | 3 {
  return look.ballLines === "three" ? 3 : look.ballLines === "two" ? 2 : 0;
}

/** The most a style's depth fade takes something at the very back toward the page (`fadeAt`). */
export const FADE_MOST = 0.7;

/** The thinnest a style's line - round the balls and sticks, or on the balls - is drawn on the screen, in pixels, however far out: thinner, it would shimmer away. */
export const LINE_LEAST_PX = 0.5;

/**
 * A line `angstroms` wide, as wide as it is drawn: in the molecule's own
 * units, `perAngstrom` of them to the ångström, but never thinner than
 * `LINE_LEAST_PX` on the screen, where `perPx` of them are a pixel. None
 * at 0.
 */
export function lineWidth(angstroms: number, perAngstrom: number, perPx: number): number {
  return angstroms > 0 ? Math.max(angstroms * perAngstrom, LINE_LEAST_PX * perPx) : 0;
}

/**
 * How far toward the page something is faded at `depth` - 0 at the front
 * of its molecule, 1 at its back, as the screen sees it - by a style's
 * `depthFade` (0 to 1): none at the front, growing toward the back, at
 * most FADE_MOST. The GPU works the same out per pixel (Molecule3DView).
 */
export function fadeAt(depth: number, depthFade: number): number {
  const d = Math.min(1, Math.max(0, depth));
  return FADE_MOST * Math.min(1, Math.max(0, depthFade)) * d * d * (3 - 2 * d);
}

/**
 * A choice with one element's colour in a style set - or, given none or
 * the style's own colour for it, no longer changed: its preset's again.
 */
export function withAtomColour(choice: Style3DChoice, id: string, el: string, value: string | null): Style3DChoice {
  if (ownStyle3d(choice, id))
    return withOwnLook(choice, id, (look) => {
      const { [el]: _was, ...rest } = look.colours;
      const set = colourSet3d(look.colourSet).colour(el);
      return { ...look, colours: value && value.toLowerCase() !== set.toLowerCase() ? { ...rest, [el]: value.toLowerCase() } : rest };
    });
  const preset = look3dPreset(id).look;
  // (what it would be with no colour of the user's own: the preset's own, else the set chosen's)
  const base = atomColour(el, { colours: preset.colours, colourSet: choice.looks[id]?.colourSet ?? preset.colourSet });
  const was = { ...(choice.looks[id]?.colours ?? {}) };
  delete was[el];
  const colours = value && value.toLowerCase() !== base.toLowerCase() ? { ...was, [el]: value.toLowerCase() } : was;
  const { colours: _c, ...rest } = choice.looks[id] ?? {};
  const changes = Object.keys(colours).length ? { ...rest, colours } : rest;
  const { [id]: _old, ...others } = choice.looks;
  return { ...choice, looks: Object.keys(changes).length ? { ...others, [id]: changes } : others };
}

// --- The user's own styles ----------------------------------------------------

/** The longest a style's name may be. */
export const STYLE_NAME_MOST = 60;

/** A choice with one of the user's own styles' look made over. */
function withOwnLook(choice: Style3DChoice, id: string, made: (look: MoleculeLook) => MoleculeLook): Style3DChoice {
  return { ...choice, own: choice.own.map((o) => (o.id === id ? { ...o, look: made(o.look) } : o)) };
}

/** Whether `name` is another style's already - built in or the user's own, but `except` - however it is capitalised. */
export function styleNameTaken3d(choice: Style3DChoice, name: string, except?: string): boolean {
  const n = name.trim().toLowerCase();
  return styles3d(choice).some((s) => s.id !== except && s.name.toLowerCase() === n);
}

/** A copy's name: "<name> copy", or "<name> copy 2", 3 and on where that is taken. */
export function copyName(name: string, taken: (name: string) => boolean): string {
  const base = `${name} copy`.slice(0, STYLE_NAME_MOST);
  for (let n = 1; ; n++) {
    const tried = n === 1 ? base : `${base.slice(0, STYLE_NAME_MOST - String(n).length - 1)} ${n}`;
    if (!taken(tried)) return tried;
  }
}


/** A choice with a style duplicated as one of the user's own - as it is set, its changes with it - named "<name> copy"; and the copy's id. */
export function withDuplicate3d(choice: Style3DChoice, id: string): { choice: Style3DChoice; id: string } {
  const copy: Own3D = {
    id: newOwnStyleId(),
    name: copyName(styleName3d(choice, id), (n) => styleNameTaken3d(choice, n)),
    look: lookOfStyle(choice, id),
  };
  return { choice: { ...choice, own: [...choice.own, copy] }, id: copy.id };
}

/** A choice with a style added as one of the user's own - `name`, made fresh where another style has it - and its id: a style file's, say. */
export function withOwn3d(choice: Style3DChoice, name: string, look: MoleculeLook): { choice: Style3DChoice; id: string } {
  const base = name.trim().slice(0, STYLE_NAME_MOST) || "My style";
  let n = base;
  for (let k = 2; styleNameTaken3d(choice, n); k++) n = `${base.slice(0, STYLE_NAME_MOST - String(k).length - 1)} ${k}`;
  const own: Own3D = { id: newOwnStyleId(), name: n, look };
  return { choice: { ...choice, own: [...choice.own, own] }, id: own.id };
}

/** A choice with one of the user's own styles renamed - as it was, where the name is empty, too long or another style's. */
export function withRenamed3d(choice: Style3DChoice, id: string, name: string): Style3DChoice {
  const n = name.trim();
  if (!ownStyle3d(choice, id) || !n || n.length > STYLE_NAME_MOST || styleNameTaken3d(choice, n, id)) return choice;
  return { ...choice, own: choice.own.map((o) => (o.id === id ? { ...o, name: n } : o)) };
}

/**
 * A choice with one of the user's own styles deleted. A role it had goes to
 * Meno's own style for that role - ball and stick, space-filling - or,
 * where the other role has that, to the first built-in style the other
 * role does not have.
 */
export function withoutStyle3d(choice: Style3DChoice, id: string): Style3DChoice {
  if (!ownStyle3d(choice, id)) return choice;
  const next: Style3DChoice = { ...choice, own: choice.own.filter((o) => o.id !== id) };
  for (const role of ["primary", "secondary"] as const) {
    if (next[role] !== id) continue;
    const other = next[role === "primary" ? "secondary" : "primary"];
    const first = DEFAULT_STYLE_3D_CHOICE[role];
    next[role] = first !== other ? first : LOOK_3D_PRESETS.find((p) => p.id !== other)!.id;
  }
  return next;
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

/**
 * How many atoms a look counts toward a very large drawing (the
 * maintainer's choice, 2026-10-13): those it draws as atoms, and every atom
 * of the residues its ribbons stand for - so that a large protein in
 * ribbons is drawn lighter as its atoms would be - but none it leaves out
 * otherwise: hydrogens on carbon where it hides them, water. `hidden` is
 * the look's `hiddenAtoms`, where it is known already.
 */
export function countedAtoms(m: Leaving, look: MoleculeLook, hidden = hiddenAtoms(m, look)): number {
  const bp = m.biopolymer;
  const inRun = new Uint8Array(bp?.residues.length ?? 0);
  if (bp && look.biopolymers === "ribbons") {
    for (const run of chainRuns(bp, m.atoms as readonly { el: string; x: number; y: number; z: number }[])) for (const r of run.residues) inRun[r] = 1;
  }
  let n = 0;
  for (let i = 0; i < m.atoms.length; i++) if (!hidden[i] || (bp && inRun[bp.residueOf[i]])) n++;
  return n;
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

export type Style3DField<K extends string = string> = {
  key: K;
  group: string;
  label: string;
  description: string;
  /** Set only while another setting of the same style is not this: greyed out, and kept as it is, while it is. */
  unless?: { key: string; is: string };
} & (
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
    description: "Balls joined by sticks, sticks alone, or each atom as large as it is.",
    kind: "choice",
    options: [
      { value: "balls", label: "Ball and stick" },
      { value: "sticks", label: "Sticks" },
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
  {
    key: "colourSet",
    group: "Atoms and bonds",
    label: "Colours",
    description: "The set of element colours the atoms are drawn in; any element can be given its own below.",
    kind: "choice",
    options: COLOUR_SETS_3D.map((c) => ({ value: c.id, label: c.name })),
  },
  {
    key: "bondColouring",
    group: "Atoms and bonds",
    label: "Bonds coloured",
    description: "Each stick in one colour, or each half in the colour of its atom.",
    kind: "choice",
    options: [
      { value: "single", label: "One colour" },
      { value: "byAtom", label: "By atom" },
    ],
  },
  {
    key: "bondColor",
    group: "Atoms and bonds",
    label: "Bond colour",
    description: "The sticks between the balls.",
    kind: "colour",
    unless: { key: "bondColouring", is: "byAtom" },
  },
  {
    key: "multipleBonds",
    group: "Atoms and bonds",
    label: "Multiple bonds",
    description: "A double or triple bond as two or three thinner lines side by side, or as one stick, as thick as a single bond.",
    kind: "choice",
    options: [
      { value: "lines", label: "As two or three lines" },
      { value: "one", label: "As one stick" },
    ],
  },
  ...(["doubleEnds", "tripleEnds"] as const).map(
    (key): Style3DField<keyof MoleculeLook> => ({
      key,
      group: "Atoms and bonds",
      label: key === "doubleEnds" ? "Double bond ends" : "Triple bond ends",
      description: `How a ${key === "doubleEnds" ? "double" : "triple"} bond's sticks end at an atom nothing else joins, where its ball is thinner than they reach.`,
      kind: "choice",
      options: [
        { value: "curve", label: "Curve" },
        { value: "joint", label: "Joint" },
        { value: "main", label: "Main stick" },
        { value: "fork", label: "Fork" },
        { value: "plain", label: "Plain" },
      ],
    }),
  ),
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
  {
    key: "outline",
    group: "Lines",
    label: "Outline",
    description: "A thin line round every ball and every stick, in picometres: it grows and shrinks with the molecule.",
    kind: "number",
    min: 0,
    max: 0.06,
    step: 0.001,
    scale: 100,
    unit: "pm",
    digits: 1,
  },
  { key: "outlineColor", group: "Lines", label: "Outline colour", description: "The line round the balls and sticks.", kind: "colour" },
  {
    key: "ballLines",
    group: "Lines",
    label: "Lines on the balls",
    description: "Circles crossing on each ball, as a globe's equator and meridians, turning with the molecule.",
    kind: "choice",
    options: [
      { value: "none", label: "None" },
      { value: "two", label: "Two" },
      { value: "three", label: "Three" },
    ],
  },
  {
    key: "ballLinesOn",
    group: "Lines",
    label: "On which atoms",
    description: "Every atom's ball, every one's but hydrogen's, or carbon's alone.",
    kind: "choice",
    options: [
      { value: "all", label: "All" },
      { value: "heavy", label: "All but H" },
      { value: "carbon", label: "Carbon" },
    ],
    unless: { key: "ballLines", is: "none" },
  },
  {
    key: "ballLinesWidth",
    group: "Lines",
    label: "Their width",
    description: "In picometres, as the outline is: they grow and shrink with the molecule.",
    kind: "number",
    min: 0.002,
    max: 0.06,
    step: 0.001,
    scale: 100,
    unit: "pm",
    digits: 1,
    unless: { key: "ballLines", is: "none" },
  },
  {
    key: "ballLinesColor",
    group: "Lines",
    label: "Their colour",
    description: "The circles on the balls.",
    kind: "colour",
    unless: { key: "ballLines", is: "none" },
  },
  {
    key: "depthFade",
    group: "Lines",
    label: "Depth fade",
    description: "What lies further back fades toward the page, so that the front reads first.",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.05,
    ends: ["None", "Strong"],
  },
  {
    key: "occlusionBy",
    group: "Surface",
    label: "Shade in hollows",
    description: "Where atoms crowd round, less light reaches: hollows and pockets darker, so the shape reads in depth.",
    kind: "choice",
    options: [
      { value: "none", label: "None" },
      { value: "atoms", label: "Per atom" },
      { value: "screen", label: "Screen-space" },
    ],
  },
  {
    key: "occlusion",
    group: "Surface",
    label: "How deep",
    description: "How much darker the hollows are.",
    kind: "number",
    min: 0.1,
    max: 1,
    step: 0.05,
    ends: ["Faint", "Deep"],
    unless: { key: "occlusionBy", is: "none" },
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
    key: "shadows",
    group: "Light",
    label: "Shadows",
    description: "The shadows the light from above right casts, on the molecule and on those beside it - never on the page.",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.05,
    ends: ["None", "Dark"],
  },
  {
    key: "largeDrawings",
    group: "Light",
    label: "Very large drawings",
    description: "Past twenty thousand atoms on the canvas: no shadows, and hollows shaded per atom, so that turning stays smooth.",
    kind: "choice",
    options: [
      { value: "lighter", label: "Lighter" },
      { value: "asSet", label: "As set" },
    ],
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

/** A style's atoms' colours as the settings file holds them: each a known element's, #rrggbb; what does not read left out. */
function acceptColours(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const [el, value] of Object.entries(raw as Record<string, unknown>)) {
    if (elementOf(el) && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) out[el] = value.toLowerCase();
  }
  return out;
}

/** A 3D style as the settings file holds it: what does not read is left as its preset has it. */
export function acceptStyle3dChoice(raw: unknown): Style3DChoice {
  if (typeof raw !== "object" || raw === null) return DEFAULT_STYLE_3D_CHOICE;
  const r = raw as Record<string, unknown>;
  const own = acceptOwn3d(r.own);
  const builtIn = (id: unknown) => LOOK_3D_PRESETS.some((p) => p.id === id);
  const known = (id: unknown) => builtIn(id) || own.some((o) => o.id === id);
  let primary = known(r.primary) ? (r.primary as string) : DEFAULT_STYLE_3D_CHOICE.primary;
  let secondary = known(r.secondary) ? (r.secondary as string) : DEFAULT_STYLE_3D_CHOICE.secondary;
  // (never the same style twice: the secondary would not be a second look)
  if (primary === secondary) [primary, secondary] = [DEFAULT_STYLE_3D_CHOICE.primary, DEFAULT_STYLE_3D_CHOICE.secondary];
  const looks: Record<string, Partial<MoleculeLook>> = {};
  if (typeof r.looks === "object" && r.looks !== null) {
    for (const [id, changes] of Object.entries(r.looks as Record<string, unknown>)) {
      if (!builtIn(id)) continue;
      const read = acceptFields(changes, LOOK_3D_FIELDS);
      const colours = acceptColours((changes as { colours?: unknown } | null)?.colours);
      if (Object.keys(colours).length) read.colours = colours;
      if (Object.keys(read).length) looks[id] = read as Partial<MoleculeLook>;
    }
  }
  return { primary, secondary, looks, shared: acceptFields(r.shared, SCENE_3D_FIELDS) as Partial<Scene3D>, own };
}

/** A look as a file holds it, whole: what does not read is left as Meno's own ball and stick has it. */
export function acceptLook3d(raw: unknown): MoleculeLook {
  const read = acceptFields(raw, LOOK_3D_FIELDS) as Partial<MoleculeLook>;
  return { ...BALL_AND_STICK, ...read, colours: acceptColours((raw as { colours?: unknown } | null)?.colours) };
}

/** The user's own styles as the settings file holds them: each with an id of its own and a name no other style has; what does not read left out. */
function acceptOwn3d(raw: unknown): Own3D[] {
  const out: Own3D[] = [];
  if (!Array.isArray(raw)) return out;
  for (const o of raw as unknown[]) {
    if (typeof o !== "object" || o === null) continue;
    const { id, name, look } = o as Record<string, unknown>;
    if (typeof id !== "string" || !isOwnStyleId(id) || out.some((x) => x.id === id)) continue;
    const n = typeof name === "string" ? name.trim() : "";
    const taken = (m: string) => [...LOOK_3D_PRESETS, ...out].some((x) => x.name.toLowerCase() === m.toLowerCase());
    if (!n || n.length > STYLE_NAME_MOST || taken(n)) continue;
    out.push({ id, name: n, look: acceptLook3d(look) });
  }
  return out;
}
