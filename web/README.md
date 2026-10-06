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

### 個人APIキー方式（初期状態）

- 写真3枚・性別を選択し、Googleへの送信と娯楽の鑑定への同意後に鑑定します。
- 利用者自身のGemini APIキーをブラウザのメモリ内のみで使用。Googleに直接HTTPS送信し、運営者サーバーを経由しません。
- APIキー、写真、結果をlocalStorage、Cookie、IndexedDBへ保存しません。「データを消去」かページを閉じるとアプリのメモリからも消去できます。
- 写真は送信前にブラウザ内で最大1280pxのJPEGへ縮小。JPEG / PNG / WebP、20MB・2400万画素以下に対応し、位置情報などのメタデータを除去します。HEICはJPEGへ事前変換してください。
- サンプル鑑定は明示した固定コンテンツで、写真の分析やAPI通信を行いません。
- Google側の無料枠・料金・写真の利用と保存は[Gemini APIの規約](https://ai.google.dev/gemini-api/terms)と契約プランに従います。
- Instagram内ブラウザで写真選択やコピーが使えない場合は、Safari / Chromeで開いてください。

## Vercel

1. [Vercel](https://vercel.com/new)でGitHubの `kek46991-commits/jimmy-fortune-app` をImport。
2. **Root Directory: `web`**、Framework: Vite、Build: `npm run build`、Output: `dist`。
3. Web版の変更を含むブランチをデプロイ対象に指定します。通常運用ではPRをマージ後にmainをProduction Branchへ設定します。
4. 環境変数未設定なら、個人APIキーとサンプル鑑定で公開できます。
5. 発行されたProduction URLをInstagramなどで共有できます。独自ドメインはVercelのDomainsで設定します。

### 利用者のキー入力を不要にする一般公開モード

以下をVercelのProduction環境変数へ登録し、再デプロイします。Preview環境には独立したキー・利用枠を用意してください。`VITE_`を秘密キーへ付けないでください。

| 変数 | 用途 |
| --- | --- |
| `VITE_SHARED_MODE=true` | 共有モードのビルド時フラグ（公開してよい値のみ） |
| `GEMINI_API_KEY` | 運営者のGeminiキー。サーバー専用 |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstileの公開サイトキー |
| `TURNSTILE_SECRET_KEY` | Turnstileの秘密キー。サーバー専用 |
| `UPSTASH_REDIS_REST_URL` | HTTPSのUpstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Redisアクセス用の秘密トークン |
| `DAILY_READING_LIMIT=100` | サービス全体の24時間枠。既定100、許容1〜1000 |

設定例は `.env.example`。`.env.local`や実キーはGitへコミットしないでください。

- Cloudflare TurnstileのHostnameにVercelの公開ドメイン・独自ドメインを登録。ウィジェットのActionは `fortune` です。
- `/api/config` は公開サイトキーだけを返します。全サーバー設定が揃わない場合は503で停止します。
- `/api/fortune` は同一オリジン・同意・3枚の画像・性別を検証し、Turnstileをサーバー側でSiteverify（成功・Hostname・Action）確認します。トークンは単回利用です。
- Redisの原子的なLuaスクリプトでIPあたり5回/時間と全体の24時間枠を制限。IPはHMAC化し、元のIP、画像、キー、結果をRedisへ保存しません。識別子・回数は1時間/24時間で失効します。
- 認証またはRedisが失敗した場合は安全側に停止し、Geminiへ送信しません。
- サーバーでも画像の実形式・画素数を検証、再縮小・JPEG化・メタデータ除去します。写真や結果をディスク・ストレージへ保存する処理はありません。
- 共有キーはブラウザへ送らず、Googleのエラー本文も利用者へ返しません。写真・キー・結果をログに出力しません。
- 共有鑑定の最大処理時間は120秒。利用するVercelプランでこの時間設定が利用できることを確認してください。
- Google Cloudの請求アラート・API利用枠、Vercel/Upstash側の利用枠も必ず設定してください。アプリの制限だけで請求ゼロや不正利用の完全防止は保証できません。

設定後は本物のキーで正常鑑定、同意なし、Turnstile失敗、利用枠超過、タイムアウト、スマホの写真選択を確認してください。自動テストはモックであり、実Gemini・実Turnstile・実Redis接続の動作保証ではありません。

## Netlify・静的ホスティング

NetlifyではBase directoryを `web`、Buildを `npm run build`、Publishを `dist` に設定できます。`netlify.toml`を同梱しています。

**NetlifyおよびDevinの静的公開は、個人APIキー / サンプル専用です。** VercelのAPI Functionsは動きません。`VITE_SHARED_MODE=true`を設定しないでください。共有キーを使いたい場合はVercelを利用するか、認証・利用制限を備えたバックエンドを別途用意してください。

`npm run build`で生成した `dist` のみを公開し、リポジトリ全体・環境変数ファイル・写真をアップロードしないでください。

## フォントとライセンス

見出しには[Zen Old Mincho](https://github.com/google/fonts/tree/main/ofl/zenoldmincho)を使用。WOFF2へ圧縮してセルフホストし、外部フォントCDNへアクセスしません。SIL Open Font Licenseは `public/fonts/OFL.txt`。

## 検証状況

画像サイズ計算・Geminiリクエスト・安全なエラー・空/ブロック応答・同意・オリジン・CAPTCHA・利用回数制限・実画像のサーバー再検証を、秘密情報を使わない自動テストで検証します。ブラウザの操作検証、実Google通信、ホスティングの実接続は別途必要です。
