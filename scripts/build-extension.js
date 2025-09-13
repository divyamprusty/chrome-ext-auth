const fs = require("fs-extra");
const path = require("path");

async function buildExtension() {
  console.log("Building Chrome extension...");

  const publicDir = path.join(__dirname, "..", "public");
  const outDir = path.join(__dirname, "..", "out");

  // Clean the out directory first
  if (await fs.pathExists(outDir)) {
    await fs.remove(outDir);
    console.log("Cleaned previous build output");
  }

  // Create out directory
  await fs.ensureDir(outDir);

  // Copy all files from public to out
  await fs.copy(publicDir, outDir);
  console.log("Copied extension files to out directory");

  console.log("Chrome extension build completed!");
  console.log("You can now load the public folder in Chrome as an unpacked extension.");
}

buildExtension().catch(console.error);
