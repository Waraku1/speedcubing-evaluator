function canonicalize(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return '{"$type":"undefined"}';
  }

  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return '{"$type":"NaN"}';
    }

    if (value === Infinity) {
      return '{"$type":"Infinity"}';
    }

    if (value === -Infinity) {
      return '{"$type":"-Infinity"}';
    }

    if (Object.is(value, -0)) {
      return "0";
    }

    return JSON.stringify(value);
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(record[key])}`
      );

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify({
    $type: typeof value,
    value: String(value),
  });
}

function hash128(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x5bd1e995);
    h3 = Math.imul(h3 ^ code, 0x27d4eb2d);
    h4 = Math.imul(h4 ^ code, 0x165667b1);

    h1 ^= h1 >>> 13;
    h2 ^= h2 >>> 15;
    h3 ^= h3 >>> 16;
    h4 ^= h4 >>> 14;
  }

  return [h1, h2, h3, h4]
    .map((part) => (part >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

export function stableIdentity(
  kind: string,
  governedContent: unknown
): string {
  return `${kind}:${hash128(canonicalize(governedContent))}`;
}

export function canonicalIdentityContent(value: unknown): string {
  return canonicalize(value);
}
