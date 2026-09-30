# 詳しい導入手順

動作環境、環境別の入れ方、`.env` の全項目、スマホからの接続。 [← 日本語ガイドに戻る](../../README.ja.md)

## 必要なもの（動作環境）

### ハードウェア

| 項目 | 必要なもの | 補足 |
| --- | --- | --- |
| GPU | **推奨**: NVIDIA製・VRAM 8GB以上 | RTX 3060/4060 クラスで動作します。**必須ではありません** — 無い場合の違いは次項 |
| メモリ | 16GB以上を推奨 | |
| ストレージ | **約 40GB の空き**（GPU 無しなら約 20GB） | 文字起こしのイメージが展開後 21GB（CPU 版なら 1.8GB）、Ollama のイメージが約 9GB、議事録用のモデルが約 5GB あります |
| OS | Windows / Linux / macOS | 開発・動作確認は Windows 11。macOS 向けのコードはありますが**実機未検証**です |

#### GPU の種類による違い

どの機器でも動きますが、**発話に追いつけるかどうか**で体験が変わります。追いつける機器は
会議中に文字が出て、追いつけない機器は会議終了時にまとめて出ます。

| 環境 | 文字起こし | 文字が出るタイミング | 話者分離 |
| --- | --- | --- | --- |
| **NVIDIA GPU** | faster-whisper（CUDA） | **話しながら** | pyannote（GPU） |
| **Apple Silicon**（ネイティブ導入） | whisper.cpp（Metal） | **話しながら** | sherpa-onnx（CPU） |
| **Apple Silicon**（Docker） | whisper.cpp（CPU。下記参照） | 会議終了時 | sherpa-onnx（CPU） |
| **AMD / Intel GPU** | whisper.cpp（**CPU**。GPU は使いません） | 会議終了時 | sherpa-onnx（CPU） |
| **CPU のみ** | whisper.cpp（CPU） | 会議終了時 | sherpa-onnx（CPU） |

#### 議事録の生成はどうなるか

上の表は文字起こしと話者分離までで、**議事録を書く工程が入っていません**。そして GPU の無い
機器では、この 3 つ目が一番遅くなります。Ollama が CPU に落ち、モデルが議事録を書き始める前に
文字起こし全体を読み切る必要があるためです。

下の 2.8 倍を測ったのと同じ 16 コアの x86 CPU で、8B モデル・GPU 無しの実測値:
**読み込み 31 トークン/秒、生成 6.5 トークン/秒**。既定の文脈上限 24,576 トークンを埋める会議なら
**読むのに約 13 分、書くのに 3〜4 分** — 1 本の議事録に 15 分前後かかります（8GB のカードなら
1 分未満です）。

動かないわけではなく、生成はバックグラウンドで進み、終われば画面が知らせます。それでも遅いと
感じる場合、**設定 → LLM** で逃げ道が 2 つあります。

- **小さいモデルにする。** 3B クラスなら数倍速くなり、込み入っていない会議なら実用になります。
  ここでは実測していないので、手元の会議で一度試してから決めてください。
