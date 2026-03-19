/**
 * Generate app icons from SVG source
 * Produces: icon.png (256x256) and icon.ico (multi-size) for Windows
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'src', 'assets');
const svgPath = join(assetsDir, 'icon.svg');

async function generateIcons() {
  const svgBuffer = readFileSync(svgPath);
  
  // Generate PNG at various sizes
  const sizes = [16, 32, 48, 64, 128, 256, 512];
  
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(join(assetsDir, `icon-${size}.png`));
    console.log(`✓ Generated icon-${size}.png`);
  }
  
  // Main icon.png at 256x256
  await sharp(svgBuffer)
    .resize(256, 256)
    .png()
    .toFile(join(assetsDir, 'icon.png'));
  console.log('✓ Generated icon.png (256x256)');

  // Generate ICO file (contains multiple sizes)
  // ICO format: header + directory entries + image data
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  
  for (const size of icoSizes) {
    const buf = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer: buf });
  }
  
  // Build ICO file
  const ico = buildIco(pngBuffers);
  writeFileSync(join(assetsDir, 'icon.ico'), ico);
  console.log('✓ Generated icon.ico (multi-size)');
  
  console.log('\nAll icons generated successfully!');
}

function buildIco(images) {
  // ICO Header: 6 bytes
  // Directory entry: 16 bytes each
  // Then PNG data
  
  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = images.length;
  const dirSize = dirEntrySize * numImages;
  
  let dataOffset = headerSize + dirSize;
  const entries = [];
  
  for (const img of images) {
    entries.push({
      width: img.size >= 256 ? 0 : img.size,  // 0 means 256 in ICO
      height: img.size >= 256 ? 0 : img.size,
      dataSize: img.buffer.length,
      dataOffset: dataOffset,
      buffer: img.buffer,
    });
    dataOffset += img.buffer.length;
  }
  
  // Total size
  const totalSize = dataOffset;
  const ico = Buffer.alloc(totalSize);
  
  // Header
  ico.writeUInt16LE(0, 0);       // Reserved
  ico.writeUInt16LE(1, 2);       // Type: 1 = ICO
  ico.writeUInt16LE(numImages, 4); // Number of images
  
  // Directory entries
  let offset = 6;
  for (const entry of entries) {
    ico.writeUInt8(entry.width, offset);      // Width
    ico.writeUInt8(entry.height, offset + 1); // Height
    ico.writeUInt8(0, offset + 2);            // Color palette
    ico.writeUInt8(0, offset + 3);            // Reserved
    ico.writeUInt16LE(1, offset + 4);         // Color planes
    ico.writeUInt16LE(32, offset + 6);        // Bits per pixel
    ico.writeUInt32LE(entry.dataSize, offset + 8);   // Data size
    ico.writeUInt32LE(entry.dataOffset, offset + 12); // Data offset
    offset += 16;
  }
  
  // Image data
  for (const entry of entries) {
    entry.buffer.copy(ico, entry.dataOffset);
  }
  
  return ico;
}

generateIcons().catch(console.error);
