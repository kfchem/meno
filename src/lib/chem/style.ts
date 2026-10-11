import type { LayoutOptions } from "./layout2d";

/**
 * How a structure is drawn: every width, spacing, size, angle and colour the
 * depiction uses, in one place, as settings rather than as constants.
 *
 * A length can be given in points or as a fraction of the bond length,
 * whichever reads better for it - a line's thickness is naturally "0.6 pt",
 * the gap in a double bond "18% of the bond". The bond length itself is in
 * points; it is what every fraction is a fraction of. What belongs to a
 * label - where its baseline sits, how big a subscript is - is a fraction of
 * the label's font size, and an angle is in degrees.
 *
 * A style is chosen as a preset (ACS 1996, RSC, ...) and what was changed
 * from it: a `StyleChoice`. The application has one, a document may have its
 * own instead, and later an atom or a bond may change a setting or two.
 * `resolveStyle` lays changes over a style. What each setting means, in
 * words, is in `styleFields.ts`.
 */

export type LengthUnit = "pt" | "bond";

/** A length in points, or as a fraction of the bond length. */
export type Length = { value: number; unit: LengthUnit };

export const pt = (value: number): Length => ({ value, unit: "pt" });
export const ofBond = (value: number): Length => ({ value, unit: "bond" });

export type DrawingStyle = {
  // --- Size ---------------------------------------------------------------
  /** Bond length, in points. Every "bond" length is a fraction of it. */
  bondLengthPt: number;

  // --- Lines --------------------------------------------------------------
  /** The thickness of a bond's line. */
  lineThickness: Length;
  /**
   * How lines end and meet: round everywhere, or square everywhere. Never a
   * mixture - a picture with round single bonds and square double ones looks
   * like two drawings.
   */
  ends: "round" | "square";
  /** The colour bonds are drawn in, as CSS: "#000000". */
  bondColor: string;

  // --- Double and triple bonds -------------------------------------------
  /** Between the lines of a double bond, centre to centre. */
  doubleGap: Length;
  /** Between the lines of a triple bond; left unset, the double bond's. */
  tripleGap?: Length;
  /**
   * How far off a double bond's line a neighbouring atom has to be, as a
   * fraction of the bond, to count as on one side of it when the side of the
   * second line is chosen.
   */
  doubleSideThreshold: number;
  /**
   * A bond leaning in along a double bond closer than this, in degrees,
   * leaves no room for the second line on its side.
   */
  doubleCrowdingAngle: number;
  /** The most a second line is shortened at each end, as a fraction of the bond. */
  innerLineMaxShortening: number;
  /**
   * A centred double bond's lines run on to meet a single bond leaving at
   * least this many degrees off straight on; closer, they stop at the atom.
   */
  centredJoinMinAngle: number;

  // --- Wedges and bold bonds ----------------------------------------------
  /** A bold bond's thickness, and the length of a hashed bond's hashes. */
  boldThickness: Length;
  /**
   * How wide a wedge is at its broad end. Left unset, one and a half times
   * the bold thickness, and it follows that when it changes.
   */
  wedgeBroadEnd?: Length;
  /**
   * The straightest a bond carrying on from a wedge's broad end may be, in
   * degrees, for the end to be cut along it; straighter, it is cut square.
   */
  wedgeCutMaxAngle: number;
  /**
   * How far along a bond it follows a broad end's corner may travel, as a
   * fraction of that bond: a limit on how far the cut reaches.
   */
  wedgeCornerReach: number;

  // --- Hashes and dashes --------------------------------------------------
  /** The least distance between the hashes of a hashed wedge or bond. */
  hashInterval: Length;
  /**
   * How far the first hash sits from the atom the hashes start at, when that
   * atom has no label; left unset, one hash interval.
   */
  hashStartOffset?: Length;
  /** A dashed bond's dashes, and the least gap between two of them. */
  dashLength: Length;
  dashGap: Length;

  // --- Dative and wavy bonds ----------------------------------------------
  /** The head of a dative bond's arrow: how long, and how wide at its base. */
  arrowheadLength: Length;
  arrowheadWidth: Length;
  /** How far a wavy bond swings either side of its line. */
  waveAmplitude: Length;
  /** One whole wave of a wavy bond: a turn to either side. */
  wavelength: Length;

  // --- Labels -------------------------------------------------------------
  /** The typeface labels are set in. */
  fontFamily: string;
  /** The size of an atom label. */
  fontSize: Length;
  /** The colour labels are drawn in, as CSS. */
  labelColor: string;
  /** How far a bond stops short of a label's letters. */
  labelClearance: Length;
  /**
   * How far a label's baseline sits below its atom, as a fraction of the
   * font size. Left unset, where it sets a capital of the typeface on its
   * atom as ACS 1996 sets Arial's - 0.4 in Arial.
   */
  labelBaseline?: number;
  /** A subscript's size, as a fraction of the font size. */
  subscriptSize: number;
  /** How far a subscript's baseline drops, as a fraction of the font size. */
  subscriptDrop: number;
  /** Baseline to baseline between the lines of a stacked label, as a fraction of the font size. */
  stackedLineSpacing: number;
  /**
   * How far from vertical, in degrees, a bond may lean and still leave a
   * label's hydrogens on the right.
   */
  hydrogenVerticalBand: number;
  /**
   * How close to horizontal, in degrees, bonds on both sides of an atom have
   * to leave for its whole symbol to be centred between them.
   */
  symbolCentringAngle: number;
  /** The most of a bond the labels at its two ends may take between them, as a fraction. */
  labelShareMax: number;

  // --- Charges --------------------------------------------------------------
  /**
   * A charge of one drawn in a circle (⊕, ⊖), or as a plain sign. A larger
   * charge is never circled: 2+.
   */
  chargeCircles: "single" | "none";
  /**
   * A charged carbon - or one with an electron unpaired - drawn as its bonds'
   * meeting with the charge beside it, or with its C.
   */
  chargedCarbonLabel: "hidden" | "shown";

  // --- Stereodescriptors ----------------------------------------------------
  /**
   * R, S, E and Z as the canvas writes them beside stereocentres and double
   * bonds when they are shown: plainly, R, or in parentheses, (R) - in
   * italics either way, as IUPAC sets them.
   */
  stereoDescriptors: "plain" | "parentheses";
  /**
   * How far R or S stands off its stereocentre, from the atom to the nearest
   * of its letters, as a fraction of the labels' font size. IUPAC's
   * recommendations for structure diagrams put it about half a capital's
   * height off (GR-11.1); written bare, it can come nearer.
   */
  stereoDescriptorGap: number;

  // --- Aromatic rings ------------------------------------------------------
  /** The circle drawn in an aromatic ring, as a fraction of the ring's radius. */
  aromaticCircleSize: number;

  // --- Reaction arrows -----------------------------------------------------
  /** The thickness of a reaction arrow's line; left unset, a bond's. */
  reactionArrowThickness?: Length;
  /**
   * A reaction arrow's head: how long, from its point to its back corners,
   * and how wide across them.
   */
  reactionArrowHeadLength: Length;
  reactionArrowHeadWidth: Length;
  /**
   * How far the back of the head is drawn in towards its point, as a
   * fraction of the head's length: none draws a triangle, more a barbed head.
   */
  reactionArrowHeadInset: number;

  // --- Electron-pushing arrows ---------------------------------------------
  /**
   * An electron-pushing arrow's head: how long, from its point to its back
   * corners, and how wide across them - a half head, a fishhook, being the
   * one side of it. Its line is a bond's.
   */
  electronArrowHeadLength: Length;
  electronArrowHeadWidth: Length;
  /** How far the back of its head is drawn in toward its point, as a fraction of the head's length: a barbed head. */
  electronArrowHeadInset: number;
};

