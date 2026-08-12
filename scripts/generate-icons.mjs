// One-off placeholder icon generator: writes flat RGBA PNGs by hand via
// node:zlib, with no image-library dependency. Re-run after changing
// ACCENT/MARK below; there's no need to keep this in the regular build.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, "..", "public", "icons");

const ACCENT = [0xb5, 0x50, 0x2e]; // matches --accent in styles.css
const MARK = [0xff, 0xf8, 0xf4]; // matches --accent-contrast

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Renders a flat accent square with a centered mark circle, as raw RGBA PNG bytes. */
function renderIcon(size, { circleRadiusRatio }) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2;
  const cy = size / 2;
  const r = size * circleRadiusRatio;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const inCircle = dx * dx + dy * dy <= r * r;
      const [red, green, blue] = inCircle ? MARK : ACCENT;
      const offset = rowStart + 1 + x * 4;
      raw[offset] = red;
      raw[offset + 1] = green;
      raw[offset + 2] = blue;
      raw[offset + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = deflateSync(raw);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const targets = [
  { file: "icon-192.png", size: 192, circleRadiusRatio: 0.32 },
  { file: "icon-512.png", size: 512, circleRadiusRatio: 0.32 },
  { file: "icon-512-maskable.png", size: 512, circleRadiusRatio: 0.24 }, // smaller mark to stay in the safe zone
  { file: "apple-touch-icon.png", size: 180, circleRadiusRatio: 0.32 },
];

for (const target of targets) {
  const png = renderIcon(target.size, target);
  writeFileSync(path.join(iconsDir, target.file), png);
  console.log(`wrote ${target.file}`);
}
