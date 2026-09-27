import test from 'node:test';
import assert from 'node:assert/strict';
import { grid } from '../src/core/board';
import { PuyoGame } from '../src/games/puyo/PuyoGame';
import { findClear, gravity, resolve, rotate, collides } from '../src/games/puyo/PuyoRules';

test('puyo: four orthogonal colors clear; three or diagonal do not', () => {
  const b = grid(6, 14);
  b[13] = [1, 1, 1, 0, 2, 0];
  assert.equal(findClear(b, 1).colored, 0);
  b[12][2] = 1;
  assert.equal(findClear(b, 1).colored, 4);
  assert.equal(findClear(b, 1).score, 40);
  const diagonal = grid(6, 14);
  for (let i = 0; i < 4; i++) diagonal[10 + i][i] = 1;
  assert.equal(findClear(diagonal, 1).colored, 0);
});
test('puyo: gravity preserves column order and splits a horizontal pair', () => {
  const b = grid(6, 14);
  b[4][0] = 1;
  b[8][0] = 2;
  b[4][1] = 3;
  assert.equal(gravity(b), true);
  assert.deepEqual(b[13].slice(0, 2), [2, 3]);
  assert.equal(b[12][0], 1);
  assert.equal(gravity(b), false);
});
function chainBoard() {
  const b = grid(6, 14);
  b[13] = [1, 2, 2, 2, 0, 0];
  b[12][0] = 1;
  b[11][0] = 1;
  b[10][0] = 1;
  b[9][0] = 2;
  return b;
}
test('puyo: clear → gravity → clear produces a two-chain and correct score', () => {
  const result = resolve(chainBoard());
  assert.equal(result.chain, 2);
  assert.equal(result.cleared, 8);
  assert.equal(result.score, 360);
  assert.ok(result.board.flat().every((v) => v === 0));
});
test('puyo: only garbage adjacent to a cleared group disappears', () => {
  const b = grid(6, 14);
  b[13] = [1, 1, 1, 1, 5, 5];
  const result = resolve(b);
  assert.equal(result.board[13][4], 0);
  assert.equal(result.board[13][5], 5);
});
test('puyo: simultaneous groups apply color bonus, large groups apply group bonus', () => {
  const b = grid(6, 14);
  b[13] = [1, 1, 1, 1, 0, 0];
  b[12] = [2, 2, 2, 2, 0, 0];
  assert.equal(findClear(b, 1).score, 240);
  b[12].fill(0);
  b[13][4] = 1;
  assert.equal(findClear(b, 1).score, 100);
});
test('puyo: garbage is evenly distributed and never overwrites existing cells', () => {
  const g = new PuyoGame(8);
  g.board[13][0] = 1;
  g.addGarbage(13);
  assert.equal(g.board.flat().filter((v) => v === 5).length, 13);
  assert.equal(g.board[13][0], 1);
  const counts = g.board[0].map((_, x) => g.board.filter((r) => r[x] === 5).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});
test('puyo: chain state machine defers garbage until every link finishes', () => {
  const g = new PuyoGame();
  g.board = chainBoard();
  g.active = null;
  g.phase = 'settle';
  g.phaseTime = 0;
  g.incoming = [{ amount: 6, readyAt: 0 }];
  g.step(1);
  assert.equal(g.chain, 1);
  assert.equal(g.phase, 'clear');
  assert.equal(g.board.flat().filter((v) => v === 5).length, 0);
  g.step(321);
  g.step(181);
  assert.equal(g.chain, 2);
  assert.equal(g.phase, 'clear');
  assert.equal(g.outgoing, 5);
  assert.equal(g.attackRemainder, 10);
  g.step(321);
  g.step(181);
  assert.equal(g.board.flat().filter((v) => v === 5).length, 6);
  assert.equal(g.phase, 'entry');
});
test('puyo: a blocked danger cell ends the round on spawn', () => {
  const g = new PuyoGame();
  g.board[2][2] = 1;
  g.active = null;
  g.phase = 'entry';
  g.phaseTime = 0;
  g.step(1);
  assert.equal(g.lost, true);
});
test('puyo: wall rotation kicks into the board', () => {
  const b = grid(6, 14),
    p = { x: 5, y: 8, r: 0, colors: [1, 2] as [number, number] };
  const result = rotate(b, p, 1);
  assert.ok(result);
  assert.equal(result.x, 4);
  assert.equal(collides(b, result), false);
});
test('puyo: hidden cells cannot form invisible matches', () => {
  const b = grid(6, 14);
  b[1] = [1, 1, 1, 1, 0, 0];
  assert.equal(findClear(b, 1).colored, 0);
});
test('puyo: lock delay gives grounded pieces time to move', () => {
  const g = new PuyoGame();
  g.active = { x: 2, y: 13, r: 0, colors: [1, 2] };
  g.step(300);
  assert.equal(g.phase, 'falling');
  assert.equal(g.act('left'), true);
  g.step(300);
  assert.equal(g.phase, 'falling');
  g.step(200);
  assert.equal(g.phase, 'settle');
});
