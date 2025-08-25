// copy-static.js
import { copyFile } from 'fs/promises';
import { resolve, join } from 'path';

const filesToCopy = ['manifest.json'];
const srcDir = resolve('public');
const destDir = resolve('dist');

for (const file of filesToCopy) {
  const src = join(srcDir, file);
  const dest = join(destDir, file);
  try {
    await copyFile(src, dest);
    console.log(`✅ Copied ${file}`);
  } catch (err) {
    console.error(`❌ Failed to copy ${file}:`, err);
  }
}