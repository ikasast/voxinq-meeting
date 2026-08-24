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

`.github/workflows/release-tarball.yml` builds `voxinq-<version>.tar.gz` from `git archive`
when a release is published, checks its contents, attaches it, and prints the SHA-256. Then:

1. Update `url`, `sha256`/`hash`, and `extract_dir` in both files here.
2. Copy `homebrew/voxinq.rb` into the tap and `scoop/voxinq.json` into the bucket.

`.gitattributes` decides what the archive holds (`export-ignore`) — there is no second list to
keep in step. It comes out around 0.5 MB: source and the launcher, without screenshots, tests,
CI, or the Docker files.

The `0.0.0` version and zeroed hashes in both files are placeholders. They are templates until
a release fills them in, and the workflow prints exactly what to paste.

## Not yet verified

Neither definition has been installed from. There is no Mac here to run `brew` on, and Scoop is
not installed on the development machine — installing a package manager onto someone's machine
to test a manifest is not a thing to do unasked. What *is* verified is everything they depend
on: the archive builds and holds the right files, and `voxinq setup` followed by `voxinq start`
works from exactly that archive on Windows.