/**
 * What every style shares unless it says otherwise: how labels are set and
 * how the drawing's rules decide, as ACS 1996 does both.
 */
const RULES = {
  bondColor: "#000000",
  labelColor: "#000000",
  doubleSideThreshold: 0.06,
  doubleCrowdingAngle: 45,
  innerLineMaxShortening: 0.45,
  centredJoinMinAngle: 20,
  wedgeCutMaxAngle: 175,
  wedgeCornerReach: 0.5,
  subscriptSize: 0.75,
  subscriptDrop: 0.225,
  stackedLineSpacing: 0.857,
  hydrogenVerticalBand: 10,
  symbolCentringAngle: 25,
  labelShareMax: 0.9,
  chargeCircles: "single",
  chargedCarbonLabel: "hidden",
  // (bare, as IUPAC's recommendations for structure diagrams draw them,
  // GR-11; the journals below say nothing of them in drawings)
  stereoDescriptors: "plain",
  stereoDescriptorGap: 0.15,
  aromaticCircleSize: 0.5,
  reactionArrowHeadInset: 0,
  // (a small barbed head, as a chemist draws one by hand)
  electronArrowHeadInset: 0.35,
} satisfies Partial<DrawingStyle>;

/**
 * ACS 1996: 14.4 pt bonds, 0.6 pt lines, 2.0 pt bold bonds (the same for a
 * hashed bond's hashes, and 3.0 pt at a wedge's broad end), a double bond's
 * lines 18% of the bond apart, hashes at least 2.5 pt apart, wavy bonds of
 * half circles 1.88 pt across, 10 pt Arial labels kept 1.6 pt clear of
 * their bonds, square ends and mitred joins.
 */
