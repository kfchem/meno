import { describe, expect, it } from "vitest";
import { colorRef, emfComments, emfPlusRecords, emfRecords, layoutEmf } from "./emf";
import { drawingLayout } from "../../ui/features/Workspace/fileActions";
import { ACS_1996 } from "./style";
import { createSVG } from "./layout2d";
import { NOMINAL_BOND_LENGTH } from "./acs";
import type { Model } from "../../ui/features/Workspace/store/types";

const L = NOMINAL_BOND_LENGTH;
// an ethanol: two lines, a wedge, and an OH label
const model: Model = {
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: L * 0.866, y: L / 2, r: 0.9, el: "C" },
    { id: 3, x: L * 1.732, y: 0, r: 0.9, el: "O" },
  ],
  bonds: [
    { id: 4, a: 2, b: 1, order: 1, stereo: "up" },
    { id: 5, a: 2, b: 3, order: 1, stereo: "none" },
  ],
};
const aromatic = { aromaticEnabled: false, aromaticRings: {} };

describe("layoutEmf", () => {
  const { layout, opts } = drawingLayout(model, aromatic, ACS_1996);
  const carried = new TextEncoder().encode("MENO{}");
  const { emf, widthPt, heightPt } = layoutEmf(layout, opts, carried);
  const records = emfRecords(emf)!;
  const types = records.map((r) => r.type);

  it("is an EMF whose every record is a whole number of words, as the header counts them", () => {
    expect(records).not.toBeNull();
    const v = new DataView(emf.buffer);
    expect(v.getUint32(48, true)).toBe(emf.length);
    expect(v.getUint32(52, true)).toBe(records.length);
    expect(emf.length % 4).toBe(0);
    expect(types[0]).toBe(1);
    expect(types[types.length - 1]).toBe(14);
  });

  it("is the style's own size: a bond of 14.4 pt", () => {
    const bondsAcross = 1.732 + 2 * opts.paddingPx / layout.zoom / L;
    expect(widthPt).toBeGreaterThan(14.4 * 1.732);
    expect(widthPt).toBeLessThan(14.4 * bondsAcross + 20);
    expect(heightPt).toBeGreaterThan(0);
    // the frame, in hundredths of a millimetre, says the same
    const frame = new DataView(emf.buffer).getInt32(32, true);
    expect(frame).toBe(Math.round((widthPt / 72) * 2540));
  });

  it("says its reference device is 96 pixels to the inch, across and down, in millimetres as in micrometres", () => {
    const v = new DataView(emf.buffer);
    const [px, py, mmx, mmy, umx, umy] = [72, 76, 80, 84, 100, 104].map((at) => v.getInt32(at, true));
    expect(px / (mmx / 25.4)).toBe(96);
    expect(py / (mmy / 25.4)).toBe(96);
    expect(px / (umx / 25_400)).toBe(96);
    expect(py / (umy / 25_400)).toBe(96);
  });

  it("carries what it is given in a comment, and draws lines, the wedge and the label", () => {
    expect(emfComments(emf).map((c) => new TextDecoder().decode(c))).toEqual(["MENO{}"]);
    expect(types).toContain(4); // polyline
    expect(types).toContain(3); // polygon: the wedge
    // the label, run by run (the O on its atom, the H after it)
    const s = records
      .filter((r) => r.type === 84)
      .map((text) => {
        const v = new DataView(text.body.buffer, text.body.byteOffset, text.body.byteLength);
        const chars = v.getUint32(36, true);
        const at = v.getUint32(40, true) - 8;
        return String.fromCharCode(...Array.from({ length: chars }, (_, i) => v.getUint16(at + 2 * i, true)));
      })
      .join("");
    expect(s).toBe("OH");
    // the font it is set in is the style's
    const font = records.find((r) => r.type === 82)!;
    const face = String.fromCharCode(...new Uint16Array(font.body.slice(32, 32 + 10).buffer));
    expect(face).toBe("Arial");
  });

  it("draws it all again in EMF+, smooth, for Office: the same shapes in the same places", () => {
    const plus = emfPlusRecords(emf);
    const count = (t: number) => plus.filter((r) => r.type === t).length;
    const gdi = (t: number) => types.filter((x) => x === t).length;
    // EMF+'s header right after the file's, saying there are two drawings; its end last
    const second = new DataView(records[1].body.buffer, records[1].body.byteOffset);
    expect(records[1].type).toBe(70);
    expect(second.getUint32(4, true)).toBe(0x2b464d45); // "EMF+"
    expect(plus[0].type).toBe(0x4001);
    expect(plus[0].flags & 1).toBe(1);
    expect(plus[plus.length - 1].type).toBe(0x4002);
    expect(types[types.length - 2]).toBe(70);
    // smooth lines and letters
    expect(plus.find((r) => r.type === 0x401e)!.flags & 1).toBe(1);
    expect(plus.find((r) => r.type === 0x401f)!.flags).toBe(4);
    // a record for each of GDI's
    expect(count(0x400d)).toBe(gdi(4));
    expect(count(0x400c)).toBe(gdi(3));
    expect(count(0x400e) + count(0x400f)).toBe(gdi(42));
    // where GDI draws a line, in pixels
    const line = records.find((r) => r.type === 4)!;
    const lv = new DataView(line.body.buffer, line.body.byteOffset, line.body.byteLength);
    const drawn = plus.find((r) => r.type === 0x400d)!.data;
    expect(drawn.getUint32(0, true)).toBe(2);
    expect(drawn.getFloat32(4, true)).toBeCloseTo(lv.getInt32(20, true) / 20, 4);
    expect(drawn.getFloat32(8, true)).toBeCloseTo(lv.getInt32(24, true) / 20, 4);
    expect(drawn.getFloat32(12, true)).toBeCloseTo(lv.getInt32(28, true) / 20, 4);
    // the label, letter by letter, in the style's typeface
    const text = plus
      .filter((r) => r.type === 0x4036)
      .map((r) => {
        const n = r.data.getUint32(12, true);
        return String.fromCharCode(...Array.from({ length: n }, (_, i) => r.data.getUint16(16 + 2 * i, true)));
      })
      .join("");
    expect(text).toBe("OH");
    const font = plus.find((r) => r.type === 0x4008 && ((r.flags >> 8) & 0x7f) === 6)!.data;
    const face = Array.from({ length: font.getUint32(20, true) }, (_, i) => font.getUint16(24 + 2 * i, true));
    expect(String.fromCharCode(...face)).toBe("Arial");
  });

  it("draws each line with a pen of its own width, however many widths there are", () => {
    // more widths than EMF+ has slots for pens
    const lines = Array.from({ length: 70 }, (_, i) => ({ x1: 0, y1: i, x2: 10, y2: i, widthPx: 1 + i / 10 }));
    const many = { ...layout, lines, polys: [], texts: [], circles: [], fills: [] };
    const plus = emfPlusRecords(layoutEmf(many, opts).emf);
    const pens = new Map<number, number>();
    const widths: number[] = [];
    for (const r of plus) {
      if (r.type === 0x4008 && ((r.flags >> 8) & 0x7f) === 2) pens.set(r.flags & 0xff, r.data.getFloat32(16, true));
      if (r.type === 0x400d) widths.push(pens.get(r.flags & 0xff)!);
    }
    expect(Math.max(...pens.keys())).toBeLessThan(64);
    expect(widths).toHaveLength(70);
    widths.forEach((width, i) => expect(width).toBeCloseTo(Math.round(lines[i].widthPx * 20) / 20, 4));
  });

  it("asks for the typeface's italic for an italic run: the t of Ot-Bu", () => {
    const ether: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: L, y: 0, r: 0.9, el: "Ot-Bu" },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 1, stereo: "none" }],
    };
    const drawn = drawingLayout(ether, aromatic, ACS_1996);
    const fonts = emfRecords(layoutEmf(drawn.layout, drawn.opts).emf)!.filter((r) => r.type === 82);
    // one font upright, one italic (EXTCREATEFONTINDIRECTW: lfItalic)
    expect(fonts.map((f) => f.body[24]).sort()).toEqual([0, 1]);
  });

  it("reads no records out of what is not an EMF", () => {
    expect(emfRecords(new Uint8Array(100))).toBeNull();
    expect(emfComments(new Uint8Array(4))).toEqual([]);
  });
});

