// Installs one published package, with its dependencies, into its own directory — the layout a real project has, so re-exports from dependencies (e.g. @nestjs/bull -> @nestjs/bull-shared) resolve exactly as they do for users.
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

// --legacy-peer-deps: unrelated ecosystem packages pin each other's majors loosely (terminus vs axios), which strict peer resolution rejects outright.
const NPM_FLAGS = ["--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", "--legacy-peer-deps"];

function npm(args: string[], label: string): void {
  const result = spawnSync("npm", args, { encoding: "utf8", shell: process.platform === "win32" });
  if (result.error) throw new Error(`Failed to run npm for ${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`npm install ${label} exited ${result.status}: ${result.stderr}`);
}

export function installPackage(name: string, version: string, dir: string): void {
  mkdirSync(dir, { recursive: true });
  npm(["install", "--prefix", dir, ...NPM_FLAGS, `${name}@${version}`], `${name}@${version}`);
}

// Installs a directory's own package.json dependencies — a whole project at once.
export function installProject(dir: string): void {
  npm(["install", "--prefix", dir, ...NPM_FLAGS], dir);
}
