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
  Your: "自分の",

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
  "Minutes — an English screen writing Japanese minutes is a combination people want.":
    "議事録の設定にあります — 画面は英語で議事録は日本語、という組み合わせは実際に使われます。",
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
  APP_PASSWORD: "APP_PASSWORD",
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
};
