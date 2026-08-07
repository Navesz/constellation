const textEncoder = new TextEncoder();

function splitEntityTags(value: string) {
  const tags: string[] = [];
  let current = "";
  let quoted = false;

  for (const character of value) {
    if (character === '"') quoted = !quoted;
    if (character === "," && !quoted) {
      tags.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  if (quoted) return [];
  tags.push(current.trim());
  return tags.filter(Boolean);
}

function opaqueEntityTag(value: string) {
  return value.startsWith("W/") ? value.slice(2) : value;
}

export async function buildWeakEntityTag(contents: string) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(contents));
  const fingerprint = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `W/"sha256-${fingerprint}"`;
}

export function matchesIfNoneMatch(value: string | null, entityTag: string) {
  if (!value) return false;
  if (value.trim() === "*") return true;

  const expected = opaqueEntityTag(entityTag);
  return splitEntityTags(value).some((candidate) => (
    opaqueEntityTag(candidate) === expected
  ));
}

export function createConditionalTextHandler(
  contents: string,
  initialHeaders: HeadersInit,
) {
  const entityTagPromise = buildWeakEntityTag(contents);

  return async function conditionalTextResponse(request: Request) {
    const entityTag = await entityTagPromise;
    const headers = new Headers(initialHeaders);
    headers.set("ETag", entityTag);

    if (matchesIfNoneMatch(request.headers.get("if-none-match"), entityTag)) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(contents, { headers });
  };
}
