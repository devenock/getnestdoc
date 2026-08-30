#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CommanderError } from "commander";
import { createProgram } from "./cli/doc.command.ts";

// Both dist/nest-doc.mjs (bundled) and src/main.ts (dev) sit one directory below the package root.
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

// Commander's default usage-error exit is 1, indistinguishable from "not found" (SPEC.md §5) — reclassified to 2 below.
const USAGE_ERROR_CODES = new Set([
  "commander.missingArgument",
  "commander.optionMissingArgument",
  "commander.missingMandatoryOptionValue",
  "commander.conflictingOption",
  "commander.unknownOption",
  "commander.excessArguments",
  "commander.unknownCommand",
  "commander.invalidArgument",
]);

const program = createProgram(DATA_DIR);
program.exitOverride();

try {
  // parseAsync, not parse: the action handler is async, and plain parse() would let main() return before it settles.
  await program.parseAsync(process.argv);
} catch (err) {
  if (err instanceof CommanderError) {
    if (err.code === "commander.version" || err.code === "commander.helpDisplayed") {
      process.exitCode = 0;
    } else if (USAGE_ERROR_CODES.has(err.code)) {
      process.exitCode = 2;
    } else {
      process.exitCode = err.exitCode;
    }
  } else {
    console.error(err);
    process.exitCode = 4;
  }
}
