export const PUBLIC_API_EXPOSED_HEADERS = [
  "Link",
  "Retry-After",
  "X-Constellation-Schema-Version",
].join(", ");

export function publicApiHeaders(init?: HeadersInit) {
  const headers = new Headers(init);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Accept, Content-Type");
  headers.set("Access-Control-Expose-Headers", PUBLIC_API_EXPOSED_HEADERS);
  return headers;
}

export function publicApiOptionsResponse() {
  return new Response(null, {
    status: 204,
    headers: publicApiHeaders({
      "Access-Control-Max-Age": "86400",
      Allow: "GET, OPTIONS",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    }),
  });
}
