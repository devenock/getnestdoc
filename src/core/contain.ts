import { realpathSync } from "node:fs";
import { sep } from "node:path";

// True when the existing path `candidate` lies inside `root`. Compares real paths, so neither `../` segments nor a
// symlink inside a third-party package can point the caller outside it (ADR-0009). A path that can't be resolved
// (missing, permission error) is never contained.
export function isContained(root: string, candidate: string): boolean {
  try {
    return realpathSync(candidate).startsWith(realpathSync(root) + sep);
  } catch {
    return false;
  }
}
