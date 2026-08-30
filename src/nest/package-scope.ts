// The `common.X` -> `@nestjs/common` shorthand (SPEC.md §5, ARCHITECTURE.md
// §4.1): "a static table of the official scope. Unscoped names not in that
// table are treated as literal package names."
//
// Built from two verified sources, not guessed:
// - the nestjs/nest monorepo's packages/ directory (github.com/nestjs/nest,
//   the packages actually published from the core repo)
// - every `@nestjs/<name>` string found anywhere in the real guide corpus's
//   code samples (data/guides.json) — the packages the docs themselves
//   actually reference, imports and otherwise
const OFFICIAL_SCOPE_NAMES = [
  // nestjs/nest monorepo (packages/)
  "common",
  "core",
  "microservices",
  "platform-express",
  "platform-fastify",
  "platform-socket.io",
  "platform-ws",
  "testing",
  "websockets",
  // referenced throughout the real docs corpus, separate repos
  "apollo",
  "axios",
  "bull",
  "bullmq",
  "cache-manager",
  "cli",
  "config",
  "cqrs",
  "devtools-integration",
  "event-emitter",
  "graphql",
  "jwt",
  "mau",
  "mercurius",
  "mongoose",
  "observe",
  "passport",
  "schedule",
  "schematics",
  "sequelize",
  "serve-static",
  "swagger",
  "terminus",
  "throttler",
  "typeorm",
] as const;

const OFFICIAL_SCOPE = new Set<string>(OFFICIAL_SCOPE_NAMES);

// "common" -> "@nestjs/common". Names not in the table pass through
// unchanged — treated as literal (unscoped) package names, per spec.
export function expandPackageShorthand(name: string): string {
  return OFFICIAL_SCOPE.has(name) ? `@nestjs/${name}` : name;
}
