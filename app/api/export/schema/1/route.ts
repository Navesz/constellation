import { legacyAuditExportJsonSchema } from "@/lib/audit-export-schema";
import { PUBLIC_API_LINK_HEADER } from "@/lib/openapi";
import { publicApiHeaders, publicApiOptionsResponse } from "@/lib/public-api";

export function OPTIONS() {
  return publicApiOptionsResponse();
}

export function GET() {
  return new Response(`${JSON.stringify(legacyAuditExportJsonSchema, null, 2)}\n`, {
    headers: publicApiHeaders({
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": "application/schema+json; charset=utf-8",
      Link: PUBLIC_API_LINK_HEADER,
      "X-Constellation-Export-Version": "1",
    }),
  });
}
