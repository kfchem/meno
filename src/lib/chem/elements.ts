/**
 * The elements: one table, in order of atomic number, for all of Meno -
 * what an element is called, its colour in 3D, and its radii. Pure data.
 * Each column and where it comes from:
 *
 * - `symbol`, `number`, `name`: the IUPAC's, the names as it spells them
 *   (aluminium, caesium, sulfur).
 * - `colour`: Jmol's default element colours (jmol.sourceforge.net,
 *   *Jmol Colors*), as Meno has drawn atoms in since its first release;
 *   none for elements 110 to 118, which Meno draws grey.
 * - `vdw`, the van der Waals radius in ångströms: S. Alvarez, "A
 *   cartography of the van der Waals territories", Dalton Trans. 2013, 42,
 *   8617-8636 (doi:10.1039/c3dt50599e), Table 1 - from the distances
 *   between atoms not bonded to one another in more than five million
 *   crystal structures, for metals as they are held in molecules (the
 *   maintainer's choice, 2026-10-11; before, Bondi's 1964 radii, from
 *   metal vapours' critical volumes for metals). For He, Ne, Ac, Pa and Cm
 *   to Es, Alvarez's rough estimates (in brackets there); for Po, At, Rn,
 *   Fr and Ra, which Alvarez gives none, M. Mantina, A. C. Chamberlin,
 *   R. Valero, C. J. Cramer, D. G. Truhlar, "Consistent van der Waals Radii
 *   for the Whole Main Group", J. Phys. Chem. A 2009, 113, 5806-5812
 *   (doi:10.1021/jp8111556), Table 12. Null where neither gives one
 *   (promethium; from fermium on).
 * - `radii`: the single-, double- and triple-bond covalent radii in
 *   picometres (a bond's length is about the sum of its two atoms' radii
 *   for its order), as Pekka Pyykkö's fits give them, collected in Tables
 *   2, 3 and 4 of P. Pyykkö, "Additive Covalent Radii for Single-, Double-,
 *   and Triple-Bonded Molecules and Tetrahedrally Bonded Crystals: A
 *   Summary", J. Phys. Chem. A 2015, 119, 2326-2337 (doi:10.1021/jp5065819),
 *   whose sources are P. Pyykkö, M. Atsumi, Chem. Eur. J. 2009, 15, 186-197
 *   (single, doi:10.1002/chem.200800987) and 12770-12779 (double,
 *   doi:10.1002/chem.200901472), and P. Pyykkö, S. Riedel, M. Patzschke,
 *   Chem. Eur. J. 2005, 11, 3511-3520 (triple, doi:10.1002/chem.200401299).
 *   Null where a table gives none.
 */

export type Element = {
  symbol: string;
  number: number;
  name: string;
  /** Its colour in 3D, as #RRGGBB; null where it has none of its own. */
  colour: string | null;
  /** Its van der Waals radius, in ångströms. */
  vdw: number | null;
  /** Its single-, double- and triple-bond covalent radii, in picometres. */
  radii: readonly [number | null, number | null, number | null];
};

