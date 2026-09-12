# Voxinq for Android

The web app in a WebView, with a native recorder that keeps going with the screen off or another
app in front. What it is for, and why it is shaped this way: [docs/android-app.md](../docs/android-app.md).

This is the first milestone. Nothing is published yet, and the server has to run a version of
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
- While the transcription service is out of reach, up to five minutes of audio is held in
  memory, as in the browser. Keeping it on disk is the next milestone.
