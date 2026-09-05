// Whether this server will make new accounts.
//
// Closing it is a real security measure and that is the point of the switch: on an instance
// where everybody who needs an account already has one, the ways in that remain are the ones
// you can name. Left open, a new tailnet identity becomes an account the first time it is seen,
// which is what keeps a household's phones working without anybody administering anything.
//
// Set in `.env` or the compose file, because it is a property of the deployment rather than a
// preference — somebody who can change settings in the app should not be able to reopen it.
//
//   VOXINQ_SIGNUP=open    (default) a tailnet identity nobody has seen becomes an account
//   VOXINQ_SIGNUP=closed  only an administrator creates accounts
//
// The first account is exempt either way. A server with `closed` set and nobody on it would
// otherwise have no administrator and no way to make one, which is a locked door with the key
// inside.

export type SignupMode = "open" | "closed";

export function signupMode(): SignupMode {
  const raw = (process.env.VOXINQ_SIGNUP ?? "").trim().toLowerCase();
  // Anything unrecognised is "open", matching the behaviour of every release before the switch
  // existed. A typo in an env var should not lock a household out of its own recordings.
  return raw === "closed" || raw === "off" || raw === "false" ? "closed" : "open";
}

export function signupIsOpen(): boolean {
  return signupMode() === "open";
}
