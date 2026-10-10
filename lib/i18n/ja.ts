// English to Japanese.
//
// The key is the English sentence the component contains, so this file reads as a table rather
// than as a set of names — somebody can check a translation here without knowing where it
// appears. Rows are grouped by screen, in the order the screens were translated.
//
// **Every row is written, not generated.** Machine translation is close enough to look finished
// and wrong in the places that matter: 「録音」and「収録」are both "record", and only one of them
// is what a person does to a meeting. Where the English is deliberately plain, the Japanese is
// too.
//
// A missing row shows the English, which is legible. `tests/i18n.test.ts` fails on one anyway,
// and on a row left here after its sentence was rewritten.

export const ja: Record<string, string> = {
  // ---- The shell: the rail, the top bar, the bottom bar, the account menu ----
  Meetings: "会議",
  "New meeting": "新しい会議",
  // The rail's own emphasis — it is the one action the app exists for, and the capitals carry
  // that in English. Japanese does not have capitals, so the exclamation of it goes instead
  // into being the shortest label on the rail.
  "Record now": "すぐ録音",
  Queue: "順番待ち",
  People: "メンバー",
  Settings: "設定",
  Help: "ヘルプ",
  "Voxinq Meeting home": "Voxinq Meeting のトップへ",
  Account: "アカウント",
  Administrator: "管理者",
  "Log out": "ログアウト",

  // ---- The meeting list: the first screen anybody sees ----
  "Search (title, transcript, minutes)": "検索（タイトル・発言・議事録）",
  "Clear filters": "絞り込みを解除",
  // "+3 more" / "less" — the tag row folds when there are many.
  Trash: "ゴミ箱",
  // The bands down the list. `bandOf` returns these strings, so they are both the value and
  // the row here.
  "This week": "今週",
  "Over a week ago": "1週間以上前",
  "Over a month ago": "1か月以上前",
  Upcoming: "予定",
  "Setting up the meeting…": "会議を用意しています…",
  "Drop to transcribe": "ドロップして文字起こし",
  "It becomes a new meeting, and its minutes follow.": "新しい会議になり、そのまま議事録まで作られます。",
  "Start a meeting": "会議を始める",
  "One tap, and it is recording.": "押すとすぐに録音が始まります。",
  "Plan a meeting": "会議を予定する",
  "Set up a meeting": "会議を準備する",
  "Name it, give it an agenda and a time.": "名前・議題・日時を先に決めておきます。",
  "Name it and give it an agenda first.": "名前と議題を先に決めておきます。",
  "Audio file": "音声ファイル",
  "Or drop one anywhere on the page.": "画面のどこにドロップしても始まります。",
  "Recent meetings": "最近の会議",
  "All meetings": "すべての会議",
  "Yesterday": "昨日",
  "Earlier": "それ以前",
  "Close the sidebar": "サイドバーを閉じる",
  "Fold the sidebar": "サイドバーを畳む",
  "Search meetings": "会議を検索",
  "Open the sidebar": "サイドバーを開く",
  "Close the transcript": "発言を閉じる",
  "Open the transcript": "発言を開く",
  "In progress": "進行中",
  "Generating minutes…": "議事録を生成中…",
  // The row's own line: how much was said, and how much was written about it. Two keys each,
  // because English agrees and Japanese does not — both forms land on the same row here, which
  // is the whole reason this needs no plural library.
  "1 utterance": "発言 1件",
  "{n} utterances": "発言 {n}件",
  "1 set of minutes": "議事録 1件",
  "{n} sets of minutes": "議事録 {n}件",
  "No meetings yet.": "まだ会議がありません。",
  "No matching meetings.": "該当する会議がありません。",
  "Recording is available over Tailscale.": "録音は Tailscale 経由で使えます。",

  // ---- The row's menu ----
  "Meeting actions": "この会議の操作",
  "Move to Trash": "ゴミ箱へ移動",
  "Move to Trash?": "ゴミ箱へ移動しますか？",
  "The meeting can be restored from Trash for 30 days.": "30日間はゴミ箱から元に戻せます。",

  // ---- The calendar over the list ----
  "Previous month": "前の月",
  "Next month": "次の月",
  Today: "今日",
  // ---- The recording screen ----
  Preparing: "準備中",
  Listening: "認識中",
  Reconnecting: "再接続中",
  Error: "エラー",
  Stopped: "停止中",
  "● Model ready": "● モデル準備完了",
  "◌ Loading model…": "◌ モデル読み込み中…",
  "Start recording": "録音を開始",
  "Stop recording": "録音を停止",
  "Generate minutes": "議事録を作成",
  "Starting…": "開始中…",
  "End only": "終了のみ",
  Diarize: "話者を分離",
  "Speaker separation": "話者分離",
  "Work out who spoke each line, and give them names":
    "どの発言を誰が話したかを判定し、名前を付けます",
  "Re-transcribe": "文字起こしをやり直す",
  Minutes: "議事録",
  "End the meeting and start generating minutes in the background":
    "会議を終了し、議事録の作成をバックグラウンドで始めます",
  "End the meeting and assign speakers automatically; generate minutes after reviewing them":
    "会議を終了し、話者を自動で割り当てます。議事録は内容を確認してから作成します",
  "Recording is not available from an external network": "外部ネットワークからは録音できません",
  "STT_WS_URL is not set on the server.": "サーバーに STT_WS_URL が設定されていません。",
  "This meeting has ended": "この会議は終了しています",
  Microphone: "マイク",
  "Mic + PC audio": "マイク + PC音声",
  "Recording source (PC audio captures online-meeting sound). Changeable while recording.":
    "録音ソース（PC音声はオンライン会議の音を取り込みます）。録音中も変更できます。",
  Japanese: "日本語",
  English: "英語",
  "Auto-detect": "自動判定",
  Standard: "標準",
  "Input audio level (movement means sound is arriving)": "入力レベル（動いていれば音が届いています）",
  "The input is clipping — turn the source down; recognition cannot recover a clipped word":
    "入力が割れています — 音源を下げてください。割れた音は認識で復元できません",
  "Screen resting. Recording continues. Activate to show the recording screen.":
    "休止画面です。録音は続いています。触れると録音画面に戻ります。",
  "Recording — touch to show": "録音中 — 触れると表示",
  Transcript: "発言",
  "Something else is using the GPU": "GPU を他の処理が使っています",
  "Interrupt and transcribe live": "中断して会議中に文字起こし",
  "Record only": "録音だけする",
  "{what} is running.": "{what} が実行中です。",
  "Interrupting it transcribes this meeting as you speak. What was running goes back to the front of the queue and starts again once the meeting ends.":
    "中断すると、この会議を話しながら文字起こしします。中断した処理はキューの先頭に戻り、会議が終わると最初からやり直します。",
  "Recording only leaves it alone. The audio is kept and transcribed after the meeting — nothing is lost, but no text appears while you talk.":
    "「録音だけする」なら、動いている処理はそのままです。音声は保存され、会議の後に文字起こしされるので失われるものはありませんが、話している間は文字が出ません。",
  "PC audio": "PC音声",
  "Before you start": "始める前に",
  "Pick the recording source from the menu above (mic / PC audio / both).":
    "上のメニューから録音ソースを選んでください（マイク / PC音声 / 両方）。",
  "For PC audio / both, enable “Share tab audio” (or system audio) in the share dialog.":
    "PC音声・両方の場合は、共有ダイアログで「タブの音声を共有」（またはシステム音声）を有効にしてください。",
  "Headphones are recommended for “both”": "「両方」ではヘッドホンを推奨します",
  ". With speakers, the mic picks up PC audio and it may be recorded twice.":
    "。スピーカーだと PC音声をマイクが拾い、二重に録音されることがあります。",
  "Distinguish speakers after the meeting via “Diarize” on the detail page, or per line.":
    "話者は会議終了後、詳細画面の「話者を分離」または発言ごとに割り当てられます。",
  "On phones, ": "スマホでは、",
  "keep the screen on": "画面を点けたままにしてください",
  "In the app, recording carries on with the screen off or another app in front. Stop it here, or from the app's notification.":
    "アプリでは、画面を消しても、ほかのアプリを開いても録音は続きます。停止はこの画面か、アプリの通知から行えます。",
  " while recording (sleep is auto-suppressed, but on some devices turning the screen off stops mic capture).":
    "（スリープは自動で抑止しますが、端末によっては画面を消すとマイクが止まります）。",
  "Microphone check": "マイクの確認",
  "Check the microphone": "マイクを確認する",
  "Check again": "もう一度確認",
  "Say something. The bar should move.": "何か話してください。バーが動けば届いています。",
  "Microphone level": "マイクの入力レベル",
  "Sound is arriving. The microphone stays open, and the recording will use it.":
    "音が届いています。このマイクは開いたままで、録音でもそのまま使われます。",
  "Nothing heard yet.": "まだ何も聞こえていません。",
  "loudest {peak} · needs {needs}": "最大 {peak} · 必要 {needs}",
  "Heard you. This microphone is open and the recording will use it — no second permission prompt, and no chance of it opening a different input.":
    "聞こえました。このマイクは開いたままで、録音でもこれが使われます — 許可を再度求められることも、別の入力が開かれることもありません。",
  "Nothing loud enough came through — the loudest moment was {peak}, and {needs} is where speech starts being recognised. Check that the right input is selected and not muted — a headset with its own mute switch, or another app holding the microphone, both look like this.":
    "十分な大きさの音が届きませんでした — 最も大きかったところで {peak}、認識が始まるのは {needs} からです。正しい入力が選ばれていて、ミュートされていないか確認してください。ヘッドセット側のミュートスイッチや、他のアプリがマイクを掴んでいる場合も、これと同じに見えます。",
  "The browser refused access to the microphone. Allow it for this site and try again.":
    "ブラウザがマイクへのアクセスを拒否しました。このサイトに許可してから、もう一度お試しください。",

  // ---- The meeting page: the column beside the minutes ----
  Add: "追加",
  "Add {name} to this meeting": "{name} をこの会議に追加",
  "{speakers} of {total} expected to speak — diarization is told to look for {n}.":
    "{total}人中 {speakers}人が発言する想定です。話者分離は {n} を探します。",
  "as many as it finds": "見つかった数だけ",
  "Back to list": "一覧へ戻る",
  "1 person": "1人",
  "Number of speakers": "話者の人数",
  "Automatic (from the participants)": "自動（参加者の人数から）",
  "{n} people": "{n}人",
  "Writing minutes…": "議事録を作成中…",
  "Transcribed with": "使用したモデル",
  Language: "言語",
  "Minutes by": "議事録の生成",
  Series: "シリーズ",
  Glossary: "用語集",
  "Open the series page (timeline & defaults)": "シリーズのページを開く（履歴と既定値）",
  "Purpose & agenda": "目的と議題",
  "Purpose, agenda, and background of the meeting. Improves minutes quality.":
    "会議の目的・議題・背景。議事録の質が上がります。",
  "Not set": "未設定",
  "e.g. Weekly sync (empty = none)": "例: 週次定例（空欄ならなし）",
  Participants: "参加者",
  "Nobody recorded.": "参加者は登録されていません。",
  "Add who was there. Ticked names are the ones expected to speak.":
    "その場にいた人を登録します。チェックした人が話す想定として扱われます。",
  "Expected to speak": "発言する想定",
  "Attended, but did not speak": "参加したが発言していない",
  "Add a name": "名前を追加",
  Remove: "削除",

  // ---- The buttons along the top of the meeting ----
  "Edit meeting title": "タイトルを編集",
  "How to write": "書き方の指示",
  "Start from the built-in instructions": "既定の指示から書き始める",
  "Instructions on how to write: tone, how much to condense, what to do with a heading that has nothing under it. Left empty, the built-in instructions shown faintly are used. Some rules always apply and are not part of this: only what was said, no guessing, the minutes' language, and starting at the first heading.":
    "文体、どこまで要約するか、該当が無い見出しの扱いなど、書き方の指示です。空欄なら薄く表示している既定の指示を使います。発言ログにあることだけを書く・推測しない・議事録の言語・最初の見出しから書き始める、といった規則は常に適用され、ここには含まれません。",
  "Change the booked time": "予定の日時を変更",
  "Only a booked meeting that has not been recorded yet can be moved.": "日時を変更できるのは、まだ録音していない予定の会議だけです。",
  "Failed to save": "保存に失敗しました",
  "Saving…": "保存中…",
  "Could not save": "保存できませんでした",
  Download: "ダウンロード",
  "Download meeting": "会議をダウンロード",
  "Download failed": "ダウンロードに失敗しました",
  "Opens the print dialog — choose “Save as PDF” as the destination":
    "印刷画面が開きます — 出力先で「PDF に保存」を選んでください",
  "Copy minutes": "議事録をコピー",
  When: "日時",
  Purpose: "目的",
  Status: "状態",
  "Edit participants": "参加者を編集",
  "Models, language and glossary": "モデル・言語・用語集",
  "Share minutes": "議事録を共有",
  "Copy transcript": "発言をコピー",
  "Who can use this server, and how they sign in.": "このサーバーを使える人と、そのサインイン方法。",
  "Accounts are disabled, never deleted: they hold meetings.": "アカウントは無効にするだけで、削除はしません（会議を持っているため）。",
  "What they sign in with. Nothing is sent to it.": "サインインに使うアドレス。メールは送られません。",
  "Tailnet login": "tailnet のログイン",
  "Signs them in from inside the tailnet, with no password.": "tailnet の中からは、パスワードなしでサインインできます。",
  "Meetings that keep happening. What they share is set once, on the series.":
    "繰り返し開く会議。共通の事項はシリーズで一度だけ設定します。",
  "each meeting's minutes are written with the previous one's": "議事録は前回の議事録をふまえて書かれます",
  "Copied onto each new meeting in the series, so speaker separation knows who to expect.":
    "シリーズの新しい会議に写され、話者分離で誰が話すかの手がかりになります。",
  "Read with each meeting's minutes. Only you see it, but it is not encrypted.":
    "各会議の議事録づくりで読まれます。見えるのはあなただけですが、暗号化はされません。",
  "Empty: the global setting.": "空欄なら全体の設定を使います。",
  "Added to the global glossary.": "全体の用語集に追加されます。",
  "Edit the regular members": "常任メンバーを編集",
  ", ": "、",
  "Edit the shared background": "共通の背景を編集",
  "Edit the minutes format": "議事録の書式を編集",
  "Edit the glossary": "用語集を編集",
  "New minutes use this; {action} can pick another. A series with its own keeps that.":
    "新しい議事録はこれを使います。「{action}」では別の書式も選べます。独自の書式を持つシリーズはそちらを使います。",
  "New work uses this. Re-transcribe can pick another for one run.":
    "新しい処理はここを使います。再文字起こしでは1回だけ別の場所も選べます。",
  "Recognition":
    "認識",
  "While recording, the screen goes black after this long; recording carries on. Saves a phone's battery, but hides the live transcript. This device only.":
    "録音中、この時間がたつと画面を黒くします（録音は続きます）。スマホの電池が持つ代わりに、文字起こしは見えなくなります。この端末だけの設定。",
  "When a booked meeting is due, this device is notified while Voxinq is open in a tab. This device only.":
    "予約した会議の時刻に、Voxinq をタブで開いていればこの端末に通知します。この端末だけの設定。",
  "Saved": "保存しました",
  "Not saved": "保存できませんでした",
  "Memory each needs: {guide}. Downloaded on first use.": "必要なメモリの目安: {guide}。初回に自動でダウンロードします。",
  "Live recognition uses this model; after the meeting and Re-transcribe use {model} at {host}.":
    "会議中の認識はこのモデル、会議後と再文字起こしは {host} の {model} を使います。",
  "Auto-detect keeps the language that was spoken.": "自動判定は、話された言語のまま文字にします。",
  "Names and terms to expect. Keep it short — about 150 characters.": "出てくる人名・用語。150 文字程度までに。",
  "Japanese translation": "日本語訳",
  "Under each non-Japanese line. Runs on the CPU; a 1.2 GB model is downloaded on first use.":
    "日本語以外の発言の下に表示。CPU で動き、初回に 1.2 GB のモデルをダウンロードします。",
  "Megabytes of video memory queued work may use at once. Empty: worked out from the card.":
    "順番待ちの処理が同時に使える VRAM（MB）。空欄ならカードから自動で決めます。",
  "Auto": "自動",
  "Whatever language was spoken.": "話された言語に関係なく、この言語で書きます。",
  "Background": "背景",
  "Read with every meeting's minutes, to understand its terms — never copied into them. Half a page to a page.":
    "すべての議事録づくりで用語の理解に使い、議事録には書き写しません。半ページ〜1 ページほど。",
  "Your organisation, projects and people.": "組織・プロジェクト・関係者など",
  "Formats": "書式",
  "Leave it empty for a local server.": "ローカルのサーバーなら空欄で構いません。",
  "This device only. System follows the OS.": "この端末だけの設定。「システム」は OS に合わせます。",
  "Of the screens. The minutes' language is under Minutes.": "画面の言語です。議事録の言語は「議事録」で設定します。",
  "Until somebody names it. A booked meeting is named for its day.": "名前を付けるまでの仮の名前。予約した会議はその日付になります。",
  "Rest the screen": "画面を休ませる",
  "{feeling} more than the rest of the meeting ({of} of {n})": "{feeling}な発言が会議全体より多め（{n} 件中 {of} 件）",
  "this meeting": "この会議",
  "For example:": "たとえば:",
  "The recording is no longer kept, so it cannot be done again.": "録音が残っていないため、分け直せません。",
  "Name the speakers": "話者に名前を付ける",
  "Not separated yet": "まだ分けていません",
  "Not separated — there is no recording to read": "分けていません（録音が残っていないため分けられません）",
  "Separate speakers": "話者を分ける",
  "1 without a name": "名前のない話者が 1 人",
  "{n} without a name": "名前のない話者が {n} 人",
  "Separating…": "分けています…",
  "How many": "人数",
  "auto": "自動",
  "How many voices to look for": "聞き分ける声の数",
  "As entered.": "入力した人数で分けます。",
  "From the participants who spoke.": "参加者のうち、発言した人の数です。",
  "Left empty, it is guessed. Tick who spoke under Participants to set it.":
    "空欄なら推定します。参加者で発言した人にチェックを入れると、その数が入ります。",
  "Separate": "分ける",
  "The recording is no longer kept, so the voices cannot be told apart.": "録音が残っていないため、声を聞き分けられません。",
  "Separate again": "分け直す",
  "Name them": "名前を付ける",
  "A name here changes every line by that speaker.": "ここで付けた名前は、その話者のすべての発言に反映されます。",
  "Remember their voices": "声を覚える",
  "The named speakers are then named automatically in later meetings.": "名前を付けた人は、次の会議から自動で名前が付きます。",
  "Voices remembered:": "覚えている声:",
  "Once the voices are told apart.": "声を分けたあとに付けられます。",
  "Told apart: 1 voice.": "1 人の声に分けました。",
  "Told apart: {n} voices.": "{n} 人の声に分けました。",
  "Me": "自分",
  "Speaker {n}": "話者 {n}",
  "Delete the voice profile of {name}": "{name} さんの声紋を削除",
  "Read the passage below aloud for 20–30 seconds, in the voice you use in meetings.":
    "お手数ですが、次の文章を普段の会議で話すときの調子で、20〜30秒ほど読み上げてください。",
  "“In today’s meeting we will first review last week’s progress, and then talk about next month’s plan. The materials are the ones shared beforehand, with three changes: first the budget, second who is responsible for what, and third the deadlines. If anything is unclear, please ask straight away.”":
    "「本日の打ち合わせでは、まず先週の進捗を確認し、そのあとで来月の計画について話し合います。資料は事前に共有した通りですが、変更点が三つあります。第一に予算の配分、第二に担当者の割り当て、第三に納期の調整です。何か質問があれば、遠慮なくその場でお知らせください。」",
  "When you have finished, feel free to add a sentence or two of your own.":
    "読み終えたら、そのまま自由に一言二言付け加えても構いません。",
  "A link for {name}": "{name} さん用のリンク",
  "It works once and expires in {n} minutes. It is shown here and nowhere else — only a hash of it is stored, so it cannot be shown again. Hand it over now.":
    "1 回だけ使え、{n} 分で切れます。表示されるのはここだけで、保存されるのはハッシュのみのため二度と表示できません。今のうちに渡してください。",
  "1 result": "1 件",
  "{n} results": "{n} 件",
  "Meetings: {added} added, {skipped} already here.": "会議: {added} 件を追加、{skipped} 件は既にありました。",
  "{n} failed.": "{n} 件は失敗しました。",
  "{utterances} utterances · {minutes} minutes · {series} series · {tags} tags · {profiles} voice profiles ({kept} kept)":
    "発言 {utterances} 件 · 議事録 {minutes} 件 · シリーズ {series} 件 · タグ {tags} 件 · 声紋 {profiles} 件（既存 {kept} 件はそのまま）",
  "Recordings: {restored} restored, {present} already present.": "録音: {restored} 件を復元、{present} 件は既にありました。",
  "{n} could not be written.": "{n} 件は書き込めませんでした。",
  "From Voxinq {version}, exported {when}": "Voxinq {version} から書き出し（{when}）",
  "unknown": "不明",
  "The meeting is recorded and recognised once it ends.": "会議は録音され、終わってからまとめて文字起こしされます。",
  "unsaved": "未保存",
  "none": "なし",
  "Recordings sent here leave this machine and go to {host}, which bills you for the length of the audio.":
    "ここに送る録音はこの PC を離れて {host} に届き、音声の長さに応じて課金されます。",
  "A local or private address — nothing leaves your network.": "ローカルまたはプライベートなアドレスです。ネットワークの外には出ません。",
  "gemini-3.5-transcribe returns word timings and speaker labels. A general model such as gemini-3.5-flash returns text alone, which arrives as one long utterance.":
    "gemini-3.5-transcribe は単語ごとの時刻と話者を返します。gemini-3.5-flash のような汎用モデルは文字だけを返すため、1 つの長い発言として届きます。",
  "Recording… {n}s": "録音中… {n} 秒",
  "{action} the series ({n})": "シリーズ {n} 件を{action}",
  "The model that tells speakers apart is free, but its authors require you to accept their terms first. It is a one-time setup of a few minutes; everything else — recording, transcription, minutes — works without it.":
    "話者を聞き分けるモデルは無料ですが、使う前に作者の利用条件への同意が必要です。数分で済む一度きりの設定で、録音・文字起こし・議事録はこれが無くても動きます。",
  "Cannot reach PostgreSQL": "PostgreSQL に接続できません",
  "Cannot reach Ollama": "Ollama に接続できません",
  "Cannot reach the LLM (check the Base URL)": "LLM に接続できません（Base URL を確認してください）",
  "Busy: minutes are being generated for “{title}”. Please wait until it finishes.":
    "「{title}」の議事録を作成中です。終わるまでお待ちください。",
  "Failed to answer: {reason}": "回答できませんでした: {reason}",
  "This meeting has no transcript to read.": "この会議には読める発言がありません。",
  "No minutes to answer from yet. Generate minutes for at least one meeting first.":
    "答えの元になる議事録がまだありません。先にどれか 1 つの会議で議事録を作成してください。",
  "No terms to check against. Add some in Settings → Transcription, or on the series.":
    "照らし合わせる用語がありません。設定 → 文字起こし、またはシリーズで追加してください。",
  "Failed to check the transcript: {reason}": "発言を確認できませんでした: {reason}",
  "This meeting has already ended. Recording cannot be restarted.": "この会議はすでに終了しています。録音は再開できません。",
  "This meeting already has a transcript.": "この会議にはすでに発言があります。",
  "That file is too large to import.": "ファイルが大きすぎて取り込めません。",
  "The transcription service could not be reached.": "文字起こしサービスに接続できませんでした。",
  "No voice embeddings stored for this meeting. Run Diarize (again) first — the recording must still exist.":
    "この会議には声の特徴が保存されていません。先に話者分離を（もう一度）実行してください。録音が残っている必要があります。",
  "No named speakers to enroll. Name the diarized speakers under “Speaker names” first.":
    "登録できる名前付きの話者がいません。先に「話者名」で、分離した話者に名前を付けてください。",
  "{field} cannot be changed from outside your private network.": "{field} はプライベートネットワークの外からは変更できません。",
  "The shared background is too long.": "共通の背景が長すぎます。",
  "Failed to update Tailscale Funnel: {reason}": "Tailscale Funnel を更新できませんでした: {reason}",
  "Found {speakers} speaker(s) across {lines} utterance(s).": "{lines} 件の発言から {speakers} 人の話者が見つかりました。",
  "{n} had no label.": "{n} 件は話者が付きませんでした。",
  "A short or one-sided recording, or a transcript that arrived as one block, gives the diarizer little to separate.":
    "録音が短い・一人だけが話している・発言が 1 つの塊で届いた、といった場合は、話者分離の手がかりが少なくなります。",
  "{split} utterance(s) held more than one speaker and were divided, adding {added} line(s).":
    "{split} 件の発言に複数の話者が含まれていたため分割し、{added} 行増えました。",
  "Interrupted by a restart — it will run again from the beginning.": "再起動で中断しました。最初からやり直します。",
  "Interrupted so a recording could start. It runs again once the meeting ends.":
    "録音を始めるために中断しました。会議が終わるとやり直します。",
  "Recording.": "録音中。",
  "Recording finished.": "録音が終わりました。",
  "Recording ended without saying so; the GPU was handed back.": "録音が知らせなく終わったため、GPU を返しました。",
  "Waiting for you to sign in — this work needs your key to read the meeting.":
    "サインインを待っています。この処理は会議を読むためにあなたの鍵が必要です。",
  "Encrypting and indexing the meetings that still need it.": "まだの会議を暗号化し、検索できるようにしています。",
  "Cannot write anything while signed out.": "サインアウト中は何も書き込めません。",
  "Emotion is switched off.": "感情はオフになっています。",
  "No line has a place in the recording to judge.": "録音上の位置が分かる発言がないため、判定できません。",
  "Emotion needs the NVIDIA GPU build of the transcription service, which has torch.":
    "感情の判定には、torch を含む NVIDIA GPU 版の文字起こしサービスが必要です。",
  "Emotion needs HF_TOKEN, with the terms of its two models accepted on Hugging Face.":
    "感情の判定には HF_TOKEN と、Hugging Face で 2 つのモデルの利用条件への同意が必要です。",
  "That transcription endpoint is no longer saved. Settings → Transcription.":
    "その文字起こし先はもう保存されていません。設定 → 文字起こしを確認してください。",
  "This device or browser cannot capture PC audio. Use Chrome or Edge on a PC.":
    "この端末・ブラウザは PC 音声を取り込めません。PC の Chrome か Edge を使ってください。",
  "No audio was shared. In the share dialog, turn on “Share tab audio” or the system audio.":
    "音声が共有されていません。共有ダイアログで「タブの音声を共有」またはシステム音声をオンにしてください。",
  "Lost the transcription service (code {code}{reason}) after {n} tries to reconnect.":
    "文字起こしサービスとの接続が切れました（コード {code}{reason}）。{n} 回再接続を試みました。",
  "Next meeting": "次の会議",
  "Next meeting in this series": "このシリーズの次の会議",
  "Fix wording": "表記の修正",
  "See every line it changes before it does": "直す前に、変わる行を確かめられます",
  "Suggest from the glossary": "用語集から候補を出す",
  "{picked} of {n} selected": "{n} 件中 {picked} 件を選択",
  "Only the first {shown} are shown; fix them, then look again.":
    "最初の {shown} 件だけを表示しています。直してから、もう一度探してください。",
  "Fixing…": "修正中…",
  "Fix {n}": "{n} 件を直す",
  "Fixed 1 line.": "1 行を直しました。",
  "Fixed {n} lines.": "{n} 行を直しました。",
  "Two product names in here are written the way speech recognition mishears them. Ask the glossary for suggestions, or type the word and what it should be — either way every line it would change is listed, and only the ticked ones change.":
    "この発言には、音声認識が聞き間違えた形の製品名が2つ入っています。用語集から候補を出すか、間違った語と正しい語を入力すると、変わる行がすべて一覧になり、チェックした行だけが直ります。",
  "Markdown, Word or PDF, the transcript and the recording — all from ⬇ beside the title.":
    "Markdown・Word・PDF、発言、録音を、タイトル横の ⬇ からまとめて書き出せます。",
  "Meeting info": "会議情報",
  Everything: "まとめて",
  "Print and save": "印刷して保存",
  "no recording": "録音なし",
  "Waiting for the GPU": "GPU の空き待ち",
  "+{n} waiting": "ほか {n} 件待ち",
  "Open the queue": "順番待ちを開く",
  "Goes under Upcoming": "予定に入ります",
  "Empty: record now": "空欄なら今すぐ録音",
  "End the meeting": "会議を終える",
  "Stop recording. The meeting stays open; end it on its page.": "録音を止めます。会議は終わらず、会議ページから終了できます。",
  "What is said appears here once recording starts.": "録音を始めると、ここに発言が流れます。",
  "Open the meeting": "会議を開く",
  "Recognizing:": "認識中:",
  "Recording “{title}”": "「{title}」を録音中",
  "“{title}” is being recorded. Stop it before recording another meeting.": "「{title}」を録音中です。別の会議を録音するには、先にそちらを止めてください。",
  Pinned: "ピン留め",
  Pin: "ピン留めする",
  Unpin: "ピン留めを外す",
  "Pin to the sidebar": "サイドバーにピン留め",
  "Unpin from the sidebar": "サイドバーのピン留めを外す",
  "Resize the transcript": "発言パネルの幅を変更",
  "Drag to change the width; double-click to reset it": "ドラッグで幅を変更・ダブルクリックで元に戻す",
  "Copy failed": "コピーに失敗しました",
  "Resume recording": "録音を再開",
  "Continue recording — appends to the existing recording and transcript":
    "録音を続けます — 既存の録音と発言に追記されます",
  "Move to Trash (restorable for 30 days)": "ゴミ箱へ移動（30日間は復元できます）",
  "Move this meeting to the trash. You can restore it within 30 days.":
    "この会議をゴミ箱へ移動します。30日以内なら復元できます。",
  Delete: "削除する",
  "Failed to delete": "削除に失敗しました",

  // ---- The minutes panel ----
  "Failed to generate minutes.": "議事録を作成できませんでした。",
  "Reason: {reason}": "理由: {reason}",
  Retry: "再試行",
  "The last regeneration failed: {reason}": "前回の作り直しに失敗しました: {reason}",
  "The last regeneration failed.": "前回の作り直しに失敗しました。",
  "Showing the previous version — use the ↻ button to retry.":
    "以前の版を表示しています。↻ ボタンでやり直せます。",
  "No minutes generated yet.": "まだ議事録が作られていません。",
  "No transcript, so minutes cannot be generated.": "発言が無いため、議事録は作れません。",
  "They will be written once the transcription is done.": "文字起こしが終わると、続けて作ります。",
  "Generating new minutes. A new version will be added below when done…":
    "新しい議事録を作成中です。完成すると下に新しい版が追加されます…",
  Regenerate: "作り直す",
  "Regenerate the minutes": "議事録を作り直す",
  "Choose how they are written…": "作り方を選ぶ…",
  "Regeneration failed": "作り直しに失敗しました",
  Edit: "編集",
  Cancel: "キャンセル",
  "Version:": "版:",
  "not recorded yet": "まだ録音していません",
  "(in progress)": "（進行中）",
  latest: "最新",
  "Viewing an older version": "古い版を表示しています",
  "Built-in default": "組み込みの既定",
  "Same as settings": "設定と同じ",
  Provider: "生成元",
  "Model: {model} (from Settings)": "モデル: {model}（設定から）",
  "Ollama (local)": "Ollama（ローカル）",
  Anthropic: "Anthropic",
  "OpenAI-compatible": "OpenAI 互換",
  Stop: "停止",
  "Stop the running minutes generation": "実行中の議事録生成を止めます",

  // ---- The transcript panel ----
  "No transcript.": "発言がありません。",
  "This meeting is being recorded; new utterances appear as they are transcribed":
    "この会議は録音中です。文字起こしされた発言が順に出ます",
  "Edit this utterance": "この発言を編集",
  "Delete this utterance": "この発言を削除",
  "Delete this utterance?": "この発言を削除しますか？",
  "Delete this utterance (it will no longer feed minutes generation)":
    "この発言を削除します（以後、議事録の生成には使われません）",
  "Change the speaker of this utterance": "この発言の話者を変更",
  "Protect the recording": "録音を保護",
  "Protect the recording so it is not auto-deleted": "録音を保護して、自動で削除されないようにします",
  "Protected. If unprotected, it is auto-deleted once the retention period has passed from then":
    "保護しています。解除すると、その時点から保存期間が過ぎたあとに自動で削除されます",
  "Checking…": "確認中…",
  "Diarization failed": "話者の分離に失敗しました",
  "Done. Rename the speakers below if you like.": "完了しました。下で話者の名前を付け直せます。",
  "Delete this voice profile": "この声紋を削除",
  "No misheard glossary terms found across {checked} utterances.": "発言 {checked}件を確認しました。聞き違えた用語は見つかりませんでした。",
  Find: "検索",
  "Replace with": "置換後",
  "Match case": "大文字小文字を区別",
  "No matches.": "一致するものがありません。",
  "Re-transcribe from the recording": "録音から文字起こしをやり直す",
  "Recognise the recording again and replace the transcript": "録音を認識し直して発言を置き換えます",
  "Re-recognizes the whole recording and replaces the transcript.":
    "録音全体を認識し直して、発言を置き換えます。",
  "Re-transcription failed": "文字起こしのやり直しに失敗しました",
  "Recognizing…": "認識中…",
  "Same as settings ({endpoint})": "設定と同じ（{endpoint}）",
  endpoint: "エンドポイント",
  "Same as settings (this machine)": "設定と同じ（この機器）",
  "On this machine": "この機器で",
  "Saved endpoints": "保存済みエンドポイント",
  "Share transcript": "発言を共有",
  "Waiting for the GPU to be free…": "GPU が空くのを待っています…",
  "Adding to the queue…": "順番待ちに追加しています…",
  "Cannot reach the server — retrying": "サーバーに接続できません — 再試行中",
  "Reconnecting…": "再接続中…",
  "Stopping…": "停止中…",
  "Stopped.": "停止しました。",
  "Cancelled.": "取り消しました。",
  "The job could not be found.": "その処理が見つかりませんでした。",

  // ---- New meeting ----
  "Weekly research sync #2": "研究定例 #2",
  "e.g. Weekly sync — links meetings so minutes carry context":
    "例: 週次定例 — 会議をつなげ、前回の議事録が文脈として渡ります",
  Title: "タイトル",
  "Transcription language": "文字起こしの言語",
  "Recording source": "録音ソース",
  "Set up meeting": "会議を準備する",
  "Setting up…": "準備中…",
  "Add to Upcoming": "予定に追加",
  "Adding…": "追加中…",
  "Failed to create meeting.": "会議の作成に失敗しました。",
  "Please enter a title.": "タイトルを入力してください。",
  "Please drop an audio file (wav, mp3, m4a, ...).":
    "音声ファイルをドロップしてください（wav, mp3, m4a など）。",
  "Uploading the recording…": "録音をアップロード中…",

  // ---- People ----
  "Add someone": "メンバーを追加",
  "Loading…": "読み込み中…",
  "Display name (optional)": "表示名（任意）",
  "An administrator": "管理者にする",
  "Issue a one-time link so they can set their own password":
    "本人がパスワードを設定できるワンタイムリンクを発行します",

  // ---- Settings ----
  "(models, glossary, API keys — off by default so a restore does not disturb this machine’s configuration)":
    "（モデル・用語集・API キー。既定ではオフです。復元でこの機械の設定が乱れないようにするためです）",
  "The Tailscale command line wasn’t reachable from the server, so publishing can’t be toggled here. You can still manage it manually on the host:":
    "サーバーから Tailscale のコマンドに到達できなかったため、ここからは切り替えられません。ホスト側で手動なら操作できます:",
  "The request format, not the company. Whisper servers and most hosted providers speak the first one; the second is for Google’s own endpoint, or a gateway that imitates it.":
    "会社ではなくリクエスト形式の話です。Whisper サーバーと多くの事業者は前者を話します。後者は Google 自身のエンドポイント、またはそれを模したゲートウェイ向けです。",
  Speakers: "話者",
  LLM: "LLM",
  "Remote access": "外部公開",
  Data: "データ",
  "Defaults for everyone": "全員の既定値",
  System: "システムに合わせる",
  Light: "ライト",
  Dark: "ダーク",
  "Brief (key points, shorter)": "簡潔（要点のみ・短め）",
  "Detailed (fuller for longer meetings)": "詳細（長い会議ほど厚く）",
  "Japanese (日本語)": "日本語",
  "Chinese (中文)": "中国語（中文）",
  "Auto-detect (keep the spoken language)": "自動判定（話された言語のまま）",
  "Japanese (fixed)": "日本語に固定",
  "English (fixed)": "英語に固定",
  "Ollama (default)": "Ollama（既定）",
  "Never — keep the screen on": "休ませない — 画面を点けたまま",
  "After 30 seconds": "30秒後",
  "After 1 minute": "1分後",
  "After 5 minutes": "5分後",
  "After 10 minutes": "10分後",
  "+ Add endpoint": "＋ エンドポイントを追加",
  "the endpoint’s model": "そのエンドポイントのモデル",
  Transcription: "文字起こし",
  Appearance: "表示",
  "Remote access (public URL)": "外部公開（公開 URL）",
  "Backup & restore": "バックアップと復元",
  "Voice profiles (speaker auto-naming)": "声紋（話者の自動命名）",
  "Saved.": "保存しました。",
  Close: "閉じる",
  More: "その他",
  Name: "名前",
  Model: "モデル",
  Key: "キー",
  Format: "書式",
  Export: "書き出し",
  Restore: "復元",
  Password: "パスワード",
  "Password again": "パスワード（確認）",
  "at least 8 characters": "8文字以上",
  Unnamed: "名称未設定",
  default: "既定",

  "Set for the whole machine — there is one card and one transcription service, so this is an administrator’s to change.":
    "この設定は機械全体のものです — カードも文字起こしサービスも 1 つしかないので、変更できるのは管理者だけです。",
  "These are what a new account starts with, and what anybody who has never changed a setting is using right now. Changing one here reaches all of them at once — and leaves alone anybody who has made their own choice.":
    "新しいアカウントが最初に使う値であり、いま設定を一度も変えていない人が使っている値でもあります。ここを変えるとその全員に一度に届き、自分で選んだ人はそのままです。",

  "This is a Japanese-only model — meetings in other languages will not transcribe.":
    "これは日本語専用モデルです — 他の言語の会議は文字起こしできません。",
  "GPU budget for queued work": "順番待ちの処理に使う VRAM の上限",
  "Translate non-Japanese speech into Japanese": "日本語以外の発言に日本語訳を付ける",

  "Minutes language": "議事録の言語",
  "Minutes format": "議事録の書式",
  "No saved formats. Minutes use the built-in one: an overview, then the discussion by topic, then decisions and action items.":
    "保存された書式はありません。議事録は組み込みの書式を使います — 概要、話題ごとの議論、決定事項とアクションアイテムの順です。",
  "Starts with": "書き出し",
  "The heading structure the model is asked to follow. Its first heading is also used to start the model off, so keep one at the top.":
    "モデルに従わせる見出し構成です。最初の見出しは書き出しにも使われるので、先頭には見出しを置いてください。",

  Ollama: "Ollama",
  "Base URL": "ベース URL",
  "API key": "API キー",
  "Delete the saved key": "保存されたキーを削除",
  "Their terms decide how long it is kept and whether it trains anything. Voxinq cannot change that.":
    "保存期間や学習に使われるかは、送り先の規約が決めます。Voxinq からは変えられません。",
  "You are billed by them, per token. Long meetings cost more than short ones.":
    "料金はトークン単位で送り先から請求されます。長い会議ほど高くなります。",

  Theme: "テーマ",
  "Follow my browser": "ブラウザに合わせる",
  "Default meeting name": "会議の既定の名前",
  "Rest the screen while recording": "録音中に画面を休ませる",

  "Publishing is managed from your private network. Open Settings on a device connected to your Tailscale tailnet (or the host itself) to turn public access on or off.":
    "公開の切り替えは、プライベートネットワークの中から行います。Tailscale の tailnet に接続した端末（またはホスト自身）で設定を開いてください。",
  "Only the web app (port 443) is published — the transcription service stays private.":
    "公開されるのは Web アプリ（443番）だけで、文字起こしサービスは非公開のままです。",
  "Tailnet devices (this one, your phone) always keep full access, public or not.":
    "tailnet 内の端末（この端末やスマホ）は、公開の有無にかかわらず常に全機能を使えます。",

  "(much larger; without them a restored meeting cannot be played, re-transcribed or diarized)":
    "（かなり大きくなります。含めないと、復元した会議は再生・文字起こしのやり直し・話者分離ができません）",
  "Adds the meetings from a backup that are not already here. Existing meetings, series, tags and voice profiles are left untouched, so this is safe to run against a live install — and running the same file twice changes nothing the second time.":
    "バックアップの中で、ここにまだ無い会議を追加します。既存の会議・シリーズ・タグ・声紋には手を触れないので、動いている環境に対して実行しても安全です。同じファイルを 2 回流しても、2 回目は何も変わりません。",
  "Restore complete": "復元が完了しました",
  "Settings replaced.": "設定を置き換えました。",

  "Recognise speech": "音声を認識する",
  "On this machine (default)": "この機器で（既定）",
  "built in": "組み込み",
  "not needed": "不要",
  API: "API",
  "OpenAI-compatible — /v1/audio/transcriptions": "OpenAI 互換 — /v1/audio/transcriptions",
  "Google Gemini — the Interactions API": "Google Gemini — Interactions API",
  "Kept on the server, never sent to the browser. Blank leaves the saved one alone.":
    "サーバー側に保管され、ブラウザには渡りません。空欄なら保存済みのものをそのまま使います。",
  "Every voice in the room, including anything said that nobody meant to write down.":
    "その場のすべての声が送られます。書き残すつもりのなかった発言も含みます。",
  "You are billed for the length of the audio — roughly $0.25–0.40 an hour at current rates, so a weekly hour-long meeting is a few dollars a year.":
    "料金は音声の長さで請求されます — 現在の相場でおよそ 1 時間あたり $0.25〜0.40 なので、週 1 時間の会議なら年に数ドルです。",
  "No live transcript.": "会議中の文字起こしはできません。",
  "These endpoints cap the upload, so long meetings are split at a silent moment and sent in pieces. Timestamps are stitched back together.":
    "これらのエンドポイントには送信量の上限があるため、長い会議は無音のところで分割して送ります。タイムスタンプは後でつなぎ直します。",
  "The saved file, the voiceprints and speaker separation all stay here — a copy of the audio is sent for recognition, and nothing else moves.":
    "保存された音声ファイル・声紋・話者分離はすべてここに留まります — 認識のために音声の複製が送られるだけで、他は何も動きません。",

  "Enroll a voice once and diarization will label that speaker by name automatically in every future meeting. You can also enroll people from a diarized meeting (name the speaker there, then “Save voice profiles”).":
    "声を一度登録しておくと、以後の会議では話者分離がその人を自動で名前付けします。話者分離済みの会議から登録することもできます（そこで話者に名前を付けてから「声紋を登録」）。",
  Enrolled: "登録済み",
  "No profiles yet.": "まだ声紋がありません。",
  "re-record": "録り直す",
  "Name for this voice": "この声の名前",
  "Done — save voiceprint": "完了 — 声紋を保存",
  "Extracting the voiceprint (GPU)… this takes a little while.":
    "声紋を抽出しています（GPU）… 少し時間がかかります。",

  // ---- What the server says back ----
  // Only the messages a person is meant to read; see lib/i18n/server-messages.ts for the line.
  "Wrong password": "パスワードが違います",
  "Wrong email or password": "メールアドレスかパスワードが違います",
  "That is not your password.": "パスワードが違います。",
  "That is not your current password.": "現在のパスワードが違います。",
  "Enter your password.": "パスワードを入力してください。",
  "Use at least {n} characters.": "{n} 文字以上にしてください。",
  "Enter the email address you want to sign in with.":
    "ログインに使うメールアドレスを入力してください。",
  "An email address is how they will sign in. Enter theirs.":
    "本人がログインに使うのはメールアドレスです。その人のアドレスを入力してください。",
  "That email address is already in use.": "そのメールアドレスは既に使われています。",
  "That username is taken.": "そのユーザー名は既に使われています。",
  "That username, email, or tailnet login is already taken.":
    "そのユーザー名・メールアドレス・tailnet のログインのいずれかが既に使われています。",
  "Usernames are 2–32 characters: letters, numbers, dot, dash, underscore.":
    "ユーザー名は 2〜32 文字です。英数字・ドット・ハイフン・アンダースコアが使えます。",
  "Display names are up to 60 characters.": "表示名は 60 文字までです。",
  "Use a PNG, JPEG or WebP image.": "PNG・JPEG・WebP の画像を使ってください。",
  "That picture is too large even after resizing. Try a smaller one.":
    "縮小してもまだ大きすぎます。もっと小さい画像でお試しください。",
  "This server already has an account. Sign in, or ask an administrator.":
    "このサーバーには既にアカウントがあります。ログインするか、管理者に依頼してください。",
  "Auth is disabled (APP_PASSWORD not set)": "認証は無効です（APP_PASSWORD が未設定）",

  "That link has expired or has already been used. Ask for another.":
    "このリンクは期限切れか、既に使用済みです。もう一度発行してもらってください。",
  "That recovery code does not match this account.":
    "その復旧コードは、このアカウントのものではありません。",
  "This account has encrypted meetings. Enter your recovery code to keep them, or confirm that you are starting again without them.":
    "このアカウントには暗号化された会議があります。復旧コードを入力すれば残せます。入力しない場合は、それらを諦めてやり直すことを確認してください。",

  "That account is disabled. Enable it first.":
    "そのアカウントは無効になっています。先に有効化してください。",
  "That is the only administrator. Make somebody else one first.":
    "管理者はその 1 人だけです。先に他の誰かを管理者にしてください。",
  "You cannot disable your own account.": "自分自身のアカウントは無効化できません。",
  "Ask about meetings": "会議への質問",
  "Ask a question of a meeting's minutes or transcript, or of a whole series.": "会議の議事録や発言、シリーズ全体に質問できます。",
  "The minutes model (LLM)": "議事録を書くモデル（LLM）",
  "Write minutes in bulk": "まとめて作成",
  "Queue minutes for every listed meeting that has none, in one go.": "一覧に出ている、議事録のない会議の議事録をまとめて順番待ちに入れます。",
  "Suggest corrections": "誤変換の候補",
  "Check the transcript against the glossary, the series name and the participants, and suggest fixes.": "用語集・シリーズ名・参加者名と照らして、誤変換の直し方を提案します。",
  "Translation": "翻訳",
  "A Japanese translation under each line spoken in another language.": "日本語以外の発言の下に、日本語訳を表示します。",
  "A translation model (about 1.2 GB), downloaded on first use": "翻訳モデル（約 1.2 GB、初回に自動でダウンロード）",
  "Read-only sharing": "外部公開",
  "Publish a password-protected, read-only link outside the tailnet.": "パスワード付きの読み取り専用リンクを、tailnet の外に公開します。",
  "Extensions": "拡張機能",
  "Recording, transcription and minutes are always there. These are added on top, for everybody on this machine. Switching one off hides it and keeps its data; switching it back on brings everything back.": "録音・文字起こし・議事録はいつでも使えます。ここで選ぶ機能は、その上に追加するもので、この機器を使う全員に効きます。無効にすると画面から消えますがデータは残り、有効に戻せば元どおりになります。",
  "Group recurring meetings: shared background, regular members, and last time's minutes carried into the next.":
    "定例会議をまとめます。背景と常連メンバーを共有し、前回の議事録を次の議事録に引き継ぎます。",
  "A weekly meeting whose minutes should pick up from last week's.": "毎週の定例で、先週の議事録を踏まえて今週の議事録を書かせたい。",
  "The same people every time, so speaker separation knows how many voices to expect.":
    "毎回同じ顔ぶれなので、話者分離に人数を伝えておきたい。",
  "Terms that belong to one project, kept on its series rather than in everyone's glossary.":
    "あるプロジェクトだけの用語を、全員の用語集ではなくそのシリーズに持たせたい。",
  "Series in the navigation, a Series field on each meeting, and the list folding a series into one row. Each series has a page with its timeline, background, members and glossary.":
    "メニューに「シリーズ」、各会議に「シリーズ」の欄が出て、一覧ではシリーズが1行にまとまります。シリーズごとに、経過・背景・常連メンバー・用語集をまとめた画面があります。",
  "Work out who said each line, name the speakers, and recognise them next time by their voice.":
    "各発言を誰が話したかを推定し、話者に名前を付けて、次からは声で見分けます。",
  "Meetings recorded on one microphone in a room, where everyone's lines come out as one voice.":
    "会議室のマイク1本で録音して、全員の発言が1人分として書き起こされる。",
  "Minutes that say who decided what and who took on which task.": "誰が何を決め、誰がどの作業を引き受けたかを議事録に残したい。",
  "Regular members, named once and recognised in every meeting after that.":
    "いつものメンバーに一度名前を付けたら、以後の会議では自動で見分けてほしい。",
  "A Speaker separation panel above each meeting's transcript, the speaker on every line, Diarize when ending a recording, and Settings, Speakers for voiceprints.":
    "会議の発言の上に「話者分離」の欄、各行に話者、録音終了時に「話者を分離」が出ます。声紋は設定の「話者」で管理します。",
  "A separation model; faster with a GPU": "話者分離のモデル（GPU があると速い）",
  "Schedule and reminders": "予定とリマインダー",
  "Book meetings ahead on a calendar, and be told when one is due to start.":
    "カレンダーから会議を予定に入れ、始まる時刻に知らせを受け取れます。",
  "Next week's meetings set up ahead of time: the title, the agenda and who is coming.":
    "来週の会議の名前・議題・参加者を、前もって用意しておく。",
  "A notice on your phone or watch when a meeting is due, and recording started from it.":
    "会議の時刻にスマホや腕時計に知らせが来て、そこから録音を始める。",
  "A month of meetings looked back over on a calendar.": "1か月分の会議をカレンダーで見返す。",
  "A calendar above the meeting list, a When field on New meeting, and Upcoming in the list. Reminders come to the browser (allowed under Settings, Appearance) and to the Android app.":
    "会議一覧の上にカレンダー、「新しい会議」に日時の欄、一覧に「予定」が出ます。開始の知らせはブラウザ（設定の「表示」で許可）と Android アプリに届きます。",
  "Minutes formats": "議事録の書式",
  "Formats and writing instructions of your own, and choosing what the model is given.":
    "自分で作った書式と書き方の指示で議事録を書き、モデルに渡す情報も選べます。",
  "Regular meetings whose minutes should always have the same headings.": "定例会議の議事録を、毎回同じ見出しでそろえたい。",
  "A client meeting and an internal one, each wanting its minutes written differently.":
    "取引先との打ち合わせと社内の会議で、議事録の書き方を変えたい。",
  "Leaving the previous minutes or the glossary out of what the model reads, for one run.":
    "前回の議事録や用語集を、今回だけモデルに渡さずに書かせたい。",
  "Settings, Minutes, to make formats; and, whenever minutes are written, a choice of format and of what the model is given. Off, minutes are written in the built-in format.":
    "設定の「議事録」で書式を作れます。議事録を作るたびに、書式とモデルに渡す情報を選べます。無効のときは、組み込みの書式で書かれます。",
  "Voice cues": "声の様子",
  "Check the voice": "声の様子を調べる",
  "Measuring…": "測っています…",
  "Mark the lines said louder, higher or faster than the speaker usually was — or quieter, lower or slower": "その人のいつもの話し方より、大きめ・高め・速め（または小さめ・低め・ゆっくり）だった発言に印を付けます",
  "Louder": "大きめ",
  "Quieter": "小さめ",
  "Higher": "高め",
  "Lower": "低め",
  "Faster": "速め",
  "Slower": "ゆっくり",
  "Compared with this speaker's other lines in this meeting": "この会議での、この人のほかの発言と比べて",
  "Mark the lines said louder or quieter, higher or lower, faster or slower than the speaker usually was.":
    "その人のいつもの話し方と比べて、大きめ・小さめ、高め・低め、速め・ゆっくりだった発言に印を付けます。",
  "Finding where a discussion warmed up, without listening to the whole meeting again.":
    "議論が熱を帯びたところを、会議を聞き直さずに見つけたい。",
  "Seeing which points someone pressed hardest, by where their voice rose.":
    "声が上がったところから、誰がどの点を強く主張していたかをつかみたい。",
  "Reading back a meeting you missed with a sense of how it went, not just what was said.":
    "出られなかった会議を、何が話されたかだけでなく、どんな様子だったかも含めて読み返したい。",
  "A Check the voice button above the transcript, and small marks on the lines that stood out. Each person is compared with their own lines in the same meeting, so a distant microphone or a quiet voice does not count as quiet.":
    "発言の上に「声の様子を調べる」ボタンが出て、目立った発言に小さな印が付きます。比べる相手はその人自身の同じ会議での発言なので、マイクから遠い人や声の小さい人が「小さめ」と出ることはありません。",
  "The meeting's recording": "会議の録音",
  "Emotion": "感情推定",
  "Judge from the voice whether each line sounded joyful, angry or sad.": "声の調子から、各発言が喜び・怒り・悲しみのどれに聞こえるかを推定します。",
  "Looking back at where a meeting turned tense, or where it lightened.": "会議のどこで空気が張り詰め、どこで和らいだかを振り返りたい。",
  "A first look at how a session went, before reading it line by line.": "発言を1行ずつ読む前に、会議の雰囲気をざっとつかみたい。",
  "A Judge emotion button above the transcript, and a label on the lines where it was clear. It is how a line sounded, judged by a model trained on read speech — a hint, not anybody's feelings. Rules on judging emotion at work differ by country (the EU AI Act restricts it); check yours before using it on colleagues.": "発言の上に「感情を推定」ボタンが出て、はっきり判定できた発言にだけ印が付きます。読み上げ音声で学習したモデルによる「どう聞こえたか」の推定で、本人の気持ちを示すものではありません。職場での感情推定の扱いは国や地域で異なります（EU の AI 法は制限しています）。同僚に使う前に確認してください。",
  "The NVIDIA GPU build, HF_TOKEN with two models' terms accepted, and about 1.3 GB downloaded on first use": "NVIDIA GPU 版、2つのモデルの利用規約に同意した HF_TOKEN、初回に約 1.3 GB のダウンロード",
  "Judge emotion": "感情を推定",
  "Judging emotion…": "感情を推定しています…",
  "Judging emotion failed.": "感情の推定に失敗しました。",
  "Judged from the voice alone: how a line sounded, not what anybody felt.": "声だけからの推定です。どう聞こえたかであって、本人の気持ちではありません。",
  "Judged from the voice alone ({p}% sure): how the line sounded, not what anybody felt.": "声だけからの推定です（確からしさ {p}%）。どう聞こえたかであって、本人の気持ちではありません。",
  "How the meeting went": "会議の流れ",
  "Click a bar to go to its line": "棒をクリックするとその発言へ移動します",
  "Sounded joyful": "うれしそう",
  "Sounded angry": "怒っていそう",
  "Sounded sad": "悲しそう",
  "Emotion is already being judged for this meeting.": "この会議の感情はすでに推定中です。",
  "External AI": "外部の AI",
  "Write minutes with Anthropic or an OpenAI-compatible service, and transcribe with a service of your choosing.":
    "Anthropic や OpenAI 互換のサービスで議事録を書き、文字起こしにも好きなサービスを使えます。",
  "There is no GPU for a local model, and meetings may be sent to a cloud service.":
    "ローカルのモデルを動かす GPU がなく、会議の内容をクラウドのサービスに送ってよい。",
  "A model larger than this machine can run, for long or difficult meetings.":
    "長い会議や難しい会議を、この機器では動かせない大きなモデルに書かせたい。",
  "A server of your own: LM Studio or vLLM for minutes, a Whisper server on another machine for transcription.":
    "自分で立てたサーバーを使いたい（議事録に LM Studio や vLLM、文字起こしに別の機器の Whisper サーバー）。",
  "Settings, LLM and Transcription: where minutes are written and where speech is recognised. Off, everything is done by Ollama and the built-in transcription.":
    "設定の「LLM」と「文字起こし」で、議事録を書く先と文字起こしの先を選べます。無効のときは、すべて Ollama と組み込みの文字起こしで処理します。",
  "An API key, and agreeing to send meetings outside this machine": "API キーと、会議の内容をこの機器の外に送ることへの同意",
  "Details": "詳しく",
  "When it helps": "こんな場面で",
  "Where it shows up": "どこに出るか",
  "What it needs": "必要なもの",
  "{name}, as it appears on screen": "{name}の画面例",
  "Before the next meeting, check what was left undecided last time.": "次の会議の前に、前回決まらなかったことを確かめる。",
  "Find who took on what, without reading the transcript again.": "誰が何を引き受けたかを、発言を読み返さずに探す。",
  "Ask a series what has been decided over several meetings.": "シリーズに、何回かの会議でこれまでに決まったことを聞く。",
  "A question box on each meeting's page and each series page. Answers come only from that meeting or series, and are not saved.":
    "会議の画面とシリーズの画面に質問欄が出ます。答えはその会議・シリーズの内容だけから作られ、保存はされません。",
  "A day of back-to-back sessions, such as a conference: record each one, and write all the minutes in the evening.":
    "学会や展示会のように会議が続く日。その場では録音だけして、夜にまとめて議事録にする。",
  "Meetings ended without minutes have piled up, and you want them all done at once.":
    "議事録を作らずに終えた会議がたまったときに、一度で片付ける。",
  "A bar above the meeting list whenever a listed meeting has no minutes. They are written one after another; the queue shows how far it has got.":
    "議事録のない会議が一覧にあると、一覧の上にバーが出ます。議事録は1件ずつ順に作られ、進み具合は順番待ちの画面で見られます。",
  "Product names or in-house terms come out wrong in the same way every time.":
    "製品名や社内用語が、毎回同じように聞き違えられる。",
  "A participant's name is written with the wrong characters.": "参加者の名前が、違う漢字で書き起こされる。",
  "Before sharing a transcript, check it against the glossary in one pass.":
    "発言を人に渡す前に、用語集とまとめて照らし合わせる。",
  "A Suggest fixes button above the transcript. Each suggestion appears on its own line, and nothing changes until you apply it.":
    "発言の上に「誤変換の候補を出す」ボタンが出ます。候補はそれぞれの発言の行に表示され、適用するまでは何も書き換わりません。",
  "Meetings with members or partners abroad who speak English.": "海外のメンバーや取引先が英語で話す会議。",
  "Checking a line you did not quite catch, in Japanese, while the meeting goes on.":
    "聞き取れなかった発言を、会議の途中でも日本語で確かめる。",
  "Reading a meeting back in Japanese later, with the original kept above each line.":
    "あとから日本語で読み返す（原文は各行にそのまま残ります）。",
  "Under each line of the transcript. Switch it on under Settings, Transcription; it applies to what is transcribed from then on.":
    "発言の下に日本語訳が出ます。設定の「文字起こし」で翻訳をオンにすると、それ以後の文字起こしに付きます。",
  "Let someone without Tailscale read the minutes, such as a client or a colleague.":
    "Tailscale を入れていない取引先や同僚に、議事録を読んでもらう。",
  "Read your minutes from a machine where you cannot install anything.":
    "何もインストールできない端末から、自分の議事録を読む。",
  "Settings, Remote access. Visitors from outside sign in with the password and can only read and download; recording and editing stay on the tailnet.":
    "設定の「外部公開」で切り替えます。外からの閲覧はパスワードでログインし、読むこととダウンロードだけができます。録音と編集は tailnet の中だけです。",
  "On": "有効",
  "Off": "無効",
  "Only an administrator switches extensions on or off.": "拡張機能を切り替えられるのは管理者だけです。",
  "This feature is switched off. An administrator can switch it on under Settings, Extensions.":
    "この機能は無効になっています。管理者が「設定 → 拡張機能」で有効にできます。",
  "No line has a place in the recording to measure.": "録音の中の位置が分かる発言が無いため、測れません。",
  "Cannot reach the transcription service.": "文字起こしサービスに接続できません。",
  "The recording is no longer kept, so how each line was said cannot be measured.":
    "録音が残っていないため、声の様子は測れません。",
  "Measuring the recording failed: {reason}": "録音の測定に失敗しました: {reason}",
  "Only an administrator sets the defaults everybody starts from.":
    "全員の既定値を設定できるのは管理者だけです。",

  "Speakers are already being separated for this meeting.":
    "この会議は既に話者分離を実行中です。",
  "This meeting is already being re-transcribed.": "この会議は既に文字起こしをやり直しています。",
  "This meeting has no transcript yet.": "この会議にはまだ発言がありません。",
  "No utterances recorded": "発言が記録されていません",
  "Stored embeddings are corrupted. Re-run Diarize.":
    "保存された声の特徴量が壊れています。話者分離をやり直してください。",

  "This server is read-only from outside your private network.":
    "プライベートネットワークの外からは、このサーバーは閲覧専用です。",
  "backups are only available from inside your private network":
    "バックアップはプライベートネットワークの中からのみ利用できます",
  "Remote access can only be changed from your local network.":
    "外部公開の切り替えは、ローカルネットワークの中からのみ行えます。",

  "no minutes to export yet": "書き出せる議事録がまだありません",
  "nothing to export (no minutes/transcript yet)":
    "書き出せるものがありません（議事録も発言もまだありません）",

  // ---- The header on every page: service health ----
  "Minutes (LLM)": "議事録（LLM）",
  DB: "DB",
  "Cannot reach STT — recording unavailable ({reason})":
    "STT に接続できません — 録音は使えません（{reason}）",
  "check failed": "確認できませんでした",
  "Accessing from outside your private network — read-only.":
    "プライベートネットワークの外からアクセスしています — 閲覧のみです。",
  "You can view and download minutes and transcripts here; recording, editing and deleting are available on your local network only.":
    "ここでは議事録と発言の閲覧・ダウンロードができます。録音・編集・削除はローカルネットワークの中だけです。",

  // ---- Logging in ----
  "Log in": "ログイン",
  // A sentence with a link through the middle. The pieces are translated for the position they
  // sit in — Japanese puts the verb after the link, English before it.
  "This server uses a single shared password.":
    "このサーバーは共有パスワードを使っています。各自のアカウントを持たせるには",
  "Create an account": "アカウントを作成",
  "to give people their own.": "してください。",
  "Sign in": "ログイン",
  "Could not unlock": "解除できませんでした",
  "Your meetings are locked.": "会議がロックされています。",
  "Transcripts and minutes are encrypted with a key only your password opens.":
    "発言と議事録は、あなたのパスワードでしか開かない鍵で暗号化されています。",
  Unlock: "解除する",
  "Unlocking…": "解除中…",

  // ---- The first account ----
  "This server already has an account": "このサーバーには既にアカウントがあります",
  "Further accounts are made by an administrator.":
    "これ以降のアカウントは管理者が作成します。",
  "Create the first account": "最初のアカウントを作成",
  "It is an administrator. From then on this server asks who you are instead of sharing one password, and APP_PASSWORD stops being a way in.":
    "このアカウントは管理者になります。以降、このサーバーは共有パスワードではなく「あなたが誰か」を尋ねるようになり、APP_PASSWORD では入れなくなります。",
  Username: "ユーザー名",
  "Letters, numbers, dot, dash, underscore. A short handle — you sign in with your email.":
    "英数字・ドット・ハイフン・アンダースコアが使えます。短い識別子で、ログインにはメールアドレスを使います。",
  Email: "メールアドレス",
  "What you type to sign in. Nothing is ever sent to it — this server has no way to send mail, and does not want one.":
    "ログインに入力するアドレスです。ここに何かが送られることはありません — このサーバーにメールを送る手段はなく、持つつもりもありません。",
  "The two passwords do not match.": "2つのパスワードが一致しません。",
  "Create the account": "アカウントを作成する",
  "Creating…": "作成中…",

  // ---- The recovery code ----
  "Your recovery code": "復旧コード",
  "Save this now — it is never shown again": "いま保存してください — 二度と表示されません",
  "{context} is encrypted. This code is the only way back in if you forget your password. It is not stored anywhere: an administrator can send you a link to set a new password, and without this code that new password opens an account whose meetings can no longer be read.":
    "{context}は暗号化されています。パスワードを忘れたときに戻れる唯一の手段がこのコードです。どこにも保存されていません。管理者はパスワード再設定のリンクを発行できますが、このコードが無ければ、新しいパスワードで開くのは会議を二度と読めなくなったアカウントです。",
  "This account": "このアカウント",
  "Your account": "あなたのアカウント",
  "Your account has a new key, and": "あなたのアカウントには新しい鍵が作られ、それ",
  "Recovery code {code}": "復旧コード {code}",
  Copy: "コピー",
  Copied: "コピーしました",
  "This browser would not let the page copy for you — the code is selected, so press":
    "このブラウザではページからのコピーが許可されませんでした。コードは選択済みなので、次を押してください:",
  "A password manager is the right place for it.": "パスワードマネージャーに入れるのが適切です。",
  "On paper is fine too — the characters avoid anything that can be misread.":
    "紙に書いても構いません。読み間違えやすい文字は使われていません。",
  "Anybody holding it can decrypt this account, so treat it as the password itself.":
    "これを持っている人はこのアカウントを復号できます。パスワードそのものとして扱ってください。",
  "I have saved it — continue": "保存しました — 次へ",
  "Have you saved your recovery code?": "復旧コードを保存しましたか？",
  "It cannot be shown again. Nobody can produce it later — not an administrator, not the server, not by resetting your password.":
    "二度と表示されません。後から誰も再発行できません — 管理者にも、サーバーにも、パスワードの再設定でも。",
  "Without it, forgetting your password means the meetings on this account stay encrypted and cannot be read.":
    "これが無いままパスワードを忘れると、このアカウントの会議は暗号化されたまま読めなくなります。",
  "Yes, I have saved it": "はい、保存しました",
  "Not yet": "まだです",

  // ---- Setting a password from a link ----
  "New password": "新しいパスワード",
  "New password again": "新しいパスワード（確認）",
  "Set the password and sign in": "パスワードを設定してログイン",
  "Setting…": "設定中…",
  "This account has encrypted meetings. Enter the recovery code you were given when the account was set up, and everything stays as it is.":
    "このアカウントには暗号化された会議があります。作成時に渡された復旧コードを入力すれば、すべてそのまま残ります。",
  "I do not have it": "コードが手元にありません",
  "Start again without your old meetings?": "これまでの会議を諦めてやり直しますか？",
  "Everything already recorded on this account is encrypted with a key only your recovery code opens. Without it, those meetings can never be read again — not by you, not by an administrator.":
    "このアカウントで録音済みのものはすべて、復旧コードでしか開かない鍵で暗号化されています。コードが無ければ、それらの会議は二度と読めません — 本人にも、管理者にも。",
  "They stay on the disk and stay unreadable. Anything recorded from now on will be fine.":
    "ディスク上には残りますが、読めないままです。これから録音するものには影響ありません。",
  "Start again — I accept losing them": "やり直す — 失うことを承知しました",
  "Go back": "戻る",

  // ---- Your account ----
  "Signed in as": "ログイン中:",
  "identified by your tailnet login": "tailnet のログインで識別",
  "1 signed-in device": "ログイン中の端末 1台",
  "{n} signed-in devices": "ログイン中の端末 {n}台",
  "Tailnet login: {login}": "tailnet のログイン: {login}",
  "Name and picture": "名前と画像",
  "Choose a picture": "画像を選ぶ",
  "Choose another": "別の画像を選ぶ",
  "That file could not be read as an image.": "そのファイルは画像として読み込めませんでした。",
  "Shown as a circle, so anything outside the middle square is trimmed. It is resized to {size}px here before it is sent — the original never leaves this device.":
    "円形で表示されるため、中央の正方形からはみ出した部分は切り取られます。送信前にこの端末で {size}px に縮小され、元の画像がこの端末から出ることはありません。",
  "Display name": "表示名",
  "What other people see beside your work in the queue. Empty falls back to your username.":
    "順番待ちなどで他の人に見える名前です。空ならユーザー名が使われます。",
  "What you type to sign in from outside the tailnet. Nothing is ever sent to it.":
    "tailnet の外からログインするときに入力するアドレスです。ここに何かが送られることはありません。",
  "Change your password": "パスワードを変更",
  "Set a password": "パスワードを設定",
  "Your account was made from your tailnet login, so it has no password — inside the tailnet you are never asked for one. Set one to be able to sign in from anywhere else.":
    "このアカウントは tailnet のログインから作られたためパスワードがありません。tailnet の中では尋ねられないからです。それ以外の場所からログインするには設定してください。",
  "Current password": "現在のパスワード",
  Save: "保存",
  "Saved. You can now sign in from anywhere with it.":
    "保存しました。これでどこからでもログインできます。",
  "Signed-in devices": "ログイン中の端末",
  "Ends every session, including this one. Use it for a phone you no longer have — the sessions live on the server, so this takes effect at once rather than whenever the browser next asks.":
    "この端末を含め、すべてのセッションを終了します。手元に無くなったスマートフォンなどに使ってください。セッションはサーバー側にあるので、ブラウザの次のアクセスを待たずに即座に効きます。",
  "Sign out everywhere": "すべての端末からログアウト",

  // ---- Managing people ----

  OK: "OK",

  // ---- Settings: what was left in English ----
  // Mostly sentences that had been split around <strong>, so the emphasised half stayed English
  // while the rest turned. Each is one key now.
  "This sends your meetings to {host}": "この設定では会議の内容が {host} に送られます",
  "The full transcript of a meeting is uploaded each time minutes are written or regenerated, and each time you ask a question about a series.":
    "議事録を作成・再作成するたび、またシリーズについて質問するたびに、その会議の発言全文がアップロードされます。",
  "This setting sends text, never the recording.":
    "この設定が送るのはテキストであって、録音ではありません。",
  "Where the audio itself goes is decided separately, under {section}.":
    "音声そのものの送り先は「{section}」で別に決めます。",
  "Speech will be recognised by {host}, not on this machine":
    "音声認識はこの機器ではなく {host} で行われます",
  "The recording itself is uploaded — not the transcript, the audio.":
    "アップロードされるのは録音そのものです — 文字起こしではなく、音声です。",
  "From outside, access is read-only: viewing and downloading only, protected by your APP_PASSWORD. Recording and editing remain tailnet-only.":
    "外部からは閲覧専用です。表示とダウンロードのみで、APP_PASSWORD で保護されます。録音と編集は tailnet 内からのみです。",
  "The profiles marked “re-record” were built by a different speaker-recognition model than this machine is running now, and voiceprints do not carry across models. They are kept, but they no longer match anyone — record those people again to restore automatic naming.":
    "「録り直し」と付いた声紋は、いまこの機器で動いているものとは別の話者認識モデルで作られています。声紋はモデルをまたいで使えません。データは残っていますが誰とも一致しないので、自動命名を戻すにはその人たちを録り直してください。",

  // Recognition endpoints.
  "your network": "自分のネットワーク",

  // The model picker.
  "large-v3-turbo (default; fast and accurate)": "large-v3-turbo（既定。速くて精度も高い）",
  "large-v3 (accurate)": "large-v3（高精度）",
  "small (light)": "small（軽量）",
  "kotoba-whisper-v2.0 (Japanese only)": "kotoba-whisper-v2.0（日本語のみ）",
  "Distilled on Japanese speech — faster and more accurate for Japanese, but the transcription language is forced to Japanese, it adds little punctuation, and the glossary is skipped for it.":
    "日本語音声で蒸留されたモデルです。日本語では速く精度も高い一方、文字起こしの言語は日本語に固定され、句読点はあまり付かず、用語集も適用されません。",
  "{model} (custom)": "{model}（自分で指定）",

  // Placeholders somebody reads before they type.
  "e.g. Acme Corp, Project Aurora, Jane Doe, Voxinq Meeting":
    "例: 株式会社アクメ, プロジェクト・オーロラ, 山田太郎, Voxinq Meeting",

  // Backup.
  "Choose a password of at least 8 characters.": "8文字以上のパスワードにしてください。",
  "Choose a backup file first.": "先にバックアップファイルを選んでください。",
  "Enter the password this backup was created with.":
    "このバックアップを作成したときのパスワードを入力してください。",
  "Your meetings, transcripts, minutes, series, tags and voice profiles, plus your settings, in one file. On a server several people share this is yours alone — nobody can export what they cannot read, so everyone takes their own.":
    "あなたの会議・発言・議事録・シリーズ・タグ・声紋に、設定を加えたものを1つのファイルにまとめます。複数人で使うサーバーでも、これはあなたの分だけです — 読めないものは書き出せないので、各自が自分の分を取ります。",
  "The file is encrypted with the password below — without it the backup cannot be opened, and there is no way to recover it, so store it somewhere safe.":
    "ファイルは下のパスワードで暗号化されます。これが無いとバックアップは開けず、復旧する手段もありません。安全な場所に保管してください。",
  "Include the audio recordings": "録音した音声も含める",
  "Also replace my settings": "設定も置き換える",

  // Defaults for everyone.
  "Saved. Anybody who has not chosen for themselves uses these now.":
    "保存しました。自分で選んでいない人は、これ以降この値を使います。",

  // Appearance.
  "Set (enter only to change)": "設定済み（変更するときだけ入力）",
  // Minutes formats.
  "+ Add format": "＋ 形式を追加",

  // LLM providers, spelled out where they warn about what leaves the machine.
  "Anthropic (Claude API — sends your transcripts off this machine)":
    "Anthropic（Claude API — 発言内容がこの機器の外に送られます）",
  "OpenAI-compatible API (OpenAI, or a local server like LM Studio)":
    "OpenAI 互換 API（OpenAI 本家、または LM Studio のようなローカルのサーバー）",

  // Remote access.
  "Public — reachable from outside your tailnet": "公開中 — tailnet の外からも到達できます",
  "Private — tailnet only": "非公開 — tailnet の中だけ",
  "Publish publicly": "公開する",
  "Make private": "非公開に戻す",
  "Working…": "処理中…",
  "Public URL:": "公開 URL:",

  // Backup.
  "Export backup": "バックアップを書き出す",
  "Exporting…": "書き出し中…",
  "Restore from backup": "バックアップから復元",
  "Restoring…": "復元中…",

  // Defaults for everyone.
  "Japanese translation under each line": "各行の下に日本語訳を表示",
  "Minutes are written by": "議事録を書くのは",
  "Ollama address": "Ollama のアドレス",
  "Ollama model": "Ollama のモデル",
  "Terms and names the recogniser should expect. People can add their own on top.":
    "認識時に想定させる用語や名前です。各自がこれに自分の分を足せます。",
  "Save the defaults": "既定値を保存",

  // ---- The queue ----
  "Work that needs the GPU, in the order it will get it.":
    "GPU が必要な処理を、実行される順に並べています。",
  "Nothing queued. Minutes, speaker separation and re-transcription wait here for the GPU when one is already using it.":
    "順番待ちはありません。議事録・話者分離・文字起こしのやり直しは、GPU が他で使われているときここで待ちます。",
  "Could not reorder the queue": "順番を入れ替えられませんでした",
  "Could not stop it": "止められませんでした",
  "Removed from the queue. The recognition pass already running finishes on the transcription service — there is no way to stop one — and its result is discarded.":
    "順番待ちから外しました。既に走っている認識処理は文字起こしサービス側で最後まで実行され（止める手段がありません）、その結果は破棄されます。",
  "{name} (you)": "{name}（自分）",
  Recording: "録音",
  "(untitled meeting)": "（無題の会議）",
  "Somebody else’s work. What it is about is not shown.":
    "他の人の処理です。内容は表示されません。",
  "Uses no video memory — it runs somewhere else, so it does not wait for the card":
    "VRAM を使いません。他所で実行されるため、カードの空きを待ちません",
  "Roughly what it is expected to occupy on the GPU": "GPU 上で占めると見込まれるおおよその量",
  "off-GPU": "GPU 外",
  "~{gb} GB": "約 {gb} GB",
  waiting: "待機中",
  running: "実行中",
  "not yours": "自分のものではありません",
  "ends with the meeting": "会議の終了と同時に終わります",
  "Move up": "上へ",
  "Move down": "下へ",
  "Encrypting your older meetings": "過去の会議を暗号化中",
  "Everybody’s work is listed, because the GPU is shared and a queue that hid the thing in front of yours could not explain why yours is waiting. For anybody else’s row you see who it belongs to and what kind of work it is — not which meeting — and only your own rows can be moved or stopped.":
    "全員の処理が並びます。GPU は共有で、自分の前にあるものを隠した待ち行列では「なぜ自分のが待たされているか」を説明できないからです。他の人の行では、誰のものかと処理の種類だけが見え、どの会議かは見えません。動かしたり止めたりできるのは自分の行だけです。",
  "How many run at once depends on what they need and what the card has — off-GPU work (recognition sent to an endpoint, minutes written by a cloud model) does not wait for it at all. Set the budget in Settings → Transcription. A run that is stopped does not go back in the queue — ask for it again when you want it.":
    "同時にいくつ走るかは、それぞれの必要量とカードの容量で決まります。GPU 外の処理（エンドポイントに送る認識や、クラウドのモデルが書く議事録）はカードを待ちません。上限は「設定 → 文字起こし」で決めます。止めた処理は待ち行列に戻らないので、必要ならもう一度指示してください。",

  // ---- Archive ----

  // ---- Trash ----
  "Deleted meetings": "削除した会議",
  "Deleted meetings are permanently removed after {n} days. Until then, you can restore them.":
    "削除した会議は {n} 日後に完全に消えます。それまでは元に戻せます。",
  "The trash is empty.": "ゴミ箱は空です。",
  "deleted {when}": "削除 {when}",
  "Permanently delete this meeting. The transcript, minutes, and recording will all be lost and cannot be recovered.":
    "この会議を完全に削除します。発言・議事録・録音のすべてが失われ、元に戻せません。",
  "Delete permanently": "完全に削除",
  "Failed to load": "読み込みに失敗しました",
  "Failed to restore": "復元に失敗しました",

  // ---- A series ----
  "No meetings in this series yet.": "このシリーズにはまだ会議がありません。",
  "Series name": "シリーズ名",
  "…heading structure the minutes must follow for this series":
    "…このシリーズの議事録が従うべき見出し構成",
  "Terms and proper nouns that come up in this series": "このシリーズで出てくる用語や固有名詞",
  "Global setting": "全体の設定",

  // ---- Asking about the minutes ----
  "Ask about these minutes": "この議事録について質問する",
  "Answered from the minutes of {scope} — nothing else. Answers are not saved.":
    "「{scope}」の議事録だけを根拠に答えます。それ以外は参照しません。回答は保存されません。",
  Ask: "質問する",
  "Thinking…": "考え中…",
  "What were the TODOs from last time?": "前回までのTODOを教えて",
  "What is still unresolved?": "未解決の論点は？",
  "Summarise the decisions so far": "これまでの決定事項をまとめて",
  "{task} — you can ask once it finishes.": "{task} — 終わったら質問できます。",
  "A GPU task is running": "GPU の処理が実行中です",
  "{task} — this will wait its turn in the queue.": "{task} — キューで順番を待ちます。",
  "{task} — anything started now waits its turn.": "{task} — 今から始める処理は順番を待ちます。",
  "See the queue": "順番待ちを見る",
  "Recording in progress…": "録音中…",
  "Transcribing…": "文字起こし中…",
  "Diarizing…": "話者を分離中…",
  "Based on 1 meeting with minutes": "議事録のある会議 1 件をもとにしています",
  "Based on {n} meetings with minutes": "議事録のある会議 {n} 件をもとにしています",
  ", {n} older left out for length": "（古い {n} 件は長さの都合で除外）",
  ", {n} without minutes not covered": "（議事録のない {n} 件は対象外）",

  // ---- The transcript panel ----
  Live: "ライブ",
  "Click a timestamp to play from that point.": "時刻をクリックすると、そこから再生します。",
  "Recording:": "録音:",
  "protected (not auto-deleted)": "保護済み（自動削除されません）",
  saved: "保存済み",
  "auto-deletes in 1 day": "1日後に自動削除",
  "auto-deletes in {n} days": "{n}日後に自動削除",
  "Show translations": "翻訳を表示",
  "Analyze the recording and assign a speaker to each line (entering the participant count improves accuracy)":
    "録音を解析して各行に話者を割り当てます（人数を入れると精度が上がります）",
  "Check the transcript for glossary terms that were misheard, and propose fixes to apply line by line":
    "用語集の語が聞き違えられていないか発言を調べ、行ごとに適用できる修正案を出します",
  "Speaker separation needs a Hugging Face token": "話者分離には Hugging Face のトークンが必要です",
  "How to set it up →": "設定方法 →",
  "e.g. Voxinq": "例: Voxinq",
  "{n} skipped — a replacement cannot empty an utterance (delete it instead) or exceed the length limit.":
    "{n} 件は対象外です。置換で発言を空にすることはできません（その場合は削除してください）。長さの上限を超える場合も同様です。",
  "There is no transcript, but the recording remains. You can restore it from here.":
    "発言は残っていませんが、録音は残っています。ここから復元できます。",
  "Recognise with": "認識に使うのは",
  Dismiss: "破棄",
  "Enter to save · Shift+Enter for a new line · Esc to cancel":
    "Enter で保存 · Shift+Enter で改行 · Esc で取り消し",

  // ---- The recording screen ----
  "No GPU acceleration on this machine, so recognition would fall behind live speech. The meeting is recorded and transcribed in one pass at the end — nothing is lost, but the text arrives afterwards.":
    "この機器に GPU アクセラレーションが無いため、リアルタイムでは認識が話す速度に追いつきません。会議は録音され、終了後に一括で文字起こしされます。失われるものはありませんが、文字は後から出てきます。",
  "Transcribes when the meeting ends": "会議の終了後に文字起こしします",
  "{model} is loaded — transcription starts right away":
    "{model} を読み込み済みです — すぐに文字起こしが始まります",
  "The model": "モデル",
  "The model is still loading. You can start; audio is buffered and transcribed once it is ready.":
    "モデルを読み込み中です。開始して構いません。音声は一時保存され、準備ができ次第まとめて文字起こしされます。",
  "You chose to leave the GPU to what was already using it. The audio is being kept and will be transcribed when the meeting ends.":
    "GPU を先に使っていた処理に譲る選択をしました。音声は保存され、会議の終了後に文字起こしされます。",
  "recording only": "録音のみ",
  "Input too loud": "入力が大きすぎます",
  "Black out the screen. Recording continues; one touch brings it back, and it rests again by itself.":
    "画面を消灯します。録音は続きます。触れば戻り、しばらくするとまた自動で消えます。",
  "Black out the screen. Recording continues; one touch brings it back. Settings → Appearance can do this on its own after a while.":
    "画面を消灯します。録音は続き、触れば戻ります。「設定 → 表示」で一定時間後に自動で消すこともできます。",
  "Rest screen": "画面を消す",
  Meeting: "会議",

  // ---- Record NOW ----
  "Failed to start recording: {error}": "録音を開始できませんでした: {error}",
  "Go to New meeting": "「新しい会議」へ",
  "Preparing to record…": "録音の準備中…",

  // ---- Printing ----
  "Print / Save as PDF": "印刷 / PDF で保存",
  "Back to the meeting": "会議に戻る",
  "Choose “Save as PDF” as the destination to keep a copy.":
    "保存したい場合は、出力先に「PDF に保存」を選んでください。",
  "No minutes have been generated for this meeting yet.":
    "この会議の議事録はまだ生成されていません。",
  "Exported from Voxinq Meeting on {when}": "Voxinq Meeting から {when} に書き出し",

  // ---- Adding the app to a device ----
  "Install app": "アプリを追加",
  "Add to home screen": "ホーム画面に追加",
  "Adds Voxinq to this device as its own window, without the browser bars. It is the same app talking to the same machine — nothing new is installed to run it. Most worthwhile on the phone you record with.":
    "Voxinq をこの端末に、ブラウザのバーの無い独立したウィンドウとして追加します。中身は同じアプリで、同じ機器と通信します。動かすために何かが新しく入るわけではありません。録音に使うスマートフォンで特に便利です。",
  "Adds Voxinq to your home screen as its own window, without the browser bars. It is the same app talking to the same machine — nothing new is installed to run it.":
    "Voxinq をホーム画面に、ブラウザのバーの無い独立したウィンドウとして追加します。中身は同じアプリで、同じ機器と通信します。動かすために何かが新しく入るわけではありません。",
  "Add to your home screen": "ホーム画面に追加する",
  "Tap the share button at the bottom of Safari": "Safari の下部にある共有ボタンをタップ",
  "Choose “Add to Home Screen”": "「ホーム画面に追加」を選択",
  "It then opens from your home screen without the browser bars. It is the same app talking to the same machine — nothing new is installed to run it, and it still needs that machine to be on.":
    "以降はホーム画面から、ブラウザのバー無しで開けます。中身は同じアプリで、同じ機器と通信します。動かすために何かが新しく入るわけではなく、その機器が動いている必要も変わりません。",
  "Don’t show again": "今後表示しない",
  "Got it": "わかりました",

  // ---- Names and tooltips the runtime sweep turned up ----
  "Remove {name}": "{name} を削除",
  "Edit {name}": "{name} を編集",
  "Edit the purpose and agenda": "目的と議題を編集",
  format: "形式",
  "{name} spoke": "{name} は発言しました",
  "+ New speaker": "＋ 話者を追加",
  "Play from here ({time})": "ここから再生（{time}）",
  "API key not set": "API キーが未設定です",

  // ---- The live status chip on the meeting list, written straight into the DOM ----
  "Recording…": "録音中…",
  "Waiting…": "待機中…",
  "Waiting — 1 job ahead of it.": "待機中 — 前に 1 件あります。",
  "Waiting — {n} jobs ahead of it.": "待機中 — 前に {n} 件あります。",
  "Working… (you can leave this page; it finishes on the server)":
    "処理中…（このページを離れても、サーバー側で最後まで実行されます）",

  "Needs some terms to look for. Add them under Settings → Transcription, or on the series this meeting belongs to.":
    "探す語が必要です。「設定 → 文字起こし」の用語、またはこの会議が属するシリーズに登録してください。",
  // ---- The series list, and what a series holds in common ----
  "1 meeting": "会議 1件",
  "{n} meetings": "会議 {n}件",
  "1 member": "メンバー 1人",
  "{n} members": "メンバー {n}人",
  "last met {when}": "最終 {when}",
  "Shared background": "共通の背景",
  "What every meeting in this series has in common: what it is for, who the parties are, what was settled long ago.":
    "このシリーズのどの会議にも共通すること: 何のための会議か、関係者は誰か、以前から決まっていること。",
  "Regular members": "常任メンバー",

  // ---- A booked meeting whose time has come ----
  "It is time for this meeting.": "この会議の時刻になりました。",
  "Notify me on this device": "この端末で通知を受け取る",
  "Meeting reminders on this device": "この端末への予定の通知",
  "In the Android app, reminders come from the app itself and follow the phone's notification settings.":
    "Android アプリでは、予定の通知はアプリ自身が出します。スマホの通知設定に従います。",
  "Notifications need a secure connection. Open Voxinq through its https address to turn them on.":
    "通知は安全な接続（https）でしか使えません。https のアドレスで Voxinq を開いてから有効にしてください。",
  "This browser cannot show notifications.": "このブラウザでは通知を使えません。",
  "Blocked for this site. Allow notifications in the browser's site settings (the icon at the left of the address bar), then come back to this page.":
    "このサイトの通知はブロックされています。ブラウザのサイト設定（アドレスバー左のアイコン）で通知を許可してから、このページに戻ってください。",
  "On for this device": "この端末で有効",
  "Send a test notification": "テスト通知を送る",
  "Sent. If nothing appeared, check the notification settings of your operating system.":
    "送りました。何も表示されない場合は、Windows など OS 側の通知設定を確認してください。",
  "The notification could not be shown.": "通知を表示できませんでした。",
  "Turn on notifications": "通知を有効にする",
  "Notifications are on. A booked meeting will look like this when its time comes.":
    "通知は有効です。予定の会議の時刻になると、このように表示されます。",
  "Show these on this device even when the app is not the window you are looking at. Needs the browser or the installed app to be running — there is no outside push service.":
    "このアプリを見ていないときでも、この端末に通知を出します。ブラウザ（またはインストールしたアプリ）が動いている必要があります — 外部のプッシュ配信は使いません。",

  // ---- The sample meeting, and the card that says what to press on it ----
  "Create a sample meeting": "サンプル会議を作る",
  "A finished meeting with real transcript text, to try everything on before a real one.":
    "発言入りの終了済みの会議です。本番の前に、これで全機能を試せます。",
  "Could not create the sample meeting.": "サンプル会議を作成できませんでした。",
  "Sample meetings can only be created from inside your private network.":
    "サンプル会議は、プライベートネットワークの中からのみ作成できます。",
  "Sample meetings can only be removed from inside your private network.":
    "サンプル会議は、プライベートネットワークの中からのみ削除できます。",
  "There is already a sample meeting. Delete it to make a fresh one.":
    "サンプル会議は既にあります。作り直すには、先に削除してください。",
  "Your first run": "はじめての1回",
  "This is sample data. Everything below is the real thing acting on it, so break it as much as you like — then delete it from the meeting list.":
    "これはサンプルデータです。下にあるものはすべて本物の機能で、このデータに対して動きます。好きなだけ壊してかまいません。終わったら会議一覧から削除してください。",
  "The speaker names": "話者の名前",
  "Three speakers, already separated — this is what diarization produces. Rename one and every line by that person changes with it.":
    "3人の話者が既に分かれています。これが話者分離の結果です。名前を変えると、その人の発言すべてに反映されます。",
  "Nothing is written yet — pressing this runs the real model on the text above. A meeting this short takes seconds; a real one takes longer and waits in the queue.":
    "議事録はまだありません。押すと、上の発言に対して本物のモデルが走ります。これくらい短い会議なら数秒で、実際の会議はもっとかかり、順番待ちに入ります。",
  "Share, or download": "共有、または書き出し",
  "Recording and separating speakers are not on this list because both need the audio, and a sample meeting has none.":
    "録音と話者分離がこの一覧に無いのは、どちらも音声そのものを必要とし、サンプル会議には音声が無いためです。",
  "Record a real one": "実際に録音してみる",
  "to try those — check the microphone first, which is the one step worth never skipping.":
    "と、その2つも試せます。先にマイクの確認だけはしてください。省いてよい手順ではない唯一のものです。",
  "no meetings": "会議なし",
  "+ Add a meeting on this day": "＋ この日に会議を追加",
  "clear": "解除",
  "End": "終了",
  "Start generating minutes and end the meeting. Generation runs in the background; check the result on the meeting page when it finishes.": "会議を終了し、議事録の作成を始めます。作成はバックグラウンドで進むので、終わったら会議のページで確認してください。",
  "End the meeting and start speaker diarization. Speakers are assigned automatically on the meeting page (enrolled voices get their names); generate minutes afterwards.": "会議を終了し、話者分離を始めます。話者は会議のページで自動的に割り当てられます（声を登録済みの人には名前が付きます）。議事録はそのあとで作成してください。",
  "End the meeting without generating minutes.": "議事録を作らずに会議を終了します。",
  "Protect the recording (otherwise auto-deleted after 7 days; used for diarization / re-transcription)": "録音を保護する（保護しないと7日後に自動で削除されます。話者分離や文字起こしのやり直しに使います）",
  "Failed to save utterance: {error}": "発言を保存できませんでした: {error}",
  "Cannot start the microphone: {error}": "マイクを開始できません: {error}",
  "Failed to start minutes generation: {error}": "議事録の作成を開始できませんでした: {error}",
  "Failed to end the meeting: {error}": "会議を終了できませんでした: {error}",
  "Transcription failed: {error}. The recording is saved — use \"Re-transcribe\" on the meeting page.": "文字起こしに失敗しました: {error}。録音は保存されています。会議のページの「文字起こしをやり直す」を使ってください。",
  "End the meeting without keeping it. It moves to the trash, where it can be restored for 30 days, and its recording is not protected.": "会議を保存せずに終了します。会議はゴミ箱に移り、30日間は元に戻せます。録音は保護されません。",
  "Discard": "破棄する",
  "End without saving": "保存せずに終了",
  "For a meeting started by mistake: moves it to the trash instead of keeping it": "間違えて始めた会議に。残さずにゴミ箱へ移します",
  "Show only \"{name}\"": "「{name}」だけを表示",
  "1 meeting in this series": "このシリーズの会議 1件",
  "{n} meetings in this series": "このシリーズの会議 {n}件",
  "1 earlier meeting in this series": "このシリーズの過去の会議 1件",
  "{n} earlier meetings in this series": "このシリーズの過去の会議 {n}件",
  "New series": "新しいシリーズ",
  "Create": "作成",
  "Could not create the series.": "シリーズを作成できませんでした。",
  "No series yet. Create one with New series, or by naming it on a meeting under Purpose & agenda.": "シリーズはまだありません。「新しいシリーズ」から作るか、会議の「目的と議題」でシリーズ名を入れると作られます。",
  "Delete this series": "このシリーズを削除",
  "Delete this series? It has no meetings, so nothing else is removed.": "このシリーズを削除しますか？会議が1件も無いので、ほかに消えるものはありません。",
  "Enter a name for the series.": "シリーズの名前を入力してください。",
  "A series with that name already exists.": "その名前のシリーズは既にあります。",
  "Only a series with no meetings in it can be deleted.": "会議が1件も無いシリーズだけ削除できます。",
  "Add {name} to this series": "{name} をこのシリーズに追加",
  "Generating minutes in the background. They will appear automatically when done…": "バックグラウンドで議事録を作成しています。終わると自動で表示されます…",
  "Applies to this run only — saved settings are unchanged.": "今回だけに適用されます。保存済みの設定は変わりません。",
  "Trim the recording?": "録音をトリミングしますか？",
  "Only {from}–{to} is kept. The rest of the audio and {n} lines outside it are deleted, and this cannot be undone. Existing minutes are not rewritten, and speaker separation will need to be run again.":
    "{from}〜{to} だけを残し、それ以外の音声と、範囲外の発言 {n} 行を削除します。元に戻せません。作成済みの議事録は書き換わらず、話者分離はやり直しが必要になります。",
  Trim: "トリミングする",
  "Trim the recording…": "録音をトリミング…",
  "Trim the recording": "録音のトリミング",
  "Drag the two handles to the part to keep. Each tick is a line of the transcript; click the bar to listen from there. Audio and lines outside the range are deleted for good.":
    "2つのつまみを、残したい範囲まで動かします。縦線は1行ずつの発言で、バーをクリックするとそこから再生します。範囲外の音声と発言は完全に削除されます。",
  "Start of the part to keep": "残す範囲の始まり",
  "End of the part to keep": "残す範囲の終わり",
  "Keep from": "開始",
  "Set to the playing position": "再生位置にする",
  "Play from here": "ここから再生",
  "Keep until": "終了",
  "Play the last 10 seconds": "終わりの10秒を再生",
  "Keeps {length} of {total}.": "全体 {total} のうち {length} を残します。",
  "Keep at least one second of the recording.": "録音は1秒以上残してください。",
  "End the meeting before trimming its recording.": "録音をトリミングする前に会議を終了してください。",
  "Wait until the work queued for this meeting has finished, then trim.":
    "この会議の順番待ちの処理が終わってからトリミングしてください。",
  "This meeting has no recording to trim.": "この会議にはトリミングできる録音がありません。",
  "The recording could not be trimmed: {reason}": "録音をトリミングできませんでした: {reason}",
  "Meeting name and time": "会議名と日時",
  "Purpose and agenda": "会議の目的・内容",
  "Series background": "シリーズの背景",
  "Previous minutes in the series": "前回の議事録（シリーズ）",
  "Business background (Settings)": "業務背景（設定）",
  "Given to the model with the transcript": "発言ログと一緒にモデルへ渡す情報",
  "(nothing for this meeting)": "（この会議には無し）",
  "With this provider, the checked items and the transcript are sent outside this machine.":
    "この生成元では、チェックした情報と発言ログがこの機器の外へ送られます。",
  "What a run with this format gives the model by default. Each run can still change it before it starts.":
    "この書式で作るときに、既定でモデルへ渡す情報です。実行前にその回だけ変えられます。",
  "Applies to this batch only — saved settings are unchanged.":
    "今回のまとめて作成だけに適用されます。保存済みの設定は変わりません。",
  "Hide options": "オプションを閉じる",
  "This link cannot be used": "このリンクは使えません",
  "That link has expired or has already been used.": "このリンクは期限切れか、すでに使われています。",
  "Ask an administrator for another — they take a few seconds to make.": "管理者に新しいリンクを発行してもらってください。数秒で作れます。",
  "Back to the login page": "ログイン画面に戻る",
  "Choose a password": "パスワードを決める",
  "This link works once. Setting a password signs you in here and signs out every other device.": "このリンクは1回だけ使えます。パスワードを設定すると、この端末でログインし、ほかのすべての端末からはログアウトします。",
  "Done": "完了",
  "(you)": "（あなた）",
  "admin": "管理者",
  "disabled": "無効",
  "no password yet": "パスワード未設定",
  "Reset link": "再設定リンク",
  "Remove admin": "管理者から外す",
  "Make admin": "管理者にする",
  "You cannot disable your own account": "自分のアカウントは無効にできません",
  "Enable": "有効にする",
  "Disable": "無効にする",
  "match: title": "一致: タイトル",
  "match: purpose": "一致: 目的",
  "match: transcript": "一致: 発言",
  "match: minutes": "一致: 議事録",
  "show all": "すべて表示",
  "via tailnet": "tailnet 経由",
  "{n} meetings — {label}": "{n}件の会議 — {label}",
  "Move all {n} meetings in this series to Trash. You can restore them within 30 days.": "このシリーズの会議 {n}件をすべてゴミ箱に移します。30日以内なら元に戻せます。",
  "Move this meeting to Trash. You can restore it within 30 days.": "この会議をゴミ箱に移します。30日以内なら元に戻せます。",
  "Uses this series’ own minutes format.": "このシリーズ独自の議事録の形式を使います。",
  "Series (recurring meetings)": "シリーズ（定例会議）",
  "Meetings in the same series share context: the previous meeting’s minutes are given to the LLM as reference when generating minutes.": "同じシリーズの会議は文脈を共有します。議事録を作るとき、前回の議事録が参考としてLLMに渡されます。",
  "Failed to change protection: {error}": "録音の保護を変更できませんでした: {error}",
  "Failed to change speaker ({reason})": "話者を変更できませんでした（{reason}）",
  "connection error": "接続エラー",
  "Failed to save the edit ({reason})": "編集を保存できませんでした（{reason}）",
  "Failed to delete ({reason})": "削除できませんでした（{reason}）",
  "Failed to save speaker name ({reason})": "話者名を保存できませんでした（{reason}）",
  "Re-transcription failed: {error}": "文字起こしのやり直しに失敗しました: {error}",
  "Transcription failed: {error}": "文字起こしに失敗しました: {error}",
  "Undo split": "分割を元に戻す",
  "No minutes": "議事録なし",
  "Ask about this meeting": "この会議について質問",
  "Answered from everything said in {scope} — nothing else. Answers are not saved.":
    "「{scope}」で話された内容だけから答えます。回答は保存されません。",
  "From the minutes": "議事録から",
  "From the transcript": "文字起こしから",
  "Based on everything said in this meeting.": "この会議で話された内容すべてに基づいています。",
  "Based on the whole of this meeting, read as notes taken from it (it was too long to read at once).":
    "長い会議のため、全体から抽出した要点メモに基づいています（会議全体をカバーしています）。",
  "Recorded, but no minutes yet": "録音はあり、議事録がまだ作られていません",
  "1 of these meetings has no minutes yet": "この一覧のうち 1 件は議事録がまだです",
  "{n} of these meetings have no minutes yet": "この一覧のうち {n} 件は議事録がまだです",
  "Write them all": "まとめて作成",
  "Select all": "すべて選択",
  Clear: "選択を解除",
  "Queue {n} for minutes": "{n} 件をキューに送る",
  "Sending…": "送っています…",
  "Could not queue the minutes ({reason})": "議事録をキューに送れませんでした（{reason}）",
  "Undoing…": "戻しています…",
  "Put lines that were divided at a speaker change back together as they were": "話者の変わり目で分かれた行を、元の1行に戻します",
  "Could not undo the split ({reason})": "分割を戻せませんでした（{reason}）",
  "Diarization failed: {error}": "話者分離に失敗しました: {error}",
  "Keep reading — at least {n} seconds are needed.": "もう少し読み続けてください。最低 {n} 秒必要です。",
  "Only an administrator can change {keys} — they describe the machine, not you.": "{keys} を変更できるのは管理者だけです。これはあなたではなく、このマシンについての設定です。",
  "Only an administrator can download models to this server.":
    "このサーバーにモデルをダウンロードできるのは管理者だけです。",
  "That is not a model name Ollama would accept.": "Ollama が受け付けるモデル名ではありません。",
  "The Ollama address is not an http(s) address.": "Ollama のアドレスが http(s) ではありません。",
  "Cannot reach Ollama at this address.": "このアドレスの Ollama に接続できません。",
  "Downloading {model}…": "{model} をダウンロード中…",
  "It carries on if you close this page.": "このページを閉じてもダウンロードは続きます。",
  "Installed · {size}": "インストール済み · {size}",
  "Installed · {size} file, about {need} once loaded": "インストール済み · ファイル {size}、読み込み時 約 {need}",
  "Loaded, it needs about {need}, more than this machine's GPU budget of {budget}. Part of it will run on the CPU, which is much slower.":
    "読み込むと約 {need} になり、このマシンの GPU 予算 {budget} を超えます。一部が CPU で動くため、かなり遅くなります。",
  "Not installed on this Ollama.": "この Ollama にはインストールされていません。",
  "An administrator can download it from this screen.": "管理者がこの画面からダウンロードできます。",
  "The download failed: {reason}": "ダウンロードに失敗しました: {reason}",
  // The queue's history.
  History: "履歴",
  "Finished work on this machine, newest first (up to {n}).": "このマシンで終わった処理（新しい順、最大 {n} 件）",
  "Your finished work, newest first (up to {n}).": "あなたの終わった処理（新しい順、最大 {n} 件）",
  "Nothing has finished yet.": "終わった処理はまだありません。",
  Failed: "失敗",
  "Stopped before it finished": "途中で停止",
  "meeting {d}": "会議 {d}",
  "waited {d}": "待ち {d}",
  "took {d}": "処理 {d}",
  "all on the GPU": "すべて GPU",
  "{gb} GB loaded": "読み込み {gb} GB",
  "GPU {gpu}% / CPU {cpu}%": "GPU {gpu}% / CPU {cpu}%",
  "{gb} GB loaded, {vram} GB of it on the GPU. The rest ran on the CPU, which is much slower.":
    "読み込み {gb} GB のうち GPU に載ったのは {vram} GB。残りは CPU で動いたため、かなり遅くなっています。",
  "on the GPU": "GPU",
  "on the CPU": "CPU",
  "via {where}": "{where} 経由",
  "{in} in / {out} out tokens": "入力 {in} / 出力 {out} トークン",
  "context {n} tokens": "コンテキスト {n} トークン",
  "{n} tokens/s": "{n} トークン/秒",
  "model load {d}": "モデル読み込み {d}",
  "{n} passes": "{n} 回に分けて生成",
  "Long enough to be condensed first, then written from the condensed notes.":
    "長い会議のため、先に要点を抽出してから議事録を書いています。",
  "{n} speaker(s)": "話者 {n} 人",
  "{n} line(s) divided": "{n} 行を分割",
  "Only an administrator can delete models from this server.":
    "このサーバーからモデルを削除できるのは管理者だけです。",
  "{model} is what minutes are written with, for this machine or for somebody on it. Choose another model there first.":
    "{model} は、このマシンまたは誰かの議事録の生成に使われています。先にそちらで別のモデルを選んでください。",
  "{model} is still downloading.": "{model} はまだダウンロード中です。",
  "Ollama could not delete it: {reason}": "Ollama が削除できませんでした: {reason}",
  "Installed models ({n})": "インストール済みのモデル（{n}）",
  "Use this model": "このモデルを使う",
  "Minutes are written with this model, for this machine or for somebody on it.":
    "このマシンまたは誰かの議事録の生成に使われているモデルです。",
  "In use": "使用中",
  "Deleting…": "削除中…",
  "Delete {size}": "削除する（{size}）",

  // ---- Found without a translation in 3.8.5's sweep: written as plain strings, which the
  // table's own test cannot see. ----
  "Disable {name}?": "{name} を無効にしますか？",
  "They are signed out everywhere and cannot sign in again until this is undone. Their meetings, recordings and minutes are untouched and stay theirs.": "すべての端末からサインアウトされ、元に戻すまでサインインできなくなります。会議・録音・議事録はそのまま残り、本人のものです。",
  "Recording protected (not auto-deleted)": "録音は保護されています（自動で削除されません）",
  "Recording available (auto-deletes after the retention period)": "録音があります（保存期間を過ぎると自動で削除されます）",
  "Recordings {done}/{total}": "録音 {done}/{total}",
  "Meetings {done}/{total}": "会議 {done}/{total}",
  "Reading the file…": "ファイルを読み込んでいます…",
  "Reading the database…": "データベースを読み込んでいます…",
  "Packing…": "まとめています…",
  "Checking what is already here…": "既にあるものを確認しています…",
  "Series and tags…": "シリーズとタグ…",
  "Voice profiles…": "声紋…",
  "Settings…": "設定…",
  "Saved {name} ({size} MB, {meetings} meetings, {recordings} recordings)": "{name} を保存しました（{size} MB、会議 {meetings} 件、録音 {recordings} 件）",
  "Export failed": "書き出しに失敗しました",
  "Restore from this backup?": "このバックアップから復元しますか？",
  "Import failed": "取り込みに失敗しました",
  "Meetings in {file} that are not already here will be added. Nothing existing is deleted or overwritten, except your settings, which will be replaced.": "{file} の会議のうち、ここにまだ無いものを追加します。既存のものは削除も上書きもしません。ただし設定だけはバックアップの内容に置き換わります。",
  "Meetings in {file} that are not already here will be added. Nothing existing is deleted or overwritten.": "{file} の会議のうち、ここにまだ無いものを追加します。既存のものは削除も上書きもしません。",
  "Failed to update": "更新に失敗しました",
  "Could not access the microphone": "マイクを使えませんでした",
  "Extraction failed (HTTP {status})": "声紋の抽出に失敗しました（HTTP {status}）",
  "Save failed (HTTP {status})": "保存に失敗しました（HTTP {status}）",
  "Voice profile \"{name}\" saved. Diarized meetings will now auto-name this voice.": "声紋「{name}」を保存しました。話者分離した会議では、この声に自動で名前が付きます。",
  "Enrollment failed": "声紋の登録に失敗しました",
  "Built by a different speaker-recognition model than this machine runs, so it can no longer be matched. Record this person again to restore automatic naming.": "このマシンが使っている話者認識モデルとは別のモデルで作られたため、照合できません。自動で名前を付けるには、この人の声を登録し直してください。",
  "Last enrolled from a meeting": "最後に会議から登録",
  "Last enrolled from guided recording": "最後に読み上げで登録",
  "averaged over 1 recording": "1 件の録音から",
  "averaged over {n} recordings": "{n} 件の録音の平均",
  "Recording download failed (HTTP {status})": "録音のダウンロードに失敗しました（HTTP {status}）",
  "Saved voice profiles: {names}": "声紋を登録しました: {names}",
  "Preview failed: {error}": "プレビューに失敗しました: {error}",
  "Replace failed: {error}": "置換に失敗しました: {error}",
  "It is removed from the transcript and will no longer be used when generating minutes. The audio itself is kept.": "文字起こしから取り除かれ、議事録の作成にも使われなくなります。音声そのものは残ります。",
  "Replace the current transcript (including speaker assignments and manual edits) with a fresh recognition from the recording. You can re-run auto-diarization afterward.": "今の文字起こし（話者の割り当てや手で直した箇所を含む）を、録音からの新しい認識結果に置き換えます。話者分離はあとからやり直せます。",
  "The recording will be uploaded to {host}, which recognises it and bills you for the length of the audio.": "録音は {host} に送られて認識され、音声の長さに応じて料金がかかります。",
  "Done. Run \"Diarize\" to distinguish speakers.": "完了しました。話者を分けるには「話者を分離」を実行してください。",
  Storage: "ストレージ",
  "How much room the recordings, transcripts and minutes take": "録音・文字起こし・議事録が使っている容量を見る",
  "The room your meeting material takes in Voxinq.": "Voxinqに保存している会議資料の容量です。",
  "Audio recordings": "録音（音声）",
  Transcripts: "文字起こし",
  Other: "その他",
  "1 recording": "1件",
  "{n} recordings": "{n}件",
  "Search index, speaker separation results and voiceprints": "検索用の索引・話者分離の結果・声紋など",
  "The recordings could not be measured: the transcription service did not answer.":
    "録音の容量は、文字起こしサービスが応答しないため測れませんでした。",
  "{size} in all.": "合計 {size}",
  "{length} in all": "計 {length}",
  Text: "テキスト",
  "Protected — kept": "保護中 · 残り続ける",
  "Not deleted automatically — kept": "自動削除なし · 残り続ける",
  "Deleted automatically within 1 day": "1日以内に自動で削除",
  "Deleted automatically within {n} days": "{n}日以内に自動で削除",
  "In the trash — deleted {n} days after it was put there": "ゴミ箱 · 入れてから{n}日で削除",
  "About {size} per hour of meeting.": "会議1時間あたり 約{size}",
  "Transcripts take about {size} per hour of meeting.": "文字起こしは会議1時間あたり 約{size}",
  "Largest recordings": "大きい録音",
  Protected: "保護中",
  "In the trash": "ゴミ箱",
  "A recording that ran on after the meeting can be cut down to the meeting with Trim, under its player.":
    "会議のあとも続いていた録音は、会議ページのプレーヤーの下にあるトリミングで、会議の部分だけにできます。",
  "Text is counted as the characters stored, without the database's own overhead. Meetings in the trash count until they are deleted for good.":
    "テキストは保存されている文字のデータ量で、データベース自体の管理領域は含みません。ゴミ箱の会議も、完全に削除されるまでは含みます。",
};
