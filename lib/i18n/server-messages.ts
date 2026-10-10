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
  "Only an administrator switches extensions on or off.",
  "This feature is switched off. An administrator can switch it on under Settings, Extensions.",

  // Voice cues.
  "No line has a place in the recording to measure.",
  "Cannot reach the transcription service.",
  "The recording is no longer kept, so how each line was said cannot be measured.",
  "Measuring the recording failed: {reason}",

  // Emotion.
  "Emotion is already being judged for this meeting.",

  // Work that is already running, or cannot start.
  "Speakers are already being separated for this meeting.",
  "This meeting is already being re-transcribed.",
  "This meeting has no transcript yet.",
  "No utterances recorded",
  "Stored embeddings are corrupted. Re-run Diarize.",

  // Moving a booked meeting.
  "Only a booked meeting that has not been recorded yet can be moved.",
  // Starting a recording from a notice, with no page open.
  "STT_WS_URL is not set on the server.",

  // Reached from outside the private network.
  "This server is read-only from outside your private network.",
  "backups are only available from inside your private network",
  "Remote access can only be changed from your local network.",

  // Not an error at all: the health endpoint's answer, which is read out beside the LLM dot in
  // every page header. It goes through `translate` rather than `apiError` because it is a field
  // of a successful response — but it is read by a person, so it belongs on this list.
  "API key not set",
  "Cannot reach PostgreSQL",
  "Cannot reach Ollama",
  "Cannot reach the LLM (check the Base URL)",

  // Asking about minutes, and checking a transcript against the glossary.
  "Busy: minutes are being generated for “{title}”. Please wait until it finishes.",
  "Failed to answer: {reason}",
  "This meeting has no transcript to read.",
  "No minutes to answer from yet. Generate minutes for at least one meeting first.",
  "No terms to check against. Add some in Settings → Transcription, or on the series.",
  "Failed to check the transcript: {reason}",

  // Recording into a meeting, and bringing a recording in.
  "This meeting has already ended. Recording cannot be restarted.",
  "This meeting already has a transcript.",
  "That file is too large to import.",
  "The transcription service could not be reached.",

  // Voiceprints from a meeting.
  "No voice embeddings stored for this meeting. Run Diarize (again) first — the recording must still exist.",
  "No named speakers to enroll. Name the diarized speakers under “Speaker names” first.",

  // Editing from outside, and a series' background.
  "{field} cannot be changed from outside your private network.",
  "The shared background is too long.",
  "Failed to update Tailscale Funnel: {reason}",

  // Notes the queue writes while nobody is looking, read later on the meeting and the queue
  // page. Those with numbers are stored as keys and values (lib/i18n/stored.ts).
  "Found {speakers} speaker(s) across {lines} utterance(s).",
  "{n} had no label.",
  "A short or one-sided recording, or a transcript that arrived as one block, gives the diarizer little to separate.",
  "{split} utterance(s) held more than one speaker and were divided, adding {added} line(s).",
  "Interrupted by a restart — it will run again from the beginning.",
  "Interrupted so a recording could start. It runs again once the meeting ends.",
  "Recording.",
  "Recording finished.",
  "Recording ended without saying so; the GPU was handed back.",
  "Waiting for you to sign in — this work needs your key to read the meeting.",
  "Encrypting and indexing the meetings that still need it.",
  "Cannot write anything while signed out.",
  "Emotion is switched off.",
  "No line has a place in the recording to judge.",
  "Emotion needs the NVIDIA GPU build of the transcription service, which has torch.",
  "Emotion needs HF_TOKEN, with the terms of its two models accepted on Hugging Face.",
  "That transcription endpoint is no longer saved. Settings → Transcription.",

  // The recording, as the browser starts it.
  "This device or browser cannot capture PC audio. Use Chrome or Edge on a PC.",
  "No audio was shared. In the share dialog, turn on “Share tab audio” or the system audio.",
  "Lost the transcription service (code {code}{reason}) after {n} tries to reconnect.",

  // The sample meeting somebody learns on.
  "Sample meetings can only be created from inside your private network.",
  "Sample meetings can only be removed from inside your private network.",
  "There is already a sample meeting. Delete it to make a fresh one.",

  // Downloads.
  "no minutes to export yet",
  "nothing to export (no minutes/transcript yet)",
  // A series of its own.
  "Enter a name for the series.",
  "A series with that name already exists.",
  "Only a series with no meetings in it can be deleted.",
  // Settings a person may not change.
  "Only an administrator can change {keys} — they describe the machine, not you.",
  // Fetching an Ollama model from the settings screen.
  "Only an administrator can download models to this server.",
  "That is not a model name Ollama would accept.",
  "The Ollama address is not an http(s) address.",
  "Only an administrator can delete models from this server.",
  "{model} is what minutes are written with, for this machine or for somebody on it. Choose another model there first.",
  "{model} is still downloading.",
  "Ollama could not delete it: {reason}",
  // Trimming a recording left running after the meeting ended.
  "Keep at least one second of the recording.",
  "End the meeting before trimming its recording.",
  "Wait until the work queued for this meeting has finished, then trim.",
  "This meeting has no recording to trim.",
  "The recording could not be trimmed: {reason}",
] as const;
