import { Command } from "commander";
import pkg from "../../package.json" with { type: "json" };

export function createProgram(): Command {
  const program = new Command();

  program
    .name("nest-doc")
    .description("A terminal documentation reader for NestJS.")
    .version(pkg.version, "--version", "output the version number");

  return program;
}
