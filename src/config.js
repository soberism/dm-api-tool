import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultConfig } from "./default-config.js";

const CONFIG_FILE = "dm.config.json";

export async function initConfig(input) {
  return writeLocalConfig({
    ...defaultConfig,
    input: input ?? defaultConfig.input,
  });
}

export async function setConfig(input, options = {}) {
  return writeLocalConfig({
    ...defaultConfig,
    input: input ?? defaultConfig.input,
    output: options.output ?? defaultConfig.output,
  });
}

async function writeLocalConfig(config) {
  const file = resolve(process.cwd(), CONFIG_FILE);
  await writeFile(
    file,
    `${JSON.stringify(config, null, 2)}\n`,
  );
  console.log(`Created ${CONFIG_FILE}`);
}

export async function loadConfig() {
  const file = resolve(process.cwd(), CONFIG_FILE);

  try {
    await access(file);
  } catch {
    return defaultConfig;
  }

  const raw = await readFile(file, "utf8");
  const config = JSON.parse(raw);

  if (!config.input) {
    throw new Error(`${CONFIG_FILE} must include "input"`);
  }

  return {
    input: config.input,
    output: config.output ?? "dm-api",
    headers: config.headers ?? {},
  };
}
