// Conformance check against real installs of the official @nestjs/* scope. Networked and slow (minutes) — run before a release, not in `npm test`.
//
//   node scripts/verify-scope.ts [--majors=10,11,12] [--keep]
//
// For each Nest major (default: the three latest), installs the newest release of every official package built for
// that major into its own project, then checks every entry point — each package root plus every subpath its exports
// map names — against the TypeScript checker as an independent oracle:
//   1. entry file:  ours === ts.resolveModuleName (NodeNext)
//   2. exports:     ours === checker.getExportsOfModule, name for name
//   3. docs:        every export the checker sees a doc comment on has one in our record
//   4. the CLI:     `nest-doc <entry>` and `nest-doc <entry>.<name>` exit 0 with the right header, for every export
// Exits 1 if anything differs.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import ts from "typescript";
import { findPackageDir } from "../src/core/resolve/find-package.ts";
import { listEntryPoints, resolveEntryTypes, resolveSubpathTypes } from "../src/core/resolve/entry-types.ts";
import { extractPackage } from "../src/core/extract/barrels.ts";
import { installProject } from "./lib/install-npm-package.ts";

const BIN = fileURLToPath(new URL("../dist/nest-doc.mjs", import.meta.url));
// Released in lockstep with @nestjs/common; every other package declares its supported majors in a peer range.
const MONOREPO = ["common", "core", "microservices", "platform-express", "platform-fastify", "platform-socket.io", "platform-ws", "testing", "websockets"];
// Every extractable official package — the same list scripts/build-packages.ts bundles.
const ECOSYSTEM = ["apollo", "axios", "azure-database", "azure-func-http", "azure-storage", "bull", "bullmq", "cache-manager", "config", "cqrs", "devtools-integration", "elasticsearch", "event-emitter", "graphql", "jwt", "mapped-types", "mercurius", "mongoose", "observe", "passport", "schedule", "schematics", "sequelize", "serve-static", "swagger", "terminus", "throttler", "typeorm"];

type Packument = { versions: Record<string, { peerDependencies?: Record<string, string> }> };

async function packument(name: string): Promise<Packument> {
  const res = await fetch(`https://registry.npmjs.org/${name}`);
  if (!res.ok) throw new Error(`registry lookup for ${name} failed: ${res.status}`);
  return (await res.json()) as Packument;
}

// The newest stable release built for Nest `major`, or undefined if the package never supported it. A package with no Nest peer at all (@nestjs/schematics) is version-independent: its latest release.
function pickVersion(name: string, doc: Packument, major: number): string | undefined {
  const stable = Object.keys(doc.versions).filter((v) => semver.valid(v) && !semver.prerelease(v));
  if (MONOREPO.includes(name)) return semver.maxSatisfying(stable, `^${major}.0.0`) ?? undefined;
  const peerOf = (v: string) => doc.versions[v]!.peerDependencies?.["@nestjs/common"] ?? doc.versions[v]!.peerDependencies?.["@nestjs/core"];
  if (!stable.some(peerOf)) return semver.maxSatisfying(stable, "*") ?? undefined;
  return stable.filter((v) => { const range = peerOf(v); return range !== undefined && semver.intersects(range, `^${major}.0.0`, { loose: true }); }).sort(semver.rcompare)[0];
}

function run(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd, env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", () => {});
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function pool<T>(jobs: (() => Promise<T>)[], size: number): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (next < jobs.length) await jobs[next++]!(); }));
}

