// Shared by build-guides.ts and build-aliases.ts — both derive from the same docs.nestjs.com tarball (ARCHITECTURE.md §6.1).
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = "nestjs/docs.nestjs.com";
const BRANCH = "master";

export async function fetchSourceCommit(): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`GitHub API request for commit sha failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

export async function fetchAndExtractRepo(destDir: string): Promise<string> {
  const res = await fetch(`https://codeload.github.com/${REPO}/tar.gz/${BRANCH}`);
  if (!res.ok) {
    throw new Error(`Tarball fetch failed: ${res.status} ${res.statusText}`);
  }

  const tarPath = join(destDir, "docs.tar.gz");
  writeFileSync(tarPath, Buffer.from(await res.arrayBuffer()));

  const result = spawnSync("tar", ["xzf", tarPath, "-C", destDir]);
  if (result.error) {
    throw new Error(`Failed to run tar: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`tar exited ${result.status}: ${result.stderr.toString()}`);
  }

  const root = readdirSync(destDir).find(
    (entry) => entry.startsWith("docs.nestjs.com-") && statSync(join(destDir, entry)).isDirectory(),
  );
  if (!root) {
    throw new Error(`Could not find extracted repo root under ${destDir}`);
  }
  return join(destDir, root);
}
