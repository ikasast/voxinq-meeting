// Simple auth via a shared password.
// If APP_PASSWORD is unset, auth is disabled (compatible with the previous Tailscale-only setup).
// The cookie holds the SHA-256 of password + secret, not the password itself.
// crypto.subtle works on both Edge (middleware) and Node.

export const AUTH_COOKIE = "voxinq_auth";

export async function expectedAuthToken(): Promise<string | null> {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return null; // auth disabled
  const secret = process.env.APP_SESSION_SECRET ?? "voxinq-default-secret";
  const data = new TextEncoder().encode(`${pw}::${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