describe("colorRef", () => {
  it("turns a CSS colour into Windows' blue-green-red", () => {
    expect(colorRef("black")).toBe(0);
    expect(colorRef("#336699")).toBe(0x996633);
    expect(colorRef("#f00")).toBe(0x0000ff);
    expect(colorRef("rgb(1, 2, 3)")).toBe(0x030201);
    expect(colorRef(undefined)).toBe(0);
  });
});

describe("molecules in 3D in an EMF", () => {
  const water3d = {
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.76, y: 0.59, z: 0 },
      { el: "H", x: -0.76, y: 0.59, z: 0.3 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    at: { x: 6, y: 0 },
  };
  const { layout, opts } = drawingLayout({ ...model, molecules3d: [water3d] }, aromatic, ACS_1996);
  const { emf } = layoutEmf(layout, opts, new TextEncoder().encode("MENO{}"));
  const records = emfRecords(emf)!;
  const plus = emfPlusRecords(emf);

  it("takes in the molecule, beside the drawing", () => {
    expect(layout.solids!.filter((m) => m.kind === "ball")).toHaveLength(3);
    expect(layout.solids!.filter((m) => m.kind === "stick")).toHaveLength(2);
    expect(layout.bounds.max.x).toBeGreaterThan(6);
  });

  it("draws each ball as discs, one inside the next, twice over - EMF+ and GDI - and each stick as a band", () => {
    const fillsPlus = plus.filter((r) => r.type === 0x400e).length;
    const ellipses = records.filter((r) => r.type === 42).length;
    expect(fillsPlus).toBe(3 * 12);
    expect(ellipses).toBe(fillsPlus);
    expect(plus.filter((r) => r.type === 0x400c).length).toBeGreaterThanOrEqual(2);
    // (still read back)
    expect(emfComments(emf).some((c) => new TextDecoder().decode(c).startsWith("MENO"))).toBe(true);
    expect(emf.length % 4).toBe(0);
  });

  it("draws the molecules from a bitmap of them in EMF+, given one - whole, or in parts when large - and keeps GDI's discs", () => {
    const bounds = { min: { x: 4, y: -2 }, max: { x: 8, y: 2 } };
    for (const size of [200, 200000]) {
      const png = new Uint8Array(size).map((_, i) => i % 251);
      const withPicture = layoutEmf(layout, opts, undefined, { png, width: 300, height: 300, bounds }).emf;
      const p = emfPlusRecords(withPicture);
      // no discs for EMF+, the picture instead; GDI's discs as they were
      expect(p.filter((r) => r.type === 0x400e)).toHaveLength(0);
      expect(emfRecords(withPicture)!.filter((r) => r.type === 42)).toHaveLength(3 * 12);
      const images = p.filter((r) => r.type === 0x4008 && ((r.flags >> 8) & 0x7f) === 5);
      const draw = p.filter((r) => r.type === 0x401a);
      expect(draw).toHaveLength(1);
      // the object it draws is the image, its parts together the PNG as given
      expect(draw[0].flags & 0xff).toBe(images[0].flags & 0xff);
      const continued = (images[0].flags & 0x8000) !== 0;
      expect(continued).toBe(size > 0xfff0);
      const bytes = images.flatMap((r) => {
        const at = continued ? 4 : 0;
        return Array.from(new Uint8Array(r.data.buffer, r.data.byteOffset + at, r.data.byteLength - at));
      });
      expect(bytes.slice(28, 28 + size)).toEqual(Array.from(png));
      expect(withPicture.length % 4).toBe(0);
    }
  });

  it("counts in a picture in parts the padding its parts carry, so that they add up to the total each says ([MS-EMFPLUS] 2.3.5.1)", () => {
    const bounds = { min: { x: 4, y: -2 }, max: { x: 8, y: 2 } };
    // PNGs of every length modulo 4, either side of where one record is too small (the image's 28-byte header with them)
    const lengths = [0xfff0 - 28 - 3, 0xfff0 - 28, 0xfff0 - 28 + 1, 0xfff0 - 28 + 2, 0xfff0 - 28 + 3, 0xfff0 - 28 + 4, 200000, 200001, 200002, 200003];
    for (const size of lengths) {
      const png = new Uint8Array(size).map((_, i) => 1 + (i % 251));
      const p = emfPlusRecords(layoutEmf(layout, opts, undefined, { png, width: 300, height: 300, bounds }).emf);
      const parts = p.filter((r) => r.type === 0x4008 && ((r.flags >> 8) & 0x7f) === 5);
      const whole = 28 + size;
      const padded = whole + ((4 - (whole % 4)) % 4);
      // every part's data whole words, as DataSize is
      for (const r of parts) expect(r.data.byteLength % 4, `${size}`).toBe(0);
      if (whole <= 0xfff0) {
        // (one record, no total: as it was)
        expect(parts, `${size}`).toHaveLength(1);
        expect(parts[0].flags & 0x8000).toBe(0);
        continue;
      }
      // each part continued but the last; each says the same total, the padded size, and the parts' data add up to it
      expect(parts.map((r) => (r.flags & 0x8000) !== 0)).toEqual(parts.map(() => true));
      const totals = parts.map((r) => r.data.getUint32(0, true));
      expect(new Set(totals), `${size}`).toEqual(new Set([padded]));
      const sum = parts.reduce((n, r) => n + r.data.byteLength - 4, 0);
      expect(sum, `${size}`).toBe(padded);
      // the PNG whole in them, and nothing after it but the padding's zeros
      const bytes = parts.flatMap((r) => Array.from(new Uint8Array(r.data.buffer, r.data.byteOffset + 4, r.data.byteLength - 4)));
      expect(bytes.slice(28, 28 + size)).toEqual(Array.from(png));
      expect(bytes.slice(28 + size).every((b) => b === 0)).toBe(true);
      expect(bytes.length - whole).toBeLessThan(4);
    }
  });

  it("blends the same pixels in for GDI, given them, in place of the discs: premultiplied, bottom row first", () => {
    const bounds = { min: { x: 4, y: -2 }, max: { x: 8, y: 2 } };
    // two pixels across, two down: the top row red, half there; the bottom blue
    const rgba = new Uint8Array([255, 0, 0, 128, 255, 0, 0, 128, 0, 0, 255, 255, 0, 0, 255, 255]);
    const emf2 = layoutEmf(layout, opts, undefined, { png: new Uint8Array(8), rgba, width: 2, height: 2, bounds }).emf;
    const gdi = emfRecords(emf2)!;
    expect(gdi.filter((r) => r.type === 42)).toHaveLength(0);
    const blend = gdi.filter((r) => r.type === 114);
    expect(blend).toHaveLength(1);
    const v = new DataView(blend[0].body.buffer, blend[0].body.byteOffset, blend[0].body.byteLength);
    expect(v.getUint32(32, true)).toBe(0x01ff0000);
    expect([v.getInt32(92, true), v.getInt32(96, true)]).toEqual([2, 2]);
    const bits = Array.from(blend[0].body.subarray(140, 156));
    // bottom row (blue) first, as BGRA; then the red, its colour times its alpha
    expect(bits).toEqual([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 128, 128, 0, 0, 128, 128]);
    expect(emf2.length % 4).toBe(0);
  });

  it("is an image in the SVG, given one drawn in 3D, in place of the discs - where the image says", () => {
    const image = { href: "data:image/png;base64,AAAA", bounds: { min: { x: 4, y: -2 }, max: { x: 8, y: 2 } } };
    const svg = createSVG({ ...layout, solidsImage: image }, opts);
    expect(svg).toContain('<image href="data:image/png;base64,AAAA" x="4" y="-2" width="4" height="4"');
    expect(svg).not.toContain("radialGradient");
    expect(createSVG(layout, opts)).toContain("radialGradient");
  });

  it("is only the molecule, where there is no drawing", () => {
    const alone = drawingLayout({ atoms: [], bonds: [], molecules3d: [water3d] }, aromatic, ACS_1996).layout;
    expect(Number.isFinite(alone.bounds.min.x) && Number.isFinite(alone.bounds.max.y)).toBe(true);
    expect(alone.bounds.min.x).toBeGreaterThan(4);
  });
});

