// A minimal shape of the package.json fields resolution actually reads — no canonical PackageJson type ships with Node, and a dependency for it is more than this needs.
// `exports` stays `unknown`: its real shape is recursive (strings, fallback arrays, nested condition objects) and third-party, so entry-types.ts narrows it at every step.
export type PackageManifest = {
  name?: string;
  version?: string;
  main?: string;
  types?: string;
  typings?: string;
  exports?: unknown;
};

// `manifestError` is set when package.json exists but isn't a readable JSON object; `manifest` is then empty.
export type FoundPackage = {
  name: string;
  packageDir: string;
  nodeModulesDir: string;
  manifest: PackageManifest;
  manifestError?: string;
};

type EntryResolutionCase = 1 | 2 | 3 | 4;

// `packageRoot` bounds everything extraction may read: the package directory, or the @types/* directory for case 4.
export type EntryResolution =
  | { found: true; entryFile: string; packageRoot: string; resolutionCase: EntryResolutionCase }
  | { found: false };
