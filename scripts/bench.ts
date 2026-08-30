// Benchmark harness (TESTING.md § Benchmark harness). Usage: node scripts/bench.ts [--budget=150] [query]
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RUNS = 20;
const WARMUP = 3;

const BIN = fileURLToPath(new URL("../dist/nest-doc.mjs", import.meta.url));

function parseArgs(argv: string[]): { budgetMs: number; binArgs: string[] } {
  let budgetMs = 60;
  const binArgs: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith("--budget=")) {
      budgetMs = Number(arg.slice("--budget=".length));
    } else {
      binArgs.push(arg);
    }
  }

  return { budgetMs, binArgs: binArgs.length > 0 ? binArgs : ["--version"] };
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

  const { budgetMs, binArgs } = parseArgs(process.argv.slice(2));
  const durationsMs: number[] = [];

  for (let i = 0; i < RUNS; i++) {
    const start = process.hrtime.bigint();
    const result = spawnSync(process.execPath, [BIN, ...binArgs], { stdio: "ignore" });
    const end = process.hrtime.bigint();

    if (result.status !== 0) {
      console.error(`run ${i + 1}: \`nest-doc ${binArgs.join(" ")}\` exited ${result.status}`);
      process.exit(1);
    }

    durationsMs.push(Number(end - start) / 1_000_000);
  }

  const timed = durationsMs.slice(WARMUP).sort((a, b) => a - b);
  const median = percentile(timed, 50);
  const p95 = percentile(timed, 95);

  console.log(`nest-doc ${binArgs.join(" ")}`);
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
