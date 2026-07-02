const METHOD_ORDER = ["get", "post", "put", "patch", "delete", "head", "options"];

export function getOperation(spec, path, method) {
  const pathItem = spec.paths?.[path];
  if (!pathItem) {
    throw new Error(`Path not found: ${path}`);
  }

  if (method) {
    const operation = pathItem[method.toLowerCase()];
    if (!operation) {
      throw new Error(`Method not found: ${method} ${path}`);
    }
    return { method: method.toLowerCase(), operation };
  }

  const methods = METHOD_ORDER.filter((item) => pathItem[item]);
  if (methods.length === 0) {
    throw new Error(`No operation found for path: ${path}`);
  }
  if (methods.length > 1) {
    throw new Error(`Multiple methods found. Use: dm g METHOD ${path}`);
  }
  return { method: methods[0], operation: pathItem[methods[0]] };
}

export function listOperations(spec) {
  const result = [];
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of METHOD_ORDER) {
      if (pathItem[method]) {
        result.push({ path, method, operation: pathItem[method] });
      }
    }
  }
  return result;
}

export function operationName(method, path, operation) {
  if (operation.operationId) {
    return toIdentifier(operation.operationId);
  }
  return toIdentifier(`${method}_${path}`);
}

export function filePathForOperation(path, method, operation) {
  const name = operationName(method, path, operation);
  return `${name}.ts`;
}

export function schemaToTs(schema, spec, ctx = { names: new Map() }) {
  if (!schema) return "void";

  if (schema.$ref) {
    return refName(schema.$ref);
  }

  if (schema.allOf) {
    return schema.allOf.map((item) => schemaToTs(item, spec, ctx)).join(" & ");
  }

  if (schema.oneOf || schema.anyOf) {
    return (schema.oneOf ?? schema.anyOf).map((item) => schemaToTs(item, spec, ctx)).join(" | ");
  }

  if (schema.enum) {
    return schema.enum.map((item) => JSON.stringify(item)).join(" | ");
  }

  if (schema.type === "array") {
    return `${wrapArrayItem(schemaToTs(schema.items, spec, ctx))}[]`;
  }

  if (schema.type === "object" || schema.properties || schema.additionalProperties) {
    const props = Object.entries(schema.properties ?? {});
    const required = new Set(schema.required ?? []);
    const lines = props.flatMap(([key, value]) => {
      const optional = required.has(key) ? "" : "?";
      return [
        ...renderJsDoc(value, "  "),
        `  ${JSON.stringify(key)}${optional}: ${schemaToTs(value, spec, ctx)};`,
      ];
    });

    if (schema.additionalProperties) {
      const valueType =
        schema.additionalProperties === true
          ? "unknown"
          : schemaToTs(schema.additionalProperties, spec, ctx);
      lines.push(`  [key: string]: ${valueType};`);
    }

    return lines.length ? `{\n${lines.join("\n")}\n}` : "Record<string, unknown>";
  }

  if (Array.isArray(schema.type)) {
    return schema.type.map((item) => primitiveType(item)).join(" | ");
  }

  return primitiveType(schema.type);
}

export function collectRefs(value, refs = new Set()) {
  if (!value || typeof value !== "object") return refs;
  if (typeof value.$ref === "string") refs.add(value.$ref);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) collectRefs(item, refs);
    } else {
      collectRefs(child, refs);
    }
  }
  return refs;
}

export function renderReferencedTypes(spec, refs) {
  const rendered = [];
  const seen = new Set();
  const queue = [...refs];

  while (queue.length) {
    const ref = queue.shift();
    if (seen.has(ref)) continue;
    seen.add(ref);

    const schema = resolveRef(spec, ref);
    if (!schema) continue;

    const nested = collectRefs(schema);
    for (const item of nested) {
      if (!seen.has(item)) queue.push(item);
    }

    rendered.push(`${renderJsDoc(schema).join("\n")}\nexport type ${refName(ref)} = ${schemaToTs(schema, spec)};`);
  }

  return rendered.join("\n\n");
}

export function resolveRef(spec, ref) {
  if (!ref.startsWith("#/")) return undefined;
  return ref
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((current, key) => current?.[key], spec);
}

export function requestBodySchema(operation) {
  return contentSchema(operation.requestBody?.content);
}

export function responseSchema(operation) {
  const responses = operation.responses ?? {};
  const status = ["200", "201", "202", "204", "default"].find((item) => responses[item]);
  return status ? contentSchema(responses[status]?.content) : undefined;
}

export function parametersSchema(operation, locations = ["path", "query"], spec) {
  const parameters = (operation.parameters ?? []).filter((item) => locations.includes(item.in));
  if (!parameters.length) return undefined;

  if (
    spec &&
    parameters.length === 1 &&
    parameters[0].in === "query" &&
    isObjectLikeSchema(parameters[0].schema, spec)
  ) {
    return parameters[0].schema;
  }

  return {
    type: "object",
    required: parameters.filter((item) => item.required).map((item) => item.name),
    properties: Object.fromEntries(parameters.map((item) => [item.name, item.schema ?? {}])),
  };
}

export function parametersByLocation(operation, location) {
  return (operation.parameters ?? []).filter((item) => item.in === location);
}

export function toIdentifier(value) {
  const words = String(value)
    .replace(/[{}]/g, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  const name = words
    .map((word, index) => {
      const lower = word.charAt(0).toLowerCase() + word.slice(1);
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
  return /^[a-zA-Z_$]/.test(name) ? name : `api${name}`;
}

export function toTypeName(value) {
  const id = toIdentifier(value);
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function refName(ref) {
  return toTypeName(ref.split("/").at(-1));
}

export function isObjectLikeSchema(schema, spec) {
  const resolved = schema?.$ref ? resolveRef(spec, schema.$ref) : schema;
  return Boolean(
    resolved &&
      (resolved.type === "object" || resolved.properties || resolved.additionalProperties),
  );
}

export function renderJsDoc(source, indent = "") {
  const lines = docLines(source);
  if (!lines.length) return [];

  return [
    `${indent}/**`,
    ...lines.map((line) => `${indent} * ${escapeJsDoc(line)}`),
    `${indent} */`,
  ];
}

function docLines(source) {
  if (!source || typeof source !== "object") return [];

  const lines = [];
  if (source.title) lines.push(String(source.title));
  if (source.summary) lines.push(String(source.summary));
  if (source.description && source.description !== source.summary) {
    lines.push(...String(source.description).split(/\r?\n/).filter(Boolean));
  }
  if (source.deprecated) lines.push("@deprecated");
  if (source.default !== undefined) lines.push(`@default ${JSON.stringify(source.default)}`);
  if (source.enum?.length) lines.push(`@enum ${source.enum.map((item) => JSON.stringify(item)).join(", ")}`);
  if (source.example !== undefined) lines.push(`@example ${JSON.stringify(source.example)}`);
  return lines;
}

function escapeJsDoc(value) {
  return String(value).replace(/\*\//g, "* /");
}

function contentSchema(content) {
  if (!content) return undefined;
  return (
    content["application/json"]?.schema ??
    content["*/*"]?.schema ??
    Object.values(content).find((item) => item?.schema)?.schema
  );
}

function primitiveType(type) {
  if (type === "integer" || type === "number") return "number";
  if (type === "boolean") return "boolean";
  if (type === "string") return "string";
  if (type === "null") return "null";
  return "unknown";
}

function wrapArrayItem(type) {
  return type.includes(" | ") || type.includes(" & ") ? `(${type})` : type;
}