export const ACS_1996: DrawingStyle = {
  ...RULES,
  // (in parentheses, as ACS writes them in names - its guide says nothing
  // of them in drawings - and as drawings made for ACS journals have them)
  stereoDescriptors: "parentheses",
  stereoDescriptorGap: 0.35,
  bondLengthPt: 14.4,
  lineThickness: pt(0.6),
  ends: "square",
  doubleGap: ofBond(0.18),
  boldThickness: pt(2.0),
  hashInterval: pt(2.5),
  // Not yet settled against ACS 1996: a dashed bond's dashes, a dative
  // bond's arrowhead and a reaction arrow's head.
  dashLength: pt(1.5),
  dashGap: pt(1.0),
  arrowheadLength: pt(3.0),
  arrowheadWidth: pt(2.0),
  reactionArrowHeadLength: pt(5.0),
  reactionArrowHeadWidth: pt(3.6),
  electronArrowHeadLength: pt(3.2),
  electronArrowHeadWidth: pt(2.6),
  waveAmplitude: pt(0.94),
  wavelength: pt(3.76),
  fontFamily: "Arial",
  fontSize: pt(10),
  labelClearance: pt(1.6),
};

/**
 * ACS 1996's lengths that the journal styles below do not state for
 * themselves, as fractions of its bond, so they keep their proportions in a
 * style with a different bond length.
 */
const ACS_PROPORTIONS = {
  dashLength: ofBond(1.5 / 14.4),
  dashGap: ofBond(1.0 / 14.4),
  arrowheadLength: ofBond(3.0 / 14.4),
  arrowheadWidth: ofBond(2.0 / 14.4),
  reactionArrowHeadLength: ofBond(5.0 / 14.4),
  reactionArrowHeadWidth: ofBond(3.6 / 14.4),
  electronArrowHeadLength: ofBond(3.2 / 14.4),
  electronArrowHeadWidth: ofBond(2.6 / 14.4),
  waveAmplitude: ofBond(0.94 / 14.4),
  wavelength: ofBond(3.76 / 14.4),
} satisfies Partial<DrawingStyle>;

/** Points in `value` centimetres. */
function cm(value: number): number {
  return (value / 2.54) * 72;
}

/**
 * The Royal Society of Chemistry's single-column style: 12.2 pt bonds,
 * 0.45 pt lines, 1.6 pt bold bonds, hashes 1.75 pt apart, a double bond's
 * lines 20% of the bond apart, 7 pt Helvetica labels kept 1.25 pt clear.
 * The rest in ACS 1996's proportions.
 */
export const RSC: DrawingStyle = {
  ...RULES,
  ...ACS_PROPORTIONS,
  bondLengthPt: 12.2,
  lineThickness: pt(0.45),
  ends: "square",
  doubleGap: ofBond(0.2),
  boldThickness: pt(1.6),
  hashInterval: pt(1.75),
  fontFamily: "Helvetica",
  fontSize: pt(7),
  labelClearance: pt(1.25),
};

