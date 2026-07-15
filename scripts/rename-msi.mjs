// Tauri's WiX bundler always appends the installer language to the filename
// (e.g. CodeNest_0.1.0_x64_en-US.msi). There's no config knob to drop that
// suffix, so this runs as a post-build step to rename it to
// CodeNest_{version}_x64.msi instead.
import { readFileSync, readdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const conf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
const { productName, version } = conf;
const msiDir = join(root, "src-tauri/target/release/bundle/msi");

const files = readdirSync(msiDir).filter((f) => f.endsWith(".msi"));
if (files.length === 0) {
  console.error(`No .msi file found in ${msiDir}`);
  process.exit(1);
}

for (const file of files) {
  const target = `${productName}_${version}_x64.msi`;
  if (file === target) continue;
  renameSync(join(msiDir, file), join(msiDir, target));
  console.log(`Renamed ${file} -> ${target}`);
}