describe("measurements in a picture", () => {
  // water, and the distance between its two hydrogens measured on it
  const water3d = {
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.76, y: 0.59, z: 0 },
      { el: "H", x: -0.76, y: 0.59, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    at: { x: 6, y: 0 },
    measures: [{ id: 1, atoms: [1, 2] }],
  };
  const { layout, opts } = drawingLayout({ ...model, molecules3d: [water3d] }, aromatic, ACS_1996);
  const text = "1.520 Å";

  it("are taken in, over the molecules: dashes, the value, and room for it", () => {
    expect(layout.measures).toHaveLength(1);
    const m = layout.measures![0];
    expect(m.text).toBe(text);
    expect(m.lines.length).toBeGreaterThan(3);
    // (written about where the two atoms meet - beside it, where it would cover a hydrogen's ball - the molecule placed at x 6; "1.520 Å" is a little wider than it was)
    expect(Math.abs(m.label.x - 6)).toBeLessThan(1.5);
    expect(layout.bounds.max.x).toBeGreaterThan(m.label.x);
  });

  it("are drawn in an SVG after the molecules: the dashes, a white ground and the value", () => {
    const svg = createSVG(layout, opts);
    const at = svg.indexOf(`>${text}</text>`);
    expect(at).toBeGreaterThan(svg.lastIndexOf("<circle"));
    expect(svg).toContain('fill="white" fill-opacity="0.9"');
    expect(svg.match(/<line [^>]*stroke="#1e90ff"/g)!.length).toBe(layout.measures![0].lines.length);
  });

  it("are drawn in an EMF, twice over: the value written in GDI and EMF+, its letters in its colour", () => {
    const { emf } = layoutEmf(layout, opts);
    const records = emfRecords(emf)!;
    const units = [...text].map((c) => c.charCodeAt(0));
    const written = records.filter((r) => r.type === 84).some((r) => {
      const v = new DataView(r.body.buffer, r.body.byteOffset, r.body.byteLength);
      const n = v.getUint32(36, true);
      const at = v.getUint32(40, true) - 8;
      return n === units.length && units.every((u, i) => v.getUint16(at + 2 * i, true) === u);
    });
    expect(written).toBe(true);
    // (and its colour set for it: Windows' blue-green-red of #1e90ff)
    expect(records.filter((r) => r.type === 24).some((r) => new DataView(r.body.buffer, r.body.byteOffset).getUint32(0, true) === colorRef("#1e90ff"))).toBe(true);
    expect(emfPlusRecords(emf).filter((r) => r.type === 0x4036).length).toBeGreaterThanOrEqual(1);
    expect(emf.length % 4).toBe(0);
  });

  // the molecules as a picture made with WebGL has them: an image, their
  // measurements' lines and fans drawn into it, in depth among the atoms
  const bounds = { min: { x: 5, y: -1 }, max: { x: 7, y: 1 } };
  const imaged = { ...layout, solidsImage: { href: "data:image/png;base64,AAAA", bounds } };

  it("leave their lines to the molecules' image, in an SVG, and write only the values over it", () => {
    const svg = createSVG(imaged, opts);
    expect(svg).not.toMatch(/<line [^>]*stroke="#1e90ff"/);
    expect(svg).toContain(`>${text}</text>`);
    expect(svg).toContain('fill="white" fill-opacity="0.9"');
    expect(svg.indexOf(`>${text}</text>`)).toBeGreaterThan(svg.indexOf("<image"));
  });

  it("leave their lines to the molecules' bitmap, in an EMF - EMF+'s and GDI's both - and write only the values over it", () => {
    const solids = { png: new Uint8Array([137, 80, 78, 71]), rgba: new Uint8Array(2 * 2 * 4), width: 2, height: 2, bounds };
    const polygons = (emf: Uint8Array) => emfRecords(emf)!.filter((r) => r.type === 3).length;
    const fills = (emf: Uint8Array) => emfPlusRecords(emf).filter((r) => r.type === 0x400c).length;
    const vector = layoutEmf(layout, opts).emf;
    const bitmap = layoutEmf(layout, opts, undefined, solids).emf;
    // (the same picture with no measurement: what the rest of it fills)
    const none = layoutEmf({ ...layout, measures: [] }, opts, undefined, solids).emf;
    // the value's white ground is all the measurement adds: one in each
    expect(fills(bitmap) - fills(none)).toBe(1);
    expect(polygons(bitmap) - polygons(none)).toBe(1);
    expect(fills(vector)).toBeGreaterThan(fills(bitmap));
    expect(polygons(vector)).toBeGreaterThan(polygons(bitmap));
    // (given the PNG alone, GDI keeps its discs, and the lines with them)
    const plusOnly = layoutEmf(layout, opts, undefined, { ...solids, rgba: undefined }).emf;
    expect(fills(plusOnly) - fills(none)).toBe(1);
    expect(polygons(plusOnly)).toBeGreaterThan(polygons(bitmap));
  });
});

