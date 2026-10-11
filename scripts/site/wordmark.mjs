// Writes Meno's wordmark - the logo and "MENO" beside it - as SVG paths.
//
//   node scripts/site/wordmark.mjs <Orbitron[wght].ttf> > site/assets/wordmark.svg
//
// The letters are Orbitron (SIL OFL 1.1, the variable font from
// github.com/google/fonts, ofl/orbitron), turned into outlines so the mark
// needs no font to show. M stands as tall as the logo, from the arc's top to
// the dot's foot; E, N and O are small capitals, 78 % of that. Each letter's
// weight is picked so its upright stroke is as thick as the arc is at its
// feet, whatever its size; the letters are spaced 0.22 em.
//
// Options: --fill <colour> (default currentColor), --height <px> (default none).

import { readFileSync } from "node:fs";
// the ES build: the package's main entry is a UMD bundle node cannot import by name
import { parse } from "opentype.js/dist/opentype.mjs";

// The logo (meno.svg, its clip box): 484 x 399 units, top at 0, foot at 399.
const LOGO =
  "M172 328.5c0-38.9 31.3-70.5 70-70.5s70 31.6 70 70.5-31.3 70.5-70 70.5-70-31.6-70-70.5z" +
  "M0 258.4C.4 115.5 108.8 0 242.3 0 375.7.2 483.8 116 484 258.9l-58.8.1" +
  "C425 148.6 327.2 80.8 239 82.3 150.8 83.8 59.2 148.2 58.8 258.6z";
const LOGO_W = 484;
const H = 399;
/** How thick the arc is at its feet: every letter's upright stroke matches it. */
const ARC = 58.8;
const SMALL = 0.78;
const TRACK = 0.22;
/** Between the logo and the M's pen position, as a share of the logo's height. */
const GAP = 0.32;

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const fill = opt("--fill", "currentColor");
const height = opt("--height", null);
const file = args[0];
if (!file) {
  console.error("usage: node scripts/site/wordmark.mjs <Orbitron[wght].ttf> [--fill c] [--height px]");
  process.exit(1);
}
const buf = readFileSync(file);
const font = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const upm = font.unitsPerEm;

/** A glyph at a weight, as the font's variations make it. */
function glyphAt(ch, wght) {
  const g = font.charToGlyph(ch);
  return font.variation ? font.variation.getTransform(g, { wght }) : g;
}

/** Straight-line pieces of a path's outline, in font units (y up). */
function segments(path) {
  const out = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  for (const c of path.commands) {
    if (c.type === "M") { x = sx = c.x; y = sy = c.y; continue; }
    if (c.type === "Z") { out.push([x, y, sx, sy]); x = sx; y = sy; continue; }
    const steps = c.type === "L" ? 1 : 16;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      let px, py;
      if (c.type === "L") { px = c.x; py = c.y; }
      else if (c.type === "Q") { px = u * u * x + 2 * u * t * c.x1 + t * t * c.x; py = u * u * y + 2 * u * t * c.y1 + t * t * c.y; }
      else { px = u * u * u * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x; py = u * u * u * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y; }
      out.push([i === 1 ? x : out[out.length - 1][2], i === 1 ? y : out[out.length - 1][3], px, py]);
    }
    x = c.x; y = c.y;
  }
  return out;
}

/** The width of the first stroke a level line at height y meets, left to right. */
function stemAt(path, y) {
  const xs = [];
  for (const [x0, y0, x1, y1] of segments(path)) {
    if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
  }
  xs.sort((a, b) => a - b);
  return xs.length >= 2 ? xs[1] - xs[0] : 0;
}

/** The letter's font size and weight for a cap height, its stem matching the arc. */
function sized(ch, cap, at) {
  const top = glyphAt(ch, 400).getBoundingBox().y2;
  const size = (cap / top) * upm;
  const scale = size / upm;
  let lo = 400, hi = 900;
  for (let i = 0; i < 24; i++) {
    const w = (lo + hi) / 2;
    const g = glyphAt(ch, w);
    if (stemAt(g.path, g.getBoundingBox().y2 * at) * scale < ARC) lo = w; else hi = w;
  }
  return { size, wght: Math.round((lo + hi) / 2) };
}

const big = sized("M", H, 0.5);
const small = sized("E", H * SMALL, 0.25);
const letters = [
  ["M", big],
  ["E", small],
  ["N", small],
  ["O", small],
];

const r = (v) => Math.round(v * 10) / 10;
let pen = LOGO_W + GAP * H;
let right = 0;
const d = [];
for (const [i, [ch, { size, wght }]] of letters.entries()) {
  const g = glyphAt(ch, wght);
  const s = size / upm;
  const box = g.getBoundingBox();
  right = pen + box.x2 * s;
  let p = "";
  for (const c of g.path.commands) {
    const X = (v) => r(pen + v * s), Y = (v) => r(H - v * s);
    if (c.type === "M") p += `M${X(c.x)} ${Y(c.y)}`;
    else if (c.type === "L") p += `L${X(c.x)} ${Y(c.y)}`;
    else if (c.type === "Q") p += `Q${X(c.x1)} ${Y(c.y1)} ${X(c.x)} ${Y(c.y)}`;
    else if (c.type === "C") p += `C${X(c.x1)} ${Y(c.y1)} ${X(c.x2)} ${Y(c.y2)} ${X(c.x)} ${Y(c.y)}`;
    else p += "Z";
  }
  d.push(p);
  if (i < letters.length - 1) pen += g.advanceWidth * s + TRACK * size;
}

const W = Math.ceil(right);
const size = height ? ` height="${height}" width="${Math.round((W / H) * Number(height))}"` : "";
process.stdout.write(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${size} role="img" aria-label="Meno">` +
    `<path id="mark" fill="${fill}" d="${LOGO}${d.join("")}"/></svg>\n`,
);
console.error(`M ${big.size.toFixed(1)} units, weight ${big.wght}; ENO ${small.size.toFixed(1)} units, weight ${small.wght}; ${W} x ${H}`);
