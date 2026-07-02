#!/usr/bin/env bun
import { run } from "./src/index.ts";

process.exit(await run(process.argv.slice(2)));
