// Deterministic decorative styles derived from ids. These carry no meaning but
// must be *stable* for a given id so a letter always looks the same wherever it
// appears (wall, drafts, correspondence). The algorithm mirrors the backend
// (Backend/app/services/derive.py) exactly — SHA-1 of the id, first 4 bytes as a
// big-endian uint32, modulo the palette size — so a letter's seal matches the
// one the server assigns on the board.

import type { BundleTie, LetterSeal } from "@/components/letterkit";

const SEALS: LetterSeal[] = ["wax", "clip", "pin", "tape", "ribbon"];
const TIES: BundleTie[] = [
  "red-string",
  "green-string",
  "clip",
  "twine-wax",
  "green-band",
];

export function sealFor(id: string): LetterSeal {
  return SEALS[sha1FirstWord(id) % SEALS.length];
}

export function tieFor(key: string): BundleTie {
  return TIES[sha1FirstWord(key) % TIES.length];
}

// First 32-bit word (h0) of the SHA-1 digest of the UTF-8 bytes, unsigned.
// Equivalent to Python's int.from_bytes(sha1(value).digest()[:4], "big").
function sha1FirstWord(message: string): number {
  const data = new TextEncoder().encode(message);
  const bitLen = data.length * 8;
  // Pad to a multiple of 64 bytes: 0x80, then zeros, then a 64-bit length.
  const withMarker = data.length + 1;
  const total = withMarker + ((56 - (withMarker % 64) + 64) % 64) + 8;
  const bytes = new Uint8Array(total);
  bytes.set(data);
  bytes[data.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(total - 4, bitLen >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let chunk = 0; chunk < total; chunk += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(chunk + i * 4);
    for (let i = 16; i < 80; i++) {
      const n = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (n << 1) | (n >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return h0 >>> 0;
}
