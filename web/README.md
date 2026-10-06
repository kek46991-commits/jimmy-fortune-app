# 星紡ぎ Web版の運用ガイド

React / TypeScript / Viteによるスマートフォン向けのAI手相・人相鑑定です。既存Python・Android版と独立してビルドできます。

## 起動・検証

Node.js 22以降を推奨（開発時は24）。このディレクトリで実行します。

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run dev` / `npm run preview` はフロントエンドとサンプルの表示用です。実鑑定にはHTTPSで公開されたNetlify FunctionsまたはVercel Functionsと、以下の運営設定が必要です。自動テストは外部通信をモックします。

## 利用者のAPIキー入力は不要

- 顔・右手・左手の写真3枚、性別、写真送信への同意を選び、「AI鑑定をはじめる」で鑑定します。
- ブラウザは同一オリジンの `/api/fortune` に送信し、サーバーだけが `process.env.GEMINI_API_KEY` でGeminiを呼び出します。個人キー入力や取得案内、Googleへの直接通信はありません。
- 運営キーをHTML / JavaScript / APIの応答へ含めません。写真・結果はlocalStorage、Cookie、IndexedDBへ保存しません。「データを消去」かページを閉じるとアプリのメモリから消去できます。
- 写真はブラウザで最大1280pxのJPEGへ縮小。JPEG / PNG / WebP、20MB・2400万画素以下に対応し、位置情報などのメタデータを除去します。HEICはJPEGへ事前変換してください。
- サーバーでも実形式・画素数を検証し、再縮小・JPEG化・メタデータ除去を行います。写真や結果をディスク・ストレージへ保存する処理はありません。
- サンプル鑑定は明示した固定コンテンツで、写真分析やAPI通信を行いません。
- 未設定・外部認証障害・利用枠超過時は実鑑定を停止します。サンプルを実鑑定結果として返すことはありません。
- Google側の料金・写真の利用と保存は[Gemini APIの規約](https://ai.google.dev/gemini-api/terms)と運営者の契約プランに従います。
- Instagram内ブラウザで写真選択やコピーが使えない場合は、Safari / Chromeで開いてください。

## 運営用の環境変数

以下をホスティングの **Production環境・Functions実行時** に登録して再デプロイしてください。Previewには独立したキーと利用枠を用意してください。`VITE_` を秘密キーへ付けないでください。ビルド時のモード切り替えフラグは不要です。

| 変数 | 用途 |
| --- | --- |
| `GEMINI_API_KEY` | 運営者のGeminiキー。サーバー専用 |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstileの公開サイトキー |
| `TURNSTILE_SECRET_KEY` | Turnstileの秘密キー。サーバー専用 |
| `UPSTASH_REDIS_REST_URL` | HTTPSのUpstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Redisアクセス用の秘密トークン |
| `DAILY_READING_LIMIT=100` | サービス全体の24時間枠。既定100、許容1〜1000 |

設定例は `.env.example`。実値を含む `.env.local` やキーはGitへコミットしないでください。

1. [Google AI Studio](https://aistudio.google.com/apikey)で運営用キーを発行し、Gemini APIの利用と必要な請求設定を確認します。この作業は運営者のみが行い、利用者には求めません。
2. [Cloudflare Turnstile](https://dash.cloudflare.com/)でManagedウィジェットを作成し、公開ドメインをHostnameに登録します。Actionは `fortune` です。公開サイトキーと秘密キーを登録します。
3. [Upstash](https://console.upstash.com/)でRedisを作成し、REST URLとREST tokenを登録します。
4. Google CloudのAPI利用枠・請求アラートと、ホスティング / Redis側の利用枠も設定してください。アプリの制限だけで請求ゼロや完全な不正利用防止は保証できません。

### 保護・API仕様

- `GET /api/config` はTurnstileの公開サイトキーのみを返します。全5設定が揃わない場合は503で停止し、秘密キーを返しません。
- `POST /api/fortune` はHTTPSの同一オリジン・同意・3枚の画像・性別・JSON形式・実際のボディサイズを検証します。最大ボディは3,100,000バイトです。
- Turnstileをサーバー側でSiteverify（成功・Hostname・Action）確認します。トークンは単回利用です。
- Redisの原子的なLuaスクリプトでIPあたり5回/時間と全体の24時間枠を制限します。IPはHMAC化し、元のIP、画像、キー、結果をRedisへ保存しません。識別子・回数は1時間/24時間で失効します。
- Netlifyではプラットフォームの `context.ip` を使い、利用者が送ったForwardedヘッダーは信用しません。Vercelではプラットフォームの `x-vercel-forwarded-for` を使います。
- 認証 / Redisが失敗した場合は安全側に停止し、Geminiへ送信しません。Googleのエラー本文・運営キーを利用者に返さず、写真・キー・結果をログへ出力しません。
- API応答は `Cache-Control: no-store`。Geminiへの送信ではURLにキーを含めず、`x-goog-api-key` ヘッダーを使います。
- サーバーの外部通信は全体で50秒のタイムアウト、画面は60秒でタイムアウトします。Netlifyの同期Functionsの60秒制限内でエラーを返します。

## Netlify（現在の公開先向け）

1. 匿名配置のサイトは最初にNetlifyアカウントへ引き取ります。GitHubリポジトリ `kek46991-commits/jimmy-fortune-app` を接続し、Web版の変更を含むブランチをデプロイ対象に指定します。mainへのマージは別途承認後に行ってください。
2. **Base directory: `web`**、Build: `npm run build`、Publish: `dist`。同梱の `web/netlify.toml` がFunctions directory `netlify/functions` を指定します。
3. Project configuration → Environment variablesで上記5設定をFunctionsのProduction環境に登録し、再デプロイします。
4. Functionsで `config` と `fortune` の公開を確認します。どちらもカスタムパス `/api/config`、`/api/fortune` で動きます。
5. Project visibilityをPublicにし、発行されたProduction URLを共有します。

CLIで既存サイトを更新する場合は、Netlifyへログイン済みの状態でこのディレクトリから実行します：

```bash
npx netlify-cli@27.11.2 link
npx netlify-cli@27.11.2 deploy --build --prod
```

静的な `dist` だけのドラッグ＆ドロップ / 匿名deployではFunctionsが動かず、実鑑定はできません。Functionsも一緒にデプロイすることが必須です。ネイティブ画像処理の `sharp` はesbuildの外部依存としてパッケージングします。リポジトリ全体・環境変数ファイル・写真を静的公開へアップロードしないでください。

## Vercel

1. [Vercel](https://vercel.com/new)で同じGitHubリポジトリをImport。
2. **Root Directory: `web`**、Framework: Vite、Build: `npm run build`、Output: `dist`。
3. Web版の変更を含むブランチをデプロイ対象に指定します。通常運用では承認後にPRをマージし、mainをProduction Branchに設定します。
4. 上記5設定をProduction環境変数へ登録し、再デプロイします。同梱の `vercel.json` がAPI Functionsを設定します。利用プランのFunctions実行時間を確認してください。
5. 発行されたProduction URLを共有します。独自ドメインはDomainsで設定します。

## 本番確認

設定後は本物のキーで正常鑑定、同意なし、Turnstile失敗、利用枠超過、タイムアウト、スマホの写真選択を確認してください。自動テストはモックであり、実Gemini / 実Turnstile / 実Redis接続や本番デプロイの動作保証ではありません。静的プレビューではサンプルだけが利用できます。

## フォントとライセンス

見出しには[Zen Old Mincho](https://github.com/google/fonts/tree/main/ofl/zenoldmincho)をWOFF2で同梱。ライセンスは `public/fonts/OFL.txt`。本文は端末の日本語システムフォントを使います。
