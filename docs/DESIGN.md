# STACK / DUEL

参考サイトの白地、墨色、細い罫線、控えめな英字ラベルを採用。メニューは一列の選択肢を基本とし、対戦中は左右対称の盤面を主役にする。

| Token             | Value   | 用途               |
| ----------------- | ------- | ------------------ |
| background        | #f6f5f1 | ページ             |
| surface           | #fffefa | 操作面             |
| border            | #d9dbd3 | 区切り             |
| text-primary      | #242724 | 主テキスト         |
| text-secondary    | #697169 | 補助テキスト       |
| accent / player-1 | #24775f | 選択、1P           |
| player-2          | #b96c3f | 2P                 |
| danger            | #bc4a49 | 危険、予告おじゃま |
| board             | #202925 | 盤面               |

角丸4–6px。グラデーション・ガラス表現・装飾用シャドウなし。システムフォントを使用し、外部フォントへのネットワーク依存なし。ぷよは形状と目の表情、テトリミノは色と輪郭で識別。CanvasはdevicePixelRatioに追従。

画像の寸法・PNG色形式は `npm run assets:inspect` で再現可能。提供スプライトは使用しないため、切り抜き・推測座標・sprite-mapは存在しない。すべてのゲームアセットはCanvasの図形で描画する。
