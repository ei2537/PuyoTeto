import test from 'node:test';
import assert from 'node:assert/strict';
import { grid } from '../src/core/board';
import { Random } from '../src/core/random';
import { TetrisGame } from '../src/games/tetris/TetrisGame';
import {
  SevenBag,
  TYPES,
  spawn,
  cells,
  collides,
  rotate,
  ghost,
  fullRows,
  clearRows,
  detectSpin,
  attackFor,
} from '../src/games/tetris/TetrisRules';
test('tetris: collision checks walls, floor, ceiling and occupied squares', () => {
  const b = grid(10, 24),
    p = spawn('T');
  assert.equal(collides(b, p), false);
  assert.equal(collides(b, { ...p, x: -1 }), true);
  assert.equal(collides(b, { ...p, x: 8 }), true);
  assert.equal(collides(b, { ...p, y: 23 }), true);
  assert.equal(collides(b, { ...p, y: -1 }), true);
  b[3][4] = 8;
  assert.equal(collides(b, p), true);
});
test('tetris: all seven tetrominoes have four cells and rotate back to their origin', () => {
  const b = grid(10, 24);
  for (const type of TYPES) {
    let p = { ...spawn(type), y: 8 };
    const original = cells(p);
    for (let i = 0; i < 4; i++) p = rotate(b, p, 1)!.piece;
    assert.deepEqual(cells(p), original);
    assert.equal(cells(p).length, 4);
  }
});
test('tetris: SRS JLSTZ wall kick and I-specific wall kick', () => {
  const b = grid(10, 24);
  const t = rotate(b, { type: 'T', r: 1, x: -1, y: 8 }, -1);
  assert.ok(t);
  assert.equal(t.piece.x, 0);
  assert.equal(t.kick, 1);
  const i = rotate(b, { type: 'I', r: 1, x: -2, y: 8 }, -1);
  assert.ok(i);
  assert.equal(i.piece.x, 0);
  assert.equal(i.kick, 1);
});
test('tetris: floor kicks lift a T and blocked rotations fail', () => {
  const b = grid(10, 24);
  const result = rotate(b, { type: 'T', x: 3, y: 22, r: 0 }, 1);
  assert.ok(result);
  assert.equal(result.piece.y, 21);
  const full = Array.from({ length: 24 }, () => Array(10).fill(8));
  assert.equal(rotate(full, spawn('T'), 1), null);
});
test('tetris: 7-bag is a permutation every seven pieces', () => {
  const bag = new SevenBag(new Random(234));
  for (let n = 0; n < 100; n++)
    assert.deepEqual(Array.from({ length: 7 }, () => bag.next()).sort(), [...TYPES].sort());
});
test('tetris: line clear compresses multiple rows and preserves order', () => {
  const b = grid(10, 24);
  b[23].fill(8);
  b[21].fill(8);
  b[22][4] = 3;
  b[20][5] = 2;
  assert.deepEqual(fullRows(b), [21, 23]);
  const result = clearRows(b);
  assert.equal(result[23][4], 3);
  assert.equal(result[22][5], 2);
  assert.ok(result[0].every((v) => !v));
});
test('tetris: HOLD is limited to once per lock and restores spawn orientation', () => {
  const g = new TetrisGame(9),
    original = g.active!.type,
    next = g.next[0];
  g.act('rotateRight');
  assert.equal(g.act('hold'), true);
  assert.equal(g.hold, original);
  assert.equal(g.active!.type, next);
  assert.equal(g.active!.r, 0);
  assert.equal(g.act('hold'), false);
  g.act('hardDrop');
  g.step(200);
  assert.equal(g.act('hold'), true);
  assert.equal(g.active!.type, original);
  assert.equal(g.active!.r, 0);
});
test('tetris: ghost is collision free and one row above collision', () => {
  const b = grid(10, 24);
  b[23][4] = 8;
  const p = ghost(b, spawn('I'));
  assert.equal(collides(b, p), false);
  assert.equal(collides(b, { ...p, y: p.y + 1 }), true);
});
test('tetris: T-Spin full, mini, last rotation and fifth-kick promotion', () => {
  const b = grid(10, 24),
    p = { type: 'T' as const, x: 3, y: 20, r: 0 };
  b[20][3] = 8;
  b[20][5] = 8;
  b[22][3] = 8;
  assert.equal(detectSpin(b, p, true, 0), 'full');
  assert.equal(detectSpin(b, p, false, 0), 'none');
  b[20][5] = 0;
  b[22][5] = 8;
  assert.equal(detectSpin(b, p, true, 0), 'mini');
  assert.equal(detectSpin(b, p, true, 4), 'full');
  assert.equal(detectSpin(b, { ...p, type: 'J' }, true, 4), 'none');
});
test('tetris: zero-distance hard drop preserves T-Spin and sends its attack', () => {
  const g = new TetrisGame();
  g.board[22].fill(8);
  for (const x of [3, 4, 5]) g.board[22][x] = 0;
  g.board[21][3] = 8;
  g.board[21][5] = 8;
  g.board[23][3] = 8;
  g.active = { type: 'T', x: 3, y: 21, r: 0 };
  g.lastRotation = true;
  g.act('hardDrop');
  assert.equal(g.outgoing, 2);
  assert.match(g.message, /T-SPIN/);
  assert.equal(g.b2b, true);
});
test('tetris: movement clears the rotation marker', () => {
  const g = new TetrisGame();
  g.lastRotation = true;
  g.act('left');
  assert.equal(g.lastRotation, false);
});
test('tetris: attacks include combo, back-to-back and perfect clear', () => {
  assert.equal(attackFor(4, 'none', 0, false, false), 4);
  assert.equal(attackFor(4, 'none', 2, true, false), 6);
  assert.equal(attackFor(2, 'full', 0, false, false), 4);
  assert.equal(attackFor(4, 'none', 0, false, true), 14);
  assert.equal(attackFor(0, 'full', 4, true, true), 0);
});
test('tetris: clear animation completes and scoring is applied only once', () => {
  const g = new TetrisGame();
  g.board[23].fill(8);
  for (let x = 3; x < 7; x++) g.board[23][x] = 0;
  g.active = spawn('I');
  g.act('hardDrop');
  const score = g.score;
  assert.equal(g.phase, 'clear');
  assert.equal(g.lines, 1);
  assert.equal(g.outgoing, 10);
  g.step(180);
  assert.equal(g.phase, 'falling');
  assert.equal(g.score, score);
  assert.ok(g.board.flat().every((v) => !v));
});
test('tetris: lock delay resets only up to fifteen ground movements', () => {
  const g = new TetrisGame();
  g.active = { type: 'O', x: 3, y: 22, r: 0 };
  g.step(400);
  assert.equal(g.phase, 'falling');
  g.act('left');
  assert.equal(g.lockElapsed, 0);
  for (let i = 0; i < 20; i++) g.act(i % 2 ? 'left' : 'right');
  assert.equal(g.lockResets, 15);
  g.step(501);
  assert.equal(g.phase, 'entry');
});
test('tetris: garbage rises with one hole; occupied top row causes overflow', () => {
  const g = new TetrisGame();
  g.board[23][2] = 3;
  g.addGarbage(3, 4);
  assert.equal(g.board[20][2], 3);
  for (const row of g.board.slice(-3)) {
    assert.equal(row[4], 0);
    assert.equal(row.filter((v) => v === 8).length, 9);
  }
  g.board[0][0] = 1;
  g.addGarbage(1, 4);
  assert.equal(g.lost, true);
});
test('tetris: garbage is deferred on a clearing turn', () => {
  const g = new TetrisGame();
  g.incoming = [{ amount: 3, readyAt: 0 }];
  g.board[23].fill(8);
  for (let x = 3; x < 7; x++) g.board[23][x] = 0;
  g.active = spawn('I');
  g.act('hardDrop');
  g.step(180);
  assert.equal(g.incoming[0].amount, 3);
});
test('tetris: spawn block-out and full lock-out lose the game', () => {
  const g = new TetrisGame();
  g.board[3].fill(8);
  g.holdUsed = false;
  g.act('hold');
  assert.equal(g.lost, true);
  const h = new TetrisGame();
  h.active = { type: 'O', x: 3, y: 1, r: 0 };
  h.board[3][4] = 8;
  h.board[3][5] = 8;
  h.act('hardDrop');
  assert.equal(h.lost, true);
});
