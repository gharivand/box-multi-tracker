// Builds the SDK, packs it with `npm pack`, and installs the resulting tarball
// into this example, so the example consumes the real package boundary.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exampleDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(exampleDir, "..", "..");
const sdkDir = join(exampleDir, ".sdk");
const tarballPath = join(sdkDir, "box-multi-tracker.tgz");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args, cwd, options = {}) {
  const result = spawnSync(npm, args, {
    cwd,
    encoding: "utf8",
    stdio: options.capture ? ["inherit", "pipe", "inherit"] : "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\n\`npm ${args.join(" ")}\` failed in ${cwd}`);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

console.log("1/4 Building the SDK (repository root)");
run(["run", "build"], repoRoot);

console.log("2/4 Packing the SDK with `npm pack`");
rmSync(sdkDir, { recursive: true, force: true });
mkdirSync(sdkDir, { recursive: true });
const packJson = run(["pack", "--ignore-scripts", "--json", "--pack-destination", sdkDir], repoRoot, {
  capture: true,
});
const [packed] = JSON.parse(packJson);
const paths = packed.files.map((file) => file.path);
console.log(`    ${packed.filename}: ${paths.join(", ")}`);

// Guard: the tarball must contain only distributable files, never this example.
const allowed = (path) => path === "package.json" || path === "README.md" || path.startsWith("dist/");
const unexpected = paths.filter((path) => !allowed(path));
if (unexpected.length > 0) {
  console.error(`Unexpected files in the SDK tarball: ${unexpected.join(", ")}`);
  process.exit(1);
}

copyFileSync(join(sdkDir, packed.filename), tarballPath);
rmSync(join(sdkDir, packed.filename), { force: true });

console.log("3/4 Removing any previously installed copy");
rmSync(join(exampleDir, "node_modules", "box-multi-tracker"), { recursive: true, force: true });

console.log("4/4 Installing into the example (npm install)");
run(["install", "--no-audit", "--no-fund"], exampleDir);

console.log(`Done. Installed ${packed.name}@${packed.version} from ${tarballPath}`);
