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
  "Record NOW": "すぐ録音",
  "Record now": "すぐ録音",
  Record: "録音",
  Queue: "順番待ち",
  People: "メンバー",
  Settings: "設定",
  Help: "ヘルプ",
  Documentation: "ドキュメント",
  "Documentation (opens on GitHub)": "ドキュメント（GitHub が開きます）",
  Main: "メインメニュー",
  "Voxinq Meeting home": "Voxinq Meeting のトップへ",
  Account: "アカウント",
  Administrator: "管理者",
  "Log out": "ログアウト",

  // ---- The meeting list: the first screen anybody sees ----
  "Search (title, transcript, minutes)": "検索（タイトル・発言・議事録）",
  "Clear filters": "絞り込みを解除",
  "Tags:": "タグ:",
  // "+3 more" / "less" — the tag row folds when there are many.
  "+{n} more": "他 {n} 件",
  less: "折りたたむ",
  Archived: "アーカイブ",
  "Archived — hidden from the list, still searchable": "アーカイブ済み — 一覧には出ませんが検索では見つかります",
  Trash: "ゴミ箱",
  // The bands down the list. `bandOf` returns these strings, so they are both the value and
  // the row here.
  "This week": "今週",
  "Over a week ago": "1週間以上前",
  "Over a month ago": "1か月以上前",
  Upcoming: "予定",
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
  "Select a meeting from the list to see its minutes and transcript here.":
    "左の一覧から会議を選ぶと、議事録と発言がここに出ます。",
  "Recording is available over Tailscale.": "録音は Tailscale 経由で使えます。",
  "+ New meeting": "＋ 新しい会議",
  "One-tap record": "ワンタップ録音",

  // ---- The row's menu ----
  "Meeting actions": "この会議の操作",
  Archive: "アーカイブする",
  Unarchive: "アーカイブを解除",
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
  "Error:": "エラー:",
  "● Model ready": "● モデル準備完了",
  "◌ Loading model…": "◌ モデル読み込み中…",
  "Start recording": "録音を開始",
  "Stop recording": "録音を停止",
  "Generate minutes": "議事録を作成",
  "Starting…": "開始中…",
  "End only": "終了のみ",
  "View minutes": "議事録を見る",
  Diarize: "話者を分離",
  "Re-transcribe": "文字起こしをやり直す",
  Minutes: "議事録",
  "End the meeting and start generating minutes in the background":
    "会議を終了し、議事録の作成をバックグラウンドで始めます",
  "End the meeting and assign speakers automatically; generate minutes after reviewing them":
    "会議を終了し、話者を自動で割り当てます。議事録は内容を確認してから作成します",
  "Recording is not available from an external network": "外部ネットワークからは録音できません",
  "This meeting has ended": "この会議は終了しています",
  "This meeting has already ended. Recording cannot be restarted.":
    "この会議は終了済みです。録音は再開できません。",
  "Settings for this recording": "この録音の設定",
  Microphone: "マイク",
  "Mic + PC audio": "マイク + PC音声",
  "Recording source (PC audio captures online-meeting sound). Changeable while recording.":
    "録音ソース（PC音声はオンライン会議の音を取り込みます）。録音中も変更できます。",
  Japanese: "日本語",
  English: "英語",
  "Auto-detect": "自動判定",
  Room: "会議室",
  Standard: "標準",
  "Loaded and run once the meeting ends": "会議終了後に読み込んで実行します",
  "Loaded on the GPU — transcription starts immediately":
    "GPU に読み込み済み — すぐに文字起こしが始まります",
  "Still loading; audio is buffered and transcribed once it is ready":
    "読み込み中です。音声は保持され、準備でき次第まとめて文字起こしします",
  "Input audio level (movement means sound is arriving)": "入力レベル（動いていれば音が届いています）",
  "The input is clipping — turn the source down; recognition cannot recover a clipped word":
    "入力が割れています — 音源を下げてください。割れた音は認識で復元できません",
  "Screen resting. Recording continues. Activate to show the recording screen.":
    "休止画面です。録音は続いています。触れると録音画面に戻ります。",
  "Recording — touch to show": "録音中 — 触れると表示",
  Transcript: "発言",
  "Speakers can be distinguished after the meeting": "話者は会議終了後に分けられます",
  'Press "Start recording" below. Text appears when the meeting ends, not during it.':
    "下の「録音を開始」を押してください。文字は会議終了後にまとめて出ます。",
  'Press "Start recording" below to begin transcription.':
    "下の「録音を開始」を押すと文字起こしが始まります。",
  "Saving the transcript…": "発言を保存しています…",
  "Something else is using the GPU": "GPU を他の処理が使っています",
  "Interrupt and transcribe live": "中断して会議中に文字起こし",
  "Record only": "録音だけする",
  "Model:": "モデル:",
  "Language:": "言語:",
  "Mic mode:": "マイクモード:",
  "Source:": "ソース:",
  "PC audio": "PC音声",
  "· at meeting end": "· 会議終了後",
  "● ready": "● 準備完了",
  "◌ loading…": "◌ 読み込み中…",
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
  "Speaking from across a room needs Mic mode: Room.":
    "離れた場所から話す場合は、マイクモードを「会議室」にしてください。",
  "The browser refused access to the microphone. Allow it for this site and try again.":
    "ブラウザがマイクへのアクセスを拒否しました。このサイトに許可してから、もう一度お試しください。",

  // ---- The meeting page: the column beside the minutes ----
  Add: "追加",
  "Add {name} to this meeting": "{name} をこの会議に追加",
  "{speakers} of {total} expected to speak — diarization is told to look for {n}.":
    "{total}人中 {speakers}人が発言する想定です。話者分離は {n} を探します。",
  "as many as it finds": "見つかった数だけ",
  "Separating speakers and writing minutes are optional, and can be run in either order.":
    "話者の分離と議事録の作成はどちらも任意で、順番も問いません。",
  "1 speaker": "話者 1人",
  "{n} speakers": "話者 {n}人",
  Progress: "進み具合",
  Recorded: "録音",
  Transcribed: "文字起こし",
  "Back to list": "一覧へ戻る",
  "Meeting details": "会議の情報",
  "1 person": "1人",
  "{n} people": "{n}人",
  "Speakers separated": "話者の分離",
  "Writing minutes…": "議事録を作成中…",
  "This meeting": "この会議",
  "Transcribed with": "使用したモデル",
  Language: "言語",
  "Minutes by": "議事録の生成",
  Series: "シリーズ",
  Glossary: "用語集",
  "Open the series page (timeline & defaults)": "シリーズのページを開く（履歴と既定値）",
  "Purpose & agenda": "目的と議題",
  "Purpose, agenda, and background of the meeting. Improves minutes quality.":
    "会議の目的・議題・背景。議事録の質が上がります。",
  Tags: "タグ",
  "Type a tag and press Enter": "タグを入力して Enter",
  "Existing:": "既存:",
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
  "Failed to save": "保存に失敗しました",
  "Saving…": "保存中…",
  "Could not save": "保存できませんでした",
  Download: "ダウンロード",
  "Download meeting": "会議をダウンロード",
  "Download meeting (minutes / transcript / info / recording)":
    "会議をダウンロード（議事録 / 発言 / 会議情報 / 録音）",
  "Minutes (.md)": "議事録 (.md)",
  "Transcript (.txt)": "発言 (.txt)",
  "Meeting info (.md)": "会議情報 (.md)",
  "Recording (.wav)": "録音 (.wav)",
  "Download failed": "ダウンロードに失敗しました",
  "Preparing…": "準備中…",
  "Download minutes": "議事録をダウンロード",
  "Opens a print view — choose “Save as PDF” as the destination":
    "印刷画面が開きます — 出力先で「PDF に保存」を選んでください",
  "Copy minutes": "議事録をコピー",
  "Copy failed": "コピーに失敗しました",
  "Save to file": "ファイルに保存",
  "New with same settings": "同じ設定で新規作成",
  "Resume recording": "録音を再開",
  "Continue recording — appends to the existing recording and transcript":
    "録音を続けます — 既存の録音と発言に追記されます",
  "Archive: hide from the list (still searchable, listed under Archived)":
    "アーカイブ: 一覧から隠します（検索では見つかり、アーカイブ一覧に入ります）",
  "Unarchive: show this meeting in the list again": "アーカイブを解除して一覧に戻します",
  "Move to Trash (restorable for 30 days)": "ゴミ箱へ移動（30日間は復元できます）",
  "Move this meeting to the trash. You can restore it within 30 days.":
    "この会議をゴミ箱へ移動します。30日以内なら復元できます。",
  Delete: "削除する",
  "Failed to delete": "削除に失敗しました",

  // ---- The minutes panel ----
  "No minutes generated yet.": "まだ議事録が作られていません。",
  "No transcript, so minutes cannot be generated.": "発言が無いため、議事録は作れません。",
  "Generating new minutes. A new version will be added below when done…":
    "新しい議事録を作成中です。完成すると下に新しい版が追加されます…",
  Regenerate: "作り直す",
  "Regenerate the minutes (choose detail & provider)": "議事録を作り直す（詳しさと生成元を選べます）",
  "Regeneration failed": "作り直しに失敗しました",
  Edit: "編集",
  Cancel: "キャンセル",
  "Version:": "版:",
  latest: "最新",
  "Viewing an older version": "古い版を表示しています",
  "Built-in default": "組み込みの既定",
  "Same as settings": "設定と同じ",
  Provider: "生成元",
  "Model: {model} (from Settings)": "モデル: {model}（設定から）",
  "Brief (shorter)": "簡潔（短め）",
  "Detailed (fuller)": "詳細（厚め）",
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
  Protect: "保護する",
  Unprotect: "保護を解除",
  "Updating…": "更新中…",
  "Checking…": "確認中…",
  "Diarization failed": "話者の分離に失敗しました",
  "Done. Rename the speakers below if you like.": "完了しました。下で話者の名前を付け直せます。",
  "How many voices to look for. Left empty, the participant list decides.":
    "探す声の数。空欄なら参加者リストから決まります。",
  "Save voice profiles": "声紋を登録",
  "Enrolled:": "登録済み:",
  "Delete this voice profile": "この声紋を削除",
  "Suggest fixes": "誤変換の候補を出す",
  "Suggested fix": "修正候補",
  "Fix a term that was misheard the same way throughout": "同じ誤変換をまとめて直します",
  "Find & replace": "検索と置換",
  Find: "検索",
  "Replace with": "置換後",
  "Match case": "大文字小文字を区別",
  Preview: "プレビュー",
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
  "Choose file": "ファイルを選ぶ",
  "Purpose / agenda (metadata)": "目的・議題（メタデータ）",
  "Series (recurring meetings, optional)": "シリーズ（定例会議、任意）",
  "When (optional)": "日時（任意）",
  "Leave empty to record now. Filling it in puts the meeting under Upcoming so the title, agenda and settings can be sorted out ahead of time — then it is one tap to start when the meeting comes round.":
    "空欄なら今すぐ録音します。日時を入れると「予定」に入り、タイトル・議題・設定を先に整えておけます — 当日はワンタップで始められます。",
  "Recording settings (this meeting only)": "録音の設定（この会議のみ）",
  "Defaults come from the app settings. Changes here apply to this meeting only and do not change the settings. (Model and language also apply to dropped files.)":
    "既定値はアプリの設定から来ています。ここでの変更はこの会議だけに効き、設定そのものは変わりません。（モデルと言語はドロップしたファイルにも適用されます。）",
  "Transcription model": "文字起こしモデル",
  "Transcription language": "文字起こしの言語",
  "Microphone mode": "マイクモード",
  "Recording source": "録音ソース",
  "Set up meeting": "会議を準備する",
  "Setting up…": "準備中…",
  "Add to Upcoming": "予定に追加",
  "Adding…": "追加中…",
  "Interrupt & set up": "中断して準備する",
  "Interrupting…": "中断中…",
  "Creating meeting…": "会議を作成中…",
  "Could not create the meeting": "会議を作成できませんでした",
  "Failed to create meeting.": "会議の作成に失敗しました。",
  "Please enter a title.": "タイトルを入力してください。",
  "Auto (follow settings default)": "自動（設定の既定に従う）",
  "Standard (close talk / calls)": "標準（近くで話す・通話）",
  "Room (pick up distant voices)": "会議室（離れた声を拾う）",
  "Microphone + PC audio": "マイク + PC音声",
  "This device cannot capture PC audio (Chrome / Edge on desktop required).":
    "この端末では PC音声を取り込めません（デスクトップの Chrome / Edge が必要です）。",
  "Drop an audio file here to transcribe and summarize (no live recording).":
    "音声ファイルをここにドロップすると、文字起こしと議事録を作ります（録音はしません）。",
  "Please drop an audio file (wav, mp3, m4a, ...).":
    "音声ファイルをドロップしてください（wav, mp3, m4a など）。",
  "Transcribing the audio… (this can take a few minutes)": "音声を文字起こし中…（数分かかることがあります）",
  "Transcription failed.": "文字起こしに失敗しました。",
  "Failed to process the file.": "ファイルを処理できませんでした。",
  "This model only handles Japanese — an English meeting will not transcribe. Pick large-v3-turbo instead.":
    "このモデルは日本語専用です — 英語の会議は文字起こしできません。large-v3-turbo を選んでください。",
  "Japanese-only model: transcription is forced to Japanese. Use large-v3-turbo for meetings in any other language.":
    "日本語専用モデルです。文字起こしは日本語に固定されます。他の言語の会議には large-v3-turbo を使ってください。",

  // ---- People ----
  "Add someone": "メンバーを追加",
  "Loading…": "読み込み中…",
  "Display name (optional)": "表示名（任意）",
  "Tailnet login (optional)": "tailnet のログイン（任意）",
  "An administrator": "管理者にする",
  "Issue a one-time link so they can set their own password":
    "本人がパスワードを設定できるワンタイムリンクを発行します",
  "What they type to sign in. Nothing is sent to it — hand them the link below instead.":
    "本人がログインに入力するアドレスです。ここには何も送られません — 下のリンクを手渡してください。",
  "Accounts are disabled, never deleted. An account holds meetings, and deleting one would either destroy them or hand them to somebody who was never in the room.":
    "アカウントは無効化するもので、削除しません。アカウントは会議を保持しているので、削除は「消す」か「その場にいなかった人に渡す」のどちらかにしかなりません。",
  "Fill this in and they are signed in automatically from inside the tailnet, with no password at all. Leave it empty and give them a reset link instead.":
    "ここを埋めると tailnet の内側では自動でログインし、パスワードは不要になります。空欄のままなら、代わりにリセットリンクを渡してください。",

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
  "What new work uses. Any of these — and this machine — can still be picked for a single run from Re-transcribe.":
    "これから行う処理が使うものです。ここに挙がったもの（この機器も含めて）は、「文字起こしをやり直す」から 1 回だけ選ぶこともできます。",
  "This model is used for live recognition on this machine. The after-the-meeting pass and Re-transcribe use {model} at {host} instead — these names belong to different services and are not interchangeable.":
    "このモデルは、この機器で会議中に認識するときに使われます。会議終了後の一括処理と「文字起こしをやり直す」は、{host} の {model} を使います — これらは別のサービスの名前で、互いに置き換えられません。",
  "Megabytes of video memory the queue may commit at once. Leave it empty to work it out from the card. Jobs that run somewhere else — recognition sent to an endpoint, minutes written by a cloud model — cost nothing here and never wait for it.":
    "順番待ちの処理が一度に確保してよい VRAM の量（MB）です。空欄なら、カードの容量から自動で決めます。他所で走る処理 — エンドポイントに送る認識や、クラウドのモデルが書く議事録 — はここを消費せず、待つこともありません。",
  Transcription: "文字起こし",
  "Transcription (Whisper)": "文字起こし（Whisper）",
  "Minutes (language, background, format)": "議事録（言語・背景・書式）",
  "Minutes generation (LLM)": "議事録の生成（LLM）",
  Appearance: "表示",
  "Remote access (public URL)": "外部公開（公開 URL）",
  "Backup & restore": "バックアップと復元",
  "Voice profiles (speaker auto-naming)": "声紋（話者の自動命名）",
  "Saved.": "保存しました。",
  Back: "戻る",
  Close: "閉じる",
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
  "Auto — from the card, less room for the display":
    "自動 — カードの容量から、表示用を差し引いて決めます",
  "This is a scheduling figure, not a limit on any one job: something larger than the whole budget still runs, on its own. Raise it to let two things run together on a bigger card; lower it if something else on this machine needs the memory.":
    "これは並行実行を決めるための数字で、1 つの処理の上限ではありません。上限より大きい処理も、単独でなら実行されます。大きいカードで 2 つ同時に走らせたいなら上げ、他の用途にメモリが要るなら下げてください。",
  "“Auto-detect” transcribes in the spoken language (minutes language is set separately below).":
    "「自動判定」は話された言語のまま文字起こしします（議事録の言語は下で別に設定します）。",
  "Terms / proper nouns (recognition bias)": "用語・固有名詞（認識のヒント）",
  "Adding jargon, names, and product names improves accuracy. Keep it short (~150 chars).":
    "専門用語・人名・製品名を入れると精度が上がります。短めに（150文字程度まで）。",
  "Placing the device in the center of the table helps.":
    "端末をテーブルの中央に置くと拾いやすくなります。",
  "Translate non-Japanese speech into Japanese": "日本語以外の発言に日本語訳を付ける",
  "CC-BY-NC — non-commercial use only": "CC-BY-NC — 非商用に限ります",

  "Minutes language": "議事録の言語",
  "Minutes are generated in this language regardless of the spoken language.":
    "話された言語にかかわらず、議事録はこの言語で生成されます。",
  "Minutes detail": "議事録の詳しさ",
  "How much detail. “Detailed” grows with longer meetings (takes a bit longer). Long meetings are auto-summarized in chunks, so the latter half is never dropped.":
    "どこまで詳しく書くか。「詳細」は会議が長いほど分量が増えます（少し時間がかかります）。長い会議は自動で分割して要約するので、後半が落ちることはありません。",
  "Business / research background": "業務・研究の背景",
  "Always-on context, separate from each meeting’s purpose. Aim for ~half to one page (too long hurts accuracy). Used only to interpret terms — not copied into minutes.":
    "会議ごとの目的とは別に、常に渡される背景情報です。半ページ〜1ページ程度を目安に（長すぎると精度が落ちます）。用語の解釈にだけ使われ、議事録には転記されません。",
  "Minutes format": "議事録の書式",
  "No saved formats. Minutes use the built-in one: an overview, then the discussion by topic, then decisions and action items.":
    "保存された書式はありません。議事録は組み込みの書式を使います — 概要、話題ごとの議論、決定事項とアクションアイテムの順です。",
  "Starts with": "書き出し",
  "The heading structure the model is asked to follow. Its first heading is also used to start the model off, so keep one at the top.":
    "モデルに従わせる見出し構成です。最初の見出しは書き出しにも使われるので、先頭には見出しを置いてください。",

  Ollama: "Ollama",
  "Base URL": "ベース URL",
  "API key": "API キー",
  "API key (leave empty for local servers)": "API キー（ローカルのサーバーなら空欄で構いません）",
  "Delete the saved key": "保存されたキーを削除",
  "OpenAI-compatible (vLLM / LM Studio / OpenAI)": "OpenAI 互換（vLLM / LM Studio / OpenAI）",
  "Their terms decide how long it is kept and whether it trains anything. Voxinq cannot change that.":
    "保存期間や学習に使われるかは、送り先の規約が決めます。Voxinq からは変えられません。",
  "You are billed by them, per token. Long meetings cost more than short ones.":
    "料金はトークン単位で送り先から請求されます。長い会議ほど高くなります。",

  Theme: "テーマ",
  "Applied instantly and saved per device (browser). No need to press “Save”.":
    "すぐ反映され、端末（ブラウザ）ごとに保存されます。「保存」を押す必要はありません。",
  "Follow my browser": "ブラウザに合わせる",
  "Default meeting name": "会議の既定の名前",
  "What a meeting is called until somebody names it. The day it is for — a meeting booked from the calendar is named for that day, not for today.":
    "誰かが名前を付けるまでの会議名です。その会議の日付が入ります — カレンダーから予約した会議は、今日ではなくその日の名前になります。",
  "Rest the screen while recording": "録音中に画面を休ませる",
  "After this long without a touch, the recording screen goes black. Tapping brings it back, and it rests again after the same wait. Recording is not affected — the microphone, the upload and the screen lock all keep going.":
    "この時間だけ操作がないと、録音画面が真っ暗になります。触れば戻り、同じ時間でまた休みます。録音には影響しません — マイクも送信も画面ロックも動いたままです。",
  "You cannot watch the live transcript while it rests": "休止中は文字起こしを見られません",

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
  "Recording (STT)": "録音（STT）",
  "Minutes (LLM)": "議事録（LLM）",
  DB: "DB",
  "Click to re-check": "クリックで再確認",
  ready: "準備完了",
  "Whisper model loaded: {model}": "読み込み済みの Whisper モデル: {model}",
  "Warm up": "先に読み込む",
  "Loading model…": "モデルを読み込み中…",
  "Load the Whisper model now so recording starts transcribing immediately":
    "いま Whisper モデルを読み込んでおくと、録音を始めた瞬間から文字起こしが動きます",
  "Cannot reach STT — recording unavailable ({reason})":
    "STT に接続できません — 録音は使えません（{reason}）",
  "check failed": "確認できませんでした",
  "Could not reach STT.": "STT に接続できませんでした。",
  "Minutes are being generated — the GPU is busy. Try again once they finish.":
    "議事録を生成中で GPU が使われています。終わってからもう一度お試しください。",
  "Model load is taking longer than expected.": "モデルの読み込みに時間がかかっています。",
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
  "Who can use this server, and how they get in. Not what any of them have recorded — running the machine is a different thing from reading what is on it.":
    "このサーバーを使えるのは誰か、どうやって入るか。誰が何を録音したかは含みません — 機械を運用することと、その中身を読むことは別だからです。",

  OK: "OK",

  // ---- Settings: what was left in English ----
  "“Room” turns off echo/noise suppression and raises auto-gain to pick up distant speech.":
    "「会議室」はエコー・ノイズ抑制を切り、オートゲインを上げて離れた声を拾います。",
  "Shows a Japanese translation under each non-Japanese utterance, during the meeting and on the transcript. Japanese speech is left alone, and minutes are still generated from the original words. Translation runs on the CPU, so it does not compete with transcription for the GPU.":
    "日本語以外の発言の下に日本語訳を表示します（会議中も、文字起こしの画面でも）。日本語の発言はそのままで、議事録は元の言葉から生成されます。翻訳は CPU で動くため、文字起こしと GPU を取り合いません。",
  "Turning this on downloads a ~600MB translation model (NLLB-200 distilled, {licence}) to the STT host on first use.":
    "有効にすると、初回利用時に約600MBの翻訳モデル（NLLB-200 distilled、{licence}）が STT ホストにダウンロードされます。",
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
  "Roughly how much memory each needs: {guide}. On an 8GB card this is what has to fit beside whatever else is loaded. Downloaded on first use and cached afterwards.":
    "それぞれのおおよその必要メモリ: {guide}。8GB のカードでは、他に読み込まれているものと並んでこれが収まる必要があります。初回利用時にダウンロードされ、以降はキャッシュされます。",

  // Placeholders somebody reads before they type.
  "e.g. Acme Corp, Project Aurora, Jane Doe, Voxinq Meeting":
    "例: 株式会社アクメ, プロジェクト・オーロラ, 山田太郎, Voxinq Meeting",
  "Org, research topics, ongoing projects, people, and background knowledge. Referenced every time as context for all minutes.":
    "組織・研究テーマ・進行中のプロジェクト・人物・前提知識など。すべての議事録で毎回コンテキストとして参照されます。",

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
  "Not set (OK for LM Studio / vLLM)": "未設定（LM Studio / vLLM なら不要）",
  "“System” follows your OS and changes with it. Read-only visitors get the same choice from the icon in the header.":
    "「システムに合わせる」は OS の設定に追従し、それに合わせて切り替わります。閲覧専用の相手も、ヘッダーのアイコンから同じ選択ができます。",
  "The screens. What language the minutes are written in is a separate setting, under Minutes — an English screen writing Japanese minutes is a combination people want.":
    "画面の言語です。議事録を書く言語は「議事録」の別の設定で、英語の画面で日本語の議事録を書くという組み合わせも実際に使われます。",
  "On a phone with an OLED screen this is most of the battery: black pixels do not light up.":
    "OLED 画面のスマートフォンでは、これがバッテリーの大半を占めます。黒い画素は光らないためです。",
  ", which is the trade — worth it for a long meeting recorded from a pocket, not for one you are reading along with.":
    "という引き換えです。ポケットに入れたまま録る長い会議には向きますが、読みながら進める会議には向きません。",
  // Minutes formats.
  "What new minutes use. Any of these can still be picked for a single run from {action}. A series with its own format keeps using that.":
    "これから作る議事録が使う形式です。ここに挙がったものは「{action}」から 1 回だけ選ぶこともできます。独自の形式を持つシリーズはそちらを使い続けます。",
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
  Brief: "簡潔",
  Detailed: "詳細",
  "Room (distant voices)": "会議室（離れた声を拾う）",
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
  "Archived meetings": "アーカイブした会議",
  "Archived meetings are hidden from the main list but kept forever — open them here or via search.":
    "アーカイブした会議は一覧には出ませんが、消えずに残ります。ここか検索から開けます。",
  "Unarchive to bring one back to the list. On a phone, swipe a row right to unarchive or left to move it to Trash.":
    "アーカイブを解除すると一覧に戻ります。スマートフォンでは、右スワイプで解除、左スワイプでゴミ箱へ移動します。",
  "Nothing archived.": "アーカイブした会議はありません。",
  "archived {when}": "アーカイブ {when}",

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
  "1 meeting in this series. When minutes are generated, the previous meeting’s minutes are passed to the LLM as context.":
    "このシリーズには 1 件の会議があります。議事録を生成するとき、前回の議事録が文脈として LLM に渡されます。",
  "{n} meetings in this series. When minutes are generated, the previous meeting’s minutes are passed to the LLM as context.":
    "このシリーズには {n} 件の会議があります。議事録を生成するとき、前回の議事録が文脈として LLM に渡されます。",
  "No minutes yet ({n}).": "議事録はまだありません（{n}）。",
  "No meetings in this series yet.": "このシリーズにはまだ会議がありません。",
  "Series defaults": "シリーズの既定値",
  "Apply to every meeting in this series, overriding the global Settings.":
    "このシリーズのすべての会議に適用され、全体の設定より優先されます。",
  "Series name": "シリーズ名",
  "Minutes format (empty = use the global setting)": "議事録の形式（空欄なら全体の設定を使用）",
  "…heading structure the minutes must follow for this series":
    "…このシリーズの議事録が従うべき見出し構成",
  "Transcription glossary (appended to the global glossary)":
    "文字起こしの用語集（全体の用語集に追加されます）",
  "Terms and proper nouns that come up in this series": "このシリーズで出てくる用語や固有名詞",
  "Transcription glossary": "文字起こしの用語集",
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
  "Show translations": "翻訳を表示",
  "Analyze the recording and assign a speaker to each line (entering the participant count improves accuracy)":
    "録音を解析して各行に話者を割り当てます（人数を入れると精度が上がります）",
  "Check the transcript for glossary terms that were misheard, and propose fixes to apply line by line":
    "用語集の語が聞き違えられていないか発言を調べ、行ごとに適用できる修正案を出します",
  "Speaker separation needs a Hugging Face token": "話者分離には Hugging Face のトークンが必要です",
  "How to set it up →": "設定方法 →",
  "Speaker names (edits apply to all lines)": "話者の名前（変更はすべての行に反映されます）",
  "e.g. NEXUS": "例: NEXUS",
  "…and {n} more": "…ほか {n} 件",
  "{n} skipped — a replacement cannot empty an utterance (delete it instead) or exceed the length limit.":
    "{n} 件は対象外です。置換で発言を空にすることはできません（その場合は削除してください）。長さの上限を超える場合も同様です。",
  "There is no transcript, but the recording remains. You can restore it from here.":
    "発言は残っていませんが、録音は残っています。ここから復元できます。",
  "Recognise with": "認識に使うのは",
  "Apply all": "すべて適用",
  "Dismiss all": "すべて破棄",
  Apply: "適用",
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
  "Accessing from an external network, so recording is unavailable (recording works over Tailscale only). Viewing/generating minutes, diarization, and sharing still work here.":
    "外部ネットワークからのアクセスのため録音は使えません（録音は Tailscale 経由のみ）。議事録の閲覧・生成、話者分離、共有はここでも使えます。",

  // ---- Record NOW ----
  "Failed to start recording: {error}": "録音を開始できませんでした: {error}",
  "Go to New meeting": "「新しい会議」へ",
  "Minutes are being generated": "議事録を生成中です",
  "Recording uses the GPU that minutes generation is running on. Interrupt the in-progress minutes and start recording now? You can regenerate those minutes afterward.":
    "録音は、いま議事録の生成が使っている GPU を必要とします。生成中の議事録を中断して、すぐ録音を始めますか？　その議事録は後から作り直せます。",
  "Keep generating": "生成を続ける",
  "Interrupt & record": "中断して録音する",
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
  "Queue — {n} of yours waiting or running": "順番待ち — 自分の処理が {n} 件（待機中または実行中）",

  // ---- Names and tooltips the runtime sweep turned up ----
  "Remove {name}": "{name} を削除",
  format: "形式",
  "{name} spoke": "{name} は発言しました",
  "+ New speaker": "＋ 話者を追加",
  "Enrolls each named speaker’s voiceprint from this meeting; future auto-diarize runs will name them automatically.":
    "名前を付けた話者の声紋を、この会議から登録します。以降の自動話者分離では、その人たちに自動で名前が付きます。",
  "Play from here ({time})": "ここから再生（{time}）",
  "New with same settings — start a new meeting inheriting this one’s purpose, tags, and series":
    "同じ設定で新規作成 — この会議の目的・タグ・シリーズを引き継いで新しい会議を始めます",
  "API key not set": "API キーが未設定です",

  // ---- The live status chip on the meeting list, written straight into the DOM ----
  "Recording…": "録音中…",
  "Waiting…": "待機中…",
  "Waiting — 1 job ahead of it.": "待機中 — 前に 1 件あります。",
  "Waiting — {n} jobs ahead of it.": "待機中 — 前に {n} 件あります。",
  "Working… (you can leave this page; it finishes on the server)":
    "処理中…（このページを離れても、サーバー側で最後まで実行されます）",
};
