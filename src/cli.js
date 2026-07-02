#!/usr/bin/env node

import { initConfig, loadConfig, setConfig } from "./config.js";
import { fetchSpec } from "./fetch-spec.js";
import { generateAll, generateOne } from "./generate.js";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    if (!command || command === "-h" || command === "--help") {
      printHelp();
      return;
    }

    if (command === "init") {
      const input = readFlag(args, "--input") ?? args[1];
      await initConfig(input);
      return;
    }

    if (command === "set") {
      const input = readFlag(args, "--input") ?? args[1];
      await setConfig(input, {
        output: readFlag(args, "--out"),
      });
      return;
    }

    if (command === "g" || command === "gen") {
      const config = await loadConfig();
      const spec = await fetchSpec(config);
      const methodOrPath = args[1];
      const maybePath = args[2];

      if (!methodOrPath) {
        throw new Error("Usage: dm g [METHOD] <path>");
      }

      const hasMethod = HTTP_METHODS.has(methodOrPath.toUpperCase());
      const method = hasMethod ? methodOrPath.toUpperCase() : undefined;
      const path = hasMethod ? maybePath : methodOrPath;

      if (!path) {
        throw new Error("Usage: dm g [METHOD] <path>");
      }

      const result = await generateOne(spec, {
        method,
        path,
        output: readFlag(args, "--out") ?? config.output,
        translateNames: config.translateNames,
      });
      console.log(`Generated ${result.count} API file: ${result.file}`);
      return;
    }

    if (command === "all") {
      const config = await loadConfig();
      const spec = await fetchSpec(config);
      const result = await generateAll(spec, {
        output: readFlag(args, "--out") ?? config.output,
        translateNames: config.translateNames,
      });
      console.log(`Generated ${result.count} API files in ${result.dir}`);
      return;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    console.error(`dm: ${error.message}`);
    process.exitCode = 1;
  }
}

function readFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function printHelp() {
  console.log(`dm

Usage:
  dm init <swagger-or-openapi-url>
  dm set [swagger-or-openapi-url]
  dm g [METHOD] <path>
  dm all

Examples:
  dm init https://example.com/swagger-ui/index.html
  dm set
  dm set https://example.com/swagger-ui/index.html
  dm g POST /user/login
  dm g /health
  dm all
`);
}

main();
