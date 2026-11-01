// Installs one published package, with its dependencies, into its own directory — the layout a real project has, so re-exports from dependencies (e.g. @nestjs/bull -> @nestjs/bull-shared) resolve exactly as they do for users.
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function installPackage(name: string, version: string, dir: string): void {
  mkdirSync(dir, { recursive: true });
  const args = ["install", "--prefix", dir, "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", "--legacy-peer-deps", `${name}@${version}`];
  const result = spawnSync("npm", args, { encoding: "utf8", shell: process.platform === "win32" });
  if (result.error) throw new Error(`Failed to run npm for ${name}@${version}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`npm install ${name}@${version} exited ${result.status}: ${result.stderr}`);
}
