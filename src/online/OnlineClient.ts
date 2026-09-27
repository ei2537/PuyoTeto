import { io, type Socket } from 'socket.io-client';
import {
  PROTOCOL_VERSION,
  type ClientEvents,
  type Command,
  type LobbySummary,
  type MatchSnapshot,
  type ServerEvents,
  type SessionView,
} from '../../shared/protocol';
import type { Action } from '../core/types';
export class OnlineClient {
  socket: Socket<ServerEvents, ClientEvents> | null = null;
  session: SessionView | null = null;
  directory: LobbySummary[] = [];
  snapshot: MatchSnapshot | null = null;
  status = '未接続';
  connected = false;
  lastSnapshotAt = 0;
  onChange = () => {};
  onNotice = (message: string) => {};
  private token = '';
  private seq = 0;
  private stopped = false;
  connect(token: string) {
    const url = import.meta.env.VITE_GAME_SERVER_URL;
    if (!url) {
      this.status = 'オンラインサーバーが未設定です';
      this.onChange();
      return;
    }
    if (this.token === token && this.socket) {
      return;
    }
    this.token = token;
    this.stopped = false;
    if (this.socket) {
      this.socket.auth = { token, version: PROTOCOL_VERSION };
      this.socket.disconnect().connect();
      return;
    }
    this.status = 'サーバーに接続中… 初回は起動まで時間がかかる場合があります';
    const socket = (this.socket = io(url, {
      auth: { token, version: PROTOCOL_VERSION },
      autoConnect: false,
      timeout: 15_000,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    }));
    socket.on('connect', () => {
      this.connected = true;
      this.seq = 0;
      this.status = '接続済み';
      this.onChange();
    });
    socket.on('connect_error', (error) => {
      this.connected = false;
      this.status = `接続待ち · ${error.message}`;
      this.onChange();
    });
    socket.on('disconnect', (reason) => {
      this.connected = false;
      this.status = this.stopped
        ? '別のタブに接続が移りました'
        : '再接続中… 対戦の復帰猶予は30秒です';
      this.onChange();
      if (reason === 'io server disconnect' && !this.stopped)
        setTimeout(() => {
          if (!this.stopped) socket.connect();
        }, 1500);
    });
    socket.on('session', (session) => {
      this.session = session;
      this.onChange();
    });
    socket.on('directory', (directory) => {
      this.directory = directory;
      this.onChange();
    });
    socket.on('snapshot', (snapshot) => {
      if (this.snapshot && this.snapshot.id === snapshot.id && snapshot.tick < this.snapshot.tick)
        return;
      if (this.session?.matchId && this.session.matchId !== snapshot.id) return;
      this.snapshot = snapshot;
      this.lastSnapshotAt = performance.now();
      this.onChange();
    });
    socket.on('notice', (message) => this.onNotice(message));
    socket.on('replaced', () => {
      this.stopped = true;
      this.status = '別のタブに接続が移りました';
      this.onChange();
    });
    socket.connect();
    this.onChange();
  }
  retry() {
    this.socket?.connect();
  }
  disconnect() {
    this.stopped = true;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.token = '';
    this.connected = false;
    this.session = null;
    this.snapshot = null;
    this.status = '未接続';
    this.onChange();
  }
  command(command: Command): Promise<void> {
    if (!this.connected || !this.socket)
      return Promise.reject(new Error('サーバーへの接続を待ってください。'));
    return new Promise((resolve, reject) =>
      this.socket!.timeout(12_000).emit('command', command, (error, reply) => {
        if (error) reject(new Error('応答を待っています。接続を確認してから再試行してください。'));
        else if (!reply.ok) reject(new Error(reply.error));
        else resolve();
      }),
    );
  }
  input(actions: Action[]) {
    const s = this.snapshot;
    if (
      !this.connected ||
      !s ||
      s.state !== 'playing' ||
      performance.now() - this.lastSnapshotAt > 1500
    )
      return;
    const filtered = actions.filter(
      (a) => s.game === 'tetris' || (a !== 'hardDrop' && a !== 'hold'),
    );
    for (let i = 0; i < filtered.length; i += 8)
      this.socket?.volatile.emit('input', {
        matchId: s.id,
        seq: this.seq++,
        actions: filtered.slice(i, i + 8),
      });
  }
}
