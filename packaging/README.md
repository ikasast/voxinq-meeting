# Packaging

The definitions a package manager installs Voxinq from. They live here so they are versioned
with the code they install, and are copied into their own repositories to publish.

| | file | published in |
| --- | --- | --- |
| Homebrew | `homebrew/voxinq.rb` | a tap: `ikasast/homebrew-voxinq` |
| Scoop | `scoop/voxinq.json` | a bucket: `ikasast/scoop-voxinq` |

```bash
brew install ikasast/voxinq/voxinq     # macOS, Linux
scoop bucket add voxinq https://github.com/ikasast/scoop-voxinq && scoop install voxinq
voxinq setup                           # both: finish the install
```

## Why not a signed installer

Neither of these needs signing, and that is the point. `brew` and `scoop` unpack the archive
themselves, so nothing acquires a macOS quarantine attribute and Gatekeeper is never consulted;
a `.dmg` downloaded in a browser would be, and clearing that costs $99 a year. The same archive
downloaded by hand from the Releases page *will* warn, which is why the docs point at the
package managers first.

## Why Node and Python are dependencies, not contents

Providing runtimes is what a package manager is for. Vendoring them would mean shipping a
second copy of each, updated by hand, to a machine that already has a package manager able to
do it properly — and on Windows it would mean either the Python embeddable distribution, which
cannot create virtualenvs, or a PyInstaller bundle of a stack with three sets of native
libraries. Neither is worth what it costs.

## Why installing takes two commands

`voxinq setup` downloads several hundred megabytes of speech models, builds the web app, and
creates two virtualenvs. Doing that inside `brew install` or `scoop install` means minutes with
nothing to look at, no way to resume, and a package that reports failure for a network blip. It
is a separate, re-runnable, visible step, and both definitions say so in their caveats.

## Releasing

**Nothing to do by hand.** `.github/workflows/release-tarball.yml` builds
`voxinq-<version>.tar.gz` from `git archive` when a release is published, checks its contents,
attaches it, then — for a full release only — runs `render.mjs` to point both definitions at it
and pushes them into the tap and the bucket. It then pushes a branch bringing the copies here
into line, and opens a PR for it where the repository lets Actions do that — otherwise the run
summary carries a compare link. That last part cannot fail the release: the manifests are
already live by then.

This was two manual steps until v2.0.1, and both were missed twice running: the tap served
`v2.0.0-beta.3` — a prerelease, with a broken Word export and the licence declared as AGPL —
for the whole of 2.0.0's life. The step can only run *after* publishing, because the manifests
carry the tarball's SHA-256, which is why it kept falling outside the release commit.

It needs a **`PACKAGING_TOKEN`** secret: a fine-grained PAT with *Contents: read and write* on
`ikasast/homebrew-voxinq` and `ikasast/scoop-voxinq`. `GITHUB_TOKEN` cannot reach another
repository. Without it the job fails loudly rather than quietly leaving the distribution
repositories on the previous release.

To redo a publish that failed, run the same script by hand and copy the results:

```bash
node packaging/render.mjs 2.0.1 <sha256 from the release>
```

`.gitattributes` decides what the archive holds (`export-ignore`) — there is no second list to
keep in step. It comes out around 0.5 MB: source and the launcher, without screenshots, tests,
CI, or the Docker files.

## How far each is verified

**Scoop is verified end to end** — installed from the bucket on Windows, then `voxinq setup`
and `voxinq start` from exactly what it placed.

**Homebrew is not.** The formula is written and its shape follows the Scoop manifest, but
nobody here has a Mac to run `brew` on. What *is* verified is everything it depends on: the
archive builds, holds the right files, and the launcher runs from it. Reports from anyone who
tries it are welcome in an issue.
