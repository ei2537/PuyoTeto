# オンライン拡張・本番運用報告

更新日：2026-09-30 JST。元のゲーム実装を保存した `55eb7fd` 以降の変更を対象とします。

## 1. Completed Features

CPU・LOCAL 2P・キーボード・Gamepad・キー設定を維持。メール/パスワード認証、公開名と勝数、オンライン対戦、公開/非公開ルーム、大会、リーグ、履歴を実装しRenderに公開しています。メール確認は有効で、Brevo SMTPを設定済みです。実受信と確認リンクはユーザーによる最終検証待ちです。

ぷよのハードドロップを入力・CPU・ルール・ネットワークから除去。おじゃま落下と着地表現、盤面外の連鎖表示を追加。テトリスのHOLDは左、NEXTは右。既存コードにキャラクター選択画面は存在せず、削除していません。

## 2. Final Architecture

ブラウザはTypeScript/Canvas/Vite。ローカル対戦とサーバーが同じ `Battle`・Puyo/Tetrisルールを使用します。Socket.IOサーバーは60Hzで盤面を計算し、20Hzで状態を配信。クライアントは連番付き入力だけを送信し、盤面や勝敗を申告しません。

Supabase Authで接続JWTを検証。Postgres/RLSにプロフィール・結果・大会状態を保存。サービス専用RPCで試合終了・勝数・大会更新を同時に保存し、二重加算を防ぎます。プロセスepochにより古いデプロイの書き込みを拒否します。

Render Static Site＋単一Node Web Service、Supabase Auth/Postgres。ゲーム通信にSupabase Realtimeは使用しません。接続オリジン・入力スキーマ・連番・レートを検証し、30秒の再接続猶予を設けています。

## 3. Added Files

- `shared/protocol.ts`
- `server/Hub.ts`, `MatchRoom.ts`, `app.ts`, `competition.ts`, `index.ts`, `snapshot.ts`, `store.ts`, `.env.example`
- `src/online/Auth.ts`, `OnlineClient.ts`, `OnlineUI.ts`, `online.css`
- `src/ui/PlayerView.ts`
- `supabase/migrations/20260927100509_online_foundation.sql`
- `supabase/migrations/20260927210840_secure_server_lifecycle.sql`
- `tests/online.test.ts`, `database.test.ts`, `browser/online.spec.ts`
- `scripts/build-server.mjs`, `qa-users.mjs`
- `.env.example`, `render.yaml`, `.github/workflows/ci.yml`
- `docs/ONLINE.md`, この報告書

## 4. Modified Files

- `src/main.ts`, `style.css`, `games/puyo/PuyoGame.ts`, `PuyoCPU.ts`, `ui/Renderer.ts`
- `package.json`, `package-lock.json`, `tsconfig.json`, `playwright.config.ts`
- `tests/core.test.ts`, `puyo.test.ts`, `stress.test.ts`, `browser/game.spec.ts`
- `scripts/smoke-production.mjs`, `README.md`, `docs/QA.md`, `IMPLEMENTATION_PROGRESS.md`

今回の再開では公開環境設定・実URLでのQAを実施し、ゲーム実装は変更していません。CPU smokeに公開URL指定と任意の画像保存を追加し、文書を実際の公開状態へ更新しました。

## 5. Supabase State

PuyoTeto / `fmfaoxcxuaaeypzompyc` / Tokyo / Free / ACTIVE_HEALTHY。

- Auth：メール確認あり。セッション保存・更新・ログアウトを実装。Brevo SMTP有効、port 587。キーはユーザーがDashboardへ直接保存。
- Site URLと唯一の許可redirect：`https://puyoteto-online.onrender.com`。
- 公開テーブル：`profiles`, `friendships`, `competitions`, `competition_members`, `matches`。すべてRLS有効。
- プロフィール：Auth作成時に生成。英数字・_の3〜20文字、大小文字を区別しない一意名。本人は名前のみ変更可能。勝数はサーバーのみ更新。
- 試合・大会：ユーザーは許可された履歴のみ参照。保存RPCはservice_role限定。非公開コードをDB公開状態に含めない。
- フレンド基盤：本人間の申請・承認・削除ポリシーあり。招待UIは未実装。
- 上記2つのmigrationは実プロジェクトに適用済み。PGliteで権限・名前一意性・結果冪等性・epoch排除を自動検証。
- Security advisor：RLS指摘なし。漏洩パスワード保護未有効の警告1件。[対処手順](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)。有料プランへの変更は行っていません。

## 6. Render Static Site

| 項目              | 現在値                                     |
| ----------------- | ------------------------------------------ |
| Service           | puyoteto-online / srv-dast1abbc2fs73a81u3g |
| URL               | https://puyoteto-online.onrender.com       |
| Root Directory    | リポジトリルート（空欄）                   |
| Build Command     | npm ci --include=dev && npm run build      |
| Publish Directory | dist                                       |
| Branch / Node     | feat/online-multiplayer / 24.14.1          |
| Auto Deploy       | OFF                                        |
| Live code         | 1d2cb59cef1422878f472c43d297c343408c4d75   |

