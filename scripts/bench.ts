// Latency benchmark harness. Usage: node scripts/bench.ts [--budget=150] [--cwd=dir] [query]
// Each invocation gets a fresh, empty cache and data directory: the first run is the cold one (discarded with the
// other warmups), so a symbol query's median measures the cached path regardless of the machine's own ~/.cache.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RUNS = 20;
const WARMUP = 3;

const BIN = fileURLToPath(new URL("../dist/nest-doc.mjs", import.meta.url));

function parseArgs(argv: string[]): { budgetMs: number; cwd: string; binArgs: string[] } {
  let budgetMs = 60;
  let cwd = process.cwd();
  const binArgs: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith("--budget=")) {
      budgetMs = Number(arg.slice("--budget=".length));
    } else if (arg.startsWith("--cwd=")) {
      cwd = resolve(arg.slice("--cwd=".length));
    } else {
      binArgs.push(arg);
    }
  }

  return { budgetMs, cwd, binArgs: binArgs.length > 0 ? binArgs : ["--version"] };
}

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index]!;
}

function main(): void {
  if (!existsSync(BIN)) {
    console.error(`${BIN} does not exist. Run \`npm run build\` first.`);
    process.exit(1);
  }

  const { budgetMs, cwd, binArgs } = parseArgs(process.argv.slice(2));
  const durationsMs: number[] = [];
  const scratch = mkdtempSync(join(tmpdir(), "getnestdoc-bench-"));
  const env = { ...process.env, XDG_CACHE_HOME: join(scratch, "cache"), XDG_DATA_HOME: join(scratch, "data") };

  try {
    for (let i = 0; i < RUNS; i++) {
      const start = process.hrtime.bigint();
      const result = spawnSync(process.execPath, [BIN, ...binArgs], { stdio: "ignore", cwd, env });
      const end = process.hrtime.bigint();

      if (result.status !== 0) {
        console.error(`run ${i + 1}: \`nest-doc ${binArgs.join(" ")}\` exited ${result.status}`);
        process.exit(1);
      }

      durationsMs.push(Number(end - start) / 1_000_000);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const timed = durationsMs.slice(WARMUP).sort((a, b) => a - b);
  const median = percentile(timed, 50);
  const p95 = percentile(timed, 95);

  console.log(`nest-doc ${binArgs.join(" ")}${cwd === process.cwd() ? "" : `  (cwd: ${cwd})`}`);
  console.log(`  runs:   ${RUNS} (discarded first ${WARMUP} for page cache warmup)`);
  console.log(`  median: ${median.toFixed(1)} ms`);
  console.log(`  p95:    ${p95.toFixed(1)} ms`);
  console.log(`  budget: ${budgetMs} ms`);

  if (median > budgetMs) {
    console.error(`FAIL: median ${median.toFixed(1)} ms exceeds ${budgetMs} ms budget`);
    process.exit(1);
  }
}

main();
