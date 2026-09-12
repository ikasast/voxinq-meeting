# The Android app

A design, written before any of it exists. It says what the app is for, what shape it takes and
why, how it talks to the parts that are already there, and what the first version has to prove.

## What it is for

One thing a web page cannot do on a phone: **keep recording when the screen goes off, or while
another app is in front.** The recording screen works around it today by keeping the screen on
(Wake Lock) and letting it rest black to save the battery. A lock, a call coming in, or a switch
to another app can still stop the capture, and a meeting that stopped recording is the one
failure this app cannot repair afterwards.

A native app can hold the microphone in a **foreground service** — the kind that shows a
notification for as long as it runs — and nothing about the screen touches it. That is the
reason for the app. Two more things come nearly free once it exists:

- **The notice at a booked meeting's time can start the recording**, from the notification,
  without the app being open. The alarm is scheduled on the phone, so no push service is needed.
- **Audio can be kept on the phone when the connection drops**, and sent when it comes back,
  instead of the browser's five minutes held in memory.

What it does **not** bring:

- **Call audio.** Android's playback capture (`MediaProjection` with `AudioPlaybackCapture`)
  only reaches audio played as media, games or an unknown usage. Calls — the phone's own, and
  VoIP apps like Zoom, Teams and Meet — play as voice communication, which Android leaves out on
  purpose. A call is still recorded on speakerphone in Room mode. What playback capture could add
  is *media* another app plays, such as a recorded webinar.
- **iOS.** It would need ReplayKit and a paid developer account.

## Shape: the web app, and a native recorder

- **`MainActivity`** is a `WebView` on the user's own server, whose address is asked for once and
  stored. Every screen is the existing web app: nothing is drawn twice, and the translations,
  settings and features arrive in the app the moment they reach the server.
- **`RecorderService`** is a foreground service of type `microphone`. It does what the recording
  page does in JavaScript today: capture, send 16 kHz PCM to the STT service, and save each final
  utterance to the web app.
- **A bridge** lets the recording page hand the recording to the service. The page asks
  `window.VoxinqAndroid` to start and stop; the service reports status, partial text, level,
  clipping and errors back. The bridge is a `WebMessageListener` restricted to the server's origin,
  so a page from anywhere else cannot reach the microphone through it.

Two shapes were considered and are not this one:

- **A Trusted Web Activity** — the PWA in an app frame. It is Chrome underneath, with the same
  background limits, so it would not solve the one problem the app exists for.
- **The WebView's own `getUserMedia`, kept alive by a foreground service.** The capture might
  survive, but saving each utterance happens in the page's JavaScript, and a hidden page is
  throttled or paused. The part that has to survive the screen going off has to live in the
  service, not in the page.

## Talking to what already exists

**No change to the server or the STT service.** The service speaks the same protocol the
browser does:

- **Where**: the page already knows the STT WebSocket address (`window.__VOXINQ_STT_WS__`) and
  passes it in. The service sends an `Origin` header of the web app's origin, which the STT's
  default allow-list (`*.ts.net`, private LAN ranges, localhost) accepts.
- **Start**: `{"type":"start","model","meetingId","language","initialPrompt","translate","liveTranscript"}`,
  exactly the browser's payload.
- **Audio**: binary frames of signed 16-bit little-endian PCM, 16 kHz, mono, 100 ms each.
- **From the service**: `status` (`loading`, `open`, `closed`), `partial`, `final` (`text`,
  `speaker`, `seq`, `start`, `end`), `translation` (`seq`, `text`), `error`.
- **Saving**: each final becomes `POST /api/transcripts` with `meetingId`, `speakerType`, `text`,
  `audioStartMs` and `audioEndMs`. A translation arrives later and is saved with
  `PATCH /api/transcripts/{id}`, matched to its row by `seq`.
- **End**: `{"type":"end"}`, then wait up to ten seconds for `status: closed` — the service has
  transcribed the last segment and saved the recording — before closing.
- **Reconnecting**: audio captured while connecting or reconnecting is held and sent once the
  service says `open`, as the browser does. In memory in the first version, on disk in the second.
- **Signed in**: the `WebView`'s session cookie is sent with the service's own HTTP requests
  (`CookieManager`). The STT service has no sign-in of its own; it is reachable only inside the
  tailnet, as it is for the browser.

On the web side, one addition:

- **`lib/stt/native.ts`** exports `startNative(handlers, options)`, returning the same `SttHandle`
  as `startMic`. The recording page calls it instead of `startMic` when the bridge is present, and
  hides the PC-audio options as it already does on a phone.
- **While the page is hidden, the service keeps saving.** The page gets each saved line through
  the bridge while it is visible, and reloads the transcript from `/api/meetings/{id}/live` —
  which exists, for second devices following a recording — when it becomes visible again.

## Staying alive

- The service is started from the visible recording screen. Android 14 and later only let a
  `microphone` foreground service start while the app is visible, or from a tap on its
  notification — which is also exactly how a booked meeting's notice will start one.
- While recording it holds a partial wake lock and a Wi-Fi lock, so neither the CPU nor the Wi-Fi
  sleeps with the screen.
- Its notification shows the elapsed time and a **Stop** button. Stopping from there sends `end`,
  waits for the recording to be saved, and then ends the meeting (`POST /api/meetings/{id}/end`)
  and hands the GPU back (`DELETE /api/queue/recording`). The page shows the ended meeting when it
  is next opened.

## Audio

- `AudioRecord` at 16 kHz, mono, 16-bit — already the format the service wants, so there is
  nothing to resample.
- **Standard** mode keeps echo cancellation and noise suppression on, as the browser does.
  **Room** mode turns them off and raises the level four times (`ROOM_GAIN`) ahead of a limiter,
  the same as `lib/stt/mic-constraints.ts`, so the phone hears a room the way the page does.
- The level meter and the clipping warning are computed on each 100 ms frame and passed to the
  page, as the worklet does now.
- The microphone check before a meeting stays in the page. It runs while the page is visible,
  where the `WebView`'s own `getUserMedia` is enough.

## The project

- **`android/`** in this repository, so the bridge and the page that calls it change in the same
  pull request. Gradle and Kotlin; package `io.github.ikasast.voxinq`.
- **SDK**: minimum Android 10 (API 29), the first with a `microphone` foreground-service type;
  target the newest SDK Android Studio ships. Developed against a Pixel 9 on Android 17.
- **Dependencies**: AndroidX core, webkit and lifecycle; OkHttp for the WebSocket and HTTP;
  kotlinx-coroutines. No Firebase, no analytics, nothing that talks to anything but the user's
  server.
- **CI**: a debug APK built on every pull request that touches `android/`. Release signing comes
  with distribution.
- **Distribution**: the APK on GitHub Releases, at no cost. Google's developer verification for
  apps installed outside Play starts in four countries on 30 September 2026 and reaches everywhere
  else in 2027; before then nothing changes, and after it the free limited-distribution account
  (up to twenty devices, no fee, no ID) or Android's advanced install flow cover a small team. The
  Play Store's one-off fee is not needed.

## Milestones

1. **A recording that survives the screen.** Server address, `WebView`, the native recorder,
   finals saved, Stop in the notification. Done when a 60-minute meeting records end to end on the
   Pixel 9 with the screen off, every line is in the meeting afterwards, and its recording
   diarizes.
2. **A recording that survives the network.** Audio written to disk and sent after a dropped
   connection; failed saves queued and retried; a recording that picks itself up if the process
   is killed.
3. **The conveniences.** The notice at a booked meeting's time with a record action; sharing an
   audio file from another app to transcribe it; capturing another app's media playback — never
   calls.
