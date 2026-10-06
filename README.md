# 星紡ぎ — AI手相・人相鑑定

顔写真・右手・左手の写真を Gemini 2.5 Flash に送り、親しみある関西弁で4項目の鑑定を届けます。スマートフォン対応のReact Web版と、Python / KivyMDのPC・Android版を収録しています。占いは娯楽であり、性格・未来・健康などを写真で確定するものではありません。

名称候補「星紡ぎ」「ルミナ」「宵の羅針盤」から、あなたの物語を紡ぐ「星紡ぎ」を採用しました。既存Android版も残しています。以前配布したAPKの表示名は旧名称のままです。

## Web版

夜空のダークグラデーション、星の光輪、手相の線画、日本語明朝体で構成したモバイル対応UIです。写真の選択・プレビュー・個別削除・同意・鑑定中の中止・結果のコピーと保存・リンク共有が利用できます。

```bash
cd web
npm ci
npm run dev
# 検証・本番ビルド
npm run lint
npm run typecheck
npm test
npm run build
```

Node.js 22以降を推奨します。Web版は運営者の `GEMINI_API_KEY` をサーバー側で使用し、利用者のキー入力は不要です。写真・結果はブラウザストレージへ保存しません。サンプルは固定の体験コンテンツで、写真送信やAI通信を行いません。

**NetlifyのBase directory / VercelのRoot Directoryを `web` に設定**し、Functionsと運営用の環境変数を登録して公開します。APIキーはブラウザに渡しません。設定不足や不正利用対策の障害時は実鑑定を停止し、サンプルのみ利用できます。運用設定・安全対策は [Web版の運用ガイド](web/README.md) を参照してください。

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

### APKビルドの検証（2026-10-06）

Ubuntu / Python 3.12 / JDK 17 / Buildozer 1.5.0 で、`jimmyfortune-1.0.0-arm64-v8a-debug.apk` の生成を確認しました。Android側のPythonは固定したpython-for-androidのレシピが提供する3.14.2です。

- APK署名、min API 24 / target API 36、`INTERNET`のみの権限、バックアップ無効を確認。
- 日本語フォント、KivyMD、PillowのWebP拡張、Requestsの同梱を確認。AndroidのWebP対応には `libwebp==1.6.0` が必要です。
- 文字コード判定ライブラリは純Pythonの `chardet==5.2.0` に固定し、ホストPC用のネイティブ拡張の混入を防いでいます。
- ZIPとネイティブライブラリの16KBアラインメントを確認。
- デバッグ署名の検証用APKです。Play Store公開用の署名・リリースではありません。
- 実機へのインストール・画面操作・実Gemini通信は未検証です。

ビルド環境ではFreeTypeの取得先がタイムアウトしたため[公式SourceForge配布](https://sourceforge.net/projects/freetype/files/freetype2/)を利用し、Maven CentralのHTTP 429には[Google提供のミラー](https://cloud.google.com/artifact-registry/docs/public-repositories/maven-central)を利用しました。依存バージョンやTLS検証は変更していません。

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
