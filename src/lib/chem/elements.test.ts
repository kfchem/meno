import { describe, expect, it } from "vitest";
import { ELEMENTS, elementColour, elementOf, singleBondRadius, vdwRadius } from "./elements";
import { orderFromLength } from "./ordersFromGeometry";

// Every element as Meno had it before its two tables became one (the
// first release's element table, read by the 3D view, the parsers and the
// writers) - but its van der Waals radius, now Alvarez's (2013, Table 1;
// Mantina's for Po to Ra), which the maintainer chose over Bondi's:
// symbol, number, name, colour, van der Waals radius, and the single-,
// double- and triple-bond radii in angstroms; "-" for none.
const BEFORE = `
H 1 hydrogen #FFFFFF 1.2 0.32/-/-
He 2 helium #D9FFFF 1.43 0.46/-/-
Li 3 lithium #CC80FF 2.12 1.33/1.24/-
Be 4 beryllium #C2FF00 1.98 1.02/0.9/0.85
B 5 boron #FFB5B5 1.91 0.85/0.78/0.73
C 6 carbon #909090 1.77 0.75/0.67/0.6
N 7 nitrogen #3050F8 1.66 0.71/0.6/0.54
O 8 oxygen #FF0D0D 1.5 0.63/0.57/0.53
F 9 fluorine #90E050 1.46 0.64/0.59/0.53
Ne 10 neon #B3E3F5 1.58 0.67/0.96/-
Na 11 sodium #AB5CF2 2.5 1.55/1.6/-
Mg 12 magnesium #8AFF00 2.51 1.39/1.32/1.27
Al 13 aluminium #BFA6A6 2.25 1.26/1.13/1.11
Si 14 silicon #F0C8A0 2.19 1.16/1.07/1.02
P 15 phosphorus #FF8000 1.9 1.11/1.02/0.94
S 16 sulfur #FFFF30 1.89 1.03/0.94/0.95
Cl 17 chlorine #1FF01F 1.82 0.99/0.95/0.93
Ar 18 argon #80D1E3 1.83 0.96/1.07/0.96
K 19 potassium #8F40D4 2.73 1.96/1.93/-
Ca 20 calcium #3DFF00 2.62 1.71/1.47/1.33
Sc 21 scandium #E6E6E6 2.58 1.48/1.16/1.14
Ti 22 titanium #BFC2C7 2.46 1.36/1.17/1.08
V 23 vanadium #A6A6AB 2.42 1.34/1.12/1.06
Cr 24 chromium #8A99C7 2.45 1.22/1.11/1.03
Mn 25 manganese #9C7AC7 2.45 1.19/1.05/1.03
Fe 26 iron #E06633 2.44 1.16/1.09/1.02
Co 27 cobalt #F090A0 2.4 1.11/1.03/0.96
Ni 28 nickel #50D050 2.4 1.1/1.01/1.01
Cu 29 copper #C88033 2.38 1.12/1.15/1.2
Zn 30 zinc #7D80B0 2.39 1.18/1.2/-
Ga 31 gallium #C28F8F 2.32 1.24/1.17/1.21
Ge 32 germanium #668F8F 2.29 1.21/1.11/1.14
As 33 arsenic #BD80E3 1.88 1.21/1.14/1.06
Se 34 selenium #FFA100 1.82 1.16/1.07/1.07
Br 35 bromine #A62929 1.86 1.14/1.09/1.1
Kr 36 krypton #5CB8D1 2.25 1.17/1.21/1.08
Rb 37 rubidium #702EB0 3.21 2.1/2.02/-
Sr 38 strontium #00FF00 2.84 1.85/1.57/1.39
Y 39 yttrium #94FFFF 2.75 1.63/1.3/1.24
Zr 40 zirconium #94E0E0 2.52 1.54/1.27/1.21
Nb 41 niobium #73C2C9 2.56 1.47/1.25/1.16
Mo 42 molybdenum #54B5B5 2.45 1.38/1.21/1.13
Tc 43 technetium #3B9E9E 2.44 1.28/1.2/1.1
Ru 44 ruthenium #248F8F 2.46 1.25/1.14/1.03
Rh 45 rhodium #0A7D8C 2.44 1.25/1.1/1.06
Pd 46 palladium #006985 2.15 1.2/1.17/1.12
Ag 47 silver #C0C0C0 2.53 1.28/1.39/1.37
Cd 48 cadmium #FFD98F 2.49 1.36/1.44/-
In 49 indium #A67573 2.43 1.42/1.36/1.46
Sn 50 tin #668080 2.42 1.4/1.3/1.32
Sb 51 antimony #9E63B5 2.47 1.4/1.33/1.27
Te 52 tellurium #D47A00 1.99 1.36/1.28/1.21
I 53 iodine #940094 2.04 1.33/1.29/1.25
Xe 54 xenon #429EB0 2.06 1.31/1.35/1.22
Cs 55 caesium #57178F 3.48 2.32/2.09/-
Ba 56 barium #00C900 3.03 1.96/1.61/1.49
La 57 lanthanum #70D4FF 2.98 1.8/1.39/1.39
Ce 58 cerium #FFFFC7 2.88 1.63/1.37/1.31
Pr 59 praseodymium #D9FFC7 2.92 1.76/1.38/1.28
Nd 60 neodymium #C7FFC7 2.95 1.74/1.37/-
Pm 61 promethium #A3FFC7 - 1.73/1.35/-
Sm 62 samarium #8FFFC7 2.9 1.72/1.34/-
Eu 63 europium #61FFC7 2.87 1.68/1.34/-
Gd 64 gadolinium #45FFC7 2.83 1.69/1.35/1.32
Tb 65 terbium #30FFC7 2.79 1.68/1.35/-
Dy 66 dysprosium #1FFFC7 2.87 1.67/1.33/-
Ho 67 holmium #00FF9C 2.81 1.66/1.33/-
Er 68 erbium #00E675 2.83 1.65/1.33/-
Tm 69 thulium #00D452 2.79 1.64/1.31/-
Yb 70 ytterbium #00BF38 2.8 1.7/1.29/-
Lu 71 lutetium #00AB24 2.74 1.62/1.31/1.31
Hf 72 hafnium #4DC2FF 2.63 1.52/1.28/1.22
Ta 73 tantalum #4DA6FF 2.53 1.46/1.26/1.19
W 74 tungsten #2194D6 2.57 1.37/1.2/1.15
Re 75 rhenium #267DAB 2.49 1.31/1.19/1.1
Os 76 osmium #266696 2.48 1.29/1.16/1.09
Ir 77 iridium #175487 2.41 1.22/1.15/1.07
Pt 78 platinum #D0D0E0 2.29 1.23/1.12/1.1
Au 79 gold #FFD123 2.32 1.24/1.21/1.23
Hg 80 mercury #B8B8D0 2.45 1.33/1.42/-
Tl 81 thallium #A6544D 2.47 1.44/1.42/1.5
Pb 82 lead #575961 2.6 1.44/1.35/1.37
Bi 83 bismuth #9E4FB5 2.54 1.51/1.41/1.35
Po 84 polonium #AB5C00 1.97 1.45/1.35/1.29
At 85 astatine #754F45 2.02 1.47/1.38/1.38
Rn 86 radon #428296 2.2 1.42/1.45/1.33
Fr 87 francium #420066 3.48 2.23/2.18/-
Ra 88 radium #007D00 2.83 2.01/1.73/1.59
Ac 89 actinium #70ABFA 2.8 1.86/1.53/1.4
Th 90 thorium #00BAFF 2.93 1.75/1.43/1.36
Pa 91 protactinium #00A1FF 2.88 1.69/1.38/1.29
U 92 uranium #008FFF 2.71 1.7/1.34/1.18
Np 93 neptunium #0080FF 2.82 1.71/1.36/1.16
Pu 94 plutonium #006BFF 2.81 1.72/1.35/-
Am 95 americium #545CF2 2.83 1.66/1.35/-
Cm 96 curium #785CE3 3.05 1.66/1.36/-
Bk 97 berkelium #8A4FE3 3.4 1.68/1.39/-
Cf 98 californium #A136D4 3.05 1.68/1.4/-
Es 99 einsteinium #B31FD4 2.7 1.65/1.4/-
Fm 100 fermium #B31FBA - 1.67/-/-
Md 101 mendelevium #B30DA6 - 1.73/1.39/-
No 102 nobelium #BD0D87 - 1.76/-/-
Lr 103 lawrencium #C70066 - 1.61/1.41/-
Rf 104 rutherfordium #CC0059 - 1.57/1.4/1.31
Db 105 dubnium #D1004F - 1.49/1.36/1.26
Sg 106 seaborgium #D90045 - 1.43/1.28/1.21
Bh 107 bohrium #E00038 - 1.41/1.28/1.19
Hs 108 hassium #E6002E - 1.34/1.25/1.18
Mt 109 meitnerium #EB0026 - 1.29/1.25/1.13
Ds 110 darmstadtium - - 1.28/1.16/1.12
Rg 111 roentgenium - - 1.21/1.16/1.18
Cn 112 copernicium - - 1.22/1.37/1.3
Nh 113 nihonium - - 1.36/-/-
Fl 114 flerovium - - 1.43/-/-
Mc 115 moscovium - - 1.62/-/-
Lv 116 livermorium - - 1.75/-/-
Ts 117 tennessine - - 1.65/-/-
Og 118 oganesson - - 1.57/-/-
`;

