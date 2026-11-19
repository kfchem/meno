/**
 * A figure's picture spoilt as pictures in papers are, for the round trip's
 * picture step (read.stage.ts): saved as JPEG at a quality and opened again
 * (RT_JPEG, through libjpeg's own `cjpeg` and `djpeg`, which must be on the
 * path), or made a scan (RT_SCAN): turned a little, blurred, made black and
 * white and speckled, the same way each time for the same figure.
 */
import { execFileSync } from "node:child_process";

/** A picture's pixels, a byte each of its channels (3 or 4), row by row. */
export type Raw = { width: number; height: number; data: Uint8Array };

/** How far a made scan is turned, in degrees; how many specks it has for each pixel; how much a speck may be across, in pixels. */
const SCAN_TURN = 0.7;
const SCAN_SPECKS = 1 / 2500;
const SCAN_SPECK = 2;

const channelsOf = (p: Raw) => Math.round(p.data.length / (p.width * p.height));

/** The picture saved as JPEG at `quality` (1 to 100) and opened again: as RGBA. */
export function viaJpeg(p: Raw, quality: number): Raw {
  const ch = channelsOf(p);
  const rgb = Buffer.alloc(p.width * p.height * 3);
  for (let i = 0; i < p.width * p.height; i++) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = p.data[i * ch + c];
  const ppm = Buffer.concat([Buffer.from(`P6\n${p.width} ${p.height}\n255\n`), rgb]);
  const jpeg = execFileSync("cjpeg", ["-quality", String(quality)], { input: ppm, maxBuffer: 1 << 28 });
  const back = execFileSync("djpeg", ["-pnm"], { input: jpeg, maxBuffer: 1 << 28 });
  // (its header: P6, the size, the greatest value - each after white space)
  let at = 0;
  const words: string[] = [];
  while (words.length < 4) {
    while (/\s/.test(String.fromCharCode(back[at]))) at++;
    let w = "";
    while (!/\s/.test(String.fromCharCode(back[at]))) w += String.fromCharCode(back[at++]);
    words.push(w);
  }
  at++;
  const [width, height] = [Number(words[1]), Number(words[2])];
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = back[at + i * 3 + c];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** A small, fixed stream of numbers from naught to one, from a seed (Marsaglia's xorshift). */
function stream(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

/** The picture as a scan of it: turned `SCAN_TURN` degrees, blurred, made black and white at half grey, speckled. As RGBA. */
export function asScan(p: Raw, seed: number): Raw {
  const ch = channelsOf(p);
  const { width, height } = p;
  // (grey, white 255)
  const grey = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) grey[i] = (p.data[i * ch] + p.data[i * ch + 1] + p.data[i * ch + 2]) / 3;
  // (turned about its middle, each pixel read back between its four nearest, white beyond the picture)
  const t = (SCAN_TURN * Math.PI) / 180;
  const [cx, cy] = [width / 2, height / 2];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 255 : grey[y * width + x]);
  const turned = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [dx, dy] = [x - cx, y - cy];
      const sx = cx + dx * Math.cos(t) + dy * Math.sin(t);
      const sy = cy - dx * Math.sin(t) + dy * Math.cos(t);
      const [x0, y0] = [Math.floor(sx), Math.floor(sy)];
      const [fx, fy] = [sx - x0, sy - y0];
      turned[y * width + x] =
        at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
    }
  // (blurred: weights 1, 2, 1 each way)
  const blurred = new Float32Array(width * height);
  const k = [1, 2, 1];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let [sum, wt] = [0, 0];
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const [xx, yy] = [x + i, y + j];
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const w = k[i + 1] * k[j + 1];
          sum += turned[yy * width + xx] * w;
          wt += w;
        }
      blurred[y * width + x] = sum / wt;
    }
  // (black and white, then specks of black on the paper)
  const bw = new Uint8Array(width * height);
  for (let i = 0; i < bw.length; i++) bw[i] = blurred[i] < 128 ? 0 : 255;
  const next = stream(seed);
  const specks = Math.round(width * height * SCAN_SPECKS);
  for (let n = 0; n < specks; n++) {
    const [x, y] = [Math.floor(next() * width), Math.floor(next() * height)];
    const r = 1 + Math.floor(next() * SCAN_SPECK);
    for (let j = 0; j < r; j++) for (let i = 0; i < r; i++) if (x + i < width && y + j < height) bw[(y + j) * width + x + i] = 0;
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < bw.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = bw[i];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}