describe("an electron-pushing arrow in a picture", () => {
  // HO- and bromomethane, an SN2's two arrows
  const sn2: Model = {
    atoms: [
      { id: 1, x: -2 * L, y: 0, r: 0.9, el: "O", charge: -1 },
      { id: 2, x: 0, y: 0, r: 0.9, el: "C" },
      { id: 3, x: L, y: 0, r: 0.9, el: "Br" },
    ],
    bonds: [{ id: 10, a: 2, b: 3, order: 1 }],
  };
  const drawn = { ...sn2, pushes: [{ id: 1, from: { atom: 1 }, to: { atom: 2 } }, { id: 2, from: { bond: 10 }, to: { atom: 3 } }] };
  const { layout, opts } = drawingLayout(drawn, aromatic, ACS_1996);

  it("is its line as a curve - the start, then three points for each segment - and its head filled", () => {
    expect(layout.curves).toHaveLength(2);
    for (const c of layout.curves!) expect((c.points.length - 1) % 3).toBe(0);
  });

  it("is written in an SVG as the curve it is", () => {
    const svg = createSVG(layout, opts);
    expect(svg).toMatch(/<path d="M[^"]*C[^"]*" fill="none"[^>]*stroke-linecap/);
  });

  it("is written in an EMF as Bezier curves, for EMF+ and for GDI alike", () => {
    const { emf } = layoutEmf(layout, opts);
    expect(emfRecords(emf)!.filter((r) => r.type === 2)).toHaveLength(2); // EMR_POLYBEZIER
    expect(emfPlusRecords(emf).filter((r) => r.type === 0x4019)).toHaveLength(2); // EmfPlusDrawBeziers
  });
});
