import { realpathSync } from "node:fs";
import { sep } from "node:path";

// True when the existing path `candidate` lies inside `root`, comparing real paths so neither `../` nor a symlink in a third-party package can escape; an unresolvable path is never contained.
export function isContained(root: string, candidate: string): boolean {
  try {
    return realpathSync(candidate).startsWith(realpathSync(root) + sep);
  } catch {
    return false;
  }
}
