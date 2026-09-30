# QA記録

実施環境：Windows / Node.js 24.14.1 / Chromium（Playwright）/ Codexアプリ内ブラウザ。

## 自動テスト

- `npm test`：45件。ぷよ4個消去・落下・2連鎖・同時色ボーナス・隣接おじゃま・発火中の予告保留・敗北。テトリス衝突・SRS JLSTZ/I/床キック・7-bag・HOLD・Ghost・複数行消去・T-Spin Full/Mini・B2B/Combo/全消し・Lock Delay・Garbage・Top Out。共通相殺・同時攻撃・同シード・ポーズ・DAS/ARR・Padの軸とボタン。各難易度CPUの合法操作と継続対戦。
- 継続対戦テスト：両ゲームで合計240設置ずつ実行し、盤面寸法・セル値・予告量・得点・状態遷移の整合性を検証。
- `npm run test:browser`：9件成功。メニュー導線、設定永続化と重複検出、Puyo/Tetrisの2Pキーボード操作、自然トップアウト、再戦、CPU Worker、2連鎖からの攻撃、T-Spinからの攻撃、模擬2台Pad、ボタン再割り当て、スティック、Startポーズ、切断ポーズ。
- 1366×768、1920×1080、1024×720で盤面と文書のはみ出しを検証。各画面のスクリーンショットを `test-results/` に出力。
- 各ブラウザテストはページ例外・コンソールエラーが0件であることを検証。
- `npm run test:production`：本番ビルドの両ゲームを起動し、CPU Workerとプレイヤー入力が動作すること、コンソールエラー0件、開発専用フックが含まれないことを検証。
- 描画計測：Hard CPU戦で150フレームを採取し、95パーセンタイル約16.7–16.8ms。これはテスト機上の測定で、すべての端末に対する性能保証ではありません。

## 手動・画面確認

- 実際にローカルサーバーを起動し、ブラウザでHOME→選択→設定→対戦を操作。
- 白・墨色のメニュー、左右対称の盤面、NEXT/HOLD、勝敗画面を確認。
- 検出した問題：NEXT最下段の切れ、低い画面のスクロール、main要素全体の不要なフォーカス枠。修正済み。
- メニューの初期フォーカスを主要操作に調整。結果表示直後のキー連打による意図しない再戦を抑止。

## 未確認の範囲

- ブラウザ上で1台のGamepad接続表示を確認。ただしXboxおよび一般PC Padそれぞれの実機ボタン・押し心地の検証は未実施。2台同時入力を含む接続・入力APIは模擬デバイスで検証。
- Safari / Firefoxの実機検証は未実施。
- キーボードの同時押し可能数はハードウェア依存。2台のGamepad、またはキーボード＋Gamepadの併用が可能。

ブラウザテストの盤面フィクスチャは開発モード専用 `window.__STACK_DUEL__` を利用。本番ビルドでは公開しません。

## オンライン拡張（2026-09-28 JST）

- `npm test`：59/59成功。上記ローカル45件を維持し、オンライン状態遷移・大会・リーグ・切断・攻撃入力制限・結果リトライ・実Socket.IO認証/オリジン/ユーザー偽装拒否を追加。
- PGlite（実Postgresエンジン）で2つのmigrationを適用し、Authトリガー・名前一意性・RLS・他人の更新拒否・結果RPCの権限制限・二重加算防止・旧サーバーepoch排除を検証。
- ローカルブラウザ9/9成功。PuyoのSpaceが無効・下入力で接地、HOLD左配置と連鎖表示を反映。1366×768 / 1920×1080 / 1024×720。Hard CPUのp95は16.8ms。
- 前後ともTypeScript/frontend/server build成功。本番buildの両CPU Worker・キー入力・コンソールエラー0・開発フック不在も成功。
- 4つの実Supabase QAアカウントを使用。ログイン、両ゲームのクイック対戦、キー入力、リロード復帰、結果保存、再検索、アカウント履歴、4人非公開ルーム・同時2試合、4人トーナメント、4人リーグ6試合を検証。
- 開発サーバーのHMRが検証中に画面をリロードするケースを検出。本番buildの固定previewを使う検証に切り替え。非アクティブなWindowsタブでの待機を避けるため、操作対象タブを前面にして操作。
- 大会退出の確認ダイアログが再描画で消える問題を修正。ローカル/オンラインとも縦レイアウトを調整。
- `render.yaml`：公式JSON schemaに適合。`off`はYAML 1.1でboolean解釈されないよう文字列で記載。

## 本番検証（2026-09-30 JST）

- Render Static Site `https://puyoteto-online.onrender.com` と Free Node `https://puyoteto-game.onrender.com` がLIVE。デプロイSHA `1d2cb59`。両サービスの自動デプロイOFF。
- 実URLでオンラインブラウザ5/5成功（2分）。ぷよ・テトリスのログイン/クイック/入力/リロード再接続/保存/再戦/履歴、4人非公開ルームで同時2試合、大会完走、リーグ全6試合。
- Supabaseに当該実行の15試合が保存済み。大会はfinished・3カード・優勝者あり、リーグはfinished・6カード・優勝者あり。オンラインQAではカードを投了で終了。自然トップアウトは共有ゲームロジックとローカルブラウザテストで検証。
- 実URLのCPU smokeも両ゲーム成功。Worker・キーボード・Canvas・HUD・本番フック不在、ページ/コンソールエラー0。`QA_BASE_URL`で再現可能。
- `/health` は200・`{"ok":true,"protocol":1}`。RenderのHealth Check Pathも `/health` に保存・MCPで確認。最近のアプリケーションエラーログ0。
- 最新ゲームコードのGitHub Linux CI成功：[workflow run](https://github.com/ei2537/PuyoTeto/actions/runs/36369889183)。模擬Pad再割り当ての中立フレーム待ちを補正し、以前の失敗は解消。
- 本番QA/SMTP設定記録と公開URL対応のsmokeスクリプトを含む `fc7074b` も、GitHubの全テスト・build・ローカルブラウザ・CPU smokeに成功：[workflow run](https://github.com/ei2537/PuyoTeto/actions/runs/36652706236)。
- Supabase Site URL/唯一の許可redirectを本番originに設定済み。メール確認は維持。
- Brevoの電話番号確認とSMTPキー作成をユーザーが実施し、キーをSupabaseに直接入力・保存。Brevo relay有効、Supabase custom SMTP有効を確認。秘密キーはチャット/Git/クライアント/Renderに保存していない。

- ユーザーが実サイトで登録・メール確認を実施。その後、Supabaseに本日作成の新規ユーザー1件・メール確認済み1件・ログイン済み1件を確認し、公開サイトでもプロフィール表示とオンライン「接続済み」を確認。実ユーザーを管理APIで確認済みにする回避策は使用していません。メール本文や確認リンクの秘密値は取得していません。

必要な本番検証の未完了項目はありません。独自送信ドメインは未設定。Supabase security advisorは漏洩パスワード保護が未有効の警告1件（RLS指摘なし）。[設定手順](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)。物理Pad/Safari/Firefoxの未確認範囲は上記のとおりです。
