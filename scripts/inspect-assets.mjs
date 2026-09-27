// Read PNG IHDR chunks directly: no image library or guessed sprite rectangles.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
const report = readdirSync('assets/img')
  .filter((f) => f.endsWith('.png'))
  .map((file) => {
    const b = readFileSync(`assets/img/${file}`);
    if (b.subarray(1, 4).toString() !== 'PNG') throw Error(`Not PNG: ${file}`);
    const type = b[25];
    return {
      file,
      width: b.readUInt32BE(16),
      height: b.readUInt32BE(20),
      bitDepth: b[24],
      colorType: type,
      alphaChannel: [4, 6].includes(type),
      used: false,
    };
  });
mkdirSync('docs', { recursive: true });
writeFileSync('docs/asset-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(report);