/**
 * Nature's style for chemical structures: 0.381 cm (10.8 pt) bonds, 0.021 cm
 * lines, 0.055 cm bold bonds, hashes 0.06 cm apart, a double bond's lines
 * 18% of the bond apart, 6 pt Arial labels kept 0.042 cm clear. The rest
 * in ACS 1996's proportions.
 */
export const NATURE: DrawingStyle = {
  ...RULES,
  ...ACS_PROPORTIONS,
  bondLengthPt: cm(0.381),
  lineThickness: pt(cm(0.021)),
  ends: "square",
  doubleGap: ofBond(0.18),
  boldThickness: pt(cm(0.055)),
  hashInterval: pt(cm(0.06)),
  fontFamily: "Arial",
  fontSize: pt(6),
  labelClearance: pt(cm(0.042)),
};

/**
 * Wiley-VCH's template for structures in Angewandte Chemie and its sister
 * journals: 0.6 cm (17 pt) bonds, 0.026 cm lines, 0.092 cm bold bonds and
 * hashes, a double bond's lines 18% of the bond apart, 12 pt Arial labels
 * kept 0.071 cm clear - drawn large, to be reduced for the page. The rest in
 * ACS 1996's proportions.
 */
export const WILEY: DrawingStyle = {
  ...RULES,
  ...ACS_PROPORTIONS,
  bondLengthPt: cm(0.6),
  lineThickness: pt(cm(0.026)),
  ends: "square",
  doubleGap: ofBond(0.18),
  boldThickness: pt(cm(0.092)),
  hashInterval: pt(cm(0.092)),
  fontFamily: "Arial",
  fontSize: pt(12),
  labelClearance: pt(cm(0.071)),
};

/**
 * Meno's own style: ACS 1996's proportions, which a chemist reads without
 * noticing them, with round ends and joins and labels in IBM Plex Sans -
 * whose capital I has serifs and whose l has a tail, so that Cl never reads
 * as CI.
 */
export const MENO: DrawingStyle = {
  ...ACS_1996,
  // (its ink the black of Meno's palette, a little softer than a journal's
  // pure black, which print wants - the maintainer, 2026-10-11)
  bondColor: "#141414",
  labelColor: "#141414",
  ends: "round",
  fontFamily: "IBM Plex Sans",
  stereoDescriptors: "plain",
  stereoDescriptorGap: 0.15,
};

/** A style that can be picked by name. */
export type StylePreset = {
  id: string;
  name: string;
  /** One line on what it is and whose it is. */
  description: string;
  style: DrawingStyle;
};

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "meno",
    name: "Meno",
    description: "ACS 1996's proportions, round ends, IBM Plex Sans.",
    style: MENO,
  },
  {
    id: "acs1996",
    name: "ACS 1996",
    description: "American Chemical Society journals.",
    style: ACS_1996,
  },
  {
    id: "rsc",
    name: "RSC",
    description: "Royal Society of Chemistry journals, single column.",
    style: RSC,
  },
  {
    id: "wiley",
    name: "Wiley",
    description: "Wiley-VCH journals, such as Angewandte Chemie.",
    style: WILEY,
  },
  {
    id: "nature",
    name: "Nature",
    description: "Nature and the Nature journals.",
    style: NATURE,
  },
];

/** The preset with this id, or the first, Meno's own. */
export function presetById(id: string | undefined): StylePreset {
  return STYLE_PRESETS.find((p) => p.id === id) ?? STYLE_PRESETS[0];
}

/**
 * A style as someone chose it: a preset, and the settings changed from it.
 * Kept this way rather than as a whole style so that it is plain which
 * settings were changed, and so that a change can be taken back to the
 * preset's value.
 */
export type StyleChoice = {
  preset: string;
  changes: Partial<DrawingStyle>;
};

export const DEFAULT_STYLE_CHOICE: StyleChoice = {
  preset: STYLE_PRESETS[0].id,
  changes: {},
};

