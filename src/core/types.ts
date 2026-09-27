export type Action = 'left' | 'right' | 'down' | 'rotateLeft' | 'rotateRight' | 'hardDrop' | 'hold';
export const ACTIONS: Action[] = [
  'left',
  'right',
  'down',
  'rotateLeft',
  'rotateRight',
  'hardDrop',
  'hold',
];
export type GameKind = 'puyo' | 'tetris';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Grid = number[][];
export type Cell = [number, number];
export interface Incoming {
  amount: number;
  readyAt: number;
}
export interface GameEvent {
  type: 'move' | 'rotate' | 'lock' | 'clear' | 'garbage' | 'hold';
  value?: number;
}
export interface GameModel {
  kind: GameKind;
  board: Grid;
  width: number;
  height: number;
  hidden: number;
  score: number;
  lost: boolean;
  incoming: Incoming[];
  outgoing: number;
  clock: number;
  pieces: number;
  phase: string;
  message: string;
  messageTime: number;
  events: GameEvent[];
  step(dt: number): void;
  act(action: Action): boolean;
  receive(amount: number): void;
  cancel(amount: number): number;
}
