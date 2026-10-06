# ジミーのズバッと本音占い

顔写真・右手・左手の写真を Gemini 2.5 Flash に送り、関西弁の占い師「ジミー」が4項目で鑑定する KivyMD アプリです。占いは娯楽であり、性格・未来・健康などを写真で確定するものではありません。

## 構成

```text
main.py                 KivyMD画面、写真選択、非同期処理
gemini_fortune.py        画像検証・加工、Gemini呼び出し
buildozer.spec          Android設定（arm64 / Android 7以降）
requirements.txt        PC用の固定バージョン依存
assets/NotoSansJP.ttf   日本語フォント
assets/OFL.txt          フォントのSIL Open Font License
tests/                  APIをモックした自動テスト
```

## PCで実行

Python 3.11 / 3.12 を推奨します（開発時は Python 3.12 を使用）。

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python main.py
```

Windows は `.venv\Scripts\activate` で仮想環境を有効にします。

1. [Google AI Studio](https://aistudio.google.com/apikey)で自分の Gemini API キーを取得し、アプリの入力欄に入力します。PCでは起動前の `GEMINI_API_KEY` 環境変数も利用できます。キーをファイル・Git・APKに埋め込まないでください。
2. 性別を選び、顔・右手・左手の写真をそれぞれ選択します。プレビューで取り違えを確認してください。
3. Googleへの写真と性別の送信に同意し、鑑定ボタンを押します。通信中も画面は応答し、重複送信はできません。
4. 消去ボタンで写真コピー・キー・結果を消せます。写真コピーはアプリ終了時と次回起動時にも削除します。

JPEG・PNG・WebPが利用できます（HEICは先に変換してください）。1枚20MB・2400万画素以下。送信前にEXIFの回転を反映し、最大1600pxに縮小、位置情報等のメタデータを除去したJPEGに変換します。元の写真は変更しません。

## Androidビルド

Linux または WSL2 上でビルドします。Buildozerの[インストール手順](https://buildozer.readthedocs.io/en/latest/)と、[python-for-android](https://python-for-android.readthedocs.io/en/latest/quickstart.html)のホスト依存を先に整えてください。JDK 17、C/C++ツールチェーン、autoconf・automake・libtool・pkg-config・cmake、zip/unzip、libffi・OpenSSLの開発ヘッダー等が必要です。

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install buildozer==1.5.0 setuptools 'cython<=3.0.12'
buildozer -v android debug
# 実機をUSB接続（USBデバッグを有効化）
buildozer android deploy run
buildozer android logcat
```

最初のビルドではSDK・NDKのダウンロード、ライセンス確認、ネイティブコンパイルが行われます。APKは `bin/` に出力されます。PC用 `requirements.txt` をAndroidの依存として転記しないでください。

設定は API 36 / min API 24 / NDK 28c / arm64-v8a / python-for-android `v2026.05.09` に固定しています。公開時はアプリID `app.jimmyfortune.jimmyfortune` を自分の名前空間に変更してください。署名付きリリースは `buildozer android release` で AAB を作り、別途署名・Play Consoleの要件（プライバシーポリシー、Data safety、対象API等）を確認します。本プロジェクトの自動テストはAPKのビルド成功や実機動作を保証するものではありません。

### Android固有の設計

- Google公式Python SDKはPCで使用します。AndroidではSDKのネイティブ依存（pydantic-core等）のクロスコンパイルを避け、同じ公式 `generateContent` REST API を HTTPS で呼び出します。モデル・プロンプト・出力設定は共通です。
- 写真選択はAndroidの Storage Access Framework（`ACTION_OPEN_DOCUMENT`）を使用し、`content://` URI をアプリ専用領域へコピーします。Android 13以降も広範なストレージ権限は不要です。必要な権限は `INTERNET` のみです。
- APIキーは起動ごとに入力します。AndroidでPCの環境変数が自動で引き継がれることはありません。キーは保存しませんが、処理中はメモリに存在します。一般配布で開発者共通のキーを使用する場合、APKにキーを埋め込まず、認証・利用制限を備えたバックエンドからGeminiを呼び出す設計へ変更してください。
- OSによる強制終了時には写真コピーが残る可能性があり、次回起動で削除します。Androidのバックアップは無効です。
- Google側のデータ利用・保存・料金は[Gemini APIの規約](https://ai.google.dev/gemini-api/terms)およびAPIのプランに従います。第三者の写真を無断送信しないでください。

## 自動検証

実際の写真やAPIキーを使わず、SDK・REST通信をモックします。

```bash
python -m pip install -r requirements-dev.txt
ruff check .
ruff format --check .
mypy main.py gemini_fortune.py
python -m compileall -q main.py gemini_fortune.py
pytest -q
# GUIのないLinuxではKivyウィジェットのスモークテスト用にXvfbが必要
xvfb-run -a pytest -q
```

LinuxのXvfbでKivyウィンドウを作るためのOpenGL/SDLライブラリも必要です。実APIでの鑑定、Androidの写真選択、APKビルド・実機動作は別途確認してください。

日本語フォントは [Google Fonts / Noto Sans JP](https://github.com/google/fonts/tree/main/ofl/notosansjp) を同梱しています。再配布ライセンスは `assets/OFL.txt` を参照してください。
