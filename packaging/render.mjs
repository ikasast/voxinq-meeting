// Point the Scoop manifest and Homebrew formula at a released version.
//
//   node packaging/render.mjs 2.0.1 562023ec8498486c07b85858e0f4c49ba9a49ebf3bddbf0ed7eb57482ee1ec26
//
// Both files carry the version and the SHA-256 of the release tarball, which only exists once
// the release is published — so this runs after publishing, not before. The release workflow
// calls it and pushes the result to the tap and the bucket; run it by hand only to redo a
// publish that failed.
//
// Fields rather than a search-and-replace: the version appears in a URL, a directory name and
// a version field, and a replace-all would also rewrite the `$version` templates that Scoop's
// own autoupdate uses.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [version, sha] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? "")) {
  console.error("usage: node packaging/render.mjs <version, no leading v> <sha256>");
  process.exit(1);
}
if (!/^[0-9a-f]{64}$/.test(sha ?? "")) {
  console.error("the second argument must be a 64-character hex sha256");
  process.exit(1);
}

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const url = `https://github.com/ikasast/voxinq-meeting/releases/download/v${version}/voxinq-${version}.tar.gz`;

// --- Scoop -----------------------------------------------------------------------------
const scoopPath = path.join(here, "scoop", "voxinq.json");
const scoop = JSON.parse(readFileSync(scoopPath, "utf8"));
scoop.version = version;
scoop.architecture["64bit"].url = url;
scoop.architecture["64bit"].hash = sha;
scoop.extract_dir = `voxinq-${version}`;
writeFileSync(scoopPath, JSON.stringify(scoop, null, 2) + "\n", "utf8");

// --- Homebrew --------------------------------------------------------------------------
const brewPath = path.join(here, "homebrew", "voxinq.rb");
let brew = readFileSync(brewPath, "utf8");
// Whether the lines were *found*, not whether the file changed: re-rendering the version that
// is already there is a legitimate no-op, and must not look like a failure.
const urlLine = /^(\s*url\s+)"[^"]*"/m;
const shaLine = /^(\s*sha256\s+)"[0-9a-f]{64}"/m;
for (const [what, re] of [["url", urlLine], ["sha256", shaLine]]) {
  if (!re.test(brew)) {
    console.error(`the formula has no ${what} line in the expected shape — has it been rewritten?`);
    process.exit(1);
  }
}
brew = brew.replace(urlLine, `$1"${url}"`).replace(shaLine, `$1"${sha}"`);
writeFileSync(brewPath, brew, "utf8");

console.log(`packaging/ now points at v${version}`);
console.log(`  url    ${url}`);
console.log(`  sha256 ${sha}`);
