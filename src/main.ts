#!/usr/bin/env node
import { createProgram } from "./cli/doc.command.ts";

createProgram().parse(process.argv);
