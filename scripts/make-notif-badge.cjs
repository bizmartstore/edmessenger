const fs = require("fs");
const zlib = require("zlib");

/** Minimal PNG writer (RGBA). */
function writePng(width, height, rgba) {
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function setPixel(rgba, w, x, y, a) {
  if (x < 0 || y < 0 || x >= w || y >= w) return;
  const i = (y * w + x) << 2;
  rgba[i] = 255;
  rgba[i + 1] = 255;
  rgba[i + 2] = 255;
  rgba[i + 3] = a;
}

function fillCircle(rgba, w, cx, cy, r, a) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(rgba, w, x, y, a);
    }
  }
}

function clearCircle(rgba, w, cx, cy, r) {
  fillCircle(rgba, w, cx, cy, r, 0);
}

function fillTriangle(rgba, w, x0, y0, x1, y1, x2, y2, a) {
  const minX = Math.floor(Math.min(x0, x1, x2));
  const maxX = Math.ceil(Math.max(x0, x1, x2));
  const minY = Math.floor(Math.min(y0, y1, y2));
  const maxY = Math.ceil(Math.max(y0, y1, y2));
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (area === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = (x1 - x) * (y2 - y) - (x2 - x) * (y1 - y);
      const w1 = (x2 - x) * (y0 - y) - (x0 - x) * (y2 - y);
      const w2 = (x0 - x) * (y1 - y) - (x1 - x) * (y0 - y);
      if (
        (w0 >= 0 && w1 >= 0 && w2 >= 0) ||
        (w0 <= 0 && w1 <= 0 && w2 <= 0)
      ) {
        setPixel(rgba, w, x, y, a);
      }
    }
  }
}

const SIZE = 96;
const rgba = Buffer.alloc(SIZE * SIZE * 4); // transparent

const cx = 48;
const cy = 44;
const outerR = 34;

// Speech-bubble circle
fillCircle(rgba, SIZE, cx, cy, outerR, 255);
// Hollow ring (cut out center disk lightly smaller so ring remains)
clearCircle(rgba, SIZE, cx, cy, 26);

// Bubble tail (bottom-left)
fillTriangle(rgba, SIZE, 28, 68, 38, 62, 22, 82, 255);

// Owl head inside
fillCircle(rgba, SIZE, cx, cy - 2, 18, 255);
// Ears
fillTriangle(rgba, SIZE, 34, 30, 40, 18, 44, 32, 255);
fillTriangle(rgba, SIZE, 52, 32, 56, 18, 62, 30, 255);
// Eye cutouts
clearCircle(rgba, SIZE, 41, 42, 4);
clearCircle(rgba, SIZE, 55, 42, 4);
// Beak cutout
fillTriangle(rgba, SIZE, 45, 48, 51, 48, 48, 54, 0);

const out = writePng(SIZE, SIZE, rgba);
fs.mkdirSync("public/icons", { recursive: true });
fs.writeFileSync("public/icons/notif-badge.png", out);

// Also write 192 version for higher-DPI badge contexts
const SIZE2 = 192;
const rgba2 = Buffer.alloc(SIZE2 * SIZE2 * 4);
// Scale blit nearest-neighbor from 96
for (let y = 0; y < SIZE2; y++) {
  for (let x = 0; x < SIZE2; x++) {
    const sx = Math.floor((x * SIZE) / SIZE2);
    const sy = Math.floor((y * SIZE) / SIZE2);
    const si = (sy * SIZE + sx) << 2;
    const oi = (y * SIZE2 + x) << 2;
    rgba2[oi] = rgba[si];
    rgba2[oi + 1] = rgba[si + 1];
    rgba2[oi + 2] = rgba[si + 2];
    rgba2[oi + 3] = rgba[si + 3];
  }
}
fs.writeFileSync("public/icons/notif-badge-192.png", writePng(SIZE2, SIZE2, rgba2));

let opaque = 0;
let transparent = 0;
for (let i = 3; i < rgba.length; i += 4) {
  if (rgba[i] > 200) opaque++;
  else transparent++;
}
console.log("badge written opaque", opaque, "transparent", transparent);
