import { AUDIT_SCHEMA_VERSION } from "@/lib/achievements";
import { auditResponseJsonSchema } from "@/lib/audit-schema";

export function GET() {
  return new Response(`${JSON.stringify(auditResponseJsonSchema, null, 2)}\n`, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": "application/schema+json; charset=utf-8",
      "X-Constellation-Schema-Version": String(AUDIT_SCHEMA_VERSION),
    },
  });
}
