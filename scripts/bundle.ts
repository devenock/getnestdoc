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

// `typescript` is a runtime dependency, lazy-imported on the symbol path only,
// and deliberately not bundled (40 MB). See ADR-0001, ARCHITECTURE.md §8.
const external = [...NEST_OPTIONAL_PEERS, "typescript"];

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
