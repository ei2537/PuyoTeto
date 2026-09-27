# 追加・変更ファイル一覧

既存のゲームコードはありませんでした。以下のファイルを新規追加しています。既存の `assets/` と `参考サイト/` のファイルは変更していません。

## 新規追加

- [.gitignore](../.gitignore)
- [.prettierrc.json](../.prettierrc.json)
- [docs/asset-report.json](../docs/asset-report.json)
- [docs/DESIGN.md](../docs/DESIGN.md)
- [docs/QA.md](../docs/QA.md)
- [index.html](../index.html)
- [package-lock.json](../package-lock.json)
- [package.json](../package.json)
- [playwright.config.ts](../playwright.config.ts)
- [public/favicon.svg](../public/favicon.svg)
- [README.md](../README.md)
- [scripts/inspect-assets.mjs](../scripts/inspect-assets.mjs)
- [scripts/smoke-production.mjs](../scripts/smoke-production.mjs)
- [src/core/Battle.ts](../src/core/Battle.ts)
- [src/core/board.ts](../src/core/board.ts)
- [src/core/combatant.ts](../src/core/combatant.ts)
- [src/core/cpu.worker.ts](../src/core/cpu.worker.ts)
- [src/core/CPUController.ts](../src/core/CPUController.ts)
- [src/core/random.ts](../src/core/random.ts)
- [src/core/types.ts](../src/core/types.ts)
- [src/games/puyo/PuyoCPU.ts](../src/games/puyo/PuyoCPU.ts)
- [src/games/puyo/PuyoGame.ts](../src/games/puyo/PuyoGame.ts)
- [src/games/puyo/PuyoRules.ts](../src/games/puyo/PuyoRules.ts)
- [src/games/tetris/TetrisCPU.ts](../src/games/tetris/TetrisCPU.ts)
- [src/games/tetris/TetrisGame.ts](../src/games/tetris/TetrisGame.ts)
- [src/games/tetris/TetrisRules.ts](../src/games/tetris/TetrisRules.ts)
- [src/input/GamepadManager.ts](../src/input/GamepadManager.ts)
- [src/input/InputManager.ts](../src/input/InputManager.ts)
- [src/input/KeyboardManager.ts](../src/input/KeyboardManager.ts)
- [src/input/settings.ts](../src/input/settings.ts)
- [src/main.ts](../src/main.ts)
- [src/style.css](../src/style.css)
- [src/ui/AudioManager.ts](../src/ui/AudioManager.ts)
- [src/ui/Renderer.ts](../src/ui/Renderer.ts)
- [tests/browser/game.spec.ts](../tests/browser/game.spec.ts)
- [tests/core.test.ts](../tests/core.test.ts)
- [tests/puyo.test.ts](../tests/puyo.test.ts)
- [tests/stress.test.ts](../tests/stress.test.ts)
- [tests/tetris.test.ts](../tests/tetris.test.ts)
- [tsconfig.json](../tsconfig.json)
- [docs/FILES.md](FILES.md)

## 生成物

- `dist/`：ビルド済み配布ファイル
- `test-results/`：ブラウザQAの画面キャプチャ・失敗時のトレース（git管理対象外）
- `node_modules/`：開発依存（git管理対象外）

## 既存ファイルの修正

なし。提供画像・音声・参考サイトはそのまま保持しています。
