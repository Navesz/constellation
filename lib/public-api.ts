export const PUBLIC_API_REQUEST_ID_HEADER = "X-Constellation-Request-Id";
export const PUBLIC_API_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PUBLIC_API_ALLOWED_METHODS = "GET, HEAD, OPTIONS";

export const PUBLIC_API_EXPOSED_HEADERS = [
  "ETag",
  "Link",
  "Retry-After",
  "X-Constellation-Export-Version",
  PUBLIC_API_REQUEST_ID_HEADER,
  "X-Constellation-Schema-Version",
].join(", ");

export function createPublicApiRequestId() {
  return crypto.randomUUID();
}

export function withPublicApiRequestId(
  response: Response,
  requestId = createPublicApiRequestId(),
) {
  if (!PUBLIC_API_REQUEST_ID_PATTERN.test(requestId)) {
    throw new TypeError("Public API request IDs must be UUID v4 values.");
  }

  const headers = new Headers(response.headers);
  headers.set(PUBLIC_API_REQUEST_ID_HEADER, requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function publicApiHeaders(
  init?: HeadersInit,
  allowedMethods = PUBLIC_API_ALLOWED_METHODS,
) {
  const headers = new Headers(init);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", allowedMethods);
  headers.set("Access-Control-Allow-Headers", "Accept, Content-Type, If-None-Match");
  headers.set("Access-Control-Expose-Headers", PUBLIC_API_EXPOSED_HEADERS);
  return headers;
}

export function publicApiHeadResponse(response: Response) {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export function publicApiOptionsResponse(
  allowedMethods = PUBLIC_API_ALLOWED_METHODS,
) {
  return new Response(null, {
    status: 204,
    headers: publicApiHeaders({
      "Access-Control-Max-Age": "86400",
      Allow: allowedMethods,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    }, allowedMethods),
  });
}
