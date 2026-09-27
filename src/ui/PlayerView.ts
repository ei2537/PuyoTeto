import type { GameKind } from '../core/types';
export const escapeHTML = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
/** Shared by offline/online HUDs: HOLD always left, NEXT always right. */
export function playerView(kind: GameKind, p: number, name: string, device: string) {
  return `<article class="player ${kind} ${p ? 'p2' : ''}"><div class="player-heading"><span class="player-name"><em>${p + 1}P</em>${escapeHTML(name)}</span><span class="player-device">${escapeHTML(device)}</span></div>
    <div class="play-field">
      ${kind === 'tetris' ? `<aside class="hold-rail"><div class="rail-label">HOLD</div><canvas class="hold-preview" id="hold-${p}" aria-label="HOLD"></canvas></aside>` : ''}
      <div class="board-wrap"><canvas class="board" id="board-${p}" aria-label="${escapeHTML(name)} の盤面"></canvas></div>
      <aside class="rail"><div class="rail-label">NEXT</div><canvas class="preview" id="next-${p}" aria-label="次のピース"></canvas><div class="stat"><div class="rail-label">SCORE</div><div class="stat-value small mono" id="score-${p}">0</div></div><div class="stat"><div class="rail-label">GARBAGE</div><div class="stat-value garbage-value mono" id="garbage-${p}">0</div><div class="garbage-bar"><i id="garbage-bar-${p}"></i></div></div></aside>
    </div><div class="player-bottom"><span id="detail-${p}"></span><span id="combo-${p}"></span></div><div class="clear-caption" id="callout-${p}" aria-live="polite"></div></article>`;
}
