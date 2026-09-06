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
};
