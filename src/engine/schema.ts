// A tiny dependency-free JSON Schema validator — just the subset the report
// schema uses (type, required, properties, items, enum). Enough to make the
// "every --format json output validates against the published schema" check real
// without pulling in a validator dependency.

export interface JsonSchema {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v; // string | number | boolean | object | undefined
}

function typeMatches(expected: string, actual: string): boolean {
  if (expected === "number") return actual === "number" || actual === "integer";
  return expected === actual;
}

export function validate(schema: JsonSchema, data: unknown, path = "$"): string[] {
  const errors: string[] = [];

  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(data);
    if (!expected.some((t) => typeMatches(t, actual))) {
      errors.push(`${path}: expected ${expected.join("|")}, got ${actual}`);
      return errors; // type wrong — downstream checks are meaningless
    }
  }

  if (schema.enum !== undefined && !schema.enum.includes(data as never)) {
    errors.push(`${path}: ${JSON.stringify(data)} not in enum ${JSON.stringify(schema.enum)}`);
  }

  if (typeOf(data) === "object" && schema.properties) {
    const obj = data as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path}.${key}: required property missing`);
    }
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (key in obj) errors.push(...validate(sub, obj[key], `${path}.${key}`));
    }
  }

  if (typeOf(data) === "array" && schema.items) {
    (data as unknown[]).forEach((item, i) => {
      errors.push(...validate(schema.items!, item, `${path}[${i}]`));
    });
  }

  return errors;
}
