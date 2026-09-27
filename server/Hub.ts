import { randomBytes, randomUUID } from 'node:crypto';
import type { Action, GameKind } from '../src/core/types';
import {
  DISCONNECT_GRACE_MS,
  type Command,
  type FinishReason,
  type Identity,
  type InputPacket,
  type LobbySummary,
  type LobbyView,
  type Member,
  type Profile,
  type ServerEvents,
  type SessionView,
} from '../shared/protocol';
import {
  advance,
  availableFixtures,
  leagueFixtures,
  shuffled,
  tournamentFixtures,
} from './competition';
import { MatchRoom } from './MatchRoom';
import type { Store } from './store';

type Emit = <K extends keyof ServerEvents>(
  userId: string,
  event: K,
  ...args: Parameters<ServerEvents[K]>
) => void;
interface User {
  profile: Profile;
  socketId: string | null;
  expiresAt: number;
  disconnectedAt: number | null;
  lobbyId: string | null;
  queue: GameKind | null;
  matchId: string | null;
  lastSeq: number;
  tokens: number;
  refillAt: number;
}
const publicProfile = (p: Profile): Profile => ({ id: p.id, username: p.username, wins: p.wins });
function joinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...randomBytes(10)].map((b) => alphabet[b % 32]).join('');
}
function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

