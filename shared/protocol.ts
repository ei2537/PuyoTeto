import { z } from 'zod';
import type { PuyoGame } from '../src/games/puyo/PuyoGame';
import type { TetrisGame } from '../src/games/tetris/TetrisGame';
import type { GameKind } from '../src/core/types';

export const PROTOCOL_VERSION = 1;
export const DISCONNECT_GRACE_MS = 30_000;
export const gameKind = z.enum(['puyo', 'tetris']);
export const category = z.enum(['room', 'tournament', 'league']);
export type Category = z.infer<typeof category>;
export type MatchType = 'quick' | Category;
export type FinishReason = 'top_out' | 'disconnect' | 'surrender' | 'draw' | 'server_restart';
export interface Profile {
  id: string;
  username: string;
  wins: number;
}
export interface Identity extends Profile {
  expiresAt: number;
}
type CommonFields =
  | 'kind'
  | 'board'
  | 'width'
  | 'height'
  | 'hidden'
  | 'score'
  | 'lost'
  | 'incoming'
  | 'clock'
  | 'pieces'
  | 'phase'
  | 'message'
  | 'messageTime'
  | 'active'
  | 'next'
  | 'clearing'
  | 'phaseTime';
export type GameView =
  | Pick<
      PuyoGame,
      CommonFields | 'chain' | 'bestChain' | 'fallingFrom' | 'garbageDrops' | 'garbageTime'
    >
  | Pick<TetrisGame, CommonFields | 'hold' | 'holdUsed' | 'lines' | 'combo' | 'b2b'>;
export interface MatchSnapshot {
  id: string;
  tick: number;
  game: GameKind;
  type: MatchType;
  state: 'countdown' | 'playing' | 'paused' | 'finished';
  countdown: number;
  elapsed: number;
  players: [Profile, Profile];
  games: [GameView, GameView];
  winner: number | null;
  disconnected: { player: number; until: number }[];
  reason: FinishReason | null;
  saved: boolean;
}
export interface Member extends Profile {
  joinedAt: number;
  connected: boolean;
  ready: boolean;
  status: 'idle' | 'queued' | 'playing';
  withdrawn: boolean;
}
export interface Fixture {
  id: string;
  round: number;
  slot: number;
  players: [string | null, string | null];
  matchId: string | null;
  winner: string | null;
  status: 'pending' | 'playing' | 'finished';
  reason: FinishReason | 'bye' | null;
}
export interface Standing {
  userId: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  headToHead: number;
  rank: number;
}
export interface LobbySummary {
  id: string;
  name: string;
  category: Category;
  game: GameKind;
  visibility: 'public' | 'private';
  capacity: number;
  count: number;
  phase: 'waiting' | 'running' | 'finished' | 'cancelled';
}
export interface LobbyView extends LobbySummary {
  host: string;
  code?: string;
  members: Member[];
  queue: string[];
  fixtures: Fixture[];
  standings: Standing[];
  champion: string | null;
  createdAt: string;
}
export interface SessionView {
  userId: string;
  queue: GameKind | null;
  lobby: LobbyView | null;
  matchId: string | null;
}
export interface Reply {
  ok: boolean;
  error?: string;
}
const id = z.uuid();
const name = z.string().trim().min(1).max(32);
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('list') }).strict(),
  z.object({ type: z.literal('quick.join'), game: gameKind }).strict(),
  z.object({ type: z.literal('quick.leave') }).strict(),
  z
    .object({
      type: z.literal('lobby.create'),
      category,
      game: gameKind,
      name,
      visibility: z.enum(['public', 'private']),
      capacity: z
        .number()
        .int()
        .refine((n) => [4, 6, 8, 16].includes(n)),
    })
    .strict(),
  z
    .object({
      type: z.literal('lobby.join'),
      id: id.optional(),
      code: z
        .string()
        .regex(/^[A-Z2-9]{10}$/)
        .optional(),
    })
    .strict()
    .refine((x) => Boolean(x.id) !== Boolean(x.code), 'Choose id or code'),
  z.object({ type: z.literal('lobby.leave') }).strict(),
  z.object({ type: z.literal('lobby.queue'), join: z.boolean() }).strict(),
  z.object({ type: z.literal('lobby.ready'), ready: z.boolean() }).strict(),
  z.object({ type: z.literal('lobby.start') }).strict(),
  z
    .object({ type: z.literal('lobby.update'), name, visibility: z.enum(['public', 'private']) })
    .strict(),
  z.object({ type: z.literal('lobby.kick'), userId: id }).strict(),
  z.object({ type: z.literal('lobby.close') }).strict(),
  z.object({ type: z.literal('match.surrender') }).strict(),
  z.object({ type: z.literal('match.dismiss') }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const inputSchema = z
  .object({
    matchId: id,
    seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    actions: z
      .array(z.enum(['left', 'right', 'down', 'rotateLeft', 'rotateRight', 'hardDrop', 'hold']))
      .min(1)
      .max(8),
  })
  .strict();
export type InputPacket = z.infer<typeof inputSchema>;
export interface ServerEvents {
  session: (session: SessionView) => void;
  directory: (lobbies: LobbySummary[]) => void;
  snapshot: (snapshot: MatchSnapshot) => void;
  notice: (text: string) => void;
  replaced: () => void;
}
export interface ClientEvents {
  command: (command: Command, reply: (reply: Reply) => void) => void;
  input: (input: InputPacket) => void;
}
