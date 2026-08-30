// A minimal shape of the package.json fields resolution actually reads.
// Not a full PackageJson type (no such canonical one ships with Node, and
// pulling in a dependency just for the type is more than this needs).
export type ExportsCondition = {
  types?: string;
  require?: string;
  import?: string;
  default?: string;
};

export type PackageManifest = {
  name?: string;
  version?: string;
  main?: string;
  types?: string;
  typings?: string;
  exports?: string | Record<string, string | ExportsCondition>;
};

export type FoundPackage = {
  name: string;
  packageDir: string;
  nodeModulesDir: string;
  manifest: PackageManifest;
};

export type EntryResolutionCase = 1 | 2 | 3 | 4;

export type EntryResolution =
  | { found: true; entryFile: string; resolutionCase: EntryResolutionCase }
  | { found: false };