describe("the one element table", () => {
  it("carries every element's values as Meno had them - its van der Waals radius as Alvarez gives it", () => {
    const rows = BEFORE.trim().split("\n").map((line) => line.split(" "));
    expect(ELEMENTS.length).toBe(rows.length);
    const value = (s: string) => (s === "-" ? null : Number(s));
    for (const [symbol, number, name, colour, vdw, radii] of rows) {
      const e = elementOf(symbol)!;
      expect({ number: e.number, name: e.name, colour: e.colour, vdw: e.vdw }).toEqual({ number: Number(number), name, colour: colour === "-" ? null : colour, vdw: value(vdw) });
      const [single, double, triple] = radii.split("/").map(value);
      expect(e.radii[0] == null ? null : e.radii[0] / 100).toBe(single);
      expect(e.radii[2] == null ? null : e.radii[2] / 100).toBe(triple);
      // (nobelium's double-bond radius, which the old table left out, is Pyykko's 159 pm: nothing read it there)
      if (symbol !== "No") expect(e.radii[1] == null ? null : e.radii[1] / 100).toBe(double);
    }
    expect(elementOf("No")!.radii[1]).toBe(159);
  });

  it("lists the elements by atomic number", () => {
    expect(ELEMENTS.map((e) => e.number)).toEqual(ELEMENTS.map((_, i) => i + 1));
  });

  it("answers as the old table's readers were answered, a symbol that is none included", () => {
    expect(vdwRadius("C")).toBe(1.77);
    expect(vdwRadius("Xx")).toBe(1.5);
    expect(elementColour("O")).toBe("#FF0D0D");
    expect(elementColour("Og")).toBe("#cccccc");
    expect(singleBondRadius("C")).toBe(0.75);
    expect(singleBondRadius("Xx")).toBeNull();
    // (the bond-order estimate reads the same radii: and none for an element with no double-bond radius)
    expect(orderFromLength("C", "C", 1.34)).toBeCloseTo(2, 1);
    expect(orderFromLength("Og", "C", 1.5)).toBeNull();
  });
});
