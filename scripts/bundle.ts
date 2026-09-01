import { build } from "esbuild";
import { chmodSync } from "node:fs";

// Optional @nestjs/* peers only the user's project may have installed — esbuild must not resolve their require() calls at bundle time.
const NEST_OPTIONAL_PEERS = [
  "class-validator",
  "class-transformer",
  "@nestjs/websockets",
  "@nestjs/websockets/socket-module",
  "@nestjs/microservices",
  "@nestjs/microservices/microservices-module",
  "@nestjs/platform-express",
  "cache-manager",
];

// `typescript`/`marked` are lazy-loaded runtime dependencies, deliberately not bundled.
const external = [...NEST_OPTIONAL_PEERS, "typescript", "marked"];

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
