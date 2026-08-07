export const PUBLIC_SITE_URL =
  "https://constellation-profile.leonardonavesworking.chatgpt.site";

const PUBLIC_SITE_ORIGIN = new URL(PUBLIC_SITE_URL).origin;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

type HeaderReader = Pick<Headers, "get">;

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

export function resolveSiteOrigin(incomingHeaders: HeaderReader) {
  const host = firstForwardedValue(
    incomingHeaders.get("x-forwarded-host") ?? incomingHeaders.get("host"),
  );
  if (!host) return PUBLIC_SITE_ORIGIN;

  const forwardedProtocol = firstForwardedValue(incomingHeaders.get("x-forwarded-proto"));
  const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : localHost ? "http" : "https";

  try {
    const candidate = new URL(`${protocol}://${host}`);
    if (candidate.origin === PUBLIC_SITE_ORIGIN) return PUBLIC_SITE_ORIGIN;
    if (LOCAL_HOSTNAMES.has(candidate.hostname)) return candidate.origin;
  } catch {
    // Fall through to the canonical production origin.
  }

  return PUBLIC_SITE_ORIGIN;
}
