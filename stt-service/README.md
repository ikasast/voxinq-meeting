# Voxinq2 STT サービス

オンプレ日本語文字起こし。ブラウザ(スマホ)から 16kHz PCM を WebSocket で受け取り、
`faster-whisper`(CTranslate2 / GPU)で準リアルタイムに確定テキストを返す。

torch には依存しない(CTranslate2 ベース)ため、STT 単体は軽量にセットアップできる。

## セットアップ (Windows / RTX 4060 8GB)

```powershell
cd stt-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

GPU 実行には CUDA 12 系のランタイムと cuBLAS / cuDNN が必要。
うまく GPU を掴めない場合は `WHISPER_DEVICE=cpu` で動作確認できる(遅い)。

## 単体確認 (Phase 3)

```powershell
# 別ターミナルで VRAM を監視: nvidia-smi -l 1
python transcribe_wav.py sample.wav large-v3
```

`large-v3` が 8GB に収まらない/遅い場合は `medium` または `distil-large-v3` を試す。

## サーバ起動 (Phase 4 以降)

```powershell
# 設定は環境変数 (.env.example 参照)
python server.py
# → ws://0.0.0.0:8000/ws , GET /health
```

## VRAM 時間分割

会議中だけ Whisper を GPU に載せ、`{"type":"end"}` 受信時にモデルを解放する。
解放後に Web アプリが Ollama(議事録生成)を呼ぶことで 8GB VRAM を STT と LLM で共有する。

## WebSocket プロトコル

- client → server
  - text: `{"type":"start","model":"large-v3"?}` / `{"type":"end"}`
  - binary: Int16LE PCM 16kHz mono
- server → client (JSON text)
  - `{"type":"status","status":"loading|open|closed"}`
  - `{"type":"partial","text":...}`
  - `{"type":"final","text":...,"speaker":"spk","start":s,"end":s}`
  - `{"type":"error","message":...}`