async function verifyMajor(major: number, versions: Map<string, string>, root: string): Promise<string[]> {
  const project = join(root, `nest${major}`);
  mkdirSync(join(project, ".git"), { recursive: true });
  const dependencies = Object.fromEntries(versions);
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: `verify-nest${major}`, private: true, dependencies }));
  installProject(project);

  const entries: { specifier: string; version: string; entryFile: string; packageRoot: string }[] = [];
  const problems: string[] = [];
  for (const [name, version] of versions) {
    const found = findPackageDir(name, project);
    if (!found || found.manifestError) { problems.push(`${name}@${version}: not resolvable after install`); continue; }
    const specifiers = [undefined, ...listEntryPoints(found.manifest)];
    for (const subpath of specifiers) {
      const specifier = subpath === undefined ? name : `${name}/${subpath}`;
      const res = subpath === undefined ? resolveEntryTypes(found) : resolveSubpathTypes(found, subpath);
      if (!res.found) { problems.push(`${specifier}@${version}: no entry declaration file`); continue; }
      entries.push({ specifier, version, entryFile: res.entryFile, packageRoot: res.packageRoot });
    }
  }

  const options: ts.CompilerOptions = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true, noEmit: true, types: [] };
  const host = ts.createCompilerHost(options);
  const oracleEntry = new Map(entries.map((e) => [e.specifier, ts.resolveModuleName(e.specifier, join(project, "index.ts"), options, host).resolvedModule?.resolvedFileName]));
  const program = ts.createProgram([...oracleEntry.values()].filter((f): f is string => f !== undefined), options);
  const checker = program.getTypeChecker();

  const indexJobs: (() => Promise<void>)[] = [];
  const symbolJobs: (() => Promise<void>)[] = [];
  const env = { ...process.env, XDG_CACHE_HOME: join(root, `cache${major}`), XDG_DATA_HOME: join(root, "no-data-home") };
  let exportCount = 0, documented = 0;
  for (const e of entries) {
    const label = `${e.specifier}@${e.version}`;
    const oracleFile = oracleEntry.get(e.specifier);
    if (!oracleFile || realpathSync(oracleFile) !== realpathSync(e.entryFile)) { problems.push(`${label}: entry file ${e.entryFile} vs TypeScript's ${oracleFile}`); continue; }
    const moduleSymbol = checker.getSymbolAtLocation(program.getSourceFile(oracleFile)!);
    const oracle = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
    const ours = new Map((await extractPackage(e.entryFile, e.packageRoot)).map((s) => [s.name, s]));
    const oracleNames = new Set(oracle.map((s) => s.getName()));
    for (const name of oracleNames) if (!ours.has(name)) problems.push(`${label}: missing export ${name}`);
    for (const name of ours.keys()) if (!oracleNames.has(name)) problems.push(`${label}: extra export ${name}`);
    for (const exported of oracle) {
      const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const hasDoc = ts.displayPartsToString(target.getDocumentationComment(checker)).trim().length > 0;
      if (hasDoc) documented++;
      if (hasDoc && !ours.get(exported.getName())?.doc.trim()) problems.push(`${label}: lost the doc comment on ${exported.getName()}`);
    }
    exportCount += oracle.length;

    indexJobs.push(async () => {
      const r = await run([e.specifier], project, env);
      const count = /^(\d+) exports, \d+ public$/m.exec(r.out)?.[1];
      if (r.code !== 0 || !r.out.startsWith(`${label}\n`) || Number(count) !== oracle.length) problems.push(`nest-doc ${e.specifier}: exit ${r.code}, ${count} exports listed vs ${oracle.length}`);
    });
    for (const name of oracleNames) {
      symbolJobs.push(async () => {
        const r = await run([`${e.specifier}.${name}`], project, env);
        if (r.code !== 0 || !r.out.startsWith(`${label}\n`) || !r.out.includes(name)) problems.push(`nest-doc ${e.specifier}.${name}: exit ${r.code}`);
      });
    }
  }
  // Index lookups first: they also warm each entry's cache, so the parallel per-export lookups never extract cold all at once.
  await pool(indexJobs, 4);
  await pool(symbolJobs, 8);

  console.log(`Nest ${major}: ${entries.length} entry points, ${exportCount} exports (${documented} documented), ${indexJobs.length + symbolJobs.length} CLI lookups — ${problems.length} problem(s)`);
  return problems;
}

async function main(): Promise<void> {
  const majorsArg = process.argv.find((a) => a.startsWith("--majors="));
  const common = await packument("@nestjs/common");
  const allMajors = [...new Set(Object.keys(common.versions).filter((v) => semver.valid(v) && !semver.prerelease(v)).map((v) => semver.major(v)))].sort((a, b) => a - b);
  const majors = majorsArg ? majorsArg.slice("--majors=".length).split(",").map(Number) : allMajors.slice(-3);

  const docs = new Map<string, Packument>();
  for (const short of [...MONOREPO, ...ECOSYSTEM]) docs.set(`@nestjs/${short}`, await packument(`@nestjs/${short}`));

  const root = mkdtempSync(join(tmpdir(), "getnestdoc-verify-"));
  const problems: string[] = [];
  try {
    for (const major of majors) {
      const versions = new Map<string, string>();
      const absent: string[] = [];
      for (const [name, doc] of docs) {
        const version = pickVersion(name, doc, major);
        if (version) versions.set(name, version);
        else absent.push(name.replace("@nestjs/", ""));
      }
      if (absent.length > 0) console.log(`Nest ${major}: no release built for it — ${absent.join(", ")}`);
      problems.push(...(await verifyMajor(major, versions, root)).map((p) => `[Nest ${major}] ${p}`));
    }
  } finally {
    if (process.argv.includes("--keep")) console.log(`kept ${root}`);
    else rmSync(root, { recursive: true, force: true });
  }

  for (const p of problems) console.error(p);
  if (problems.length > 0) process.exit(1);
  console.log(`OK — Nest ${majors.join(", ")}: every entry point, export, and doc comment matches the TypeScript checker, and every lookup renders.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
