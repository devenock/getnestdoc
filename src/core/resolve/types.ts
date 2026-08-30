// A minimal shape of the package.json fields resolution actually reads — no canonical PackageJson type ships with Node, and a dependency for it is more than this needs.
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

type EntryResolutionCase = 1 | 2 | 3 | 4;

export type EntryResolution =
  | { found: true; entryFile: string; resolutionCase: EntryResolutionCase }
  | { found: false };
