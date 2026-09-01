import { spawn } from "node:child_process";

export type PagerDecision = { page: true; command: string } | { page: false };

// Pages only on a real terminal when the content doesn't fit one screen; piped or redirected output is never paged.
export function decidePager(lineCount: number, isTTY: boolean, rows: number | undefined, pagerEnv: string | undefined): PagerDecision {
  if (!isTTY || !rows || lineCount <= rows) return { page: false };
  return { page: true, command: pagerEnv && pagerEnv.length > 0 ? pagerEnv : "less" };
}

// F quits if content fits one screen; R preserves ANSI colors. Deliberately no X — it breaks less's alternate-screen redraw, duplicating content on scroll.
export const DEFAULT_LESS_OPTIONS = "FR";

// Spawns the pager with the content piped to its stdin; a missing binary reports via exit code 127, not Node's 'error' event, so both are handled.
function runPager(command: string, text: string): Promise<void> {
  return new Promise((resolve) => {
    let handled = false;
    const fallBackToPrint = (): void => {
      if (handled) return;
      handled = true;
      process.stdout.write(`${text}\n`);
      resolve();
    };

    const env = { ...process.env };
    if (!env.LESS) env.LESS = DEFAULT_LESS_OPTIONS;

    const child = spawn(command, { shell: true, stdio: ["pipe", "inherit", "inherit"], env });

    child.on("error", fallBackToPrint);
    child.on("close", (code) => {
      if (code === 127) fallBackToPrint();
      else if (!handled) {
        handled = true;
        resolve();
      }
    });

    // Quitting the pager before it's read everything closes the pipe early — EPIPE on our end, not a real failure.
    child.stdin.on("error", () => {});
    child.stdin.end(text);
  });
}

export async function writeOutput(text: string): Promise<void> {
  const decision = decidePager(text.split("\n").length, process.stdout.isTTY === true, process.stdout.rows, process.env.PAGER);
  if (!decision.page) {
    process.stdout.write(`${text}\n`);
    return;
  }
  await runPager(decision.command, text);
}
