# Voxinq for Android

The web app in a WebView, with a native recorder that keeps going with the screen off or another
app in front. What it is for, and why it is shaped this way: [docs/android-app.md](../docs/android-app.md).

What it does: a recording that survives the screen, one that survives the network, the notice at a
booked meeting's time, and importing a recording shared from another app. The signed APK is attached
to every release from `v3.8.0` — see [Install](#install-and-how-updates-arrive).

**The server has to be new enough for what the app asks of it.** Recording through the app needs
**3.7.0** or later, which is when the recording page learned to hand the recording over
(`lib/stt/native.ts`); an older server records in the page, as a browser does. The meeting notice
and sharing a recording need **3.8.0**: before it, the server cannot say what is coming or take a
file from the phone.

## Build

In Android Studio, or from this directory with its JDK:

```bash
./gradlew assembleDebug testDebugUnitTest
```

The APK is `app/build/outputs/apk/debug/app-debug.apk`. Its version is the project's — read from
`package.json`, so `3.8.0` becomes `versionName 3.8.0` and `versionCode 30800`. One number to bump,
and the phone can tell which build is newer.

## The signed build, and the key it needs

A release build is signed with the app's own key, and **the key decides whether a later version can
be installed over this one**. Android refuses an update signed by anything else, so:

- **Back up the key.** It lives outside the working tree, in `~/.voxinq/android-signing/`:
  `voxinq-release.jks` and `keystore.properties` beside it (the passwords are in that file). A
  `git clean` cannot touch it there — and if it is lost, every future update has to be an
  uninstall and a fresh install, which loses the server address and anything the phone had not
  sent yet.
- Another machine can point `VOXINQ_KEYSTORE_PROPERTIES` at its own copy, or drop a
  `keystore.properties` in `android/` (git ignores it).
- Without a key, `assembleRelease` **stops and says so** rather than handing over an APK that
  cannot install over anything.

```bash
./gradlew assembleRelease
```

`app/build/outputs/apk/release/app-release.apk`, signed. Making a key in the first place:

```bash
keytool -genkeypair -keystore ~/.voxinq/android-signing/voxinq-release.jks -alias voxinq -keyalg RSA -keysize 4096 -validity 10000
```

Then write `~/.voxinq/android-signing/keystore.properties` with `storeFile`, `storePassword`,
`keyAlias` and `keyPassword`.

## Install, and how updates arrive

The signed APK of each version is attached to its
[release](https://github.com/ikasast/voxinq-meeting/releases). Download it on the phone and open
it, or with USB debugging on:

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

**Updates install over the app**, keeping the server address and anything not yet sent — as long
as the APK is signed with the same key. To be told when there is one, point an updater such as
[Obtainium](https://github.com/ImranR98/Obtainium) at this repository's releases and let it watch;
every 3.x release is a **pre-release** until 3.x ships properly, so turn its "include prereleases"
setting on. There is no automatic silent update outside the Play Store: an updater notices the new
version, and the install is still a tap.

**A debug build cannot be updated into a signed one** — different key, so Android refuses. Uninstall
the debug app once (`adb uninstall io.github.ikasast.voxinq`), then install the signed APK.

On first launch the app asks for the server's address, the one you open Voxinq at in a browser,
such as `https://your-pc.your-tailnet.ts.net`. The phone has to be able to reach it, over
Tailscale or otherwise. Long-press the app icon for **Change server**.

## Against a development server

Debug builds also accept `http://localhost`, so a server on the PC can be reached through adb:

```bash
adb reverse tcp:3000 tcp:3000
```

```bash
adb reverse tcp:8000 tcp:8000
```

Then enter `http://localhost:3000`. Start the web app with `STT_WS_URL=ws://localhost:8000/ws`
so the page hands the app an address the phone can reach. Release builds speak HTTPS only.

With a debug build, `chrome://inspect` on the PC opens the page's DevTools.

## Not yet

- Files the page builds itself — minutes and meeting exports, backups — do not download in the
  app yet. Use a browser for those.
- Capturing what other apps are playing is **not planned**. Android's playback capture reaches
  media only — never a call, and never Zoom, Teams or Meet — and for audio that exists as a file,
  sharing it to the app (above) is better. The reasoning is in
  [docs/android-app.md](../docs/android-app.md#not-capturing-what-the-phone-plays).

## When the network goes

Audio is written to a file before it is sent, and the file is the queue: an outage of twenty
minutes costs nothing, and the oldest audio only starts to go after two hours of it. Lines
waiting to be saved are written down too.

If the system kills the app mid-recording, what it owed stays on the phone. Open the app again
and it delivers it — the audio is appended to that meeting's recording and recognised, and the
lines it had already recognised are saved. `files/pending/<meeting id>/` is where that lives;
an empty directory means nothing is owed.

## A meeting you booked

When a meeting has a time, the phone says so at that time, with **Record** in the notice — which
opens that meeting's recording page and starts it. It works with nothing open, and it needs no
push service: the app sets an alarm for each meeting it knows about, within a day or so ahead,
and checks with the server every quarter of an hour for anything new.

What is late, and honestly: the notice can arrive a couple of minutes after the hour, because
being exact to the second would mean asking for a permission. And a meeting booked minutes before
it starts, while the phone is asleep, waits for the next check; anything booked earlier has an
alarm of its own. A meeting already being recorded, or
recorded from somewhere else, is not announced — the server is asked at the moment the alarm goes
off, and it is the server's answer that decides.

Turn it off in the phone's notification settings for the app, under **Meeting reminders**.

## A recording from another app

Share an audio file to Voxinq — from a voice recorder, a chat, a file manager — and it becomes a
meeting: the app asks once, uploads it, and the transcription runs on the server as a queued job.
The upload is the only part that needs the phone, so it can be pocketed afterwards; the
notification that stays behind opens the meeting. Share several and they are sent one after
another, each leaving a notification of its own.

Minutes are not written automatically. The list says how many meetings have none and offers
**Write them all**, which is the quicker way through a day of shared recordings.

It refuses, with a reason: something that is not audio, a file over 512 MB, and anything at all
while a meeting is being recorded.
