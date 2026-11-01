import { tmpdir } from "node:os";
import { join } from "node:path";

// Environment for spawning the binary: XDG_DATA_HOME points somewhere that never exists, so a developer who has run
// `nest-doc update` locally (ADR-0013) doesn't have tests silently reading their updated corpus instead of data/.
export function isolatedEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, XDG_DATA_HOME: join(tmpdir(), "getnestdoc-test-no-data-home"), ...extra };
}
