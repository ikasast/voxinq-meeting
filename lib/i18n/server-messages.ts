// The messages an API sends that a person is going to read.
//
// Not all of them are. The routes write two kinds of error, and the difference is who it is
// addressed to:
//
//   "That is not your password."     somebody typed something, and this is the answer
//   "meetingId is required"          the caller sent a malformed request, which is a bug
//
// The second kind is not translated, deliberately. It appears only when the client is broken,
// it is what somebody pastes into a bug report or searches the source for, and a Japanese
// version of it would make both of those harder while helping nobody — the person who sees it
// cannot act on it in any language.
//
// So this file is the list of the first kind. It exists because the strings live at their call
// sites, spread over forty routes, and the table's test needs somewhere it can see them all:
// `lib/i18n/keys.ts` reads the array below as keys, the way it reads `t("…")` everywhere else.
// A message here with no row in `ja.ts` fails the build.

export const SERVER_MESSAGES = [
  // Signing in, and the account screens.
  "Wrong password",
  "Wrong email or password",
  "That is not your password.",
  "That is not your current password.",
  "Enter your password.",
  "Use at least {n} characters.",
  "Enter the email address you want to sign in with.",
  "An email address is how they will sign in. Enter theirs.",
  "That email address is already in use.",
  "That username is taken.",
  "That username, email, or tailnet login is already taken.",
  "Usernames are 2–32 characters: letters, numbers, dot, dash, underscore.",
  "Display names are up to 60 characters.",
  "Use a PNG, JPEG or WebP image.",
  "That picture is too large even after resizing. Try a smaller one.",
  "This server already has an account. Sign in, or ask an administrator.",
  "Auth is disabled (APP_PASSWORD not set)",

  // The recovery code and reset links.
  "That link has expired or has already been used. Ask for another.",
  "That recovery code does not match this account.",
  // One literal, not the two the route concatenates: the key is the sentence, whole.
  "This account has encrypted meetings. Enter your recovery code to keep them, or confirm that you are starting again without them.",

  // Administering people.
  "That account is disabled. Enable it first.",
  "That is the only administrator. Make somebody else one first.",
  "You cannot disable your own account.",
  "Only an administrator sets the defaults everybody starts from.",

  // Work that is already running, or cannot start.
  "Speakers are already being separated for this meeting.",
  "This meeting is already being re-transcribed.",
  "This meeting has no transcript yet.",
  "No utterances recorded",
  "Stored embeddings are corrupted. Re-run Diarize.",

  // Reached from outside the private network.
  "This server is read-only from outside your private network.",
  "backups are only available from inside your private network",
  "Remote access can only be changed from your local network.",

  // Not an error at all: the health endpoint's answer, which is read out beside the LLM dot in
  // every page header. It goes through `translate` rather than `apiError` because it is a field
  // of a successful response — but it is read by a person, so it belongs on this list.
  "API key not set",

  // Downloads.
  "no minutes to export yet",
  "nothing to export (no minutes/transcript yet)",
] as const;