/** All state transitions run on one serialized command chain. Physics never awaits I/O. */
export class Hub {
  users = new Map<string, User>();
  lobbies = new Map<string, LobbyView>();
  matches = new Map<string, MatchRoom>();
  queues: Record<GameKind, string[]> = { puyo: [], tetris: [] };
  private tail: Promise<unknown> = Promise.resolve();
  private failures = new Map<string, number>();
  private housekeeping = false;
  constructor(
    public store: Store,
    private emit: Emit,
    public now = () => Date.now(),
  ) {}
  serial<T>(work: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => {});
    return result;
  }
  async connect(identity: Identity, socketId: string) {
    return this.serial(async () => {
      let u = this.users.get(identity.id);
      const oldSocket = u?.socketId;
      if (!u) {
        u = {
          profile: publicProfile(identity),
          socketId,
          expiresAt: identity.expiresAt,
          disconnectedAt: null,
          lobbyId: null,
          queue: null,
          matchId: null,
          lastSeq: -1,
          tokens: 100,
          refillAt: this.now(),
        };
        this.users.set(identity.id, u);
      }
      u.profile = publicProfile(identity);
      u.socketId = socketId;
      u.expiresAt = identity.expiresAt;
      u.disconnectedAt = null;
      u.lastSeq = -1;
      const match = u.matchId ? this.matches.get(u.matchId) : null;
      if (match) {
        match.disconnected.delete(match.record.players.findIndex((p) => p.id === identity.id));
        match.tick++;
        this.emit(identity.id, 'snapshot', match.view());
      }
      const lobby = u.lobbyId ? this.lobbies.get(u.lobbyId) : null;
      const member = lobby?.members.find((m) => m.id === identity.id);
      if (member) member.connected = true;
      this.broadcast();
      return oldSocket && oldSocket !== socketId ? oldSocket : null;
    });
  }
  disconnect(id: string, socketId: string) {
    return this.serial(() => {
      const u = this.users.get(id);
      if (!u || u.socketId !== socketId) return;
      u.socketId = null;
      u.disconnectedAt = this.now();
      this.unqueue(id);
      const lobby = u.lobbyId ? this.lobbies.get(u.lobbyId) : null;
      const member = lobby?.members.find((m) => m.id === id);
      if (member) {
        member.connected = false;
        member.ready = false;
        if (member.status === 'queued') member.status = 'idle';
      }
      if (lobby) lobby.queue = lobby.queue.filter((x) => x !== id);
      const match = u.matchId ? this.matches.get(u.matchId) : null;
      if (match && match.battle.state !== 'finished') {
        match.disconnected.set(
          match.record.players.findIndex((p) => p.id === id),
          this.now() + DISCONNECT_GRACE_MS,
        );
        match.inputs = [[], []];
        match.tick++;
      }
      this.broadcast();
    });
  }
  private unqueue(id: string) {
    for (const game of ['puyo', 'tetris'] as const)
      this.queues[game] = this.queues[game].filter((x) => x !== id);
    const u = this.users.get(id);
    if (u) u.queue = null;
  }
  private user(id: string) {
    return requireValue(this.users.get(id), 'ログインしてください。');
  }
  private lobby(id: string) {
    return requireValue(
      this.lobbies.get(requireValue(this.user(id).lobbyId, '参加中の部屋がありません。')),
      '部屋は閉じられました。',
    );
  }
  private busy(u: User) {
    return !!u.matchId && !this.matches.get(u.matchId)?.saved;
  }
  private free(u: User) {
    if (u.queue || u.lobbyId || this.busy(u))
      throw new Error('現在の待機・部屋・対戦を終了してから参加してください。');
  }
  private host(id: string, l: LobbyView) {
    if (l.host !== id) throw new Error('ホストのみ操作できます。');
  }
  private async persist(l: LobbyView) {
    await this.store.saveCompetition(l);
    this.lobbies.set(l.id, l);
  }
  command(id: string, command: Command) {
    return this.serial(async () => {
      const u = this.user(id);
      if (!u.socketId || u.expiresAt <= this.now()) throw new Error('接続を更新してください。');
      if (command.type === 'list') {
        this.broadcast(id);
        return;
      }
      if (command.type === 'quick.join') {
        this.free(u);
        u.matchId = null;
        u.queue = command.game;
        this.queues[command.game].push(id);
        await this.pairQuick(command.game);
      } else if (command.type === 'quick.leave') this.unqueue(id);
      else if (command.type === 'lobby.create') {
        this.free(u);
        const capacities = { room: [4, 8, 16], tournament: [4, 8], league: [4, 6, 8] };
        if (!capacities[command.category].includes(command.capacity))
          throw new Error('人数設定が不正です。');
        if (this.lobbies.size >= 200)
          throw new Error('部屋が満員です。時間をおいてお試しください。');
        const l: LobbyView = {
          id: randomUUID(),
          name: command.name,
          category: command.category,
          game: command.game,
          visibility: command.visibility,
          capacity: command.capacity,
          count: 1,
          phase: 'waiting',
          host: id,
          code: joinCode(),
          members: [this.member(u)],
          queue: [],
          fixtures: [],
          standings: [],
          champion: null,
          createdAt: new Date(this.now()).toISOString(),
        };
        await this.persist(l);
        u.lobbyId = l.id;
        u.matchId = null;
      } else if (command.type === 'lobby.join') {
        this.free(u);
        const original = command.code
          ? [...this.lobbies.values()].find((l) => l.code === command.code)
          : this.lobbies.get(command.id!);
        const l = structuredClone(
          requireValue(original, '部屋が見つかりません。コードを確認してください。'),
        );
        if (l.visibility === 'private' && !command.code)
          throw new Error('非公開の部屋には参加コードが必要です。');
        if (l.phase !== 'waiting') throw new Error('すでに開始・終了しています。');
        if (l.members.length >= l.capacity) throw new Error('満員です。');
        l.members.push(this.member(u));
        l.count = l.members.length;
        await this.persist(l);
        u.lobbyId = l.id;
        u.matchId = null;
      } else if (command.type === 'lobby.leave') await this.leave(id);
      else if (command.type === 'lobby.queue') {
        const l = this.lobby(id);
        if (l.category !== 'room') throw new Error('この部屋には対戦キューがありません。');
        if (this.busy(u)) throw new Error('対戦中です。');
        l.queue = l.queue.filter((x) => x !== id);
        if (command.join) {
          l.queue.push(id);
          u.matchId = null;
        }
        l.members.find((m) => m.id === id)!.status = command.join ? 'queued' : 'idle';
        await this.pairRoom(l);
      } else if (command.type === 'lobby.ready') {
        const l = structuredClone(this.lobby(id));
        if (l.category === 'room' || l.phase !== 'waiting')
          throw new Error('準備状態を変更できません。');
        l.members.find((m) => m.id === id)!.ready = command.ready;
        await this.persist(l);
      } else if (command.type === 'lobby.start') {
        const l = structuredClone(this.lobby(id));
        this.host(id, l);
        if (
          l.category === 'room' ||
          l.phase !== 'waiting' ||
          l.members.length !== l.capacity ||
          l.members.some((m) => !m.ready || !m.connected)
        )
          throw new Error('定員全員の接続と準備完了が必要です。');
        const players = shuffled(l.members.map((m) => m.id));
        l.fixtures =
          l.category === 'tournament' ? tournamentFixtures(players) : leagueFixtures(players);
        l.phase = 'running';
        await this.persist(l);
        await this.schedule(l.id);
      } else if (command.type === 'lobby.update') {
        const l = structuredClone(this.lobby(id));
        this.host(id, l);
        if (l.phase !== 'waiting') throw new Error('開始後は変更できません。');
        l.name = command.name;
        l.visibility = command.visibility;
        await this.persist(l);
      } else if (command.type === 'lobby.kick') {
        const l = this.lobby(id);
        this.host(id, l);
        if (
          l.phase !== 'waiting' ||
          command.userId === id ||
          !l.members.some((m) => m.id === command.userId) ||
          this.busy(this.user(command.userId))
        )
          throw new Error('このプレイヤーを退出させられません。');
        await this.leave(command.userId);
        this.emit(command.userId, 'notice', 'ホストにより部屋から退出しました。');
      } else if (command.type === 'lobby.close') {
        const l = this.lobby(id);
        this.host(id, l);
        if (l.phase === 'running' || l.members.some((m) => this.busy(this.user(m.id))))
          throw new Error('対戦中は閉じられません。');
        const closed = structuredClone(l);
        closed.phase = 'cancelled';
        await this.store.saveCompetition(closed);
        this.lobbies.delete(l.id);
        for (const m of l.members) {
          const other = this.users.get(m.id);
          if (other) other.lobbyId = null;
          this.emit(m.id, 'notice', '部屋が閉じられました。');
        }
      } else if (command.type === 'match.surrender') {
        const match = requireValue(this.matches.get(u.matchId!), '対戦がありません。');
        if (!match.saved)
          await this.finish(
            match,
            1 - match.record.players.findIndex((p) => p.id === id),
            'surrender',
          );
      } else if (command.type === 'match.dismiss') {
        if (this.busy(u)) throw new Error('対戦の結果を保存しています。');
        u.matchId = null;
      }
      this.broadcast();
    });
  }
  private member(u: User): Member {
    return {
      ...u.profile,
      joinedAt: this.now(),
      connected: true,
      ready: false,
      status: 'idle',
      withdrawn: false,
    };
  }
  private async pairQuick(game: GameKind) {
    const queue = this.queues[game];
    while (queue.length >= 2) {
      const ids: [string, string] = [queue[0], queue[1]];
      try {
        await this.startMatch(ids, game, 'quick', null, null);
        queue.splice(0, 2);
        ids.forEach((id) => {
          this.user(id).queue = null;
        });
      } catch (error) {
        ids.forEach((id) => {
          this.emit(id, 'notice', '試合を準備できません。接続を確認して再検索してください。');
          this.user(id).queue = null;
        });
        queue.splice(0, 2);
        throw error;
      }
    }
  }
  private async pairRoom(l: LobbyView) {
    while (l.queue.length >= 2) {
      const ids: [string, string] = [l.queue[0], l.queue[1]];
      await this.startMatch(ids, l.game, 'room', l.id, null);
      l.queue.splice(0, 2);
      ids.forEach((id) => {
        l.members.find((m) => m.id === id)!.status = 'playing';
      });
    }
  }
  private async startMatch(
    ids: [string, string],
    game: GameKind,
    type: MatchRoom['record']['type'],
    lobbyId: string | null,
    fixtureId: string | null,
  ) {
    if (ids.some((id) => this.busy(this.user(id)))) throw new Error('プレイヤーは別の対戦中です。');
    const m = new MatchRoom(
      {
        game,
        type,
        competitionId: type === 'tournament' || type === 'league' ? lobbyId : null,
        players: ids.map((id) => this.user(id).profile) as [Profile, Profile],
      },
      lobbyId,
      fixtureId,
    );
    await this.store.createMatch(m.persistence);
    this.matches.set(m.id, m);
    ids.forEach((id, player) => {
      const u = this.user(id);
      u.matchId = m.id;
      u.lastSeq = -1;
      if (!u.socketId) m.disconnected.set(player, this.now() + DISCONNECT_GRACE_MS);
    });
    return m;
  }
  private async leave(id: string) {
    const u = this.user(id),
      original = this.lobby(id),
      l = structuredClone(original);
    if (l.phase === 'running') {
      const member = l.members.find((m) => m.id === id)!;
      member.withdrawn = true;
      member.ready = false;
      member.status = 'idle';
    } else {
      l.members = l.members.filter((m) => m.id !== id);
      l.count = l.members.length;
    }
    l.queue = l.queue.filter((x) => x !== id);
    if (l.host === id)
      l.host =
        l.members.filter((m) => !m.withdrawn).sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id || id;
    if (!l.members.some((m) => !m.withdrawn)) l.phase = 'cancelled';
    await this.persist(l);
    u.lobbyId = null;
    const match = u.matchId ? this.matches.get(u.matchId) : null;
    if (match && !match.saved)
      await this.finish(match, 1 - match.record.players.findIndex((p) => p.id === id), 'surrender');
    u.matchId = null;
    if (!l.members.length || l.phase === 'cancelled') this.lobbies.delete(l.id);
    else if (l.phase === 'running') await this.schedule(l.id);
  }
  private async schedule(id: string) {
    const found = this.lobbies.get(id);
    if (!found || found.phase !== 'running') return;
    let l: LobbyView = found;
    for (const f of availableFixtures(l)) {
      // Withdrawal gives a walkover; no manufactured game or lifetime win.
      const eligible = f.players.filter(
        (p): p is string => !!p && !l!.members.find((m) => m.id === p)?.withdrawn,
      );
      if (eligible.length < 2) {
        const next: LobbyView = structuredClone(l),
          nf = next.fixtures.find((x) => x.id === f.id)!;
        nf.status = 'finished';
        nf.winner = eligible[0] || null;
        nf.reason = 'bye';
        advance(next);
        await this.persist(next);
        l = next;
        continue;
      }
      if (f.players.some((p) => this.busy(this.user(p!)))) continue;
      const m = await this.startMatch(
        f.players as [string, string],
        l.game,
        l.category,
        l.id,
        f.id,
      );
      const next = structuredClone(l),
        nf = next.fixtures.find((x) => x.id === f.id)!;
      nf.status = 'playing';
      nf.matchId = m.id;
      for (const p of f.players) next.members.find((x) => x.id === p)!.status = 'playing';
      await this.persist(next);
      l = next;
    }
    // Walkovers can make the next round ready immediately.
    if (availableFixtures(l).length && !l.fixtures.some((f) => f.status === 'playing'))
      await this.schedule(l.id);
  }
  private async finish(m: MatchRoom, winner: number | null, reason: FinishReason) {
    if (m.saved) return;
    m.finalizing = true;
    m.battle.state = 'finished';
    m.battle.winner = winner;
    m.reason = reason;
    m.disconnected.clear();
    m.tick++;
    const original = m.lobbyId ? this.lobbies.get(m.lobbyId) : null;
    const l = original ? structuredClone(original) : null;
    const winnerId = winner === null ? null : m.record.players[winner].id;
    if (l) {
      for (const p of m.record.players) {
        const member = l.members.find((x) => x.id === p.id);
        if (member) member.status = 'idle';
      }
      const f = l.fixtures.find((x) => x.id === m.fixtureId);
      if (f) {
        if (l.category === 'tournament' && !winnerId && reason === 'draw') {
          f.status = 'pending';
          f.matchId = null;
        } else {
          f.status = 'finished';
          f.winner = winnerId;
          f.reason = reason;
        }
        advance(l);
      }
    }
    try {
      await this.store.finishMatch(
        m.persistence,
        winnerId,
        reason,
        l && l.category !== 'room' ? l : null,
      );
    } catch (error) {
      m.finalizing = false;
      this.failures.set(m.id, this.now() + 3000);
      throw error;
    }
    m.saved = true;
    m.finishedAt = this.now();
    m.finalizing = false;
    this.failures.delete(m.id);
    if (winnerId) {
      const winnerUser = this.users.get(winnerId);
      if (winnerUser) winnerUser.profile.wins++;
    }
    if (l) this.lobbies.set(l.id, l);
    for (const p of m.record.players) this.emit(p.id, 'snapshot', m.view());
    this.broadcast();
    // Results remain visible briefly; a scheduled task starts the next competition game.
  }
  input(id: string, socketId: string, packet: InputPacket) {
    const u = this.users.get(id);
    if (
      !u ||
      u.socketId !== socketId ||
      u.matchId !== packet.matchId ||
      packet.seq <= u.lastSeq ||
      u.expiresAt <= this.now()
    )
      return;
    const m = this.matches.get(packet.matchId);
    if (!m || m.battle.state !== 'playing' || m.disconnected.size) return;
    const now = this.now();
    u.tokens = Math.min(100, u.tokens + (now - u.refillAt) * 0.12);
    u.refillAt = now;
    u.lastSeq = packet.seq;
    if (packet.actions.length > u.tokens) return;
    u.tokens -= packet.actions.length;
    const player = m.record.players.findIndex((p) => p.id === id);
    if (player < 0) return;
    const actions: Action[] = packet.actions.filter(
      (a) => m.record.game === 'tetris' || (a !== 'hardDrop' && a !== 'hold'),
    );
    // Bounded per-tick queue prevents a packet flood from starving simulation.
    m.inputs[player].push(...actions.slice(0, Math.max(0, 12 - m.inputs[player].length)));
  }
  step(dt: number) {
    for (const m of this.matches.values()) {
      m.step(dt);
      if (m.saved || m.finalizing || (this.failures.get(m.id) || 0) > this.now()) continue;
      const expired = [...m.disconnected].filter(([, until]) => until <= this.now());
      if (expired.length) {
        m.finalizing = true;
        void this.serial(() =>
          this.finish(m, expired.length === 2 ? null : 1 - expired[0][0], 'disconnect'),
        ).catch(() => {});
      } else if (m.battle.state === 'finished') {
        m.finalizing = true;
        void this.serial(() =>
          this.finish(
            m,
            m.battle.winner,
            m.reason || (m.battle.winner === null ? 'draw' : 'top_out'),
          ),
        ).catch(() => {});
      }
    }
  }
  snapshots() {
    for (const m of this.matches.values())
      if (!m.saved || this.now() - m.finishedAt < 10_000)
        for (const p of m.record.players)
          if (this.users.get(p.id)?.matchId === m.id) this.emit(p.id, 'snapshot', m.view());
  }
  maintain() {
    if (this.housekeeping) return;
    this.housekeeping = true;
    void this.serial(async () => {
      for (const [id, u] of this.users) {
        if (
          u.disconnectedAt !== null &&
          this.now() - u.disconnectedAt > DISCONNECT_GRACE_MS &&
          !this.busy(u)
        ) {
          if (u.lobbyId) await this.leave(id);
          this.users.delete(id);
        }
      }
      for (const l of this.lobbies.values())
        if (l.phase === 'running' && !l.fixtures.some((f) => f.status === 'playing')) {
          const recent = [...this.matches.values()].some(
            (m) => m.lobbyId === l.id && m.saved && this.now() - m.finishedAt < 5000,
          );
          if (!recent) await this.schedule(l.id);
        }
      for (const [id, m] of this.matches)
        if (m.saved && this.now() - m.finishedAt > 120_000) {
          this.matches.delete(id);
          for (const u of this.users.values()) if (u.matchId === id) u.matchId = null;
        }
      this.broadcast();
    })
      .catch((error) => console.error('Maintenance failed:', error.message))
      .finally(() => {
        this.housekeeping = false;
      });
  }
  session(id: string): SessionView {
    const u = this.user(id);
    return {
      userId: id,
      queue: u.queue,
      lobby: u.lobbyId ? this.lobbies.get(u.lobbyId) || null : null,
      matchId: u.matchId,
    };
  }
  directory(): LobbySummary[] {
    return [...this.lobbies.values()]
      .filter((l) => l.visibility === 'public')
      .map(({ id, name, category, game, visibility, capacity, count, phase }) => ({
        id,
        name,
        category,
        game,
        visibility,
        capacity,
        count,
        phase,
      }));
  }
  broadcast(only?: string) {
    for (const [id, u] of this.users)
      if (u.socketId && (!only || only === id)) {
        this.emit(id, 'session', this.session(id));
        this.emit(id, 'directory', this.directory());
      }
  }
}
