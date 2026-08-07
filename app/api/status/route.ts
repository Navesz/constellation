import { PUBLIC_API_LINK_HEADER } from "@/lib/openapi";
import {
  publicApiHeadResponse,
  publicApiHeaders,
  publicApiOptionsResponse,
} from "@/lib/public-api";
import { buildServiceStatus } from "@/lib/service-status";

export function OPTIONS() {
  return publicApiOptionsResponse();
}

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return Response.json(buildServiceStatus(origin), {
    headers: publicApiHeaders({
      "Cache-Control": "no-store",
      Link: PUBLIC_API_LINK_HEADER,
    }),
  });
}

export function HEAD(request: Request) {
  return publicApiHeadResponse(GET(request));
}
