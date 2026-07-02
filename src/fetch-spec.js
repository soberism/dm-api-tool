import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const COMMON_SPEC_PATHS = [
  "/v3/api-docs",
  "/swagger/v1/swagger.json",
  "/swagger.json",
  "/openapi.json",
  "/api-docs",
];

export async function fetchSpec(config) {
  const input = config.input;

  if (!isHttpUrl(input)) {
    return readLocalSpec(input);
  }

  const direct = await readRemote(input, config.headers);
  const directSpec = parseSpecMaybe(direct.body);
  if (directSpec) return directSpec;

  const swaggerConfigUrl = findSwaggerConfigUrl(direct.body, input);
  if (swaggerConfigUrl) {
    const configDoc = await readRemote(swaggerConfigUrl, config.headers);
    const specUrl = parseSwaggerConfig(configDoc.body, swaggerConfigUrl);
    if (specUrl) return readRemoteSpec(specUrl, config.headers);
  }

  const embeddedSpecUrl = findEmbeddedSpecUrl(direct.body, input);
  if (embeddedSpecUrl) {
    return readRemoteSpec(embeddedSpecUrl, config.headers);
  }

  const initializerUrl = findSwaggerInitializerUrl(direct.body, input);
  if (initializerUrl) {
    const initializer = await readRemote(initializerUrl, config.headers);
    const initializerConfigUrl = findSwaggerConfigUrl(initializer.body, initializerUrl);
    if (initializerConfigUrl) {
      const configDoc = await readRemote(initializerConfigUrl, config.headers);
      const specUrl = parseSwaggerConfig(configDoc.body, initializerConfigUrl);
      if (specUrl) return readRemoteSpec(specUrl, config.headers);
    }

    const initializerSpecUrl = findEmbeddedSpecUrl(initializer.body, initializerUrl);
    if (initializerSpecUrl) {
      return readRemoteSpec(initializerSpecUrl, config.headers);
    }
  }

  const base = new URL(input);
  for (const path of COMMON_SPEC_PATHS) {
    const candidate = new URL(path, `${base.protocol}//${base.host}`).toString();
    try {
      return await readRemoteSpec(candidate, config.headers);
    } catch {
      // Try the next conventional endpoint.
    }
  }

  throw new Error("Could not find an OpenAPI spec from the configured input");
}

async function readLocalSpec(input) {
  const file = isAbsolute(input) ? input : resolve(process.cwd(), input);
  const body = await readFile(file, "utf8");
  const spec = parseSpecMaybe(body);
  if (!spec) {
    throw new Error("Local spec must be JSON OpenAPI/Swagger for this MVP");
  }
  return spec;
}

async function readRemoteSpec(url, headers) {
  const response = await readRemote(url, headers);
  const spec = parseSpecMaybe(response.body);
  if (!spec) {
    throw new Error(`URL did not return JSON OpenAPI/Swagger: ${url}`);
  }
  return spec;
}

async function readRemote(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`);
  }
  return {
    url,
    body: await response.text(),
  };
}

function parseSpecMaybe(body) {
  try {
    const json = JSON.parse(body);
    if (json && (json.openapi || json.swagger) && json.paths) {
      return json;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseSwaggerConfig(body, baseUrl) {
  try {
    const config = JSON.parse(body);
    const url = config.url ?? config.urls?.[0]?.url;
    return url ? new URL(url, baseUrl).toString() : undefined;
  } catch {
    return undefined;
  }
}

function findSwaggerConfigUrl(html, baseUrl) {
  const match = html.match(/["']?configUrl["']?\s*[:=]\s*["']([^"']+)["']/);
  return match ? new URL(match[1], baseUrl).toString() : undefined;
}

function findEmbeddedSpecUrl(html, baseUrl) {
  const urlsMatch = html.match(/urls\s*:\s*\[\s*\{[^}]*url\s*:\s*["']([^"']+)["']/s);
  if (urlsMatch) return new URL(urlsMatch[1], baseUrl).toString();

  const urlMatch = html.match(/\burl\s*:\s*["']([^"']+)["']/);
  return urlMatch ? new URL(urlMatch[1], baseUrl).toString() : undefined;
}

function findSwaggerInitializerUrl(html, baseUrl) {
  const scriptMatches = html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi);
  for (const match of scriptMatches) {
    if (match[1].includes("swagger-initializer")) {
      return new URL(match[1], baseUrl).toString();
    }
  }
  return undefined;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}
