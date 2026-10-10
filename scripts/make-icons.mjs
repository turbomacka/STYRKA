// Genererar PWA-ikoner (PNG) utan externa beroenden: skivstångssymbol på blå bakgrund.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
function png(size) {
  const s = size / 64;
  const rects = [[8, 22, 6, 20], [16, 17, 7, 30], [41, 17, 7, 30], [50, 22, 6, 20], [23, 29, 18, 6]];
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = x / s, v = y / s;
      const white = rects.some(([rx, ry, rw, rh]) => u >= rx && u < rx + rw && v >= ry && v < ry + rh);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = white ? 255 : 11; raw[o + 1] = white ? 255 : 92; raw[o + 2] = white ? 255 : 173;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync('public/icon-192.png', png(192));
writeFileSync('public/icon-512.png', png(512));
console.log('ikoner skapade');