- **別のマシンに投げる。** LLM は HTTP 越しに呼ぶだけなので、同じ PC である必要はありません。
  GPU のある機器の Ollama や vLLM、あるいは Anthropic / OpenAI を指定できます（→ [設定のカスタマイズ](guide.md#設定のカスタマイズ)）。
  外に出す場合、**文字起こし済みのテキスト**がその接続先に送られます。既定では送りません。

どちらの場合も**音声は出ません**。送られるのは文字起こしだけで、しかも指定した接続先だけです。

GPU 加速の無い環境では、**会議中は録音だけを行い、終了時に全体を一度で文字起こしします**。
追いつけないまま遅れ続けるより確実で、失われるのは**会議中に文字が見えること**だけです。
議事録生成・話者分離・検索はそのまま使えます。

ただし**モデルは同じでも重みは同じではありません。** faster-whisper は CTranslate2 の重み、
whisper.cpp は GGML 量子化された重みを使うため、出力は一致しません。実際の 12 分の日本語会議で
区切りを固定して測ったところ、同じ `large-v3-turbo` でも **文字単位で 13.8% 相違**しました。

**ただしこの数字を「品質差」として読まないでください。**同じ音声を同じエンジンで 2 回流すだけでも
**15.4% 相違**します（文字単位。単語単位では 20.3%）。文字起こしはそもそも再現しないためで、
13.8% はその**ノイズフロアより小さい**のです。対照を取り直すまでは、両エンジンの優劣を示す数値
としては使えません（測定方法は
[design-decisions.md](../design-decisions.md#transcription-is-not-reproducible-and-the-cause-is-the-temperature-fallback)
にあります）。速度に自信のある機器なら `STT_LIVE_TRANSCRIPTION=1` でリアルタイム動作を強制できます。

> **AMD / Intel GPU は加速に使われません。** whisper.cpp 本体は Vulkan に対応していますが、
> 配布されている pywhispercpp の Linux / Windows 向けパッケージは CPU ビルドのため、
> これらの環境は CPU のみの機器とまったく同じ速度になります。
> 16 コアの x86 CPU で実際の日本語会議を測ったところ、既定の `large-v3-turbo` は
> **音声の長さの 2.8 倍**かかりました。これがリアルタイム処理をやめている理由です —
> 1 時間の会議で停止を押した時点で約 39 分ぶんが未処理として残り、追いつくのにさらに
> 1 時間半かかる計算になります。スレッド数を増やしても改善しません（メモリ帯域が上限のため）。
>
> **Docker の中では Metal を使えません**（Docker Desktop は GPU を透過しない Linux VM の上で
> 動くため）。したがって同じ Mac でも、ネイティブ導入ならリアルタイム、Docker なら会議終了時、
> と結果が変わります。Docker のほうが導入は圧倒的に簡単なので、そこが交換条件です。
>
> なお **議事録生成には Radeon を使えます** — Ollama に ROCm 版があり、別サービスとして
> 動くためです。CPU に留まるのは文字起こしと話者分離だけです。Mac も同様で、Ollama を
> ネイティブに動かせば Metal が効きます（設定 → LLM で `http://host.docker.internal:11434`）。

> **VRAM 8GB でも動く工夫**
> 文字起こし用のWhisperと議事録用のLLMは同時にVRAMへ載りません。そこで
> **「会議中はWhisper、会議が終わったらLLM」と時間で切り替える**設計にしています。
> そのため8GBでも問題なく動作します。

### ソフトウェア

**導入方法によって、事前に用意するものは変わります。** 下の表の一番左を選ぶなら、
このリストは読み飛ばして構いません。

| | 4-A. Docker | 4-B. `voxinq` | 4-C. ネイティブ |
| --- | --- | --- | --- |
| [Node.js](https://nodejs.org) 20 以上 | 不要（イメージに同梱） | パッケージマネージャが入れます | **自分で用意** |
| [Python](https://www.python.org) 3.11 | 不要（イメージに同梱） | パッケージマネージャが入れます | **自分で用意** |
| [PostgreSQL](https://www.postgresql.org) 17 | 不要（コンテナで同梱） | 不要（**同梱**） | **自分で用意** |
| [Ollama](https://ollama.com) | 不要（コンテナで同梱） | **自分で用意** | **自分で用意** |
| そのかわり必要なもの | Docker Desktop | Homebrew か Scoop | — |

Ollama は「議事録を生成する LLM」です。4-B と 4-C では別途用意してください
（`scoop install ollama` など）。クラウドのモデル（Anthropic / OpenAI）を使う場合は
Ollama 自体が不要になります。

## インストール手順

### あなたの環境でのおすすめ

⭐ がおすすめの入れ方です。

| 環境 | おすすめ | ほかの方法 | 文字が出るタイミング |
| --- | --- | --- | --- |
| **Windows + NVIDIA GPU** | ⭐ **[4-A. Docker](#4-a-docker-で入れる推奨)**（GPU 版） | 4-B（Scoop）・4-C | 話しながら |
| **Linux + NVIDIA GPU** | ⭐ **[4-A. Docker](#4-a-docker-で入れる推奨)**（GPU 版） | 4-C | 話しながら |
| **Mac（Apple Silicon）** | ⭐ **[4-B. `voxinq`](#4-b-voxinq-コマンドで入れるdocker-を使わない)**（Homebrew）。Docker からは Mac の GPU が使えないため | 4-A（CPU 版） | 話しながら（Docker なら会議終了時） |
| **NVIDIA GPU なし**（CPU のみ・AMD / Intel GPU・Intel Mac） | ⭐ **[4-A. Docker](#4-a-docker-で入れる推奨)**（CPU 版） | 4-B（Scoop / Homebrew） | 会議終了時 |
| **コードを触りたい** | [4-C. ネイティブ](#4-c-ネイティブで入れるスクリプト) | — | 機材しだい |

Mac の 2 通りは、まだ実機の Mac で動かしていません（[動作確認の状況](../setup.md#what-has-actually-been-run)）。

### 3 つの導入方法の違い

導入方法は 3 つあります。

| | 4-A. Docker | 4-B. `voxinq` | 4-C. ネイティブ |
| --- | --- | --- | --- |
| 事前に入れるもの | Docker Desktop だけ | パッケージマネージャだけ | Node / Python / PostgreSQL / Ollama |
| PostgreSQL | コンテナで同梱 | **同梱** | 自分で用意 |
| 初回ダウンロード | 約 7.5GB（展開後 21GB／GPU 無しなら 0.5GB・展開後 1.8GB） | 数 GB（モデル分） | 数 GB（モデル分） |
| 向いている人 | **とにかく動かしたい人** | Docker を入れたくない人 | コードを触りたい人 |

迷ったら **4-A の Docker** を選んでください。コマンド操作に慣れていない場合は、
4-A の中の[「コマンドを使わずに入れる」](#コマンドを使わずに入れるwindows--docker-desktop)を見てください。Mac で GPU 加速（Metal）を使いたい場合だけは、
Docker の中から GPU が見えないため **4-B** が必要です。

### 4-A. Docker で入れる（推奨）

**前提**: Docker Desktop。NVIDIA GPU を使う場合はドライバも必要です（WSL2 バックエンドなら
GPU 対応は組み込み済み）。GPU が無くても同じ手順で入ります — 最後の起動コマンドだけが変わります。

イメージは公開済みなので、**リポジトリの取得は不要**です。ファイル 2 つだけで入ります。

```bash
mkdir voxinq && cd voxinq
curl -O https://raw.githubusercontent.com/ikasast/voxinq-meeting/release/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/ikasast/voxinq-meeting/release/.env.example
```

#### `.env` に何を書くか

ダウンロードした `.env` は、ほとんどの項目がコメントアウトされた状態です。**必須は 2 つだけ**で、
残りは「その機能を使いたくなったとき」に足せば十分です。上から順に見ていってください。

| 項目 | 必要？ | 何を書くか |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | **必須** | 自分で決めます。これから作るデータベースコンテナ用のパスワードなので、既存の何かと一致させる必要はありません |
| `DATABASE_URL` | **必須** | `postgresql://voxinq:上と同じパスワード@db:5432/voxinq` |
| `TZ` | **UTC 以外の地域なら必須** | 自分のタイムゾーン（例 `Asia/Tokyo`）。コンテナは時刻帯を持たないので、未設定だと会議一覧・タイトル下の日時・印刷・エクスポートが UTC で表示され、ブラウザ側で描画される文字起こしの時刻とずれます。保存されるデータは正しいので、後から設定しても既存の会議ごと直ります |
| `HF_TOKEN` | NVIDIA GPU 搭載機で話者分離を使うなら | Hugging Face の無料トークン。**後回しで構いません** — 話者を区別する機能以外はこれ無しで動きます。GPU が無い環境では不要です。→ [取得手順](#hf_token-の取り方nvidia-gpu-での話者分離に必要) |
| `STT_WS_URL` | スマホで録音するなら | スマホのブラウザから文字起こしサービスに届くアドレス（例 `wss://myhost.tailnet.ts.net:8443/ws`）→ [スマホから使う](#スマホから使うtailscale) |
| `APP_PASSWORD` + `APP_SESSION_SECRET` | 外部に公開するなら | ログインパスワードと、長いランダム文字列。自分のPCの中だけで使う間は不要です |
| `WEB_PORT` `STT_PORT` `DB_PORT` `OLLAMA_PORT` | ぶつかったときだけ | ポートが使用中だと起動に失敗します。その場合だけ変更（例 `DB_PORT="127.0.0.1:5433"`） |
| `OLLAMA_PROFILE` | 既に Ollama がある場合 | 何か書けば同梱の Ollama を起動しません（例 `external`）。値は Compose の profile 名として使われるだけなので、`off` でも `yes` でも結果は同じです。未設定なら起動します → [自分の環境に合わせる](#自分の環境に合わせる) |
| `VOXINQ_VERSION` | ほぼ不要 | バージョンを固定したいとき（例 `v3.8.5`）。**未指定なら最新の安定版**（`latest`）を追いかけます。プレリリース版は `latest` に含まれないため、beta や rc を使うにはここで指定します。`v1.5.0` は 1.x 系最後の版で、そこに留まりたい場合に指定します（1.x は NVIDIA GPU が必須です） |
| `NEXT_PUBLIC_STT_WS_URL` | **Docker では無視** | ネイティブ導入専用の項目です |

> **「安定版」は別に用意されているものではありません。**最新の正式リリースがそのまま安定版です
> — GitHub で *Latest* が付いているもの、`latest` イメージが指すもの、`release` ブランチが
> 指すもの、この3つが同じコミットを指します。`stable` のような別のタグは作っていません。
> ポインタが増えれば、それだけ更新し忘れる場所が増えるためです。
>
> **`v3.8.2` から 3.x が正式版です**（`latest` も 3.x を指します）。2.x から `latest` で使っている場合は、
> 次の `docker compose pull` で 3.x に上がります。**上げる前に必ずバックアップを取ってください**
> （設定 → データ → エクスポート、または `pg_dump`）。途中のマイグレーション1つが既存のシリーズに
> 持ち主を付けるため、**上げた後に 2.x へ戻すことはできません**。`.env` の変更は不要で、
> マイグレーションは起動時に自動で走ります。アカウントは作るまで何も変わりません（従来どおり
> 共有パスワード1つ、または無し）。2.x に留まるなら `VOXINQ_VERSION="v2.3.2"` を指定してください。

> ⚠️ `@db:5432` の `db` は**コンテナのサービス名**です。ここを `localhost` にすると、
> Web コンテナが自分自身を見に行ってしまい接続できません。

文字起こしモデル・用語集・議事録の書式・LLM の選択などは `.env` ではなく、
**アプリの「設定」画面**で設定します。

#### 自分の環境に合わせる

**起動の前に 2 つだけ決めてください。** どちらもダウンロードされるものが変わります。初回は
7.5GB ほど落としてくるので、後から気づくと引き直しになります。

**この PC に NVIDIA GPU はありますか。** 無ければ CPU 版イメージを使います。マルチ
アーキテクチャなので Apple Silicon でも動き、CUDA 関連を含まないためサイズも
展開後 21GB → **約 1.8GB**（ダウンロードは 7.5GB → 0.5GB）です。下の起動コマンドで override を足すか、`docker-compose.yml` を
自分で 2 箇所直しても構いません（イメージ名に `-cpu`、`deploy:` ブロックを削除）。
何が変わるかは [GPU の種類による違い](#gpu-の種類による違い) にあります。

```bash
curl -O https://raw.githubusercontent.com/ikasast/voxinq-meeting/release/docker-compose.cpu.yml
```

**この PC で既に Ollama を動かしていますか。** 動かしているなら、コンテナ版は同じプログラムの
2 つ目で、同じモデルをもう一度ダウンロードすることになります（7B で数 GB、大きいものなら
数十 GB）。`.env` に `OLLAMA_PROFILE=external` と書くか、`docker-compose.yml` から `ollama`
サービスを削除してください。起動後に **設定 → LLM → Ollama base URL** を
`http://host.docker.internal:11434` にします。

> ホスト側の Ollama が `OLLAMA_HOST=0.0.0.0` で待ち受けている必要があります。既定は
> `127.0.0.1` だけで、それはコンテナから見ると「コンテナ自身」を指すため届きません。

#### 起動する

```bash
docker compose up -d                                                    # NVIDIA GPU
docker compose -f docker-compose.yml -f docker-compose.cpu.yml up -d    # それ以外
```

どちらか一方を実行したら、議事録用のモデルを取得します（コンテナ版の Ollama を使う場合のみ）。

```bash
docker compose exec ollama ollama pull qwen3:8b
```

このコマンドは省略して、**「設定」→「LLM」のモデル欄から管理者がダウンロード**することもできます。

`http://localhost:3000` を開けば使えます。

#### コマンドを使わずに入れる（Windows / Docker Desktop）

上の手順は端末（PowerShell）を前提にしていますが、Windows ではほぼマウスだけで導入できます。
**コマンドを打つのは 1 回だけ**で、それ以降は Docker Desktop のボタンで動かせます。

1. **[Docker Desktop](https://www.docker.com/products/docker-desktop/) を入れて**、再起動を
   求められたら再起動します。NVIDIA GPU の機器では、既定で提案される **WSL2 バックエンドの
   まま**にしてください。GPU 対応がそこに組み込まれています。

2. **フォルダを 1 つ作ります。** エクスプローラーで右クリック →「新規作成」→「フォルダー」。
   `C:\voxinq` などで構いません。ホスト側に置くものは、このフォルダの中だけです。

3. **ブラウザで 2 つのファイルを保存します。** それぞれ開いて Ctrl+S:

   - [`docker-compose.yml`](https://raw.githubusercontent.com/ikasast/voxinq-meeting/release/docker-compose.yml)
   - [`.env.example`](https://raw.githubusercontent.com/ikasast/voxinq-meeting/release/.env.example)
     — 保存ダイアログで**ファイルの種類を「すべてのファイル」**にして、名前を拡張子なしの
     `.env` にします。

   > Windows はドットで始まるファイル名を嫌がります。`.env` で保存できない場合は、いったん
   > `env.txt` で保存し、あとから **`.env.`** に名前変更してください。末尾のドットは
   > Windows が落とすので、結果として `.env` になります。

4. **中身を書きます。** `.env` を右クリック →「プログラムから開く」→「メモ帳」。ほとんどの行は
   `#` でコメントアウトされたままで構いません。何を書くかは次の表のとおりです。
   **メモ帳で保存するときはファイル名を `".env"` と引用符で囲んでください** — そうしないと
   `.env.txt` として保存されます。

5. **起動します。** Docker Desktop を開き、下部の `>_` ボタンで内蔵ターミナルを出すか、
   フォルダで PowerShell を開きます。打つのはこれだけです。

   ```powershell
   cd C:\voxinq
   docker compose up -d
   ```

   初回は約 7.5GB（展開後 21GB）のダウンロードがあり、時間がかかります。**NVIDIA GPU が無い場合**は
   [`docker-compose.cpu.yml`](https://raw.githubusercontent.com/ikasast/voxinq-meeting/release/docker-compose.cpu.yml)
   も同じフォルダに保存し、上の「[自分の環境に合わせる](#自分の環境に合わせる)」と同じ差し替えを
   行ってください。

6. **議事録用のモデルを入れます。** Docker Desktop の **Containers** で `voxinq` プロジェクトを
   開き、`ollama` のコンテナを選んで **Exec** タブで次を実行します。

   ```
   ollama pull qwen3:8b
   ```

7. **開きます。** 同じ **Containers** の `web` の行に `3000:3000` がリンクとして出ているので
   クリックするか、`http://localhost:3000` を開いてください。

**以降はコマンドを使う場面がありません。** Containers 画面のボタンで全体の起動・停止ができ、
各サービスのログもタブで見られます。再起動後も自動で立ち上がります（停止するまで再起動し続ける
設定になっています）。更新は **Images** 画面でプルし直してから、また起動するだけです。

#### インストール直後、どこまで動くか

「設定し忘れ」を「壊れている」と誤解しないための一覧です。

| やること | すぐ使える？ |
| --- | --- |
| 録音・文字起こし | ✅（NVIDIA GPU / Apple Silicon なら会議中に、それ以外は終了時に） |
| 録音の再生、発言の編集 | ✅ |
| 議事録の生成 | ✅（`ollama pull` の完了後）。GPU が無いと 1 本 15 分前後かかります → [議事録の生成はどうなるか](#議事録の生成はどうなるか) |
| **スマホから**録音 | `STT_WS_URL` が必要（スマホから `localhost` には届かないため） |
| **話者を区別する**（話者分離） | NVIDIA GPU 搭載機なら `HF_TOKEN` が必要 → 次項。GPU 無しならそのまま動きます |
| 声紋登録（話者の自動命名） | 同上（話者分離と同じモデルを使います） |

#### 話者分離のエンジンは 2 種類あり、機器で自動的に選ばれます

| 環境 | エンジン | 準備 |
| --- | --- | --- |
| NVIDIA GPU あり | pyannote | `HF_TOKEN` が必要 → 次項 |
| それ以外（Mac / AMD・Intel GPU / CPU のみ） | sherpa-onnx | **不要**（モデルはイメージに同梱） |

pyannote のほうが長い会議での精度が明確に高いため、動く環境ではこちらが選ばれます。ただし GPU が
無いと会議とほぼ同じ時間がかかるため、その場合は実時間の約 5 倍速で動く sherpa-onnx になります。

`.env` で `DIA_BACKEND="pyannote"` / `DIA_BACKEND="sherpa"` と書けば固定できます。動かせない方を
指定した場合は、黙って切り替えずエラーになります。

#### `HF_TOKEN` の取り方（NVIDIA GPU での話者分離に必要）

pyannote は無料ですが **利用規約への同意が必要**なモデルで、同意していないとダウンロードできません。

Voxinq の他の機能はこれを使わないので、**インストール直後は問題なく動き、初めて「話者分離」を
押したときに初めて失敗します**。モデルが同意待ちだと知らないと、何が起きたのか分からない場面です。

一度だけ、数分の作業です。

1. [huggingface.co](https://huggingface.co/join) で無料アカウントを作る（すでにあれば不要）
2. 次の **3 つすべて**のページで利用規約に同意する（別々のモデルで、3 つとも読み込まれます）。
   用途を書くフォームが出ますが、その場で承認されます。
   - [`pyannote/speaker-diarization-community-1`](https://huggingface.co/pyannote/speaker-diarization-community-1)
   - [`pyannote/speaker-diarization-3.1`](https://huggingface.co/pyannote/speaker-diarization-3.1)
   - [`pyannote/segmentation-3.0`](https://huggingface.co/pyannote/segmentation-3.0)
3. [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) で
   **New token → 種別「Read」** を選んでトークンを作る。**表示は一度きり**なのでコピーしておく
4. `.env` に書いて、文字起こしサービスを再起動する

   ```
   HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   ```

   ```bash
   docker compose up -d stt
   ```

初回の話者分離だけ、モデル（数百MB）のダウンロードが入るため時間がかかります。

> 「規約に同意したがトークンを作っていない」「トークンは作ったが規約に同意していない」は
> どちらも同じエラーになります。**同意したアカウントとトークンのアカウントが同じか**も確認してください。

#### 更新のしかた

データはボリュームに残るので消えません。

```bash
docker compose pull && docker compose up -d
```

**これで更新されるのはイメージだけです。** `docker-compose.yml` には触れません。**つまり自由に
編集して構いません** — 不要なサービスを消す、ポートを変える、GPU 予約を外す。何かに上書きされる
ことはありません。

同じことの裏返しとして、リリースで compose ファイルに変更が入っても自動では届きません。
リリースノートが compose ファイルに触れていたら、現行版との差分を見て必要なものだけ取り込んで
ください。

```bash
curl -s https://raw.githubusercontent.com/ikasast/voxinq-meeting/release/docker-compose.yml | diff docker-compose.yml -
```

やらなくても壊れません。古い compose ファイルはそのまま動き、新しい選択肢が無いだけです。

### 4-B. `voxinq` コマンドで入れる（Docker を使わない）

**PostgreSQL の準備が要りません** — 同梱されます。ネイティブ導入で一番の難所がなくなる形です。

```bash
brew install ikasast/voxinq/voxinq                                # macOS / Linux
scoop bucket add voxinq https://github.com/ikasast/scoop-voxinq   # Windows
scoop install voxinq

voxinq setup          # 依存・ビルド・音声モデル（数分かかります）
voxinq start          # 起動してブラウザが開きます
voxinq autostart on   # ログイン時に自動起動
```

Node と Python はパッケージマネージャが用意します。議事録生成用の LLM は別途必要です
（`scoop install ollama` など、またはクラウドモデル）。

データは**インストール先の外**（Windows は `%LOCALAPPDATA%\voxinq`、macOS は
`~/Library/Application Support/voxinq`）に置かれるため、更新や削除で消えることはありません。

> **Scoop 経路は実機で検証済み**です。**Homebrew は formula を用意しただけで未検証**です
> （検証できる Mac が無いため）。試された結果を Issue でいただけると助かります。

クローンから使う場合は `cd cli && npm install && npm link` で同じ `voxinq` コマンドが入ります。

### 4-C. ネイティブで入れる（スクリプト）

#### ステップ1: リポジトリを取得

```bash
git clone https://github.com/ikasast/voxinq-meeting.git
cd voxinq-meeting
```

#### ステップ2: セットアップスクリプトを実行

必要なものを自動で判定してインストールします。**何度実行しても安全**です。

```powershell
# Windows の場合
.\scripts\setup.ps1
```

```bash
# Linux / macOS の場合
./scripts/setup.sh
```

このスクリプトは次のことを順番に行います。

1. 必要なソフトが入っているかチェック（不足していれば教えてくれます）
2. `npm install` で依存パッケージを導入
3. `.env` を作成し、**PostgreSQLの接続情報を対話形式で質問**します
4. データベースのテーブルを作成
5. 文字起こしサービス用のPython環境を構築
6. 議事録用のAIモデル（`qwen3:8b`）をダウンロード

> **最初に入るAIモデルについて**
> `qwen3:8b` は「**VRAM 8GB に収まり、日本語の議事録が実用になる**」ことを基準に選んだ初期設定です。
> GPUに余裕があれば、[もっと高性能なAIを使いたい場合](guide.md#もっと高性能なaiを使いたい場合) を参考に
> あとから差し替えられます（**設定 → LLM** のモデル欄から、画面上でダウンロードできます）。

> **話者分離（誰が話したかの判別）も使う場合**
> `--diarization`（Windowsは `-Diarization`）を付けて実行してください。
> ```powershell
> .\scripts\setup.ps1 -Diarization
> ```
> 加えて、Hugging Face で以下のモデルの利用規約に同意し、`HF_TOKEN` を設定する必要があります。
> - [pyannote/speaker-diarization-community-1](https://huggingface.co/pyannote/speaker-diarization-community-1)
>
> 旧パイプラインを使う場合は `DIA_MODEL=pyannote/speaker-diarization-3.1` を設定し、
> [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0) にも同意してください。

#### ステップ3: 起動

```powershell
# Windows の場合
.\scripts\start.ps1
```

```bash
# Linux / macOS の場合
./scripts/start.sh
```

ブラウザで `http://localhost:3000` を開けば準備完了です。

> ⚠️ **開発モード（`npm run dev`）で常用しないでください**
> 他の端末（スマホなど）からアクセスした際に画面が反応しなくなります。
> `scripts/start` は自動的に本番ビルドで起動するので、通常はこれを使ってください。

#### PCの起動時に自動で立ち上げたい場合

**Docker なら何もしなくて大丈夫です。**`restart: unless-stopped` が付いているので、PC の起動と
ともに戻ってきます。

**`voxinq` ランチャー**を使っている場合は、次の 1 行です。Windows はタスクスケジューラ、macOS は
launchd、Linux は systemd のユーザーサービスと、**OS が元々持っている仕組み**にそのまま登録します
（`voxinq autostart off` で解除、`status` で確認できます）。

```bash
voxinq autostart on
```

> ソースを直接動かす導入（C）は**コードを触るための方法**なので、`scripts/start` で前面に起動します。
> 常駐させたいときは Docker かランチャーを使ってください。以前は `scripts\windows\` に
> タスクスケジューラ登録用のスクリプトがありましたが、ランチャーが 3 つの OS で同じことを
> するので整理しました。

バックアップは **設定 → データ → エクスポート**（会議・録音・設定をまとめた暗号化ファイル）が
基本です。詳しい手順は [docs/setup.md](../setup.md)（英語）にあります。

## スマホから使う（Tailscale）

外出先や会議室から使うには、[Tailscale](https://tailscale.com) を使うのが**いちばん簡単**です。
（無料で使えるVPNのようなサービスで、自分の端末同士を安全につなぎます）

**手順1**: PC とスマホの両方に Tailscale を入れ、同じアカウントでログイン（PC 側は `tailscale up`）。

**手順2**: **自分のアドレスを調べます。** これが分からないと次に進めません。
アドレスは `<ホスト名>.<テイルネット名>.ts.net` という形です。

```bash
tailscale status
```

最初の行が自分の PC で、そこにホスト名が出ます。テイルネット名は
[管理コンソール](https://login.tailscale.com/admin/machines)の上部に表示されています
（`tail1a2b3c.ts.net` のような文字列）。合わせると `myhost.tail1a2b3c.ts.net` になります。
管理コンソールで機器名にカーソルを合わせると、完全な名前をコピーできます。

**手順3**: 管理コンソールの [DNS](https://login.tailscale.com/admin/dns) で
**MagicDNS** と **HTTPS Certificates** を有効化します。これが無いと次のコマンドが
証明書を取得できません。

**手順4**: 2 つのポートを公開します。

```bash
tailscale serve --bg --https=443 localhost:3000      # Webアプリ
tailscale serve --bg --https=8443 localhost:8000     # 文字起こしサービス
```

`tailscale serve status` で、意図どおり転送されているか確認できます。

**手順5**: 文字起こしサービスのアドレスをアプリに教えます。**導入方法によって変数が違います。**

| 導入方法 | 設定する変数 | 反映方法 |
| --- | --- | --- |
| **Docker** | `STT_WS_URL="wss://<ホスト名>.<テイルネット名>.ts.net:8443/ws"` | `docker compose up -d`（**再ビルド不要**。実行時に読まれます） |
| **ネイティブ** | `NEXT_PUBLIC_STT_WS_URL="wss://<ホスト名>.<テイルネット名>.ts.net:8443/ws"` | **`npm run build` で再ビルドが必要**（ビルド時に埋め込まれるため） |

#### アプリとして追加する（PWA）

ヘッダー右上の**下向き矢印のアイコン**（⤓ のような形。文字は出ません）を押すと、その端末に
**ブラウザのバーが無い専用ウィンドウ**として追加できます。iOS の Safari では同じアイコンから
「ホーム画面に追加」の手順が出ます。**すでに追加済みの端末と、対応していないブラウザでは
アイコン自体が出ません。**Dock / タスクバー / ホーム画面に
アイコンが並び、Alt+Tab にも独立して現れます。

**追加されるのは「見る側・操作する側」だけです。** サーバーが増えるわけではなく、中身は同じ
ページで、同じ PC に接続します。機能は何も変わりません。

| 追加する端末 | 効果 |
| --- | --- |
| サーバー機そのもの | ブラウザのタブに埋もれなくなる程度 |
| **スマホ** | **ここが本命**。1 タップで録音画面、画面が広く、誤操作で前のページに戻りにくい |
| 別の PC | 閲覧・議事録確認用の独立ウィンドウ |

> **追加したときの URL がそのアプリの入口として固定されます。** スマホで使うなら、必ず
> `https://<ホスト名>.<テイルネット名>.ts.net/` を開いた状態で追加してください。`localhost` から
> 追加すると、そのスマホでは何も表示できないアプリになります。
>
> オフラインでは動きません（意図的にキャッシュしない設計です）。サーバー機が止まっていれば、
> ブラウザで開いたときと同じくエラーになります。

> 🔒 **セキュリティに関する注意**
> 文字起こしサービス（8443ポート）は、**Tailscaleの外（Funnel等でインターネット公開）に出さないでください。**
> このサービスには認証がなく、tailnet内での利用を前提としています。

#### Android アプリ（画面を消しても録音が続く）

PWA はブラウザの中で動くので、**画面を消すとマイクが止まる機種があります**（録音画面の休止画面はその
回避策です）。Android では専用アプリでこの制約がなくなります。画面は同じページで、録音だけを
アプリが引き受けます。

- **画面を消しても、他のアプリに切り替えても録音が続きます。**通知に経過時間と「停止して終了」が出ます
- **通信が切れても失いません。**音声はいったん端末に書いてから送るので、20 分途切れても
  つながったときに送られます。アプリが強制終了されても、次に開いたときに送り直します
- **予約した会議の時刻に通知**します（何も開いていなくても）。通知の「録音」から録音が始まります
- **他のアプリから録音ファイルを共有**して会議にできます（→ [既存の録音ファイルから議事録を作る](guide.md#既存の録音ファイルから議事録を作る)）

**入れ方**

1. [Releases](https://github.com/ikasast/voxinq-meeting/releases) の v3.8.0 以降から `voxinq-<版>.apk` を
   スマホで開き、インストールします（「不明なアプリのインストール」の許可を求められます）
2. 初回起動でサーバーのアドレスを入力します。PWA と同じ
   `https://<ホスト名>.<テイルネット名>.ts.net` です（**https のみ**。`http://` の LAN アドレスは使えません）
3. 通知の許可を求められたら許可します（予約の通知に必要です）

- **サーバーは 3.8.0 以上にしてください。**録音だけなら 3.7.0 から使えますが、予約の通知と
  共有取り込みには 3.8.0 が必要です
- **更新**は新しい APK を上から入れるだけです（サーバーのアドレスや未送信の音声は残ります）。
  [Obtainium](https://github.com/ImranR98/Obtainium) にこのリポジトリの Releases を登録しておくと、新版を
  知らせてくれます。Play ストアの外なので
  **完全な自動更新はできず**、最後の 1 タップは必要です
- 以前に**開発版（debug ビルド）**を入れていた場合は、一度アンインストールしてから入れてください
  （署名が違うため上書きできません）
- 通話の音声は、アプリでも録れません（[FAQ](troubleshooting.md#よくある質問faq)）

詳しい説明は [android/README.md](../../android/README.md)（英語）にあります。

## ファイルで設定するもの（`.env`）

変更したら**再起動（または再ビルド）が必要**です。

| 項目 | 内容 |
| --- | --- |
| `DATABASE_URL` | PostgreSQLの接続先 |
| `NEXT_PUBLIC_STT_WS_URL` | 文字起こしサービスのアドレス（**変更時は再ビルド必須**） |
| `APP_PASSWORD` | パスワード認証（未設定なら認証なし）。設定時、tailnet外（Funnel/公開URL）からのアクセスは**閲覧・DL専用**になる。**アカウントを1つでも作ると入口ではなくなる** |
| `VOXINQ_SIGNUP` | `open`（既定）＝ tailnet の未知の ID は初回アクセスでアカウントになる。`closed` ＝ 管理者が作ったアカウントだけ。**最初の1つはどちらでも作れます**（でなければ管理者がいないサーバーができてしまうため） |
| `VOXINQ_KEY_SECRET` | 開いている鍵を包む秘密。**これがあると DB やバックアップだけを盗まれても開いた鍵は読めません。** バックアップには含めないこと。変えても失うものはありません（次のログインで開き直します） |

詳細は [docs/configuration.md](../configuration.md)（英語）を参照してください。
