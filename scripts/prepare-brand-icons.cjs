/**
 * Generate EdMessenger brand icons for in-app, PWA, and push notifications.
 * Source: full-color shield crest logo.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src/assets/edmessenger-logo.png");
const BRAND_BLUE = { r: 30, g: 64, b: 175, alpha: 1 }; // #1e40af theme_color
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function containOnCanvas(size, background, padRatio = 0.06) {
  const pad = Math.round(size * padRatio);
  const inner = size - pad * 2;
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png();
}

/** Maskable PWA: more padding so Android circle crop keeps crest + text. */
async function maskable(size) {
  return containOnCanvas(size, BRAND_BLUE, 0.14);
}

/** Any / apple-touch: white canvas, slight padding. */
async function anyIcon(size) {
  return containOnCanvas(size, WHITE, 0.04);
}

/**
 * Android notification badge: white speech-bubble silhouette on transparent.
 * (Full-color logos become solid white blobs when alpha-masked.)
 */
function writeSpeechBubbleBadge(size, outPath) {
  const zlib = require("zlib");

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
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }
  function writePng(width, height, rgba) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
      raw[y * (stride + 1)] = 0;
      rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
    }
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw)),
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

  const s = size;
  const rgba = Buffer.alloc(s * s * 4);
  const scale = s / 96;
  const cx = 48 * scale;
  const cy = 44 * scale;
  const outerR = 34 * scale;

  fillCircle(rgba, s, cx, cy, outerR, 255);
  clearCircle(rgba, s, cx, cy, 26 * scale);
  fillTriangle(
    rgba,
    s,
    28 * scale,
    68 * scale,
    38 * scale,
    62 * scale,
    22 * scale,
    82 * scale,
    255,
  );
  // Three dots (message ellipsis) — readable at tiny sizes
  fillCircle(rgba, s, cx - 12 * scale, cy, 5 * scale, 255);
  fillCircle(rgba, s, cx, cy, 5 * scale, 255);
  fillCircle(rgba, s, cx + 12 * scale, cy, 5 * scale, 255);

  fs.writeFileSync(outPath, writePng(s, s, rgba));
}

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`Missing source logo: ${SRC}`);
  }
  fs.mkdirSync(path.join(ROOT, "public/icons"), { recursive: true });

  // In-app + OG / primary brand mark (square, white pad)
  await (await anyIcon(512)).toFile(path.join(ROOT, "public/logo.png"));

  // PWA home-screen (any purpose) — white, tight contain
  await (await anyIcon(512)).toFile(path.join(ROOT, "public/logo-pwa.png"));
  await (await anyIcon(192)).toFile(path.join(ROOT, "public/icons/icon-192.png"));
  await (await anyIcon(512)).toFile(path.join(ROOT, "public/icons/icon-512.png"));

  // Maskable variants (safe zone on brand blue)
  await (await maskable(192)).toFile(path.join(ROOT, "public/icons/icon-maskable-192.png"));
  await (await maskable(512)).toFile(path.join(ROOT, "public/icons/icon-maskable-512.png"));

  // Full-color notification icon (Android tray large icon / Chrome web icon)
  await (await anyIcon(256)).toFile(path.join(ROOT, "public/icons/push-icon.png"));
  await (await anyIcon(512)).toFile(path.join(ROOT, "public/logo-push.png"));

  // Monochrome status-bar badge (must be white-on-transparent)
  writeSpeechBubbleBadge(96, path.join(ROOT, "public/icons/notif-badge.png"));
  writeSpeechBubbleBadge(192, path.join(ROOT, "public/icons/notif-badge-192.png"));

  // Favicon (ICO via PNG rename fallback — browsers accept PNG as favicon if linked;
  // also write a small PNG that __root can use)
  await (await anyIcon(64)).toFile(path.join(ROOT, "public/favicon-64.png"));
  // Keep .ico as PNG bytes for simplicity (modern browsers); or copy 64png
  fs.copyFileSync(
    path.join(ROOT, "public/favicon-64.png"),
    path.join(ROOT, "public/favicon.ico"),
  );

  // Optional loose copy for debugging
  if (fs.existsSync(path.join(ROOT, "public/logo-source.png"))) {
    fs.unlinkSync(path.join(ROOT, "public/logo-source.png"));
  }

  const report = {};
  for (const f of [
    "public/logo.png",
    "public/logo-pwa.png",
    "public/logo-push.png",
    "public/icons/push-icon.png",
    "public/icons/icon-192.png",
    "public/icons/icon-512.png",
    "public/icons/icon-maskable-192.png",
    "public/icons/icon-maskable-512.png",
    "public/icons/notif-badge.png",
    "public/favicon.ico",
  ]) {
    report[f] = fs.statSync(path.join(ROOT, f)).size;
  }
  console.log("brand icons ready", report);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
