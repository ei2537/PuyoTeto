# STACK / DUEL

ブラウザで遊べる、ぷよ形式 / テトリス形式の対戦パズル。VS CPU（Easy / Normal / Hard）、LOCAL 2P、ログインして遊ぶオンライン対戦に対応しています。オンラインにはクイック対戦、公開/非公開ルーム、トーナメント、総当たりリーグがあります。

## 起動

Node.js 24 以降を使用してください（検証版：24.14.1）。

```sh
npm ci
npm run dev
```

[http://127.0.0.1:5173](http://127.0.0.1:5173) を開きます。HOME → GAME SELECT → MODE SELECT → 対戦設定 → 対戦。CPU戦・LOCAL 2Pにはアカウントは不要です。オンライン用の環境変数・サーバー起動・本番運用は [docs/ONLINE.md](docs/ONLINE.md) を参照してください。

```sh
npm run build      # 型チェックと本番ビルド。出力は dist/
npm run preview    # 本番ビルドの確認
npm test           # ロジック・入力・CPU・継続対戦テスト
npx playwright install chromium # ブラウザテスト初回のみ
npm run test:browser
npm run test:production # dist の両ゲームと Worker を起動確認
npm run assets:inspect
npm run format
```

静的ホスティングには `dist/` 全体を配置できます。Gamepad API と Web Worker のため、HTTP localhost または HTTPS で配信してください。HTMLのファイル直開きは対応しません。

## 操作

| 操作                       | 1P    | 2P       | 標準 Xbox / PC Pad      |
| -------------------------- | ----- | -------- | ----------------------- |
| 左右移動                   | ← / → | A / D    | 十字キー / 左スティック |
| ソフトドロップ             | ↓     | S        | 下                      |
| 左回転                     | Z     | Q        | X（B2）                 |
| 右回転                     | ↑     | E        | A（B0）                 |
| ハードドロップ（テトリス） | Space | W        | Y（B3）                 |
| HOLD（テトリス）           | C     | 左 Shift | LB（B4）                |
| 一時停止                   | Esc   | Esc      | Start（B9）             |

メニュー：Tab / Enter、またはGamepadの十字キー / Aで決定 / Bで戻る。ゲームパッドはボタンを一度押してブラウザに認識させてください。2台は別々のプレイヤーに割り当てられ、キーボードとの混在も可能です。

「操作設定」で各キー・ボタン・軸方向、DAS（初期140ms）、ARR（初期30ms）、音量を変更できます。ARR 0 はDAS経過後に端まで移動します。キーボードの重複割り当てを検出します。設定はlocalStorageに保存。デバイス番号は接続セッションで変化し得るため、次回起動時に検出・再割り当てします。

ローカル対戦はウィンドウのフォーカス喪失・タブ非表示・使用中コントローラーの切断で一時停止。再開は明示操作が必要です。オンラインではPLAYER 1の操作設定を使用し、一時停止はできません。通信切断時は双方の盤面を止め、30秒間の復帰を待ちます。

## ルール

### PUYO

- 横6 × 可視12行、上部2行の内部領域。4色、2個1組。NEXT 3組。
- 上下左右に同色4個以上で同時消去。隣接するおじゃまも消去。
- 盤面は `falling → settle → clear → settle → … → entry` の状態機械。全消去を判定してから列ごとに圧縮し、連鎖を再判定。
- 得点 = 消えた色ぷよ数 × 10 ×（連鎖ボーナス + 色数ボーナス + 結合ボーナス）。倍率は1〜999。
- 消去得点70点につきおじゃま1個。端数を持ち越し。ソフトドロップ得点は攻撃に含めません。ぷよのハードドロップはありません。
- 全消しは2100点、次の消去時に30個の追加攻撃。
- 連鎖中はおじゃまが落ちません。連鎖終了時に到着済みのおじゃまを最大30個、列を均等に使って落とします。
- 接地猶予450ms、接地時の移動・回転による延長8回。片側の壁蹴り、床蹴り、1列の隙間でのクイックターン。
- 可視最上段の左から3列目（×）の占有、出現不能、盤面上端へのおじゃま溢れで敗北。

### TETRIS

- 横10 × 可視20行、上部4行の内部領域。7-bag、NEXT 5個、HOLD（1設置につき1回）、Ghost。
- SRSのJLSTZ / I別キックテーブル、左右回転、接地猶予500ms・延長15回。
- T-Spinは最後の操作が回転で、Tの中心の四隅の3つが埋まっていることを判定。前方2角・5番目のキックでFull、他はMini。2ライン以上のMiniはFull扱い。
- 通常消去の攻撃は Single 0 / Double 1 / Triple 2 / Tetris 4。T-Spin Single 2 / Double 4 / Triple 6。Mini Single 1。
- 難しい消去のBack-to-Backは+1。Comboは `0,0,1,1,2,2,3,3,4,4,4,5…`。Perfect Clearは+10。
- 消去したターンはおじゃまのせり上がりを延期。非消去ターンに到着済み分を最大8行せり上げます。各行に穴は1個。
- 出現衝突、全セルが非表示領域に固定される非消去ターン、盤面上端のせり上がり溢れで敗北。

共通：双方に同じシードのピース列を配布。攻撃は自分の予告おじゃまから相殺し、同フレームの残余攻撃も相殺してから相手に到着。到着猶予700ms。自然落下は時間で徐々に速くなります。公式ゲーム完全互換を目指したものではなく、この文書の対戦ルールを採用しています。

## 設計とファイル

TypeScript、Canvas 2D、CSS、Web Audioを使用。ローカルゲームのルールは外部サービスに依存しません。オンラインはSupabase JS、Socket.IO、Zodを使用。Vite / esbuild / tsx / Playwright / PGlite / Prettierは開発・検証用です。

```text
src/
  main.ts                  画面遷移・対戦UI・アプリの接続
  style.css                デザイントークン・レスポンシブレイアウト
  core/
    Battle.ts              対戦進行・同時攻撃・勝敗・一時停止
    combatant.ts           おじゃまの予告・到着・相殺
    CPUController.ts       Worker依頼と操作の再生
    cpu.worker.ts          盤面探索の実行
    types.ts / board.ts / random.ts
  input/
    KeyboardManager.ts     押下・離上・フォーカス喪失
    GamepadManager.ts      接続イベント・軸・ボタン
    InputManager.ts        入力統合・DAS/ARR・同時押し
    settings.ts            デフォルト値・検証・永続化
  games/
    puyo/                  PuyoGame / PuyoRules / PuyoCPU
    tetris/                TetrisGame / TetrisRules / TetrisCPU
  ui/
    Renderer.ts            盤面・NEXT・HOLD・自作図形
    AudioManager.ts        オリジナルの短い合成効果音
tests/
  *.test.ts                純粋ロジック・入力・CPU・継続対戦
  browser/game.spec.ts     メニュー・対戦・設定・模擬Gamepad・画面QA
scripts/inspect-assets.mjs PNGヘッダー調査
docs/                      デザイン、アセット調査、QA記録
```

CPUは合法操作を幅優先探索し、穴・高さ・凹凸・消去・色の接続を評価。Easyは上位候補から控えめな選択、Normalは最高評価、Hardは上位候補について次のピースも先読みします。思考・操作間隔も異なります。Workerで探索し、実際のゲームと同じ移動・回転・ドロップAPIで操作します。攻撃を受けたり落下で予定操作が無効になった場合は再計画します。

シミュレーションは固定60Hz、描画はrequestAnimationFrame。プレビューは表示領域に合わせて縮尺を決定し、devicePixelRatio最大2で描画。Canvasからルールへは依存しません。

元の `参考サイト/` と `assets/` は変更していません。提供画像・音声はゲームには使用せず、自作図形・合成音で統一しています。スプライトの切り抜きは行っていないためsprite-map / sprite viewerは不要です。

## 確認範囲・制限

詳細は [docs/QA.md](docs/QA.md)。物理コントローラーでの押し心地・機種固有の番号差は実機未確認です。Gamepad APIの2台同時入力、割り当て、再設定、切断処理は模擬デバイスで自動検証しています。一般的な非標準Padの番号差は操作設定で調整してください。

PC向けです。タッチ用操作ボタン、異種対戦、競技用の高度な定型連鎖AIは対象外です。音声読み上げだけで盤面を把握できるアクセシビリティは未実装です。
