# A closed server

Voxinq can run on a machine that has **no way out to the internet** once it is set up: a server
dedicated to it, reachable only from the devices that should reach it, and unable to send
anything anywhere. This page is for whoever sets one up — for an organisation, or as a service for
somebody else.

> **Status.** The application side was tested on 4.0.0 with the CPU image: the Voxinq containers
> on a Docker `internal` network, unable to reach anything outside it by name or by address, and a
> meeting taken from upload to transcript, speakers and minutes — the same in under a minute
> closed as it was online once the models were in place, with and without `HF_HUB_OFFLINE`. That
> test is what found the [CPU image note](#setting-one-up) below. Firewalling a whole machine,
> and the Tailscale allow-list, have not been run end to end by this project.

## What closing it protects against, and what it does not

**Closing the way out** stops the server sending what it holds anywhere, whatever is running on it:
a compromised dependency, a mistaken setting, an update nobody vetted. **Closing the way in** —
nothing published to the internet, only your private network — stops anybody outside it reaching
the app at all. Voxinq on Tailscale without Funnel already has the second; a closed server adds the
first.

What it does **not** protect against is somebody who is already on the inside: a device that is
allowed in, or an account that is. Those are covered under [Hardening what is allowed in](#hardening-what-is-allowed-in).

## What Voxinq itself sends out

**While it runs — recording, transcribing, separating speakers, writing minutes — nothing**, in
the default configuration:

- Recognition and minutes run on the machine. Sending them elsewhere is the **External AI**
  extension, off by default, and named on screen when it is used.
- The web app sends no telemetry at runtime (Next.js's anonymous telemetry is for building, which
  the published images have already done).
- Funnel (read-only sharing outside the tailnet) is an extension, off by default.

What needs the internet, and when:

| What | When | On a closed server |
| --- | --- | --- |
| The Docker images (`ghcr.io`) | installing, and each update | pin `VOXINQ_VERSION`; fetch them on another machine and carry them in ([below](#updating-a-closed-server)) |
| The recognition, speaker and translation models (Hugging Face) | the first time each is used | use each once while setting up; they stay in the `hfcache` volume |
| The minutes model (Ollama) | when it is pulled | pull it while setting up; it stays in the `ollama` volume |
| The Android app's update | when the app updates | the **phone** fetches it from GitHub, not the server; or install the APK by hand |

Once the models are in place, set **`HF_HUB_OFFLINE=1`** for the `stt` service. Without it the
model library may look for newer files before using the ones it has. Where the network refuses at
once that costs nothing — it did not in the test — but a firewall that silently drops packets
makes every such look wait for its timeout.

## Choosing a design

1. **Tailscale, with the way out limited to Tailscale (recommended).** The server's firewall lets
   out only what Tailscale needs ([list](#what-tailscale-needs)) and nothing else. Everything works
   as it does on an open machine, phones included.
2. **Tailscale's coordination run in-house (Headscale).** Nothing leaves the building at all. In
   exchange, HTTPS certificates have to come from your own certificate authority, and every device
   has to trust it — see [the Android app](#the-android-app).
3. **No Tailscale: the office network only.** The simplest network, the same certificate question as
   2, and reachable only from inside the building.

**HTTPS is not optional.** A browser lets a page use the microphone only over HTTPS (or on
`localhost`), and the Android app's release build speaks HTTPS only.

## Setting one up

The order matters: set the machine up **online**, use every model once, then close it.

1. Install as usual ([Setup](setup.md)), with `VOXINQ_VERSION` pinned — `v4.0.0`, say — in `.env`.
2. Pull the minutes model (`docker compose exec ollama ollama pull qwen3:8b`), and switch on the
   extensions you will use (*Settings → Extensions*).
3. **Run one meeting through everything you will use** — recognition, speaker separation, and
   translation or emotion if they are on. Each downloads its model the first time.
4. Add `HF_HUB_OFFLINE: "1"` under the `stt` service's `environment:` in `docker-compose.yml`,
   and `docker compose up -d`.
5. **Close it:** apply the firewall rules of design 1, or take the machine off the internet for 2
   and 3.
6. Run a meeting again, to see it work closed.

> **The CPU image of 4.0.0 and earlier** keeps the whisper.cpp model outside the `hfcache`
> volume, so recreating the container — an update, or step 4 itself — throws it away, and a
> closed server can no longer transcribe. On those versions, also add
> `XDG_DATA_HOME: /data/huggingface/xdg` to the `stt` service before step 3. Later images keep
> it on the volume by themselves.

## What Tailscale needs

For design 1, the server's firewall lets out:

- **Tailscale's coordination servers** — `controlplane.tailscale.com` and `login.tailscale.com`,
  TCP 443. Keys and who-may-reach-whom come from here; the meetings never do.
- **Tailscale's relays (DERP)** — `derp*.tailscale.com`, TCP 443 and UDP 3478. Used only when two
  devices cannot reach each other directly; on the same network they usually can.
- **Direct connections** — UDP 41641 to the devices themselves.
- **Let's Encrypt** — `acme-v02.api.letsencrypt.org`, TCP 443. `tailscale serve`'s certificate
  lasts about 90 days and renews itself; **block this and HTTPS stops working a few months later.**

Start Tailscale with `--no-logs-no-support` to stop it sending its logs. Tailscale publishes the
current list of what it connects to; check it against the version you run.

## Updating a closed server

With the version pinned, nothing changes until you change it.

- **Carry the images in.** On a machine with internet:
  `docker pull ghcr.io/ikasast/voxinq-meeting/web:v4.0.1` (and `stt:v4.0.1`, or `stt:v4.0.1-cpu`),
  then `docker save -o voxinq-4.0.1.tar <images>`. On the server: `docker load -i voxinq-4.0.1.tar`,
  set `VOXINQ_VERSION=v4.0.1`, `docker compose up -d`.
- **Or open the way out for the update only**, to `ghcr.io`, and close it again.
- **Back up first** (*Settings → Data*). Migrations within 4.x only add, so going back is
  a matter of pinning the previous version.
- A new model a release needs (rare) is fetched the same way it was the first time.

## The Android app

- **Updates** come from GitHub to the phone. A phone that cannot reach GitHub gets its APK from you,
  installed by hand; the app keeps its server address and anything not yet sent.
- **Its own certificate authority** (designs 2 and 3): the release build trusts the certificate
  authorities Android ships with, not ones added on the phone. Using your own CA needs a build of
  the app that trusts it — not something the published app does today.
- When the server cannot be reached, the app records on the phone and sends the recording later,
  closed server or not.

## Hardening what is allowed in

Closing the server leaves the ways in that are meant to be there. The work is on those:

- **The Tailscale account.** Whoever can sign in to it can add a device to the tailnet.
  - Use a sign-in provider with **two-factor authentication** enforced (Google, Microsoft,
    GitHub, Okta…).
  - Turn on **device approval**, so a new device waits for an administrator.
  - Consider **Tailnet Lock**, so a new device has to be signed by one you already trust — even a
    compromised account cannot add one.
  - Use **access rules** (ACLs) so only the people who need Voxinq reach the server, on its ports
    only; tag the server.
- **Voxinq accounts.** Create accounts rather than sharing one password
  ([accounts and encryption, in Japanese](ja/security.md)). Each account's transcripts and
  minutes are encrypted under its own key.
  - Inside the tailnet a person is recognised by their Tailscale identity, with no password. The
    identity does not carry the key, so meetings that are locked ask for the password once — but
    while the key is open (somebody is using the app, or has work queued) the identity alone
    reads them. **That is why the Tailscale account matters most.**
  - Set `VOXINQ_SIGNUP=closed`, so a tailnet identity nobody has seen does not become an account
    by itself, and `VOXINQ_KEY_SECRET` ([configuration](configuration.md#env)).
- **The devices.** A lost phone or laptop is the remaining way in.
  - Require a screen lock.
  - **Require the app lock** (*Settings → Defaults for everyone → Require the app lock*): every
    phone's app then asks for its fingerprint, face or screen lock when opened, and a phone with no
    screen lock shows nothing until it has one. Starting a recording is not behind it. The app keeps
    this rule; the server cannot check it ([the lock](../android/README.md#the-lock)).
  - Remove a lost device from the tailnet at once; that cuts it off from the server.
  - Sign the account out of every device (*Account → Sign out everywhere*). An administrator can
    also disable the account under *People*, which ends its sessions at once.
  - The Android app keeps recordings it has not sent in its own storage, which Android encrypts
    with the device.

---

[Docs index](README.md) · [Setup](setup.md) · [Security notes in Japanese](ja/security.md)
