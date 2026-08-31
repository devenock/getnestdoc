import { spawn } from "node:child_process";

export type PagerDecision = { page: true; command: string } | { page: false };

// Page the same way git/man/npm do: only on a real terminal, and only when the content doesn't fit on one screen — never when piped or redirected, so `nest-doc x | grep` stays untouched (isTTY is false there).
export function decidePager(lineCount: number, isTTY: boolean, rows: number | undefined, pagerEnv: string | undefined): PagerDecision {
  if (!isTTY || !rows || lineCount <= rows) return { page: false };
  return { page: true, command: pagerEnv && pagerEnv.length > 0 ? pagerEnv : "less" };
}

// F: quit if the content fits on one screen (defense-in-depth; decidePager already filters for this). R: preserve our ANSI colors. Deliberately not X ("no-init") — X skips less's alternate-screen switch, so it never clears between redraws: every screenful piles onto the same buffer instead of replacing the last one (verified: this exact symptom, duplicated content on every scroll — git sets X too, but for leaving diff output in scrollback after quitting, which doesn't apply to a documentation reader).
export const DEFAULT_LESS_OPTIONS = "FR";

// `shell: true` so a $PAGER value with flags ("less -S") works. stdin is a pipe carrying our content; the pager still reads its own keystrokes straight from the controlling terminal, exactly as it would in `nest-doc x | less` — the shell just isn't the one setting up the pipe here.
//
// A missing pager binary does NOT raise Node's 'error' event under shell:true
// — verified: the shell absorbs it and reports failure the POSIX way, exit
// code 127 ("command not found"), via a normal 'close' event. Without
// checking for that specifically, a broken $PAGER would silently swallow
// the output entirely — the shell prints its own error to stderr and we'd
// just resolve as if paging had succeeded.
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
