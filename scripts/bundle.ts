import { build } from "esbuild";
import { chmodSync } from "node:fs";

// Optional peers of @nestjs/* that only the user's project may have installed.
// esbuild must not try to resolve their `require()` calls at bundle time.
// See ARCHITECTURE.md §8.
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

// `typescript` and `marked` are both runtime dependencies lazy-imported on a
// single path each (the symbol path, and `nest-doc update` respectively) and
// deliberately not bundled — see ADR-0001, ARCHITECTURE.md §8, and
// src/nest/update/marked-loader.ts.
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
