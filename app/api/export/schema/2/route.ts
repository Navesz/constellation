import { AUDIT_EXPORT_VERSION } from "@/lib/audit-export";
import { auditExportJsonSchema } from "@/lib/audit-export-schema";
import { createConditionalTextHandler } from "@/lib/http-validators";
import { PUBLIC_API_LINK_HEADER } from "@/lib/openapi";
import { publicApiHeaders, publicApiOptionsResponse } from "@/lib/public-api";

export function OPTIONS() {
  return publicApiOptionsResponse();
}

const handleConditionalSchema = createConditionalTextHandler(
  `${JSON.stringify(auditExportJsonSchema, null, 2)}\n`,
  publicApiHeaders({
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    "Content-Type": "application/schema+json; charset=utf-8",
    Link: PUBLIC_API_LINK_HEADER,
    "X-Constellation-Export-Version": String(AUDIT_EXPORT_VERSION),
  }),
);

export function GET(request: Request) {
  return handleConditionalSchema(request);
}