/** The style a choice comes to. */
export function styleOf(choice: StyleChoice): DrawingStyle {
  return resolveStyle(presetById(choice.preset).style, choice.changes);
}

/** A wedge's broad end: as set, or one and a half bold thicknesses. */
export function wedgeBroadEndOf(style: DrawingStyle): Length {
  if (style.wedgeBroadEnd) return style.wedgeBroadEnd;
  const bold = style.boldThickness;
  return { value: bold.value * 1.5, unit: bold.unit };
}

/** A length as a fraction of the style's bond length. */
export function bondFraction(length: Length, style: DrawingStyle): number {
  return length.unit === "bond" ? length.value : length.value / style.bondLengthPt;
}

/** A length in points. */
export function inPoints(length: Length, style: DrawingStyle): number {
  return length.unit === "pt" ? length.value : length.value * style.bondLengthPt;
}

/** `base` with each layer's settings laid over it, the last on top. */
export function resolveStyle(
  base: DrawingStyle,
  ...layers: (Partial<DrawingStyle> | undefined)[]
): DrawingStyle {
  let out = base;
  for (const layer of layers) {
    if (!layer) continue;
    const defined = Object.fromEntries(
      Object.entries(layer).filter(([, v]) => v !== undefined),
    ) as Partial<DrawingStyle>;
    out = { ...out, ...defined };
  }
  return out;
}

/**
 * Layout options that draw in `style`, with a bond `bondLength` long in
 * whatever units the drawing uses - the editor's world units by default.
 */
export function layoutOptionsFor(
  style: DrawingStyle,
  bondLength: number,
  over?: Partial<LayoutOptions>,
): LayoutOptions {
  const L = bondLength;
  const at = (length: Length) => bondFraction(length, style) * L;
  const options: LayoutOptions = {
    lineWidthPx: at(style.lineThickness),
    doubleOffsetPx: at(style.doubleGap),
    // A triple bond's outer lines sit one spacing either side.
    tripleOffsetPx: at(style.tripleGap ?? style.doubleGap),
    wedgeWidthPx: at(wedgeBroadEndOf(style)),
    hashSpacingPx: at(style.hashInterval),
    hashFirstGapPx: at(style.hashStartOffset ?? style.hashInterval),
    boldWidthPx: at(style.boldThickness),
    dashLengthPx: at(style.dashLength),
    dashGapPx: at(style.dashGap),
    dativeHeadLengthPx: at(style.arrowheadLength),
    dativeHeadWidthPx: at(style.arrowheadWidth),
    wavyAmpPx: at(style.waveAmplitude),
    wavyPeriodPx: at(style.wavelength),
    fontPx: at(style.fontSize),
    fontFamily: style.fontFamily,
    labelMarginPx: at(style.labelClearance),
    bondColor: style.bondColor,
    labelColor: style.labelColor,
    labelSet: {
      baseline: style.labelBaseline,
      subscriptSize: style.subscriptSize,
      subscriptDrop: style.subscriptDrop,
      stackSpacing: style.stackedLineSpacing,
      fontFamily: style.fontFamily,
    },
    hydrogenBandDeg: style.hydrogenVerticalBand,
    symbolCentringDeg: style.symbolCentringAngle,
    labelShareMax: style.labelShareMax,
    doubleSideThreshold: style.doubleSideThreshold,
    doubleCrowdingDeg: style.doubleCrowdingAngle,
    innerLineMaxShortening: style.innerLineMaxShortening,
    centredJoinMinDeg: style.centredJoinMinAngle,
    wedgeCutMaxDeg: style.wedgeCutMaxAngle,
    wedgeCornerReach: style.wedgeCornerReach,
    aromaticCircleSize: style.aromaticCircleSize,
    paddingPx: 48,
    showCarbonLabels: false,
    circleCharges: style.chargeCircles !== "none",
    stereoParentheses: style.stereoDescriptors === "parentheses",
    stereoGap: style.stereoDescriptorGap,
    showChargedCarbons: style.chargedCarbonLabel === "shown",
    units: "world",
    minLinePx: 1,
    joinStyle: style.ends === "round" ? "round" : "sharp",
  };
  return { ...options, ...(over ?? {}) };
}
