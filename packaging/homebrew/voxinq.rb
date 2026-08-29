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
  url "https://github.com/ikasast/voxinq-meeting/releases/download/v2.1.0/voxinq-2.1.0.tar.gz"
  sha256 "c48b8ae12ea43159ee5c9e72dbc8e66e6f72875f2684a6d3b3f5f775f96b83c5"
  license "MIT"

  depends_on "node"
  depends_on "python@3.11"

  def install
    libexec.install Dir["*"]

    # The CLI's own dependencies, which include the bundled PostgreSQL binaries for this
    # platform. The *app's* dependencies are not installed here: `voxinq setup` does that, and
    # it downloads speech models and takes minutes -- not something to do inside `brew install`
    # where there is nothing to look at and no way to resume.
    system "npm", "install", "--omit=dev", "--no-audit", "--no-fund", "--prefix", libexec/"cli"

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
    # and several minutes.
    assert_match "voxinq", shell_output("#{bin}/voxinq help")
    assert_match "Not running", shell_output("#{bin}/voxinq status")
  end
end
