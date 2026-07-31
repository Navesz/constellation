import {
  OPENAPI_MEDIA_TYPE,
  PUBLIC_API_LINK_HEADER,
  openApiDocument,
} from "@/lib/openapi";
import { publicApiHeaders, publicApiOptionsResponse } from "@/lib/public-api";

export function OPTIONS() {
  return publicApiOptionsResponse();
}

export function GET() {
  return new Response(`${JSON.stringify(openApiDocument, null, 2)}\n`, {
    headers: publicApiHeaders({
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": `${OPENAPI_MEDIA_TYPE}; charset=utf-8`,
      Link: PUBLIC_API_LINK_HEADER,
    }),
  });
}