`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、index.htmlの`Cache-Control: no-cache`を設定し、実HTTPレスポンスで確認済み。

## 7. Render Web Service

| 項目                      | 現在値                                       |
| ------------------------- | -------------------------------------------- |
| Service                   | puyoteto-game / srv-dast17bbc2fs73a81ju0     |
| URL                       | https://puyoteto-game.onrender.com           |
| Root Directory            | リポジトリルート（空欄）                     |
| Build Command             | npm ci --include=dev && npm run build:server |
| Start Command             | npm run start:server                         |
| Health Check              | /health（Render設定済み、200応答確認）       |
| Plan / Region / Instances | Free / Singapore / 1                         |
| Branch / Node             | feat/online-multiplayer / 24.14.1            |
| Auto Deploy               | OFF                                          |
| Live code                 | 1d2cb59cef1422878f472c43d297c343408c4d75     |

HTTPS/WSS、RenderのPORT、0.0.0.0 bind。現在のサービスはMCPで個別作成済みです。`render.yaml`は検証済み再現用設定で、既存サービスに接続したBlueprintではありません。

## 8. Online Modes

| モード      | 実装・確認内容                                                                                |
| ----------- | --------------------------------------------------------------------------------------------- |
| QUICK MATCH | ゲーム別キュー。両ゲームで入力・再接続・再戦・履歴を本番確認                                  |
| ROOM MATCH  | 公開/非公開、定員4/8/16、秘密コード、ホスト操作/移譲。4人/同時2試合/部屋へ復帰を本番確認      |
| TOURNAMENT  | 4/8人、ランダムシード、準備完了、勝ち上がり、棄権処理、優勝者。4人大会の3試合と履歴を本番確認 |
| LEAGUE      | 4/6/8人、総当たり、同一選手の並行試合防止、順位・同点規則。4人リーグ6試合と履歴を本番確認     |

CPU戦はEasy/Normal/Hard、ローカル2Pはキーボード2人・Pad2台・混在に対応。オンラインでは操作設定のPLAYER 1を使用します。←/→移動、↓ソフトドロップ、Z左回転、↑右回転。テトリスはSpaceハードドロップ・C HOLD。Gamepadと再割り当ては [README](../README.md) を参照してください。

## 9. Environment Variables

値・秘密情報は掲載しません。

- Frontend：`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GAME_SERVER_URL`
- Server：`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLIENT_ORIGIN`, `PORT`, `NODE_ENV`
- Render：`NODE_VERSION`
- QA：`ONLINE_QA`, `QA_BASE_URL`、任意の`QA_SCREENSHOT_DIR`

Supabase publishable/anon keyは公開可能。service secretはNodeサービス限定。SMTPキーはSupabase SMTP設定限定。`.env.local`、`server/.env`、QA認証情報と画面証拠はGit対象外です。

## 10. Git

リポジトリ：[ei2537/PuyoTeto](https://github.com/ei2537/PuyoTeto)。作業ブランチは `feat/online-multiplayer`、originにpush済み。mainは元の `76fbf53` のままです。

- `55eb7fd`：既存の完成したローカルゲームを保全。
- `1d52680`：オンライン対戦・認証・部屋・大会・リーグ。
- `f460694`：保存/セキュリティ/epoch/QA/CI/Render構成。
- `1d2cb59`：表示領域とQAの修正。現在の本番コード。

この報告・実URL QA支援の変更は別checkpointとして保存します。自動デプロイOFFのため文書pushで進行中対戦を中断しません。force pushやmainへの直接統合は行っていません。

## 11. Tests

- 59/59：ゲーム・入力・CPU・継続対戦・オンライン状態・本物のSocket.IO・Postgres RLS/RPC。
- 9/9：ローカルブラウザ。両ゲーム2P・CPU・設定・自然敗北・再戦・模擬2Pad・攻撃・3サイズの表示。
- 5/5：本番オンラインブラウザ。両ゲームクイック・4人部屋・大会・リーグ。
- Frontend/serverの型チェックとbuild成功。CPU production smokeは固定previewとRender実サイト双方で成功。
- ゲームコードのGitHub Linux CI成功：[run 36369889183](https://github.com/ei2537/PuyoTeto/actions/runs/36369889183)。

## 12. Production Verification

2026-09-30、実際のRender URL・Supabase Auth・WSS・Postgresを使用。オンライン5ケースは2分で成功。15試合の結果、大会finished/3カード/優勝者、リーグfinished/6カード/優勝者をDBでも確認しました。オンラインfixture終了には投了を使用。自然敗北は共有エンジンとローカルブラウザで検証しています。

公開CPU戦のWorker・キーボード・盤面・HUDが両ゲームで動作。コンソール/ページ例外0、開発専用フック不在。健康チェックは200・`{"ok":true,"protocol":1}`、最近のRenderアプリケーションエラーログ0。Static Siteヘッダーも実応答で確認。

ユーザー自身の新規登録メールの受信・リンク確認は最終検証待ちです。QAアカウントは管理APIで確認済みとして作成したため、この5ケースだけでSMTP実配送を検証したことにはしていません。

## 13. Known Issues

- 無料Nodeサービスは休止からの初回応答に50秒以上かかる場合があります。接続再試行を実装済み。
- 1インスタンス運用。サーバー再起動時、進行中の試合/大会は中断扱い。盤面の再起動復元や水平分散は対象外です。
- 物理Xbox/一般PC Padの押し心地は未確認。模擬2Padの接続・入力・設定・切断は検証済み。
- Safari/Firefox実機検証は未実施。
- Brevoの独自送信ドメインは未設定。実配送はサービスの送信制限や受信側の迷惑メール判定に影響されます。
- Supabase漏洩パスワード保護の警告は上記のとおり。

## 14. Blockers

ゲーム実装・本番対戦・結果保存にはなし。アカウント公開の最終確認はユーザー自身の確認メール受信・リンク検証待ちです。

## 15. Future Improvements

操作遅延を抑える入力予測と補間、レーティング、観戦、フレンド招待、ルーム永続化。継続利用が増えた時点で常時稼働サーバーと独自送信ドメインを検討できます。今回これらの課金・追加機能は実施していません。
