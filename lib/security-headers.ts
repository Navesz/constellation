export const DISABLED_BROWSER_CAPABILITIES = [
  "accelerometer",
  "camera",
  "display-capture",
  "geolocation",
  "gyroscope",
  "magnetometer",
  "microphone",
  "payment",
  "usb",
  "xr-spatial-tracking",
] as const;

export const SECURITY_PERMISSIONS_POLICY = [
  ...DISABLED_BROWSER_CAPABILITIES.map((capability) => `${capability}=()`),
  "web-share=(self)",
].join(", ");

export const SECURITY_RESPONSE_HEADERS = {
  "Content-Security-Policy": "base-uri 'self'; form-action 'self'; object-src 'none'",
  "Permissions-Policy": SECURITY_PERMISSIONS_POLICY,
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Permitted-Cross-Domain-Policies": "none",
} as const;

export function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_RESPONSE_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
