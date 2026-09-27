import type { Game } from '../src/core/Battle';
import type { GameView } from '../shared/protocol';
export function gameView(g: Game): GameView {
  const common = {
    board: g.board,
    width: g.width,
    height: g.height,
    hidden: g.hidden,
    score: g.score,
    lost: g.lost,
    incoming: g.incoming,
    clock: g.clock,
    pieces: g.pieces,
    message: g.message,
    messageTime: g.messageTime,
    phaseTime: g.phaseTime,
  };
  return g.kind === 'puyo'
    ? {
        ...common,
        kind: g.kind,
        width: g.width,
        height: g.height,
        hidden: g.hidden,
        phase: g.phase,
        active: g.active,
        next: g.next,
        clearing: g.clearing,
        chain: g.chain,
        bestChain: g.bestChain,
        fallingFrom: g.fallingFrom,
        garbageDrops: g.garbageDrops,
        garbageTime: g.garbageTime,
      }
    : {
        ...common,
        kind: g.kind,
        width: g.width,
        height: g.height,
        hidden: g.hidden,
        phase: g.phase,
        active: g.active,
        next: g.next,
        clearing: g.clearing,
        hold: g.hold,
        holdUsed: g.holdUsed,
        lines: g.lines,
        combo: g.combo,
        b2b: g.b2b,
      };
}
