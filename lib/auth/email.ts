// The address somebody signs in with.
//
// Not verified, and deliberately so: this app sends no mail and has no outbound network path at
// runtime. The address is an identifier — the one thing a person already knows about themselves
// and does not have to be issued — not a channel. Nothing is ever sent to it, which is also why
// a typo in it is recoverable: an administrator's reset link still works, and the account screen
// can fix it.

/** Fold case and surrounding space, so `Sam@Example.com ` and `sam@example.com` are one account. */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Is this shaped like an address?
 *
 * Deliberately loose. A strict RFC 5322 check rejects addresses that work, and this is not a
 * gate on reachability — nothing is sent here. What it is worth catching is the empty string, a
 * username typed into the wrong box, and whitespace in the middle.
 */
export function looksLikeEmail(value: string): boolean {
  const v = normaliseEmail(value);
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
