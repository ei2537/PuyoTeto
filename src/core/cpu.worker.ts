import { planTetris, type TetrisSnapshot } from '../games/tetris/TetrisCPU';
import { planPuyo, type PuyoSnapshot } from '../games/puyo/PuyoCPU';
import type { Difficulty } from './types';
export interface CPURequest {
  id: number;
  snapshot: TetrisSnapshot | PuyoSnapshot;
  difficulty: Difficulty;
}
self.onmessage = (e: MessageEvent<CPURequest>) => {
  const { id, snapshot: s, difficulty } = e.data;
  const actions = s.kind === 'tetris' ? planTetris(s, difficulty) : planPuyo(s, difficulty);
  self.postMessage({ id, actions });
};
