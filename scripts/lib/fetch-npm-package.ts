// Shared by build-names.ts: downloads a real published tarball and lays it out as a real node_modules/<name> directory, so production find-package.ts/entry-types.ts run against it unmodified.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

type RegistryVersionMeta = {
  dist: { tarball: string };
};

// Extracts into <nodeModulesRoot>/node_modules/<name>/, exactly where a real install would put it.
export async function fetchAndExtractPackage(name: string, version: string, nodeModulesRoot: string): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/${name}/${version}`);
  if (!res.ok) {
    throw new Error(`npm registry metadata request for ${name}@${version} failed: ${res.status} ${res.statusText}`);
  }
  const meta = (await res.json()) as RegistryVersionMeta;

  const tarRes = await fetch(meta.dist.tarball);
  if (!tarRes.ok) {
    throw new Error(`Tarball fetch for ${name}@${version} failed: ${tarRes.status} ${tarRes.statusText}`);
  }

  const packageDir = join(nodeModulesRoot, "node_modules", ...name.split("/"));
  mkdirSync(packageDir, { recursive: true });

  const tarPath = join(packageDir, "package.tgz");
  writeFileSync(tarPath, Buffer.from(await tarRes.arrayBuffer()));

  const result = spawnSync("tar", ["xzf", tarPath, "-C", packageDir, "--strip-components=1"]);
  if (result.error) {
    throw new Error(`Failed to run tar for ${name}@${version}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`tar exited ${result.status} for ${name}@${version}: ${result.stderr.toString()}`);
  }

  // Guard against a tarball shaped differently than expected rather than silently pointing at an empty directory.
  const entries = readdirSync(packageDir);
  if (!entries.includes("package.json")) {
    throw new Error(`${name}@${version}: extracted directory has no package.json (found: ${entries.join(", ")})`);
  }

  return packageDir;
}
