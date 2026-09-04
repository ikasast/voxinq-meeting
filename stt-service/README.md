# Voxinq STT サービス

音声認識と話者分離を担う FastAPI サービス。ブラウザから 16kHz PCM を WebSocket で受け取り、
確定テキストを返す。会議終了後の一括文字起こし、録音ファイルの保管、話者分離もここが持つ。

設定値の一覧は [`docs/configuration.md`](../docs/configuration.md)、設計上の判断は
[`docs/design-decisions.md`](../docs/design-decisions.md) にある。ここは実装側の要点だけ。

## 認識バックエンド

**ローカル2つは起動時にハードウェアから自動で選ばれる**（`backends.py` の `choose_backend`）。

| バックエンド | 選ばれる条件 | 備考 |
| --- | --- | --- |
| `faster-whisper` (CTranslate2) | CUDA が使えるとき | この構成で最速。GPU 環境では既定 |
| `whisper.cpp` (pywhispercpp) | それ以外すべて | Apple Silicon では Metal、他は CPU |

`STT_BACKEND` で明示指定もできる。**指定したものが入っていない場合は、もう一方に落ちて起動する**
（起動しない STT サービスの方が困るため）。これは話者分離の `DIA_BACKEND` とは逆の方針で、
あちらは動かせないものを指定するとエラーになる。

**リモート2つは起動時には選ばれない。**`choose_backend` は決して返さない。ジョブごとに Web アプリが
`remote` ブロックを付けて渡してきたときだけ使う — どこへ送るかの判断は1か所だけにするため。

| バックエンド | 対象 |
| --- | --- |
| `OpenAiCompatibleBackend` | `/v1/audio/transcriptions` を話すもの全般（Groq / OpenAI / 自前の whisper サーバー） |
| `GeminiBackend` | Google の Interactions API（別のリクエスト形・別のヘッダ・単語単位の注釈） |

どちらも、単語や区間の時刻が返らなかった場合は**チャンク全体を1発話として返し、その旨を `note` で
報告する**。黙って1つの長い発話にすると、話者分離が割り当てる行が1行しか無くなる。

## ライブ文字起こしができるかどうか

`live_transcription_available()` が判定する。**「認識できるか」ではなく「実時間に追いつくか」**が
基準で、追いつかない機器は会議中は録音だけして終了時に一括処理する（16コアの x86 CPU で実測
2.8倍遅く、1時間の会議で39分の積み残しが出る）。

- faster-whisper → CUDA のときだけライブ
- whisper.cpp → Apple Silicon のときだけライブ（wheel が Metal を含むため）
- リモート → 常に不可（1チャンクごとに往復するため）

## セットアップ

```powershell
cd stt-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python server.py       # → ws://0.0.0.0:8000/ws , GET /health
```

**GPU は必須ではない。**CUDA があれば faster-whisper が使われ、無ければ whisper.cpp が使われる。
CUDA を掴めているかは `GET /health` の `backend` / `device` で分かる。

話者分離は別の venv（`../diarization/`）でサブプロセスとして動く。pyannote（CUDA + `HF_TOKEN`）と
sherpa-onnx（トークン不要・全OS）の2本立てで、これもハードウェアから選ばれる。

## VRAM の時間分割

8GB のカードでは Whisper と Ollama が同時に載らない。会議中だけ Whisper を GPU に置き、
`{"type":"end"}` で解放してから Web アプリが議事録生成を呼ぶ。`STT_IDLE_RELEASE_SECONDS`
（既定 600）で無操作時にも解放する。**これは 8GB 構成の話であって、アプリの前提ではない。**

## WebSocket プロトコル (`/ws`)

- client → server
  - text: `{"type":"start","model":?,"meetingId":?,"language":?,"initialPrompt":?,"translate":?}`
  - text: `{"type":"end"}`
  - binary: Int16LE PCM 16kHz mono
- server → client (JSON text)
  - `{"type":"status","status":"loading|open|closed"}`
  - `{"type":"partial","text":...}` — 確定前の暫定テキスト（`STT_PARTIAL_MS`、0で無効）
  - `{"type":"final","text":...,"speaker":"spk","seq":n,"start":s,"end":s}`
  - `{"type":"translation","seq":n,"text":...}` — `seq` で対応する発話に後から届く（CPU 側で走るため）
  - `{"type":"error","message":...}`

## HTTP

| 用途 | エンドポイント |
| --- | --- |
| 状態 | `GET /health`（`busy` / `busyKind` を含む）, `POST /preload`, `POST /activity`, `POST /recordings/states` |
| 録音 | `GET/POST/DELETE /recordings/{id}` とその `/audio` `/sidecars` `/protect` `/restore` `/segments/delete` |
| 一括文字起こし | `POST /transcribe/{id}` → `GET /transcribe/{id}/status` |
| ファイルからの取り込み | `POST /upload/{id}`（wav/mp3/m4a など ffmpeg が読める形式） |
| 話者分離 | `POST /diarize/{id}` → `GET /diarize/{id}/status`、`POST /diarize/{id}/cancel` |
| 声紋 | `POST /voiceprint` |

`/transcribe/{id}` の body に `remote` を入れるとリモートバックエンドが使われる。API キーはここに
乗って来る（Web アプリがサーバー側で付ける）ので、**ブラウザには渡らない**。

## テスト

```powershell
.venv\Scripts\python.exe test_backends.py
```

CI（`.github/workflows/ci.yml`）でも同じものが走る。ネットワークもモデルも要らない
（HTTP バックエンドはローカルのスタブサーバーに対して検証している）。
