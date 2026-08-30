// Every type here is defined once, canonically, on the src/ side (the actual
// consumer at both build and runtime) and re-exported so build scripts
// produce data conforming to exactly the same contract:
// - token shapes (Heading, CodeToken, TableToken, ImageToken,
//   InternalLinkToken, GuideToken): src/core/render/types.ts, the renderer
// - Guide/GuidesFile (the file-level wrapper): src/nest/guides/types.ts,
//   the runtime guide loader
export type { CodeToken, GuideToken, Heading, ImageToken, InternalLinkToken, TableToken } from "../../src/core/render/types.ts";
export type { Guide, GuidesFile } from "../../src/nest/guides/types.ts";
