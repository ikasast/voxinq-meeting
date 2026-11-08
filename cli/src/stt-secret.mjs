// The secret the web app and the transcription service share (lib/stt/auth.ts,
// stt-service/auth.py): the web app signs what it asks of the service, and the service answers
// nothing else. Generated on first start and kept in the data directory, like the database's
// password, so both processes get the same one on every start after.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { paths } from "./paths.mjs";

export function sttSecret() {
  const file = join(paths.data(), "stt-secret");
  if (existsSync(file)) return readFileSync(file, "utf-8").trim();
  const generated = randomBytes(32).toString("base64url");
  mkdirSync(paths.data(), { recursive: true });
  writeFileSync(file, generated, { encoding: "utf-8", mode: 0o600 });
  return generated;
}
