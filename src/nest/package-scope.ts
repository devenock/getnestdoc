// The `common.X` -> `@nestjs/common` shorthand (SPEC.md §5, ARCHITECTURE.md §4.1). Built from two verified sources: the nestjs/nest monorepo's packages/ directory, and every `@nestjs/<name>` string found in the real guide corpus's code samples.
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

// Names not in the table pass through unchanged, treated as literal package names.
export function expandPackageShorthand(name: string): string {
  return OFFICIAL_SCOPE.has(name) ? `@nestjs/${name}` : name;
}

// Inverse of the above, for display only (the package index's "nest-doc common.<name>" hint, SPEC.md §4.2).
export function shorthandFor(packageName: string): string {
  const match = /^@nestjs\/(.+)$/.exec(packageName);
  if (match && OFFICIAL_SCOPE.has(match[1]!)) return match[1]!;
  return packageName;
}
