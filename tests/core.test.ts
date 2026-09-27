import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/core/Battle';
import { Combatant } from '../src/core/combatant';
import { Random } from '../src/core/random';
import { repeatCount } from '../src/input/InputManager';
import { bindingDown } from '../src/input/GamepadManager';
import { planTetris } from '../src/games/tetris/TetrisCPU';
import { planPuyo } from '../src/games/puyo/PuyoCPU';
import { TetrisGame } from '../src/games/tetris/TetrisGame';
import { PuyoGame } from '../src/games/puyo/PuyoGame';
test('combat: cancellation consumes oldest packets and returns excess', () => {
  const c = new Combatant();
  c.receive(3);
  c.receive(5);
  assert.equal(c.cancel(6), 0);
  assert.equal(c.incoming[0].amount, 2);
  assert.equal(c.cancel(5), 3);
  assert.equal(c.incoming.length, 0);
});
test('combat: grace period and per-turn garbage cap', () => {
  const c = new Combatant();
  c.receive(12);
  assert.equal(c.takeGarbage(8), 0);
  c.tick(701);
  assert.equal(c.takeGarbage(8), 8);
  assert.equal(c.takeGarbage(8), 4);
});
for (const kind of ['puyo', 'tetris'] as const)
  test(`${kind}: simultaneous attacks cancel symmetrically after own queue`, () => {
    const b = new Battle(kind, 123),
      [a, c] = b.games;
    a.receive(3);
    a.outgoing = 8;
    c.outgoing = 2;
    b.flushAttacks();
    assert.equal(a.incoming.length, 0);
    assert.equal(c.incoming[0].amount, 3);
    assert.equal(a.outgoing, 0);
    assert.equal(c.outgoing, 0);
  });
test('battle: same seeds produce identical piece sequences', () => {
  for (const kind of ['puyo', 'tetris'] as const) {
    const b = new Battle(kind, 521);
    assert.deepEqual(b.games[0].next, b.games[1].next);
    assert.deepEqual(b.games[0].active, b.games[1].active);
  }
});
test('battle: countdown blocks moves, pause freezes clocks, simultaneous loss draws', () => {
  const b = new Battle('tetris');
  assert.equal(b.act(0, 'left'), false);
  b.pause();
  b.step(5000);
  assert.equal(b.countdown, 2400);
  b.resume();
  b.step(2500);
  assert.equal(b.state, 'playing');
  b.pause();
  b.step(1000);
  assert.equal(b.elapsed, 0);
  b.resume();
  b.games.forEach((g) => (g.lost = true));
  b.step(1);
  assert.equal(b.state, 'finished');
  assert.equal(b.winner, null);
});
test('input: immediate movement, DAS, ARR, release and instant ARR', () => {
  const s = { active: false, elapsed: 0, next: 0 };
  assert.equal(repeatCount(s, true, 16, 140, 30), 1);
  assert.equal(repeatCount(s, true, 139, 140, 30), 0);
  assert.equal(repeatCount(s, true, 1, 140, 30), 1);
  assert.equal(repeatCount(s, true, 60, 140, 30), 2);
  assert.equal(repeatCount(s, false, 16, 140, 30), 0);
  assert.equal(repeatCount(s, true, 16, 140, 0), 1);
  assert.equal(repeatCount(s, true, 140, 140, 0), 12);
});
test('input: standard buttons and signed axes use a dead zone', () => {
  const pad = { buttons: [{ pressed: true }], axes: [-0.7, 0.2] } as unknown as Gamepad;
  assert.equal(bindingDown(pad, { type: 'button', index: 0 }), true);
  assert.equal(bindingDown(pad, { type: 'button', index: 1 }), false);
  assert.equal(bindingDown(pad, { type: 'axis', index: 0, sign: -1 }), true);
  assert.equal(bindingDown(pad, { type: 'axis', index: 1, sign: 1 }), false);
  assert.equal(bindingDown(null, { type: 'button', index: 0 }), false);
});
test('random: same seed produces a reproducible stream', () => {
  const a = new Random(345),
    b = new Random(345);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});
for (const difficulty of ['easy', 'normal', 'hard'] as const)
  for (const kind of ['puyo', 'tetris'] as const)
    test(`CPU ${kind} ${difficulty}: selected moves are legal and place a piece`, () => {
      const g = kind === 'puyo' ? new PuyoGame(42) : new TetrisGame(42);
      for (let turn = 0; turn < 8 && !g.lost; turn++) {
        const s = g.snapshot(),
          actions = s.kind === 'puyo' ? planPuyo(s, difficulty) : planTetris(s, difficulty);
        assert.ok(actions.length > 0);
        for (const action of actions) assert.equal(g.act(action), true, `${kind}: ${action}`);
        assert.notEqual(g.phase, 'falling');
        let steps = 0;
        while (g.phase !== 'falling' && !g.lost && steps++ < 400) g.step(16.667);
        assert.ok(steps < 400);
        g.events = [];
      }
      assert.equal(g.lost, false);
    });
