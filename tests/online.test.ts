import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { Hub } from '../server/Hub';
import { createGameServer } from '../server/app';
import { leagueFixtures, standings, tournamentFixtures } from '../server/competition';
import {
  commandSchema,
  DISCONNECT_GRACE_MS,
  inputSchema,
  PROTOCOL_VERSION,
  type Category,
  type FinishReason,
  type Identity,
  type LobbyView,
} from '../shared/protocol';
import type { MatchRecord, Store } from '../server/store';

class MemoryStore implements Store {
  matches = new Map<
    string,
    { record: MatchRecord; winner: string | null; reason: FinishReason | null }
  >();
  competitions = new Map<string, LobbyView>();
  wins = new Map<string, number>();
  failFinish = false;
  async recover() {}
  async createMatch(record: MatchRecord) {
    assert.ok(!this.matches.has(record.id));
    this.matches.set(record.id, { record, winner: null, reason: null });
  }
  async saveCompetition(lobby: LobbyView) {
    if (lobby.category !== 'room') this.competitions.set(lobby.id, structuredClone(lobby));
  }
  async finishMatch(
    record: MatchRecord,
    winner: string | null,
    reason: FinishReason,
    lobby: LobbyView | null,
  ) {
    if (this.failFinish) throw new Error('DB temporarily offline');
    const match = this.matches.get(record.id)!;
    if (match.reason) return;
    match.winner = winner;
    match.reason = reason;
    if (winner) this.wins.set(winner, (this.wins.get(winner) || 0) + 1);
    if (lobby) await this.saveCompetition(lobby);
  }
}
async function fixture(count = 4) {
  let now = 100000;
  const store = new MemoryStore(),
    events: { id: string; event: string; payload: unknown }[] = [];
  const hub = new Hub(
    store,
    (id, event, ...args) => {
      events.push({ id, event, payload: args[0] });
    },
    () => now,
  );
  const users: Identity[] = Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    username: `player_${i}`,
    wins: 0,
    expiresAt: 1e12,
  }));
  for (const u of users) await hub.connect(u, `socket-${u.id}`);
  return {
    hub,
    store,
    users,
    events,
    advance: (ms: number) => {
      now += ms;
    },
    async settle() {
      await hub.serial(() => {});
    },
  };
}
async function lobby(
  f: Awaited<ReturnType<typeof fixture>>,
  category: Category,
  capacity = 4,
  visibility: 'public' | 'private' = 'public',
) {
  await f.hub.command(f.users[0].id, {
    type: 'lobby.create',
    category,
    capacity,
    visibility,
    name: 'Test room',
    game: 'tetris',
  });
  const l = f.hub.session(f.users[0].id).lobby!;
  for (const u of f.users.slice(1, capacity))
    await f.hub.command(
      u.id,
      visibility === 'private'
        ? { type: 'lobby.join', code: l.code! }
        : { type: 'lobby.join', id: l.id },
    );
  return l.id;
}
async function startCompetition(
  f: Awaited<ReturnType<typeof fixture>>,
  category: 'tournament' | 'league',
  capacity = 4,
) {
  const id = await lobby(f, category, capacity);
  for (const u of f.users.slice(0, capacity))
    await f.hub.command(u.id, { type: 'lobby.ready', ready: true });
  await f.hub.command(f.users[0].id, { type: 'lobby.start' });
  return id;
}
test('protocol rejects forged identity, malformed payloads and impossible actions', () => {
  assert.equal(
    commandSchema.safeParse({ type: 'quick.join', game: 'tetris', userId: randomUUID() }).success,
    false,
  );
  assert.equal(
    inputSchema.safeParse({ matchId: randomUUID(), seq: 1, actions: ['win'] }).success,
    false,
  );
  assert.equal(
    inputSchema.safeParse({ matchId: randomUUID(), seq: 1, actions: Array(100).fill('left') })
      .success,
    false,
  );
  assert.equal(
    commandSchema.safeParse({ type: 'lobby.join', id: randomUUID(), code: 'ABCDEFGH23' }).success,
    false,
  );
});
test('quick queues isolate games and prevent duplicate/cross-mode membership', async () => {
  const f = await fixture();
  const [a, b, c, d] = f.users;
  await f.hub.command(a.id, { type: 'quick.join', game: 'puyo' });
  await f.hub.command(b.id, { type: 'quick.join', game: 'tetris' });
  assert.equal(f.hub.matches.size, 0);
  await assert.rejects(f.hub.command(a.id, { type: 'quick.join', game: 'puyo' }));
  await f.hub.command(c.id, { type: 'quick.join', game: 'puyo' });
  assert.equal(f.hub.matches.size, 1);
  assert.equal(f.hub.session(a.id).matchId, f.hub.session(c.id).matchId);
  await f.hub.command(d.id, { type: 'quick.join', game: 'tetris' });
  assert.equal(f.hub.matches.size, 2);
  await assert.rejects(
    f.hub.command(a.id, {
      type: 'lobby.create',
      category: 'room',
      capacity: 4,
      visibility: 'public',
      name: 'x',
      game: 'puyo',
    }),
  );
});
test('private codes are unpredictable and absent from directory; room runs simultaneous matches', async () => {
  const f = await fixture(5);
  const id = await lobby(f, 'room', 4, 'private');
  assert.equal(f.hub.directory().length, 0);
  assert.match(f.hub.lobbies.get(id)!.code!, /^[A-Z2-9]{10}$/);
  await assert.rejects(f.hub.command(f.users[4].id, { type: 'lobby.join', id }));
  for (const u of f.users.slice(0, 4))
    await f.hub.command(u.id, { type: 'lobby.queue', join: true });
  assert.equal(f.hub.matches.size, 2);
  await f.hub.command(f.users[0].id, { type: 'match.surrender' });
  assert.equal(f.hub.lobbies.get(id)!.members.find((m) => m.id === f.users[0].id)!.status, 'idle');
  assert.equal(f.hub.lobbies.get(id)!.queue.length, 0);
});
test('room host migrates to oldest member; host-only operations are enforced', async () => {
  const f = await fixture();
  const id = await lobby(f, 'room');
  await assert.rejects(f.hub.command(f.users[1].id, { type: 'lobby.close' }));
  await f.hub.command(f.users[0].id, { type: 'lobby.leave' });
  assert.equal(f.hub.lobbies.get(id)!.host, f.users[1].id);
  await f.hub.command(f.users[1].id, { type: 'lobby.kick', userId: f.users[2].id });
  assert.equal(f.hub.session(f.users[2].id).lobby, null);
});
test('same-user reconnect restores the match; stale socket input/disconnect is ignored', async () => {
  const f = await fixture(2),
    [a, b] = f.users;
  await f.hub.command(a.id, { type: 'quick.join', game: 'tetris' });
  await f.hub.command(b.id, { type: 'quick.join', game: 'tetris' });
  const match = [...f.hub.matches.values()][0];
  match.battle.state = 'playing';
  await f.hub.disconnect(a.id, `socket-${a.id}`);
  assert.equal(match.view().state, 'paused');
  f.advance(1000);
  await f.hub.connect(a, 'new-socket');
  assert.equal(match.disconnected.size, 0);
  const x = match.battle.games[0].active!.x;
  f.hub.input(a.id, `socket-${a.id}`, { matchId: match.id, seq: 1, actions: ['left'] });
  match.step(16);
  assert.equal(match.battle.games[0].active!.x, x);
  f.hub.input(a.id, 'new-socket', { matchId: match.id, seq: 2, actions: ['left'] });
  match.step(16);
  assert.equal(match.battle.games[0].active!.x, x - 1);
  f.hub.input(a.id, 'new-socket', { matchId: match.id, seq: 2, actions: ['left'] });
  match.step(16);
  assert.equal(match.battle.games[0].active!.x, x - 1);
  await f.hub.disconnect(a.id, `socket-${a.id}`);
  assert.equal(match.disconnected.size, 0);
});
test('disconnect timeout saves a loss exactly once; DB outage retries without duplicate wins', async () => {
  const f = await fixture(2),
    [a, b] = f.users;
  await f.hub.command(a.id, { type: 'quick.join', game: 'puyo' });
  await f.hub.command(b.id, { type: 'quick.join', game: 'puyo' });
  const m = [...f.hub.matches.values()][0];
  await f.hub.disconnect(a.id, `socket-${a.id}`);
  f.advance(DISCONNECT_GRACE_MS + 1);
  f.store.failFinish = true;
  f.hub.step(17);
  await f.settle();
  assert.equal(m.saved, false);
  f.store.failFinish = false;
  f.advance(3001);
  f.hub.step(17);
  await f.settle();
  assert.equal(m.saved, true);
  assert.equal(m.reason, 'disconnect');
  assert.equal(f.store.wins.get(b.id), 1);
  f.hub.step(17);
  await f.hub.command(b.id, { type: 'match.surrender' });
  assert.equal(f.store.wins.get(b.id), 1);
});
test('Puyo rejects hard-drop over the network and limits per-frame flood', async () => {
  const f = await fixture(2),
    [a, b] = f.users;
  for (const u of [a, b]) await f.hub.command(u.id, { type: 'quick.join', game: 'puyo' });
  const m = [...f.hub.matches.values()][0];
  m.battle.state = 'playing';
  const y = m.battle.games[0].active!.y;
  f.hub.input(a.id, `socket-${a.id}`, { matchId: m.id, seq: 1, actions: ['hardDrop', 'hold'] });
  m.step(16);
  assert.equal(m.battle.games[0].active!.y, y);
  for (let seq = 2; seq < 100; seq++)
    f.hub.input(a.id, `socket-${a.id}`, { matchId: m.id, seq, actions: Array(8).fill('left') });
  assert.ok(m.inputs[0].length <= 12);
});
test('4/8-player tournaments schedule rounds and persist a champion', async () => {
  for (const capacity of [4, 8]) {
    const f = await fixture(capacity),
      id = await startCompetition(f, 'tournament', capacity);
    for (let guard = 0; f.hub.lobbies.get(id)!.phase === 'running' && guard < 10; guard++) {
      for (const m of f.hub.matches.values())
        if (!m.saved) {
          await f.hub.command(m.record.players[0].id, { type: 'match.surrender' });
        }
      f.advance(6000);
      f.hub.maintain();
      await f.settle();
    }
    const l = f.hub.lobbies.get(id)!;
    assert.equal(l.phase, 'finished');
    assert.ok(l.champion);
    assert.equal(l.fixtures.filter((x) => x.status === 'finished').length, capacity - 1);
    assert.equal(f.store.competitions.get(id)!.champion, l.champion);
  }
});
test('league round robin pairs each opponent once, never overlaps player, completes standings', async () => {
  for (const size of [4, 6, 8]) {
    const fixtures = leagueFixtures(Array.from({ length: size }, (_, i) => String(i)));
    assert.equal(fixtures.length, (size * (size - 1)) / 2);
    assert.equal(
      new Set(fixtures.map((f) => [...f.players].sort().join(':'))).size,
      fixtures.length,
    );
    for (let r = 1; r < size; r++)
      assert.equal(
        new Set(fixtures.filter((f) => f.round === r).flatMap((f) => f.players)).size,
        size,
      );
  }
  const f = await fixture(4),
    id = await startCompetition(f, 'league');
  for (let guard = 0; f.hub.lobbies.get(id)!.phase === 'running' && guard < 10; guard++) {
    for (const m of f.hub.matches.values())
      if (!m.saved) await f.hub.command(m.record.players[0].id, { type: 'match.surrender' });
    f.advance(6000);
    f.hub.maintain();
    await f.settle();
  }
  const l = f.hub.lobbies.get(id)!;
  assert.equal(l.phase, 'finished');
  assert.equal(l.fixtures.length, 6);
  assert.ok(l.standings.every((r) => r.played === 3));
  assert.equal(
    l.standings.reduce((n, r) => n + r.wins, 0),
    6,
  );
});
test('league tied mini-table results share rank and tournament seeded bracket has correct slots', () => {
  const members = ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    username: id,
    wins: 0,
    joinedAt: 0,
    connected: true,
    ready: true,
    status: 'idle' as const,
    withdrawn: false,
  }));
  const fixtures = leagueFixtures(members.map((m) => m.id));
  fixtures.forEach((f) => {
    f.status = 'finished';
    f.winner = null;
  });
  assert.deepEqual(
    standings({ members, fixtures }).map((r) => r.rank),
    [1, 1, 1, 1],
  );
  assert.deepEqual(
    tournamentFixtures(['a', 'b', 'c', 'd']).map((f) => f.players),
    [
      ['a', 'b'],
      ['c', 'd'],
      [null, null],
    ],
  );
});
test('tournament withdrawals resolve walkovers and never stall later rounds', async () => {
  const f = await fixture(4),
    id = await startCompetition(f, 'tournament');
  const matches = [...f.hub.matches.values()];
  for (const m of matches) await f.hub.command(m.record.players[0].id, { type: 'lobby.leave' });
  f.advance(6000);
  f.hub.maintain();
  await f.settle();
  const final = [...f.hub.matches.values()].find((m) => !m.saved);
  assert.ok(final);
  await f.hub.command(final.record.players[0].id, { type: 'match.surrender' });
  assert.equal(f.hub.lobbies.get(id)!.phase, 'finished');
});
test('Socket.IO verifies token/origin, rejects spoofed payload and reconnects by authenticated identity', async (t) => {
  const users = new Map(
    ['one', 'two'].map((token) => [
      token,
      { id: randomUUID(), username: token, wins: 0, expiresAt: Date.now() + 60_000 },
    ]),
  );
  const server = await createGameServer({
    store: new MemoryStore(),
    origins: ['http://localhost:5173'],
    authenticate: async (token) => {
      const u = users.get(token);
      if (!u) throw new Error('bad token');
      return u;
    },
  });
  await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  const port = (server.http.address() as { port: number }).port,
    sockets: Socket[] = [];
  t.after(async () => {
    sockets.forEach((s) => s.disconnect());
    await server.close();
  });
  const connect = (token: string, origin = 'http://localhost:5173') => {
    const s = io(`http://127.0.0.1:${port}`, {
      auth: { token, version: PROTOCOL_VERSION },
      extraHeaders: { Origin: origin },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(s);
    return s;
  };
  const bad = connect('bad');
  await new Promise<void>((resolve) => bad.on('connect_error', () => resolve()));
  assert.equal(bad.connected, false);
  const forbidden = connect('one', 'https://evil.example');
  await new Promise<void>((resolve) => forbidden.on('connect_error', () => resolve()));
  assert.equal(forbidden.connected, false);
  const a = connect('one'),
    b = connect('two');
  await Promise.all(
    [a, b].map((s) => new Promise<void>((resolve) => s.on('session', () => resolve()))),
  );
  const request = (s: Socket, payload: unknown) =>
    new Promise<any>((resolve) => s.emit('command', payload, resolve));
  assert.equal(
    (await request(a, { type: 'quick.join', game: 'tetris', userId: users.get('two')!.id })).ok,
    false,
  );
  assert.equal((await request(a, { type: 'quick.join', game: 'tetris' })).ok, true);
  assert.equal((await request(b, { type: 'quick.join', game: 'tetris' })).ok, true);
  const snapshot: any = await new Promise((resolve) => a.once('snapshot', resolve));
  assert.equal(snapshot.players[0].id, users.get('one')!.id);
  assert.equal('rng' in snapshot.games[0], false);
  const disconnected = new Promise<void>((resolve) => a.once('disconnect', () => resolve()));
  const duplicate = connect('one');
  await new Promise<void>((resolve) => duplicate.once('session', () => resolve()));
  await disconnected;
  assert.equal(a.connected, false);
  assert.equal(server.hub.session(users.get('one')!.id).matchId, snapshot.id);
});
