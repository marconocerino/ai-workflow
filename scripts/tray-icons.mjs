// Tray icons (VAI-205), drawn in code: no image library, no design file yet.
// The logo's five waveform bars on a 24-unit grid; state by colour and, for recording, a red dot.
//   node scripts/tray-icons.mjs   → writes assets/tray/{idle,listening,recording,transcribing}{,@2x}.png
// A test checks the committed files still match (pixels, not bytes: zlib output can differ).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = path.join(root, 'assets', 'tray');
export const STATES = ['idle', 'listening', 'recording', 'transcribing'];
export const SIZES = { '': 16, '@2x': 32 };

// Mid-tone colours that read on both light and dark Windows taskbars.
const COLORS = {
  idle: [0x8a, 0x97, 0x8a],
  listening: [0x3f, 0xa0, 0x6a],
  recording: [0x3f, 0xa0, 0x6a],
  transcribing: [0x4a, 0x8f, 0xd9],
  dot: [0xe5, 0x48, 0x4d],
};

// Logo bars: x centre and y range on the 24 grid (path "M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4").
const BARS = [
  [4, 10, 14],
  [8, 7, 17],
  [12, 4, 20],
  [16, 7, 17],
  [20, 10, 14],
];
const BAR_RADIUS = 1.35; // a little bolder than the logo, so 16 px stays readable
const DOT = { x: 18.5, y: 18.5, r: 5, gap: 1.5 };

function inCapsule(x, y, [cx, y1, y2]) {
  const cy = Math.min(Math.max(y, y1), y2);
  return (x - cx) ** 2 + (y - cy) ** 2 <= BAR_RADIUS ** 2;
}

/** RGBA pixels for one state at one size (4×4 supersampling for smooth edges). */
export function renderIcon(state, size) {
  const px = Buffer.alloc(size * size * 4);
  const bars = COLORS[state];
  const withDot = state === 'recording';
  const n = 4;
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let barHits = 0;
      let dotHits = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const x = ((pxl + (sx + 0.5) / n) / size) * 24;
          const y = ((py + (sy + 0.5) / n) / size) * 24;
          const d = Math.hypot(x - DOT.x, y - DOT.y);
          if (withDot && d <= DOT.r) dotHits++;
          else if (withDot && d <= DOT.r + DOT.gap)
            continue; // clear ring around the dot
          else if (BARS.some((b) => inCapsule(x, y, b))) barHits++;
        }
      }
      const total = n * n;
      const a = (barHits + dotHits) / total;
      if (a === 0) continue;
      const mix = (i) =>
        Math.round((bars[i] * barHits + COLORS.dot[i] * dotHits) / (barHits + dotHits));
      const o = (py * size + pxl) * 4;
      px[o] = mix(0);
      px[o + 1] = mix(1);
      px[o + 2] = mix(2);
      px[o + 3] = Math.round(a * 255);
    }
  }
  return px;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** Minimal RGBA PNG encoder. */
export function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Decode PNGs written by encodePng (for the drift test). */
export function decodePng(png) {
  const size = png.readUInt32BE(16);
  const idat = [];
  for (let p = 8; p < png.length;) {
    const len = png.readUInt32BE(p);
    const type = png.toString('latin1', p + 4, p + 8);
    if (type === 'IDAT') idat.push(png.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    raw.copy(rgba, y * size * 4, y * (size * 4 + 1) + 1, (y + 1) * (size * 4 + 1));
  return { size, rgba };
}

export function iconFiles() {
  return STATES.flatMap((state) =>
    Object.entries(SIZES).map(([suffix, size]) => ({ state, size, file: `${state}${suffix}.png` })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const { state, size, file } of iconFiles()) {
    writeFileSync(path.join(OUT_DIR, file), encodePng(renderIcon(state, size), size));
    console.log(`wrote assets/tray/${file}`);
  }
}
