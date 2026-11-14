const loopback = (hostname: string) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);

export function appOrigin(request: Request, configured = process.env.APP_ORIGIN): string {
  const actual = new URL(request.url);
  if (!configured) return actual.origin;
  const publicUrl = new URL(configured);
  // Local development may select another port when the preferred one is busy.
  // A public deployment still uses its explicit origin behind TLS termination.
  if (loopback(actual.hostname) && loopback(publicUrl.hostname)) return actual.origin;
  return publicUrl.origin;
}
