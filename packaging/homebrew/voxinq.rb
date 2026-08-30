# Homebrew formula for Voxinq. Goes in a tap: ikasast/homebrew-voxinq.
#
#   brew install ikasast/voxinq/voxinq
#   voxinq setup
#   voxinq start
#
# Node and Python are dependencies rather than bundled contents. Providing runtimes is what a
# package manager is for, and vendoring them would mean shipping a second copy of each, kept up
# to date by hand, for no benefit on a machine that already has Homebrew.
#
# There is no signing or notarisation here, and none is needed: `brew` unpacks the archive
# itself rather than the browser downloading it, so nothing gets a quarantine attribute and
# Gatekeeper is never consulted. That is the whole reason distribution goes through a package
# manager instead of a .dmg.
class Voxinq < Formula
  desc "Self-hosted meeting minutes: record in the browser, transcribe on your own machine"
  homepage "https://github.com/ikasast/voxinq-meeting"
  url "https://github.com/ikasast/voxinq-meeting/releases/download/v2.1.2/voxinq-2.1.2.tar.gz"
  sha256 "82a5513b2679d04bc6290274f4c7756e645dd4ec1c09b8de7e6a21315176b1c3"
  license "MIT"

  depends_on "node"
  depends_on "python@3.11"

  def install
    libexec.install Dir["*"]

    # Nothing is installed into the keg beyond the source. In particular `npm install` is *not*
    # run here, which it was until CI on a real Mac showed what that costs: the CLI's only
    # dependency is embedded-postgres, which carries prebuilt PostgreSQL binaries, and Homebrew
    # rewrites the install names of every Mach-O file it finds in a keg. Those dylibs cannot be
    # rewritten:
    #
    #   Failed changing dylib ID of .../@embedded-postgres/darwin-arm64/native/lib/libcom_err.3.0.dylib
    #   Failed to fix install linkage
    #
    # and `brew install` exits non-zero having apparently succeeded. `voxinq setup` installs it
    # instead, on the far side of that processing. The app's dependencies were always its job
    # for a different reason -- they download speech models and take minutes, which is not
    # something to do inside `brew install` where there is nothing to look at and no way to
    # resume.
    #
    # Scoop does the equivalent in post_install and is right to: Windows has no Mach-O and no
    # relocation step, so the problem does not exist there.

    # A wrapper rather than a symlink: the CLI locates the app by walking up from its own file,
    # and a symlink in bin would put it outside the install.
    (bin/"voxinq").write <<~SH
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/cli/src/index.mjs" "$@"
    SH
  end

  def caveats
    <<~EOS
      Voxinq is installed but not yet built. Finish with:

          voxinq setup

      That installs the web dependencies, builds the app, and creates the transcription and
      speaker-separation environments. It takes several minutes and needs the network.

      Then:

          voxinq start          open it in a browser
          voxinq autostart on   start it when you log in

      PostgreSQL is bundled -- nothing to install or configure for it. Data lives in
      ~/Library/Application Support/voxinq, outside this install, so upgrading cannot delete it.

      Minutes need an LLM: `brew install ollama`, or point Settings -> LLM at a cloud model.

      On Apple silicon, transcription runs on Metal and keeps up with live speech. On an Intel
      Mac it runs on the CPU, which is slower than speech -- there, Voxinq records the meeting
      and transcribes it in one pass at the end.
    EOS
  end

  test do
    # The CLI answers without a built app, which is the only thing testable without a network
    # and several minutes. It also answers without its node_modules, which `voxinq setup`
    # installs: embedded-postgres is imported dynamically, inside the functions that start the
    # database, so `help` and `status` reach neither.
    assert_match "voxinq", shell_output("#{bin}/voxinq help")
    assert_match "Not running", shell_output("#{bin}/voxinq status")
  end
end
