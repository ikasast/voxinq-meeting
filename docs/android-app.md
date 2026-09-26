# The Android app

Written as the design before any of it existed, and kept as the record of why the app is shaped
the way it is: what it is for, how it talks to the parts that were already there, and what each
milestone had to prove. All three milestones are built — the third with one of its conveniences
declined, for the reasons [below](#not-capturing-what-the-phone-plays). How to build, install and
update the app is in [android/README.md](../android/README.md).

## What it is for

One thing a web page cannot do on a phone: **keep recording when the screen goes off, or while
another app is in front.** The recording screen works around it today by keeping the screen on
(Wake Lock) and letting it rest black to save the battery. A lock, a call coming in, or a switch
to another app can still stop the capture, and a meeting that stopped recording is the one
failure this app cannot repair afterwards.

A native app can hold the microphone in a **foreground service** — the kind that shows a
notification for as long as it runs — and nothing about the screen touches it. That is the
reason for the app. Two more things come nearly free once it exists:

- **The notice at a booked meeting's time leads straight to recording**, with nothing open
  beforehand: **Record** in the notification opens that meeting's recording page, which starts by
  itself. The alarm is scheduled on the phone, so no push service is needed. (It goes through the
  page rather than starting the microphone from the notification itself — see
  [the notice](#the-notice-at-a-booked-meetings-time) for why.)
- **Audio can be kept on the phone when the connection drops**, and sent when it comes back,
  instead of the browser's five minutes held in memory.

What it does **not** bring:

- **Call audio.** Android's playback capture (`MediaProjection` with `AudioPlaybackCapture`)
  only reaches audio played as media, games or an unknown usage. Calls — the phone's own, and
  VoIP apps like Zoom, Teams and Meet — play as voice communication, which Android leaves out on
  purpose. A call is still recorded on speakerphone in Room mode. What playback capture could add
  is *media* another app plays, such as a recorded webinar — which was built, and then
  [declined](#not-capturing-what-the-phone-plays).
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
- **Reconnecting**: audio captured while connecting or reconnecting is **written to a file and
  sent from there**, so the file is the queue rather than a five-minute buffer in memory. A
  connection that returns twenty minutes later finds everything, in order; two hours is the
  point at which the oldest starts to go. A connection that dies gives back whatever OkHttp was
  still holding, so a drop costs a few seconds re-sent rather than seconds lost.
- **Lines waiting to be saved** are written down too, before they are sent. A line the server
  refuses is dropped (it would be refused again); one it cannot be reached for is kept.
- **A run the system kills** leaves its audio and its unsaved lines on the phone. The next time
  the app is opened it delivers them: the same `start` message a reconnect sends, so the service
  appends to that meeting's recording, and whatever it recognises is saved like any other line.
  Delivery holds no microphone, so it runs as a data-sync service.
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
  notification. A booked meeting's notice goes through the page too, rather than relying on the
  second of those: the rule is one that has changed between versions, and a meeting silently not
  being recorded is the failure this app exists to prevent.
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

## The notice at a booked meeting's time

A meeting booked in advance is the one most likely to go unrecorded: everybody walks in already
talking. The web app has a banner for exactly this, but a banner needs a page somebody is looking
at, and on a phone the page is not open. So the phone wakes at the meeting's own time and says so,
with **Record** in the notice.

**Two mechanisms, because neither alone is enough.** An alarm for each meeting is on time, but the
app has to have heard about the meeting to set one. A check every quarter of an hour hears about
everything, including a meeting booked on the laptop a minute ago, but is late. So both: the check
sets the alarms and announces anything already past its time, and the app checks whenever it comes
to the front.

**The server decides what is due, not the phone.** When a meeting's alarm goes off, the app asks
rather than trusting what it knew when the alarm was set: by then the meeting may have been
recorded from the laptop, moved, or deleted. Only when the server cannot be reached does the alarm
speak for itself, from the title and time it was given — better a notice that may be stale than
silence about a meeting that is starting. Each meeting is announced once; a record of what has been
mentioned, kept for six hours, is what stops the quarter-hourly check repeating itself.

**No permission is asked for to be on time.** A meeting's alarm is inexact and allowed to fire in
Doze (`setAndAllowWhileIdle`), which needs nothing from the user — an exact alarm would mean a
permission prompt for a convenience. Inexact is worth about two minutes: the system gives such an
alarm a window and tends to use it. The quarter-hourly check is a plain alarm, deliberately: the
system allows an app one allow-while-idle alarm every nine minutes or so in Doze, and those are
wanted for the meetings themselves. What is left late by all this is one case — a meeting booked
minutes before it starts while the phone is asleep, which waits for the next maintenance window or
for the app to be opened. Anything booked earlier has an alarm of its own.

**Record opens the recording page, which starts by itself** (`?autostart=1`, which the web app
already uses for its own one-tap links). Not because a notification cannot start work, but because
a microphone service started with nothing on screen is at the mercy of a rule that has changed with
every other Android version, and a meeting silently not being recorded is the failure this feature
exists to prevent.

On the server, one addition: `/api/meetings/due` takes `?soon=<minutes>` and answers with a second
list of what is coming, so the phone can set its alarms. Without the parameter it answers exactly
what it did before — which is what the page's own banner asks for.

Alarms do not survive a reboot or an install over the top, so both re-arm the check, and its first
run sets the meetings' alarms again. The **Meeting reminders** notification channel is the off
switch; permission to post is asked for once, when the app is first opened with a server set,
because unlike the microphone there is no later tap to ask on.

## A recording made somewhere else

A phone is full of audio that belongs in a meeting: a voice recorder app's file, something a
colleague sent in a chat, the dictation from a handset nobody had Voxinq on. Android's answer to
"put this in that app" is the share sheet, so the app is in it.

Sharing a recording asks one question — the file's name, its size, and that a meeting will be
created — over whatever app the person was in, and then gets out of the way. A share is one tap
from a mis-tap, and the answer costs a meeting and a place in the transcription queue.

**The upload is the app's only job.** It creates the meeting, sends the file, says the meeting is
over, and asks for the recognition; the recognition itself is a **queued job on the server**, the
same one a re-transcription uses. So the phone can be pocketed the moment the upload finishes, and
what is left behind is a notification that opens the meeting when it is ready. Shares that arrive
while one is uploading wait their turn and go **one at a time**: side by side they shared one
foreground service, and whichever finished first stopped it under the other, which then had no
notification and could be frozen by the system halfway through its upload. Three of those four
calls already existed. The fourth is new:

- `POST /api/meetings/{id}/recording` takes the audio and hands it to the transcription service as
  that meeting's recording, *stored but not recognised* (`/upload/{id}?transcribe=false`, also new).
  Storing and recognising were one step before, which is fine for a browser watching it happen and
  wrong here: recognition belongs in the queue, which is the only thing that can see the LLM's work
  as well as this service's, and on a single-GPU host that is the difference between one job at a
  time and two fighting.
- The route is where the meeting's guards live, too: a meeting that already has a transcript is
  refused rather than overwritten, and the meeting's start time is wound back by the recording's
  own length — without which every line of an hour-long recording imported at five o'clock would
  be stamped after six, because a line's time is reconstructed as "meeting start plus its offset".
- `POST /api/meetings/{id}/transcribe` now fills in **what the settings say** when the caller says
  nothing: the model, the language, and the glossary — the host's terms and the series' own. The
  pages always said; the app, handed a file and nothing else, cannot. So a meeting recognised from
  the phone is primed with exactly what the same meeting recognised from a browser would have been.

Minutes are not written automatically, unlike the web app's drop zone. A day of recordings shared
from a phone is exactly the case the list's **Write them all** was built for.

What the app refuses, and says so: a file that is not audio (by the type the sharing app declares
or the name), one larger than half a gigabyte (the service decodes it in memory), and anything at
all while a meeting is being recorded — the uplink belongs to the recording, which is the one
thing here that cannot be done again later. A file the sharing app granted no permission to read
is refused too, rather than crashing on it.

## Not capturing what the phone plays

The third convenience was to record what other apps are playing, as the page does on a PC with
the browser's screen share. It was built and then closed, because of what it can actually reach.

Android's playback capture covers audio played as **media**, **game** or **unknown** usage, and an
app may opt out of being captured at all. Voice communication is a usage of its own, so the case it
would most be wanted for — a phone call, or Zoom, Teams and Meet — cannot be captured, and no
version of this app will change that. What is left is live media: a talk being streamed, a
recording played back by an app that will not hand the file over.

That last case is the one to weigh, and **sharing the file is better at it** (above): no sitting
through the playback in real time, no second pass through a decoder, and nothing to consent to. So
what remained was narrow enough not to be worth six hundred lines, a screen-recording consent flow
and a media-projection service type in an app that is installed as an APK.

For a meeting somebody is *attending* on the phone, the answer is unchanged and written down in
[usage](usage.md#recording-an-online-meeting-you-are-attending-on-a-phone): speakerphone, with the
microphone in **Room** mode.

The work is not lost — it is on the `android-phone-audio` branch and in closed pull request #283 —
if a use for live media capture turns up later.

## The project

- **`android/`** in this repository, so the bridge and the page that calls it change in the same
  pull request. Gradle and Kotlin; package `io.github.ikasast.voxinq`.
- **SDK**: minimum Android 10 (API 29); target the newest SDK Android Studio ships. Developed
  against a Pixel 9 on Android 17. The `microphone` foreground-service type arrived in Android
  11, with the rule it answers — an app in the background keeps the microphone only through a
  service of that type — so on Android 10 the service holds the microphone without one.
- **Dependencies**: AndroidX core, activity and webkit; OkHttp for the WebSocket and HTTP;
  kotlinx-coroutines. No Firebase, no analytics, nothing that talks to anything but the user's
  server.
- **CI**: a debug APK built on every pull request that touches `android/`. Signing is deliberately
  not in CI: the key would have to be kept in this repository's secrets, and it is the one thing
  that cannot be replaced — an update signed by anything else is refused by Android. It stays on
  the machine that cuts releases, in `~/.voxinq/android-signing/`.
- **Version**: the project's, read from `package.json` at build time, so `3.8.0` is `versionName
  3.8.0` and `versionCode 30800`. One number to bump.
- **Distribution**: the signed APK attached to the release, at no cost, and the release is what an
  updater watches — [Obtainium](https://github.com/ImranR98/Obtainium) or anything else that
  follows a repository's releases.
  **There is no silent auto-update outside the Play Store**; what this gives is being told, and one
  tap. Google's developer verification for apps installed outside Play starts in four countries on
  30 September 2026 and reaches everywhere else in 2027; before then nothing changes, and after it
  the free limited-distribution account (up to twenty devices, no fee, no ID) or Android's advanced
  install flow cover a small team. The Play Store's one-off fee is not needed.

## Milestones

1. **A recording that survives the screen.** Server address, `WebView`, the native recorder,
   finals saved, Stop in the notification. Done when a 60-minute meeting records end to end on the
   Pixel 9 with the screen off, every line is in the meeting afterwards, and its recording
   diarizes.
2. **A recording that survives the network.** Audio written to disk and sent after a dropped
   connection; failed saves queued and retried; a recording that picks itself up if the process
   is killed. Done when a six-minute outage — past the five minutes the page holds in memory —
   costs nothing, and a killed process delivers what it owed when the app is next opened.
3. **The conveniences.** The notice at a booked meeting's time with a record action; sharing an
   audio file from another app to transcribe it. Capturing another app's playback was the third,
   and is **not being done** — see below.
