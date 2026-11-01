import { build } from "esbuild";
import { chmodSync } from "node:fs";

// `typescript`/`marked` are lazy-loaded runtime dependencies, deliberately not bundled.
const external = ["typescript", "marked"];

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/nest-doc.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external,
  logLevel: "info",
});

// esbuild preserves the entry file's shebang, but not its executable bit.
chmodSync("dist/nest-doc.mjs", 0o755);
