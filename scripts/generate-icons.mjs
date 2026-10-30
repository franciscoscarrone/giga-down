// Genera los íconos PNG de la PWA a partir del logo (SVG).
// Uso: node scripts/generate-icons.mjs  (usa `sharp`, que ya viene instalado con Next.js).
// Los PNG resultantes se versionan: este script solo hace falta si cambia el logo.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const ACCENT = "#c3f344";
const INK = "#14140e";

/** Flecha + bandeja. `inset` achica el dibujo para la zona segura de los íconos maskable. */
function logoSvg({ size, rounded, inset = 0 }) {
  const scale = 1 - inset * 2;
  const offset = 32 * inset * 2;
  const radius = rounded ? 16 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${radius}" fill="${ACCENT}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <path d="M32 15v24m-11-11 11 11 11-11M19 48h26" fill="none" stroke="${INK}"
      stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const png = (svg) => sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

await mkdir("public/icons", { recursive: true });

const outputs = [
  ["public/icons/icon-192.png", logoSvg({ size: 192, rounded: true })],
  ["public/icons/icon-512.png", logoSvg({ size: 512, rounded: true })],
  // Maskable: fondo a sangre y el dibujo dentro del 80 % central.
  ["public/icons/maskable-512.png", logoSvg({ size: 512, rounded: false, inset: 0.1 })],
  // iOS redondea las esquinas por su cuenta.
  ["src/app/apple-icon.png", logoSvg({ size: 180, rounded: false, inset: 0.06 })],
];

for (const [path, svg] of outputs) {
  await writeFile(path, await png(svg));
  console.log("✓", path);
}

await writeFile("src/app/icon.svg", logoSvg({ size: 64, rounded: true }));
console.log("✓ src/app/icon.svg");
