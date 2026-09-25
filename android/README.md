# Voxinq for Android

The web app in a WebView, with a native recorder that keeps going with the screen off or another
app in front. What it is for, and why it is shaped this way: [docs/android-app.md](../docs/android-app.md).

Built so far: a recording that survives the screen, one that survives the network, the notice at a
booked meeting's time, importing a recording shared from another app, and recording what the phone
itself is playing. Nothing is published yet, and the server has to run a version of
Voxinq that includes the page's side of the recorder (`lib/stt/native.ts`); an older server
records in the page, as a browser does.

## Build

In Android Studio, or from this directory with its JDK:

```bash
./gradlew assembleDebug testDebugUnitTest
```

The APK is `app/build/outputs/apk/debug/app-debug.apk`.

## Install

With USB debugging on:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

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
notification that stays behind opens the meeting.

Minutes are not written automatically. The list says how many meetings have none and offers
**Write them all**, which is the quicker way through a day of shared recordings.

It refuses, with a reason: something that is not audio, a file over 512 MB, and anything at all
while a meeting is being recorded.

## What the phone is playing

The source menu on the recording screen has **This phone's audio** and **Mic + phone audio** as
well as the microphone. Android asks for screen-recording permission each time — only the audio is
taken, never the screen — and **Entire screen** is the choice to make there.

It covers what apps play as *media*. **A phone call cannot be captured, and neither can Zoom, Teams
or Meet**: Android treats their audio as voice communication and does not allow it. For a file you
already have, share it to the app instead (above); this is for something playing live.

With both sources at once, headphones are worth it: through a speaker the microphone hears the
playback too, and it lands in the recording twice.
