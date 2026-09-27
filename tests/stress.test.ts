import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/core/Battle';
import { planTetris } from '../src/games/tetris/TetrisCPU';
import { planPuyo } from '../src/games/puyo/PuyoCPU';
for (const kind of ['puyo', 'tetris'] as const)
  test(`${kind}: sustained seeded CPU battle preserves board invariants`, () => {
    const b = new Battle(kind, 9027);
    b.countdown = 0;
    b.step(1);
    let placements = 0,
      garbagePeak = 0,
      iterations = 0;
    const planned = [-1, -1];
    while (b.state === 'playing' && placements < 240 && iterations++ < 20000) {
      for (const [i, g] of b.games.entries())
        if (!g.lost && g.phase === 'falling' && planned[i] !== g.pieces) {
          planned[i] = g.pieces;
          const s = g.snapshot(),
            difficulty = i === 0 ? 'normal' : 'hard';
          const plan = s.kind === 'puyo' ? planPuyo(s, difficulty) : planTetris(s, difficulty);
          for (const action of plan)
            assert.equal(g.act(action), true, `${kind} ${action} at piece ${g.pieces}`);
          placements++;
        }
      b.step(1000 / 60);
      garbagePeak = Math.max(
        garbagePeak,
        ...b.games.map((g) => g.incoming.reduce((n, p) => n + p.amount, 0)),
      );
      for (const g of b.games) {
        assert.equal(g.board.length, g.height);
        assert.ok(g.board.every((r) => r.length === g.width));
        assert.ok(
          g.board
            .flat()
            .every((v) => Number.isInteger(v) && v >= 0 && v <= (kind === 'puyo' ? 5 : 8)),
        );
        assert.ok(g.incoming.every((p) => p.amount > 0));
        assert.ok(Number.isFinite(g.score));
        g.events = [];
      }
    }
    assert.ok(placements >= 20);
    assert.ok(iterations < 20000);
    assert.ok(b.games.some((g) => g.score > 100));
    console.log(
      `${kind} soak: ${placements} placements, peak incoming ${garbagePeak}, ${b.state}, scores ${b.games.map((g) => g.score).join('/')}`,
    );
  });
