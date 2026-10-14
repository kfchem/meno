/**
 * SHA-256, as FIPS 180-4 (section 6.2) gives it, worked out at once: for
 * where a hash cannot wait for the browser's own (`crypto.subtle`, which
 * answers later) - a file kept in a workspace's file, checked against the
 * name it is kept by as it is read.
 */

// the first 32 bits of the fractional parts of the cube roots of the first 64 primes (section 4.2.2)
const K = Int32Array.of(
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
);

// the first 32 bits of the fractional parts of the square roots of the first 8 primes (section 5.3.3)
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/** One 64-byte block of `bytes`, from `at`, taken into the hash `h` (section 6.2.2); `w`, the message schedule, is room to work in. */
function block(h: Int32Array, w: Int32Array, bytes: Uint8Array, at: number): void {
  for (let t = 0; t < 16; t++, at += 4) w[t] = (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
  for (let t = 16; t < 64; t++) {
    const x = w[t - 15];
    const y = w[t - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    w[t] = (s1 + w[t - 7] + s0 + w[t - 16]) | 0;
  }
  let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
  for (let t = 0; t < 64; t++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (k + S1 + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    k = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  h[0] += a;
  h[1] += b;
  h[2] += c;
  h[3] += d;
  h[4] += e;
  h[5] += f;
  h[6] += g;
  h[7] += k;
}

/** Bytes' SHA-256, in hex, worked out at once. */
export function sha256Hex(bytes: Uint8Array): string {
  const h = Int32Array.from(H0);
  const w = new Int32Array(64);
  const whole = bytes.length - (bytes.length % 64);
  for (let at = 0; at < whole; at += 64) block(h, w, bytes, at);
  // the rest, then a one bit, then zeros, then the length in bits as 64 bits, to fill a block or two (section 5.1.1)
  const rest = bytes.length - whole;
  const last = new Uint8Array(rest < 56 ? 64 : 128);
  last.set(bytes.subarray(whole));
  last[rest] = 0x80;
  const view = new DataView(last.buffer);
  const bits = bytes.length * 8;
  view.setUint32(last.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(last.length - 4, bits >>> 0);
  for (let at = 0; at < last.length; at += 64) block(h, w, last, at);
  return Array.from(h, (x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}
