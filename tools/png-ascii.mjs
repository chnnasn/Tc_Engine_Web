/**
 * Decode a PNG locally and print a coarse ASCII luminance map plus color
 * statistics.  Useful for verifying that a WebGL screenshot actually shows
 * the multi-panel editor layout without sending the image anywhere.
 *
 *   node tools/png-ascii.mjs <file.png> [columns] [rows]
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const file = process.argv[2];
const columns = Number(process.argv[3] || 140);
const rows = Number(process.argv[4] || 48);
const rawProbes = process.argv.slice(5).filter((arg) => arg.includes(","));
const paletteMode = process.argv.includes("--palette");
const probes = rawProbes.map((item) => {
  const [px, py] = item.split(",").map(Number);
  return { px, py };
});
const bytes = readFileSync(file);

let offset = 8; // PNG signature
let width = 0;
let height = 0;
let bitDepth = 0;
let colorType = 0;
let idat = Buffer.alloc(0);

function chunk() {
  const length = bytes.readUInt32BE(offset);
  const type = bytes.toString("ascii", offset + 4, offset + 8);
  const data = bytes.subarray(offset + 8, offset + 8 + length);
  offset += 12 + length;
  return { type, data };
}

while (offset < bytes.length) {
  const { type, data } = chunk();
  if (type === "IHDR") {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === "IDAT") {
    idat = Buffer.concat([idat, data]);
  } else if (type === "IEND") {
    break;
  }
}

if (!width || !height) throw new Error("No IHDR/IDAT found");
const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
const raw = inflateSync(idat);
const stride = width * channels;

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

const pixels = Buffer.alloc(height * stride);
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  const lineStart = y * stride;
  for (let x = 0; x < stride; x++) {
    const rawValue = raw[y * (stride + 1) + 1 + x];
    const left = x >= channels ? pixels[lineStart + x - channels] : 0;
    const up = y > 0 ? pixels[lineStart - stride + x] : 0;
    const upLeft = y > 0 && x >= channels ? pixels[lineStart - stride + x - channels] : 0;
    let value = rawValue;
    if (filter === 1) value += left;
    else if (filter === 2) value += up;
    else if (filter === 3) value += Math.floor((left + up) / 2);
    else if (filter === 4) value += paeth(left, up, upLeft);
    pixels[lineStart + x] = value & 0xff;
  }
}

const ramp = " .:-=+*#%@";
const grid = [];
const stats = { distinct: new Set(), nonBlack: 0, dark: 0, mid: 0, bright: 0 };
for (let r = 0; r < rows; r++) {
  let line = "";
  for (let c = 0; c < columns; c++) {
    const px = Math.min(width - 1, Math.floor((c + 0.5) * width / columns));
    const py = Math.min(height - 1, Math.floor((r + 0.5) * height / rows));
    const p = py * stride + px * channels;
    const red = pixels[p];
    const green = pixels[p + 1];
    const blue = pixels[p + 2];
    const lum = (red * 299 + green * 587 + blue * 114) / 1000;
    stats.distinct.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
    if (lum > 220) stats.bright++;
    else if (lum > 90) stats.mid++;
    else if (lum > 12) stats.dark++;
    else stats.nonBlack++;
    if (paletteMode) {
      if (red > 120 && green > 180 && blue > 200 && blue > red) line += "B";
      else if (lum >= 52 && lum <= 70) line += "#";
      else if (lum >= 20 && lum <= 46) line += ".";
      else if (lum > 8) line += "+";
      else line += " ";
    } else {
      const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (spread > 36 && lum > 30) {
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      let sat = 0;
      if (max === red) sat = 0;
      else if (max === green) sat = 1;
      else sat = 2;
      if (min === max) sat = -1;
      line += sat === 0 ? "R" : sat === 1 ? "G" : "B";
      } else {
        line += ramp[Math.min(ramp.length - 1, Math.floor(lum / 256 * ramp.length))];
      }
    }
  }
  grid.push(line);
}

console.log(`PNG ${width}x${height} bit=${bitDepth} colorType=${colorType}`);
console.log(`samples=${rows * columns} uniqueShades=${stats.distinct.size} black=${stats.nonBlack} dark=${stats.dark} mid=${stats.mid} bright=${stats.bright}`);
console.log(grid.join("\n"));
if (probes.length) {
  for (const { px, py } of probes) {
    const x = Math.floor(width * px / 100);
    const y = Math.floor(height * py / 100);
    const p = y * stride + x * channels;
    console.log(`probe ${px}%,${py}% -> rgb(${pixels[p]},${pixels[p + 1]},${pixels[p + 2]})`);
  }
}
const extra = process.argv.slice(5).filter((arg) => arg.startsWith("line:"));
for (const spec of extra) {
  const [, axis, fixed, from, to, step] = spec.split(":");
  const values = [];
  for (let v = Number(from); v <= Number(to); v += Number(step)) {
    const x = axis === "x" ? Math.floor(width * v / 100) : Math.floor(width * Number(fixed) / 100);
    const y = axis === "y" ? Math.floor(height * v / 100) : Math.floor(height * Number(fixed) / 100);
    const p = y * stride + x * channels;
    const lum = (pixels[p] * 299 + pixels[p + 1] * 587 + pixels[p + 2] * 114) / 1000;
    values.push(`${v}%:${pixels[p]},${pixels[p + 1]},${pixels[p + 2]}:${lum | 0}`);
  }
  console.log(`line ${spec}: ${values.join("  ")}`);
}