export const ELEMENTS: readonly Element[] = [
  { symbol: "H", number: 1, name: "hydrogen", colour: "#FFFFFF", vdw: 1.2, radii: [32, null, null] },
  { symbol: "He", number: 2, name: "helium", colour: "#D9FFFF", vdw: 1.43, radii: [46, null, null] },
  { symbol: "Li", number: 3, name: "lithium", colour: "#CC80FF", vdw: 2.12, radii: [133, 124, null] },
  { symbol: "Be", number: 4, name: "beryllium", colour: "#C2FF00", vdw: 1.98, radii: [102, 90, 85] },
  { symbol: "B", number: 5, name: "boron", colour: "#FFB5B5", vdw: 1.91, radii: [85, 78, 73] },
  { symbol: "C", number: 6, name: "carbon", colour: "#909090", vdw: 1.77, radii: [75, 67, 60] },
  { symbol: "N", number: 7, name: "nitrogen", colour: "#3050F8", vdw: 1.66, radii: [71, 60, 54] },
  { symbol: "O", number: 8, name: "oxygen", colour: "#FF0D0D", vdw: 1.5, radii: [63, 57, 53] },
  { symbol: "F", number: 9, name: "fluorine", colour: "#90E050", vdw: 1.46, radii: [64, 59, 53] },
  { symbol: "Ne", number: 10, name: "neon", colour: "#B3E3F5", vdw: 1.58, radii: [67, 96, null] },
  { symbol: "Na", number: 11, name: "sodium", colour: "#AB5CF2", vdw: 2.5, radii: [155, 160, null] },
  { symbol: "Mg", number: 12, name: "magnesium", colour: "#8AFF00", vdw: 2.51, radii: [139, 132, 127] },
  { symbol: "Al", number: 13, name: "aluminium", colour: "#BFA6A6", vdw: 2.25, radii: [126, 113, 111] },
  { symbol: "Si", number: 14, name: "silicon", colour: "#F0C8A0", vdw: 2.19, radii: [116, 107, 102] },
  { symbol: "P", number: 15, name: "phosphorus", colour: "#FF8000", vdw: 1.9, radii: [111, 102, 94] },
  { symbol: "S", number: 16, name: "sulfur", colour: "#FFFF30", vdw: 1.89, radii: [103, 94, 95] },
  { symbol: "Cl", number: 17, name: "chlorine", colour: "#1FF01F", vdw: 1.82, radii: [99, 95, 93] },
  { symbol: "Ar", number: 18, name: "argon", colour: "#80D1E3", vdw: 1.83, radii: [96, 107, 96] },
  { symbol: "K", number: 19, name: "potassium", colour: "#8F40D4", vdw: 2.73, radii: [196, 193, null] },
  { symbol: "Ca", number: 20, name: "calcium", colour: "#3DFF00", vdw: 2.62, radii: [171, 147, 133] },
  { symbol: "Sc", number: 21, name: "scandium", colour: "#E6E6E6", vdw: 2.58, radii: [148, 116, 114] },
  { symbol: "Ti", number: 22, name: "titanium", colour: "#BFC2C7", vdw: 2.46, radii: [136, 117, 108] },
  { symbol: "V", number: 23, name: "vanadium", colour: "#A6A6AB", vdw: 2.42, radii: [134, 112, 106] },
  { symbol: "Cr", number: 24, name: "chromium", colour: "#8A99C7", vdw: 2.45, radii: [122, 111, 103] },
  { symbol: "Mn", number: 25, name: "manganese", colour: "#9C7AC7", vdw: 2.45, radii: [119, 105, 103] },
  { symbol: "Fe", number: 26, name: "iron", colour: "#E06633", vdw: 2.44, radii: [116, 109, 102] },
  { symbol: "Co", number: 27, name: "cobalt", colour: "#F090A0", vdw: 2.4, radii: [111, 103, 96] },
  { symbol: "Ni", number: 28, name: "nickel", colour: "#50D050", vdw: 2.4, radii: [110, 101, 101] },
  { symbol: "Cu", number: 29, name: "copper", colour: "#C88033", vdw: 2.38, radii: [112, 115, 120] },
  { symbol: "Zn", number: 30, name: "zinc", colour: "#7D80B0", vdw: 2.39, radii: [118, 120, null] },
  { symbol: "Ga", number: 31, name: "gallium", colour: "#C28F8F", vdw: 2.32, radii: [124, 117, 121] },
  { symbol: "Ge", number: 32, name: "germanium", colour: "#668F8F", vdw: 2.29, radii: [121, 111, 114] },
  { symbol: "As", number: 33, name: "arsenic", colour: "#BD80E3", vdw: 1.88, radii: [121, 114, 106] },
  { symbol: "Se", number: 34, name: "selenium", colour: "#FFA100", vdw: 1.82, radii: [116, 107, 107] },
  { symbol: "Br", number: 35, name: "bromine", colour: "#A62929", vdw: 1.86, radii: [114, 109, 110] },
  { symbol: "Kr", number: 36, name: "krypton", colour: "#5CB8D1", vdw: 2.25, radii: [117, 121, 108] },
  { symbol: "Rb", number: 37, name: "rubidium", colour: "#702EB0", vdw: 3.21, radii: [210, 202, null] },
  { symbol: "Sr", number: 38, name: "strontium", colour: "#00FF00", vdw: 2.84, radii: [185, 157, 139] },
  { symbol: "Y", number: 39, name: "yttrium", colour: "#94FFFF", vdw: 2.75, radii: [163, 130, 124] },
  { symbol: "Zr", number: 40, name: "zirconium", colour: "#94E0E0", vdw: 2.52, radii: [154, 127, 121] },
  { symbol: "Nb", number: 41, name: "niobium", colour: "#73C2C9", vdw: 2.56, radii: [147, 125, 116] },
  { symbol: "Mo", number: 42, name: "molybdenum", colour: "#54B5B5", vdw: 2.45, radii: [138, 121, 113] },
  { symbol: "Tc", number: 43, name: "technetium", colour: "#3B9E9E", vdw: 2.44, radii: [128, 120, 110] },
  { symbol: "Ru", number: 44, name: "ruthenium", colour: "#248F8F", vdw: 2.46, radii: [125, 114, 103] },
  { symbol: "Rh", number: 45, name: "rhodium", colour: "#0A7D8C", vdw: 2.44, radii: [125, 110, 106] },
  { symbol: "Pd", number: 46, name: "palladium", colour: "#006985", vdw: 2.15, radii: [120, 117, 112] },
  { symbol: "Ag", number: 47, name: "silver", colour: "#C0C0C0", vdw: 2.53, radii: [128, 139, 137] },
  { symbol: "Cd", number: 48, name: "cadmium", colour: "#FFD98F", vdw: 2.49, radii: [136, 144, null] },
  { symbol: "In", number: 49, name: "indium", colour: "#A67573", vdw: 2.43, radii: [142, 136, 146] },
  { symbol: "Sn", number: 50, name: "tin", colour: "#668080", vdw: 2.42, radii: [140, 130, 132] },
  { symbol: "Sb", number: 51, name: "antimony", colour: "#9E63B5", vdw: 2.47, radii: [140, 133, 127] },
  { symbol: "Te", number: 52, name: "tellurium", colour: "#D47A00", vdw: 1.99, radii: [136, 128, 121] },
  { symbol: "I", number: 53, name: "iodine", colour: "#940094", vdw: 2.04, radii: [133, 129, 125] },
  { symbol: "Xe", number: 54, name: "xenon", colour: "#429EB0", vdw: 2.06, radii: [131, 135, 122] },
  { symbol: "Cs", number: 55, name: "caesium", colour: "#57178F", vdw: 3.48, radii: [232, 209, null] },
  { symbol: "Ba", number: 56, name: "barium", colour: "#00C900", vdw: 3.03, radii: [196, 161, 149] },
  { symbol: "La", number: 57, name: "lanthanum", colour: "#70D4FF", vdw: 2.98, radii: [180, 139, 139] },
  { symbol: "Ce", number: 58, name: "cerium", colour: "#FFFFC7", vdw: 2.88, radii: [163, 137, 131] },
  { symbol: "Pr", number: 59, name: "praseodymium", colour: "#D9FFC7", vdw: 2.92, radii: [176, 138, 128] },
  { symbol: "Nd", number: 60, name: "neodymium", colour: "#C7FFC7", vdw: 2.95, radii: [174, 137, null] },
  { symbol: "Pm", number: 61, name: "promethium", colour: "#A3FFC7", vdw: null, radii: [173, 135, null] },
  { symbol: "Sm", number: 62, name: "samarium", colour: "#8FFFC7", vdw: 2.9, radii: [172, 134, null] },
  { symbol: "Eu", number: 63, name: "europium", colour: "#61FFC7", vdw: 2.87, radii: [168, 134, null] },
  { symbol: "Gd", number: 64, name: "gadolinium", colour: "#45FFC7", vdw: 2.83, radii: [169, 135, 132] },
  { symbol: "Tb", number: 65, name: "terbium", colour: "#30FFC7", vdw: 2.79, radii: [168, 135, null] },
  { symbol: "Dy", number: 66, name: "dysprosium", colour: "#1FFFC7", vdw: 2.87, radii: [167, 133, null] },
  { symbol: "Ho", number: 67, name: "holmium", colour: "#00FF9C", vdw: 2.81, radii: [166, 133, null] },
  { symbol: "Er", number: 68, name: "erbium", colour: "#00E675", vdw: 2.83, radii: [165, 133, null] },
  { symbol: "Tm", number: 69, name: "thulium", colour: "#00D452", vdw: 2.79, radii: [164, 131, null] },
  { symbol: "Yb", number: 70, name: "ytterbium", colour: "#00BF38", vdw: 2.8, radii: [170, 129, null] },
  { symbol: "Lu", number: 71, name: "lutetium", colour: "#00AB24", vdw: 2.74, radii: [162, 131, 131] },
  { symbol: "Hf", number: 72, name: "hafnium", colour: "#4DC2FF", vdw: 2.63, radii: [152, 128, 122] },
  { symbol: "Ta", number: 73, name: "tantalum", colour: "#4DA6FF", vdw: 2.53, radii: [146, 126, 119] },
  { symbol: "W", number: 74, name: "tungsten", colour: "#2194D6", vdw: 2.57, radii: [137, 120, 115] },
  { symbol: "Re", number: 75, name: "rhenium", colour: "#267DAB", vdw: 2.49, radii: [131, 119, 110] },
  { symbol: "Os", number: 76, name: "osmium", colour: "#266696", vdw: 2.48, radii: [129, 116, 109] },
  { symbol: "Ir", number: 77, name: "iridium", colour: "#175487", vdw: 2.41, radii: [122, 115, 107] },
  { symbol: "Pt", number: 78, name: "platinum", colour: "#D0D0E0", vdw: 2.29, radii: [123, 112, 110] },
  { symbol: "Au", number: 79, name: "gold", colour: "#FFD123", vdw: 2.32, radii: [124, 121, 123] },
  { symbol: "Hg", number: 80, name: "mercury", colour: "#B8B8D0", vdw: 2.45, radii: [133, 142, null] },
  { symbol: "Tl", number: 81, name: "thallium", colour: "#A6544D", vdw: 2.47, radii: [144, 142, 150] },
  { symbol: "Pb", number: 82, name: "lead", colour: "#575961", vdw: 2.6, radii: [144, 135, 137] },
  { symbol: "Bi", number: 83, name: "bismuth", colour: "#9E4FB5", vdw: 2.54, radii: [151, 141, 135] },
  { symbol: "Po", number: 84, name: "polonium", colour: "#AB5C00", vdw: 1.97, radii: [145, 135, 129] },
  { symbol: "At", number: 85, name: "astatine", colour: "#754F45", vdw: 2.02, radii: [147, 138, 138] },
  { symbol: "Rn", number: 86, name: "radon", colour: "#428296", vdw: 2.2, radii: [142, 145, 133] },
  { symbol: "Fr", number: 87, name: "francium", colour: "#420066", vdw: 3.48, radii: [223, 218, null] },
  { symbol: "Ra", number: 88, name: "radium", colour: "#007D00", vdw: 2.83, radii: [201, 173, 159] },
  { symbol: "Ac", number: 89, name: "actinium", colour: "#70ABFA", vdw: 2.8, radii: [186, 153, 140] },
  { symbol: "Th", number: 90, name: "thorium", colour: "#00BAFF", vdw: 2.93, radii: [175, 143, 136] },
  { symbol: "Pa", number: 91, name: "protactinium", colour: "#00A1FF", vdw: 2.88, radii: [169, 138, 129] },
  { symbol: "U", number: 92, name: "uranium", colour: "#008FFF", vdw: 2.71, radii: [170, 134, 118] },
  { symbol: "Np", number: 93, name: "neptunium", colour: "#0080FF", vdw: 2.82, radii: [171, 136, 116] },
  { symbol: "Pu", number: 94, name: "plutonium", colour: "#006BFF", vdw: 2.81, radii: [172, 135, null] },
  { symbol: "Am", number: 95, name: "americium", colour: "#545CF2", vdw: 2.83, radii: [166, 135, null] },
  { symbol: "Cm", number: 96, name: "curium", colour: "#785CE3", vdw: 3.05, radii: [166, 136, null] },
  { symbol: "Bk", number: 97, name: "berkelium", colour: "#8A4FE3", vdw: 3.4, radii: [168, 139, null] },
  { symbol: "Cf", number: 98, name: "californium", colour: "#A136D4", vdw: 3.05, radii: [168, 140, null] },
  { symbol: "Es", number: 99, name: "einsteinium", colour: "#B31FD4", vdw: 2.7, radii: [165, 140, null] },
  { symbol: "Fm", number: 100, name: "fermium", colour: "#B31FBA", vdw: null, radii: [167, null, null] },
  { symbol: "Md", number: 101, name: "mendelevium", colour: "#B30DA6", vdw: null, radii: [173, 139, null] },
  { symbol: "No", number: 102, name: "nobelium", colour: "#BD0D87", vdw: null, radii: [176, 159, null] },
  { symbol: "Lr", number: 103, name: "lawrencium", colour: "#C70066", vdw: null, radii: [161, 141, null] },
  { symbol: "Rf", number: 104, name: "rutherfordium", colour: "#CC0059", vdw: null, radii: [157, 140, 131] },
  { symbol: "Db", number: 105, name: "dubnium", colour: "#D1004F", vdw: null, radii: [149, 136, 126] },
  { symbol: "Sg", number: 106, name: "seaborgium", colour: "#D90045", vdw: null, radii: [143, 128, 121] },
  { symbol: "Bh", number: 107, name: "bohrium", colour: "#E00038", vdw: null, radii: [141, 128, 119] },
  { symbol: "Hs", number: 108, name: "hassium", colour: "#E6002E", vdw: null, radii: [134, 125, 118] },
  { symbol: "Mt", number: 109, name: "meitnerium", colour: "#EB0026", vdw: null, radii: [129, 125, 113] },
  { symbol: "Ds", number: 110, name: "darmstadtium", colour: null, vdw: null, radii: [128, 116, 112] },
  { symbol: "Rg", number: 111, name: "roentgenium", colour: null, vdw: null, radii: [121, 116, 118] },
  { symbol: "Cn", number: 112, name: "copernicium", colour: null, vdw: null, radii: [122, 137, 130] },
  { symbol: "Nh", number: 113, name: "nihonium", colour: null, vdw: null, radii: [136, null, null] },
  { symbol: "Fl", number: 114, name: "flerovium", colour: null, vdw: null, radii: [143, null, null] },
  { symbol: "Mc", number: 115, name: "moscovium", colour: null, vdw: null, radii: [162, null, null] },
  { symbol: "Lv", number: 116, name: "livermorium", colour: null, vdw: null, radii: [175, null, null] },
  { symbol: "Ts", number: 117, name: "tennessine", colour: null, vdw: null, radii: [165, null, null] },
  { symbol: "Og", number: 118, name: "oganesson", colour: null, vdw: null, radii: [157, null, null] },
];

const BY_SYMBOL: ReadonlyMap<string, Element> = new Map(ELEMENTS.map((e) => [e.symbol, e]));

/** An element by its symbol; undefined for a symbol that is none. */
export const elementOf = (symbol: string): Element | undefined => BY_SYMBOL.get(symbol);

/** An element's van der Waals radius, in ångströms; 1.5 where it has none. */
export const vdwRadius = (symbol: string): number => BY_SYMBOL.get(symbol)?.vdw ?? 1.5;

/** An element's colour in 3D; a light grey where it has none. */
export const elementColour = (symbol: string): string => BY_SYMBOL.get(symbol)?.colour ?? "#cccccc";

/** An element's single-bond covalent radius, in ångströms; null where it has none. */
export function singleBondRadius(symbol: string): number | null {
  const r = BY_SYMBOL.get(symbol)?.radii[0];
  return r == null ? null : r / 100;
}
