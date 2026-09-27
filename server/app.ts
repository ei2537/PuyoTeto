import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { performance } from 'node:perf_hooks';
import {
  commandSchema,
  inputSchema,
  PROTOCOL_VERSION,
  type ClientEvents,
  type Identity,
  type ServerEvents,
} from '../shared/protocol';
import { Hub } from './Hub';
import type { Store } from './store';

interface Options {
  store: Store;
  authenticate: (token: string) => Promise<Identity>;
  origins: string[];
  startLoops?: boolean;
}
export async function createGameServer(options: Options) {
  // Fail closed when migrations/DB are unavailable. Recovery completes before accepting players.
  await options.store.recover();
  let closing = false;
  const http = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.url === '/health') {
      res.statusCode = closing ? 503 : 200;
      res.end(JSON.stringify({ ok: !closing, protocol: PROTOCOL_VERSION }));
    } else {
      res.statusCode = 404;
      res.end('{"error":"Not found"}');
    }
  });
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, { identity: Identity }>(
    http,
    {
      cors: { origin: options.origins, methods: ['GET', 'POST'] },
      serveClient: false,
      maxHttpBufferSize: 8192,
      allowRequest: (req, done) => done(null, options.origins.includes(req.headers.origin || '')),
      pingInterval: 10_000,
      pingTimeout: 10_000,
    },
  );
  const socketByUser = new Map<string, string>();
  const hub = new Hub(options.store, (id, event, ...args) => {
    const sid = socketByUser.get(id);
    if (sid) (io.to(sid).emit as (...args: unknown[]) => void)(event, ...args);
  });
  const attempts = new Map<string, { count: number; at: number }>();
  io.use(async (socket, next) => {
    const ip = socket.handshake.address;
    const now = Date.now(),
      rate = attempts.get(ip);
    if (rate && now - rate.at < 60_000 && rate.count >= 30) {
      next(new Error('接続回数が多すぎます。1分後に再試行してください。'));
      return;
    }
    attempts.set(
      ip,
      rate && now - rate.at < 60_000 ? { ...rate, count: rate.count + 1 } : { count: 1, at: now },
    );
    const token = socket.handshake.auth?.token;
    if (
      socket.handshake.auth?.version !== PROTOCOL_VERSION ||
      typeof token !== 'string' ||
      token.length > 8192
    ) {
      next(new Error('認証情報またはクライアントのバージョンが不正です。'));
      return;
    }
    try {
      socket.data.identity = await options.authenticate(token);
      next();
    } catch {
      next(new Error('認証できません。ログインを更新してください。'));
    }
  });
  io.on('connection', async (socket) => {
    const identity = socket.data.identity,
      id = identity.id;
    const old = socketByUser.get(id);
    socketByUser.set(id, socket.id);
    if (old && old !== socket.id) {
      io.to(old).emit('replaced');
      io.sockets.sockets.get(old)?.disconnect(true);
    }
    await hub.connect(identity, socket.id);
    let commands = 0,
      windowAt = Date.now();
    socket.on('command', async (raw, reply) => {
      if (typeof reply !== 'function') return;
      if (socketByUser.get(id) !== socket.id) {
        reply({ ok: false, error: '別のタブに接続が移りました。' });
        return;
      }
      if (Date.now() - windowAt >= 10_000) {
        commands = 0;
        windowAt = Date.now();
      }
      if (++commands > 30) {
        reply({ ok: false, error: '操作が多すぎます。少し待ってください。' });
        return;
      }
      const parsed = commandSchema.safeParse(raw);
      if (!parsed.success) {
        reply({ ok: false, error: '送信内容が不正です。' });
        return;
      }
      try {
        await hub.command(id, parsed.data);
        reply({ ok: true });
      } catch (error) {
        reply({
          ok: false,
          error:
            error instanceof Error && !error.cause
              ? error.message
              : 'サーバーへの保存に失敗しました。もう一度お試しください。',
        });
      }
    });
    socket.on('input', (raw) => {
      const parsed = inputSchema.safeParse(raw);
      if (parsed.success) hub.input(id, socket.id, parsed.data);
    });
    socket.on('disconnect', () => {
      if (socketByUser.get(id) === socket.id) socketByUser.delete(id);
      void hub.disconnect(id, socket.id);
    });
    if (!socket.connected) {
      if (socketByUser.get(id) === socket.id) socketByUser.delete(id);
      await hub.disconnect(id, socket.id);
    }
  });
  const timers: NodeJS.Timeout[] = [];
  if (options.startLoops !== false) {
    let last = performance.now(),
      accumulator = 0;
    timers.push(
      setInterval(() => {
        const now = performance.now();
        accumulator += Math.min(250, now - last);
        last = now;
        while (accumulator >= 1000 / 60) {
          hub.step(1000 / 60);
          accumulator -= 1000 / 60;
        }
      }, 1000 / 60),
    );
    timers.push(setInterval(() => hub.snapshots(), 50));
    timers.push(
      setInterval(() => {
        for (const socket of io.sockets.sockets.values())
          if (socket.data.identity.expiresAt <= Date.now()) {
            socket.emit('notice', 'ログインの期限を更新しています。');
            socket.disconnect(true);
          }
        for (const [ip, r] of attempts) if (Date.now() - r.at > 60_000) attempts.delete(ip);
        hub.maintain();
      }, 1000),
    );
  }
  return {
    http,
    io,
    hub,
    async close() {
      closing = true;
      timers.forEach(clearInterval);
      await hub.serial(() => {});
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
