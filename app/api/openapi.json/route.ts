import {
  OPENAPI_MEDIA_TYPE,
  PUBLIC_API_LINK_HEADER,
  openApiDocument,
} from "@/lib/openapi";
import { createConditionalTextHandler } from "@/lib/http-validators";
import { publicApiHeaders, publicApiOptionsResponse } from "@/lib/public-api";

export function OPTIONS() {
  return publicApiOptionsResponse();
}

const handleConditionalDescription = createConditionalTextHandler(
  `${JSON.stringify(openApiDocument, null, 2)}\n`,
  publicApiHeaders({
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    "Content-Type": `${OPENAPI_MEDIA_TYPE}; charset=utf-8`,
    Link: PUBLIC_API_LINK_HEADER,
  }),
);

export function GET(request: Request) {
  return handleConditionalDescription(request);
}
