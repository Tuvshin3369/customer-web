import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const iconsDir = path.join(publicDir, 'icons');

const defaultSource = path.join(iconsDir, 'source.png');

const sourceArg = process.argv[2];
const sourceInput = sourceArg ? path.resolve(sourceArg) : defaultSource;

/** Хар / бараан саарал JPEG фон — alpha=0; цэнхэр дугуй хадгална. */
function isBackgroundPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  return max < 52 && saturation < 0.22;
}

/**
 * Master logo: хар фон арилгасан, зөвхөн цэнхэр дугуй + сагс (transparent PNG).
 */
async function prepareCircularLogo(inputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isBackgroundPixel(r, g, b)) {
      data[i + 3] = 0;
    }
  }

  return sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 8 })
    .png();
}

async function resizeLogo(logo, size, outPath) {
  await logo
    .clone()
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      position: 'centre',
    })
    .png()
    .toFile(outPath);
}

async function createMaskable512(logo, outPath) {
  const safeSize = Math.round(512 * 0.8);
  const scaled = await logo
    .clone()
    .resize(safeSize, safeSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      position: 'centre',
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png()
    .toFile(outPath);
}

async function main() {
  await mkdir(iconsDir, { recursive: true });

  const prepared = await prepareCircularLogo(sourceInput);
  const sourceOut = path.join(iconsDir, 'source.png');
  await prepared.clone().toFile(sourceOut);

  const logo = sharp(await prepared.toBuffer());

  const favicon32 = path.join(publicDir, 'favicon-32.png');
  const favicon16 = path.join(publicDir, 'favicon-16.png');

  await resizeLogo(logo, 32, favicon32);
  await resizeLogo(logo, 16, favicon16);
  await copyFile(favicon32, path.join(publicDir, 'favicon.png'));

  const icoBuffer = await pngToIco([favicon16, favicon32]);
  await writeFile(path.join(publicDir, 'favicon.ico'), icoBuffer);

  await resizeLogo(logo, 192, path.join(publicDir, 'icon-192.png'));
  await resizeLogo(logo, 512, path.join(publicDir, 'icon-512.png'));
  await resizeLogo(logo, 180, path.join(publicDir, 'apple-touch-icon.png'));
  await createMaskable512(logo, path.join(publicDir, 'maskable-icon-512.png'));

  console.log('Generated transparent circular icons in public/ from', sourceInput);
  console.log('Master source saved to', sourceOut);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
