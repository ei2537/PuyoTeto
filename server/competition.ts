import { randomInt, randomUUID } from 'node:crypto';
import type { Fixture, LobbyView, Standing } from '../shared/protocol';

export function shuffled<T>(items: T[], random = randomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
const fixture = (round: number, slot: number, a: string | null, b: string | null): Fixture => ({
  id: randomUUID(),
  round,
  slot,
  players: [a, b],
  matchId: null,
  winner: null,
  status: 'pending',
  reason: null,
});
export function tournamentFixtures(players: string[]): Fixture[] {
  const out: Fixture[] = [];
  for (let round = 1, size = players.length / 2; size >= 1; round++, size /= 2)
    for (let slot = 0; slot < size; slot++)
      out.push(
        fixture(
          round,
          slot,
          round === 1 ? players[slot * 2] : null,
          round === 1 ? players[slot * 2 + 1] : null,
        ),
      );
  return out;
}
export function leagueFixtures(players: string[]): Fixture[] {
  const ring = [...players],
    out: Fixture[] = [];
  for (let round = 1; round < ring.length; round++) {
    for (let slot = 0; slot < ring.length / 2; slot++)
      out.push(fixture(round, slot, ring[slot], ring[ring.length - 1 - slot]));
    ring.splice(1, 0, ring.pop()!);
  }
  return out;
}
export function standings(lobby: Pick<LobbyView, 'members' | 'fixtures'>): Standing[] {
  const table: Standing[] = lobby.members.map((m) => ({
    userId: m.id,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    headToHead: 0,
    rank: 0,
  }));
  for (const f of lobby.fixtures.filter((f) => f.status === 'finished'))
    for (const id of f.players) {
      const row = table.find((r) => r.userId === id);
      if (!row) continue;
      row.played++;
      if (!f.winner) {
        row.draws++;
        row.points++;
      } else if (f.winner === id) {
        row.wins++;
        row.points += 3;
      } else row.losses++;
    }
  // Mini-table among all tied players; equal records share a rank (no arbitrary UUID winner).
  for (const row of table) {
    const tied = new Set(table.filter((r) => r.points === row.points).map((r) => r.userId));
    for (const f of lobby.fixtures)
      if (
        f.status === 'finished' &&
        f.players.includes(row.userId) &&
        f.players.every((id) => id && tied.has(id))
      )
        row.headToHead += f.winner === row.userId ? 3 : !f.winner ? 1 : 0;
  }
  table.sort(
    (a, b) =>
      b.points - a.points ||
      b.headToHead - a.headToHead ||
      b.wins - a.wins ||
      a.userId.localeCompare(b.userId),
  );
  table.forEach((r, i) => {
    const prev = table[i - 1];
    r.rank =
      prev && r.points === prev.points && r.headToHead === prev.headToHead && r.wins === prev.wins
        ? prev.rank
        : i + 1;
  });
  return table;
}
export function advance(lobby: LobbyView): void {
  if (lobby.category === 'tournament') {
    for (const f of lobby.fixtures.filter((f) => f.status === 'finished')) {
      const next = lobby.fixtures.find(
        (n) => n.round === f.round + 1 && n.slot === Math.floor(f.slot / 2),
      );
      if (next) next.players[f.slot % 2] = f.winner;
    }
    const final = lobby.fixtures.at(-1);
    if (final?.status === 'finished') {
      lobby.phase = 'finished';
      lobby.champion = final.winner;
    }
  } else if (lobby.category === 'league') {
    lobby.standings = standings(lobby);
    if (lobby.fixtures.length && lobby.fixtures.every((f) => f.status === 'finished')) {
      lobby.phase = 'finished';
      const leaders = lobby.standings.filter((r) => r.rank === 1);
      lobby.champion = leaders.length === 1 ? leaders[0].userId : null;
    }
  }
}
export function availableFixtures(lobby: LobbyView): Fixture[] {
  if (lobby.phase !== 'running') return [];
  const unfinished = lobby.fixtures.filter((f) => f.status !== 'finished');
  const round = Math.min(...unfinished.map((f) => f.round));
  return unfinished.filter((f) => f.round === round && f.status === 'pending');
}
