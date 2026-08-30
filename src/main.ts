#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CommanderError } from "commander";
import { createProgram } from "./cli/doc.command.ts";

// dist/nest-doc.mjs (bundled) and src/main.ts (native dev execution) both sit
// exactly one directory below the package root, so this offset is correct in
// both contexts without needing to special-case either.
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

// Exit codes are part of the CLI contract (SPEC.md §5): 0 success, 1 not
// found, 2 usage error, 4 internal error. Commander's own default for usage
// errors is 1 (indistinguishable from "not found"), so exitOverride() is
// needed to reclassify them to 2.
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
  program.parse(process.argv);
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
