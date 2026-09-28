import type { Category, Command, LobbyView, MatchSnapshot } from '../../shared/protocol';
import type { GameKind } from '../core/types';
import type { InputManager } from '../input/InputManager';
import { BoardRenderer, preview } from '../ui/Renderer';
import { escapeHTML as esc, playerView } from '../ui/PlayerView';
import { Auth } from './Auth';
import { OnlineClient } from './OnlineClient';

const categoryLabel = { room: 'ROOM MATCH', tournament: 'TOURNAMENT', league: 'LEAGUE' };
const phaseLabel = {
  waiting: '参加受付中',
  running: '対戦中',
  finished: '終了',
  cancelled: '中断',
};
const reasonLabel = {
  top_out: 'トップアウト',
  disconnect: '切断による決着',
  surrender: '投了',
  draw: '引き分け',
  server_restart: 'サーバー再起動',
};
export class OnlineUI {
  auth = new Auth();
  client = new OnlineClient();
  kind: GameKind = 'puyo';
  private root: HTMLElement | null = null;
  private view: 'hub' | 'create' | 'account' = 'hub';
  private formCategory: Category = 'room';
  private signup = false;
  private message = '';
  private rendered = '';
  private renderers: BoardRenderer[] = [];
  private matchId = '';
  private resultKey = '';
  private history = '';
  onAuthChange = () => {};
  constructor(
    private input: InputManager,
    private back: () => void,
    private openSettings: () => void,
  ) {
    this.auth.onChange = () => {
      if (this.auth.session && this.auth.profile)
        this.client.connect(this.auth.session.access_token);
      else if (!this.auth.session) this.client.disconnect();
      this.onAuthChange();
      this.refresh(true);
    };
    this.client.onChange = () => this.refresh();
    this.client.onNotice = (message) => {
      this.message = message;
      this.refresh(true);
    };
  }
  mount(root: HTMLElement, kind: GameKind, account = false) {
    this.root = root;
    this.kind = kind;
    this.view = account ? 'account' : 'hub';
    this.rendered = '';
    this.refresh(true);
  }
  unmount() {
    this.root = null;
    this.destroyBoards();
    this.input.keyboard.enabled = false;
  }
  private destroyBoards() {
    this.renderers.forEach((r) => r.destroy());
    this.renderers = [];
    this.matchId = '';
    this.resultKey = '';
  }
  get playing() {
    return !!this.root && !!this.matchId && this.client.snapshot?.state === 'playing';
  }
  private node<T extends HTMLElement = HTMLElement>(id: string) {
    return this.root?.querySelector<T>(`#${id}`) || null;
  }
  private on(id: string, fn: () => void | Promise<void>) {
    this.node(id)?.addEventListener('click', () => {
      void this.perform(fn);
    });
  }
  private async perform(fn: () => void | Promise<void>) {
    try {
      this.message = '';
      await fn();
    } catch (error) {
      this.message = error instanceof Error ? error.message : '操作に失敗しました。';
    } finally {
      // Keep a newly opened confirmation visible until the user answers it.
      if (!this.root?.querySelector('.inline-confirm')) this.refresh(true);
    }
  }
  private async command(command: Command) {
    await this.client.command(command);
  }
  exit() {
    if (this.client.session?.matchId && this.client.snapshot?.state !== 'finished') {
      this.confirm('対戦を投了して退出しますか？', async () => {
        await this.command({ type: 'match.surrender' });
        await this.leaveOnline();
        this.back();
      });
    } else
      void this.perform(async () => {
        await this.leaveOnline();
        this.back();
      });
  }
  private async leaveOnline() {
    if (this.client.session?.lobby) await this.command({ type: 'lobby.leave' });
    if (this.client.session?.queue) await this.command({ type: 'quick.leave' });
    if (this.client.session?.matchId) await this.command({ type: 'match.dismiss' });
  }
  private confirm(message: string, action: () => Promise<void>) {
    const root = this.root;
    if (!root) return;
    root.querySelector('.inline-confirm')?.remove();
    const dialog = document.createElement('div');
    dialog.className = 'inline-confirm';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', message);
    dialog.innerHTML = `<p>${esc(message)}</p><button class="danger" id="confirm-yes">実行</button><button id="confirm-no">キャンセル</button>`;
    root.prepend(dialog);
    dialog.querySelector('#confirm-no')!.addEventListener('click', () => dialog.remove());
    dialog.querySelector('#confirm-yes')!.addEventListener('click', () => {
      dialog.remove();
      void this.perform(action);
    });
    (dialog.querySelector('#confirm-no') as HTMLElement).focus();
  }
  private refresh(force = false) {
    if (!this.root) return;
    const session = this.client.session,
      snapshot = this.client.snapshot;
    if (
      this.auth.profile &&
      session?.matchId &&
      snapshot?.id === session.matchId &&
      this.view !== 'account'
    ) {
      if (this.matchId !== snapshot.id) this.mountMatch(snapshot);
      this.updateStatus();
      return;
    }
    const signature = JSON.stringify([
      this.view,
      this.auth.loading,
      this.auth.profile,
      this.signup,
      session,
      this.client.directory,
      this.message,
      this.auth.error,
    ]);
    if (!force && signature === this.rendered) {
      this.updateStatus();
      return;
    }
    // Background directory updates must not destroy fields while somebody types.
    if (!force && this.view === 'create') {
      this.updateStatus();
      return;
    }
    this.rendered = signature;
    this.destroyBoards();
    this.input.keyboard.enabled = false;
    if (!this.auth.client) {
      this.root.innerHTML = `<section class="menu online-menu"><div class="menu-top"><button class="back" id="online-back">← 戻る</button><span>ONLINE</span></div><h1>オンラインの準備中</h1><p>接続先がまだ設定されていません。CPU戦とローカル2Pはそのまま遊べます。</p></section>`;
      this.on('online-back', () => this.back());
      return;
    }
    if (this.auth.loading) {
      this.root.innerHTML =
        '<section class="menu"><p role="status">ログイン状態を確認しています…</p></section>';
      return;
    }
    if (!this.auth.profile) {
      this.authScreen();
      return;
    }
    if (this.view === 'account') {
      this.accountScreen();
      return;
    }
    if (session?.lobby) {
      this.lobbyScreen(session.lobby);
      return;
    }
    if (this.view === 'create') {
      this.createScreen();
      return;
    }
    this.hubScreen();
  }
  private header(title: string, eyebrow = 'ONLINE') {
    return `<div class="menu-top"><button class="back" id="online-back">← 戻る</button><span class="step-number">${eyebrow}</span></div><div class="online-heading"><h1>${title}</h1>${this.auth.profile ? `<button id="online-account">${esc(this.auth.profile.username)} · ${this.auth.profile.wins} WINS</button>` : ''}</div><p id="online-status" class="network-status" role="status">${esc(this.client.status)}</p><p class="online-message" role="alert">${esc(this.message || this.auth.error)}</p>`;
  }
  private bindHeader() {
    this.on('online-back', () => this.exit());
    this.on('online-account', () => {
      this.view = 'account';
      this.refresh(true);
    });
  }
  private updateStatus() {
    const el = this.node('online-status');
    if (el) el.textContent = this.client.status;
  }
  private authScreen() {
    this.root!.innerHTML = `<section class="menu online-menu">${this.header(this.signup ? 'アカウントを作る' : 'オンラインにログイン')}<form id="auth-form" class="auth-form">${this.signup ? '<label class="field">ユーザー名<input name="username" required pattern="[A-Za-z0-9_]{3,20}" maxlength="20" autocomplete="nickname"><span class="hint">英数字・_の3〜20文字。公開名になります。</span></label>' : ''}<label class="field">メールアドレス<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label class="field">パスワード<input name="password" type="password" autocomplete="${this.signup ? 'new-password' : 'current-password'}" minlength="8" maxlength="128" required></label><button class="primary" type="submit">${this.signup ? '登録する' : 'ログイン'}</button></form><button class="back" id="auth-switch">${this.signup ? '登録済みの方はこちら' : '新しいアカウントを作る'}</button><p class="settings-note">CPU戦・ローカル2Pはログインなしで遊べます。</p></section>`;
    this.on('online-back', () => this.back());
    this.on('auth-switch', () => {
      this.signup = !this.signup;
      this.message = '';
      this.refresh(true);
    });
    this.node<HTMLFormElement>('auth-form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement,
        data = new FormData(form);
      const button = form.querySelector('button')!;
      button.disabled = true;
      void this.perform(async () => {
        try {
          if (this.signup)
            this.message = await this.auth.signUp(
              String(data.get('email')),
              String(data.get('password')),
              String(data.get('username')),
            );
          else await this.auth.signIn(String(data.get('email')), String(data.get('password')));
        } finally {
          button.disabled = false;
        }
      });
    });
  }
  private hubScreen() {
    const queue = this.client.session?.queue;
    const rows = this.client.directory.filter((l) => l.game === this.kind);
    this.root!.innerHTML = `<section class="menu online-menu">${this.header('オンライン対戦', `${this.kind.toUpperCase()} / ONLINE`)}<div class="online-toolbar"><button id="online-puyo" aria-pressed="${this.kind === 'puyo'}">PUYO</button><button id="online-tetris" aria-pressed="${this.kind === 'tetris'}">TETRIS</button><button class="back" id="online-controls">操作設定</button><button class="back" id="online-retry">再接続</button></div>
      <div class="quick-match"><div><h2>QUICK MATCH</h2><p>${queue ? `${queue.toUpperCase()} の対戦相手を探しています…` : '同じゲームを選んだプレイヤーと1対1。'}</p></div><button class="primary" id="quick">${queue ? '検索をキャンセル' : '対戦相手を探す'}</button></div>
      <div class="online-toolbar"><h2>ROOMS & COMPETITIONS</h2><button id="create-lobby">作成する ＋</button></div><form id="code-form" class="join-code"><label for="join-code">参加コード</label><input id="join-code" name="code" placeholder="10文字のコード" maxlength="10" minlength="10" pattern="[A-Za-z2-9]{10}" required autocomplete="off"><button type="submit">参加</button></form>
      <div class="lobby-list">${rows.length ? rows.map((l) => `<div class="lobby-row"><div><strong>${esc(l.name)}</strong><span>${categoryLabel[l.category]} · ${l.count}/${l.capacity} · ${phaseLabel[l.phase]}</span></div><button data-join="${l.id}" ${l.phase !== 'waiting' || l.count >= l.capacity ? 'disabled' : ''}>参加</button></div>`).join('') : '<p class="empty-state">公開中の部屋はありません。作成するか、参加コードを入力してください。</p>'}</div></section>`;
    this.bindHeader();
    this.on('online-controls', () => this.openSettings());
    this.on('online-retry', () => this.client.retry());
    for (const kind of ['puyo', 'tetris'] as const)
      this.on(`online-${kind}`, () => {
        this.kind = kind;
        this.refresh(true);
      });
    this.on('quick', () =>
      this.command(queue ? { type: 'quick.leave' } : { type: 'quick.join', game: this.kind }),
    );
    this.on('create-lobby', () => {
      this.view = 'create';
      this.refresh(true);
    });
    this.node<HTMLFormElement>('code-form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      const code = this.node<HTMLInputElement>('join-code')!.value.trim().toUpperCase();
      void this.perform(() => this.command({ type: 'lobby.join', code }));
    });
    this.root!.querySelectorAll<HTMLElement>('[data-join]').forEach((button) =>
      button.addEventListener(
        'click',
        () =>
          void this.perform(() => this.command({ type: 'lobby.join', id: button.dataset.join! })),
      ),
    );
  }
  private createScreen() {
    this.root!.innerHTML = `<section class="menu online-menu">${this.header('部屋・大会を作る')}<form id="create-form" class="create-form"><label class="field">種類<select name="category" id="create-category">${(['room', 'tournament', 'league'] as const).map((c) => `<option value="${c}" ${c === this.formCategory ? 'selected' : ''}>${categoryLabel[c]}</option>`).join('')}</select></label><label class="field">名前<input name="name" maxlength="32" value="${this.kind === 'puyo' ? 'ぷよ' : 'テトリス'}対戦" required></label><label class="field">ゲーム<select name="game"><option value="puyo" ${this.kind === 'puyo' ? 'selected' : ''}>PUYO</option><option value="tetris" ${this.kind === 'tetris' ? 'selected' : ''}>TETRIS</option></select></label><label class="field">定員<select name="capacity" id="create-capacity"></select></label><label class="field">公開範囲<select name="visibility"><option value="public">公開 · 一覧に表示</option><option value="private">非公開 · コードで参加</option></select></label><p class="settings-note" id="create-explanation"></p><button class="primary" type="submit">作成する</button></form></section>`;
    this.on('online-back', () => {
      this.view = 'hub';
      this.refresh(true);
    });
    this.on('online-account', () => {
      this.view = 'account';
      this.refresh(true);
    });
    const setCategory = () => {
      this.formCategory = this.node<HTMLSelectElement>('create-category')!.value as Category;
      this.node('create-capacity')!.innerHTML = {
        room: [4, 8, 16],
        tournament: [4, 8],
        league: [4, 6, 8],
      }[this.formCategory]
        .map((n) => `<option>${n}</option>`)
        .join('');
      this.node('create-explanation')!.textContent = {
        room: '各プレイヤーが対戦キューに参加。複数の1対1を同時に遊べます。',
        tournament: '全員の準備完了後、ホストが開始。組み合わせはランダム、1敗で敗退。',
        league: '全員の準備完了後、総当たり戦。勝ち3点・引き分け1点。',
      }[this.formCategory];
    };
    setCategory();
    this.node('create-category')!.addEventListener('change', setCategory);
    this.node<HTMLFormElement>('create-form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      void this.perform(async () => {
        await this.command({
          type: 'lobby.create',
          category: this.formCategory,
          name: String(data.get('name')).trim(),
          game: data.get('game') as GameKind,
          capacity: Number(data.get('capacity')),
          visibility: data.get('visibility') as 'public' | 'private',
        });
        this.view = 'hub';
      });
    });
  }
  private lobbyScreen(l: LobbyView) {
    const self = l.members.find((m) => m.id === this.auth.profile!.id),
      host = l.host === this.auth.profile!.id;
    this.root!.innerHTML = `<section class="menu online-menu">${this.header(esc(l.name), `${l.game.toUpperCase()} / ${categoryLabel[l.category]}`)}<div class="online-toolbar"><span>${phaseLabel[l.phase]} · ${l.members.length}/${l.capacity} · ${l.visibility === 'public' ? '公開' : '非公開'}</span><button id="copy-code">コード ${esc(l.code || '')} をコピー</button><button class="back" id="leave-lobby">退出</button></div>
      <div class="lobby-members">${l.members.map((m) => `<div class="member-row"><strong>${esc(m.username)} ${m.id === l.host ? '<small>HOST</small>' : ''}</strong><span>${m.withdrawn ? '棄権' : !m.connected ? '再接続待ち' : m.status === 'playing' ? '対戦中' : m.status === 'queued' ? '対戦待ち' : m.ready ? '準備完了' : '待機中'}</span>${host && m.id !== l.host && l.phase === 'waiting' ? `<button class="back" data-kick="${m.id}" ${m.status === 'playing' ? 'disabled' : ''}>退出させる</button>` : ''}</div>`).join('')}</div>
      ${l.category === 'room' ? `<div class="lobby-bottom"><p>${l.queue.length} 人が対戦待ち</p><button class="primary" id="room-queue">${self?.status === 'queued' ? '対戦待ちを解除' : '対戦キューに参加'}</button></div>` : l.phase === 'waiting' ? `<div class="lobby-bottom"><button id="ready" aria-pressed="${!!self?.ready}">${self?.ready ? '準備を取り消す' : '準備完了'}</button>${host ? `<button class="primary" id="start-competition" ${l.members.length !== l.capacity || l.members.some((m) => !m.ready || !m.connected) ? 'disabled' : ''}>大会を開始</button>` : '<p>全員の準備後、ホストが開始します。</p>'}</div>` : ''}
      ${l.fixtures.length ? this.competitionHTML(l) : ''}
      ${host && l.phase === 'waiting' ? `<details class="host-settings"><summary>ホスト設定</summary><form id="host-form"><label>名前 <input name="name" value="${esc(l.name)}" maxlength="32" required></label><label>公開範囲 <select name="visibility"><option value="public" ${l.visibility === 'public' ? 'selected' : ''}>公開</option><option value="private" ${l.visibility === 'private' ? 'selected' : ''}>非公開</option></select></label><button type="submit">保存</button></form><button class="danger" id="close-lobby">部屋を閉じる</button></details>` : ''}</section>`;
    this.bindHeader();
    this.on('leave-lobby', () => {
      if (l.phase === 'running')
        this.confirm('大会から棄権して退出しますか？', () => this.command({ type: 'lobby.leave' }));
      else return this.command({ type: 'lobby.leave' });
    });
    this.on('copy-code', async () => {
      await navigator.clipboard.writeText(l.code || '');
      this.message = '参加コードをコピーしました。';
    });
    this.on('room-queue', () =>
      this.command({ type: 'lobby.queue', join: self?.status !== 'queued' }),
    );
    this.on('ready', () => this.command({ type: 'lobby.ready', ready: !self?.ready }));
    this.on('start-competition', () => this.command({ type: 'lobby.start' }));
    this.on('close-lobby', () =>
      this.confirm('この部屋を閉じて全員を退出させますか？', () =>
        this.command({ type: 'lobby.close' }),
      ),
    );
    this.root!.querySelectorAll<HTMLElement>('[data-kick]').forEach((b) =>
      b.addEventListener(
        'click',
        () =>
          void this.perform(() => this.command({ type: 'lobby.kick', userId: b.dataset.kick! })),
      ),
    );
    this.node<HTMLFormElement>('host-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      void this.perform(() =>
        this.command({
          type: 'lobby.update',
          name: String(data.get('name')),
          visibility: data.get('visibility') as 'public' | 'private',
        }),
      );
    });
  }
  private competitionHTML(l: LobbyView) {
    const name = (id: string | null) => esc(l.members.find((m) => m.id === id)?.username || '未定');
    return `${l.phase === 'finished' ? `<div class="competition-result"><strong>${l.champion ? `${name(l.champion)} CHAMPION` : l.category === 'league' ? '同率優勝' : '優勝者なし'}</strong></div>` : ''}${l.category === 'league' ? `<h2>順位表</h2><p class="settings-note">勝ち3点・引分1点。得点 → 同点者間の直接対決得点 → 勝数。すべて同じ場合は同順位。</p><table class="standings"><thead><tr><th>順位</th><th>プレイヤー</th><th>試合</th><th>勝</th><th>負</th><th>分</th><th>点</th></tr></thead><tbody>${l.standings.map((r) => `<tr><td>${r.rank}</td><td>${name(r.userId)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.draws}</td><td>${r.points}</td></tr>`).join('')}</tbody></table>` : ''}<div class="fixtures">${[
      ...new Set(l.fixtures.map((f) => f.round)),
    ]
      .map(
        (round) =>
          `<section><h3>${l.category === 'tournament' ? (round === Math.max(...l.fixtures.map((f) => f.round)) ? 'FINAL' : round === Math.max(...l.fixtures.map((f) => f.round)) - 1 ? 'SEMI FINAL' : `ROUND ${round}`) : `ROUND ${round}`}</h3>${l.fixtures
            .filter((f) => f.round === round)
            .map(
              (f) =>
                `<div class="fixture"><span>${name(f.players[0])} <small>vs</small> ${name(f.players[1])}</span><strong>${f.status === 'finished' ? (f.winner ? `${name(f.winner)} WIN${f.reason === 'bye' ? ' · 不戦勝' : ''}` : 'DRAW') : f.status === 'playing' ? 'PLAYING' : 'WAITING'}</strong></div>`,
            )
            .join('')}</section>`,
      )
      .join('')}</div>`;
  }
  private accountScreen() {
    this.root!.innerHTML = `<section class="menu online-menu">${this.header('アカウント')}<p>${esc(this.auth.session?.user.email || '')}</p><form id="profile-form" class="auth-form"><label class="field">ユーザー名<input name="username" required pattern="[A-Za-z0-9_]{3,20}" maxlength="20" value="${esc(this.auth.profile!.username)}"></label><button type="submit">名前を変更</button></form><p>通算 ${this.auth.profile!.wins} 勝</p><div class="online-toolbar"><button id="history-load">対戦・大会履歴を表示</button><button id="signout">ログアウト</button></div><div id="online-history">${this.history}</div></section>`;
    this.on('online-back', () => {
      this.view = 'hub';
      this.refresh(true);
    });
    this.on('signout', () =>
      this.confirm('ログアウトしますか？対戦中の場合は投了します。', async () => {
        if (this.client.session?.matchId && this.client.snapshot?.state !== 'finished')
          await this.command({ type: 'match.surrender' });
        await this.leaveOnline();
        await this.auth.signOut();
      }),
    );
    this.node<HTMLFormElement>('profile-form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      void this.perform(async () => {
        if (
          this.client.session?.lobby ||
          this.client.session?.queue ||
          this.client.session?.matchId
        )
          throw new Error('待機・部屋・対戦から退出してから変更してください。');
        await this.auth.rename(String(data.get('username')));
        this.client.disconnect();
        this.client.connect(this.auth.session!.access_token);
        this.message = 'ユーザー名を更新しました。';
      });
    });
    this.on('history-load', async () => {
      const id = this.auth.profile!.id;
      const [{ data: matches, error }, { data: members, error: memberError }] = await Promise.all([
        this.auth
          .client!.from('matches')
          .select('id,game_type,match_type,winner_id,ended_at,finish_reason')
          .or(`player1_id.eq.${id},player2_id.eq.${id}`)
          .order('started_at', { ascending: false })
          .limit(20),
        this.auth
          .client!.from('competition_members')
          .select('competition_id,competitions(id,name,status,state)')
          .eq('user_id', id)
          .limit(20),
      ]);
      if (error || memberError) throw new Error('履歴を読み込めません。');
      this.history = `<h2>最近の対戦</h2>${matches?.length ? matches.map((m) => `<div class="history-row"><span>${esc(m.game_type.toUpperCase())} · ${esc(m.match_type)}</span><strong>${!m.ended_at ? '進行中' : m.finish_reason === 'server_restart' ? '中断' : !m.winner_id ? 'DRAW' : m.winner_id === id ? 'WIN' : 'LOSE'}</strong><span>${m.ended_at ? esc(new Date(m.ended_at).toLocaleString()) : ''}</span></div>`).join('') : '<p>履歴はありません。</p>'}<h2>参加した大会</h2>${(members || []).map((row: any) => (row.competitions ? `<details><summary>${esc(row.competitions.name)} · ${esc(row.competitions.status)}</summary>${this.competitionHTML(row.competitions.state as LobbyView)}</details>` : '')).join('')}`;
      await this.auth.loadProfile();
    });
  }
  private mountMatch(s: MatchSnapshot) {
    this.destroyBoards();
    this.matchId = s.id;
    this.input.reset();
    this.input.keyboard.enabled = true;
    this.root!.innerHTML = `<section class="arena online-arena" aria-label="${s.game.toUpperCase()} オンライン対戦"><div class="match-bar"><div class="match-label"><h1>${s.game.toUpperCase()}</h1><span>${s.type.toUpperCase()}</span></div><div class="match-actions"><span class="mono" id="match-clock">00:00</span><button id="online-surrender">投了</button></div></div><p id="online-status" class="network-status" role="status"></p><div class="versus-layout">${playerView(s.game, 0, s.players[0].username, s.players[0].id === this.auth.profile!.id ? 'YOU' : 'OPPONENT')}<div class="middle-score"><div class="vs">VS</div></div>${playerView(s.game, 1, s.players[1].username, s.players[1].id === this.auth.profile!.id ? 'YOU' : 'OPPONENT')}<div class="countdown" id="online-countdown" hidden><span></span></div></div><div class="online-result" id="online-result" aria-live="polite"></div><p class="match-help">操作設定の PLAYER 1 のキー・コントローラーを使用。${s.game === 'puyo' ? '下入力でソフトドロップ。' : 'HOLDは左、NEXTは右。'}オンラインでは一時停止できません。</p></section>`;
    this.renderers = [0, 1].map(
      (p) => new BoardRenderer(this.node<HTMLCanvasElement>(`board-${p}`)!),
    );
    this.on('online-surrender', () =>
      this.confirm('この対戦を投了しますか？', () => this.command({ type: 'match.surrender' })),
    );
    this.root!.tabIndex = -1;
    this.root!.focus({ preventScroll: true });
  }
  step(dt: number) {
    if (!this.root || !this.matchId) return;
    const s = this.client.snapshot;
    if (!s || s.id !== this.matchId) return;
    this.input.keyboard.enabled = s.state === 'playing' && this.client.connected;
    if (this.input.keyboard.enabled && !this.root.querySelector('.inline-confirm'))
      this.client.input(this.input.actions(0, dt));
    const seconds = Math.floor(s.elapsed / 1000);
    this.node('match-clock')!.textContent =
      `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    for (const p of [0, 1]) {
      const g = s.games[p];
      this.renderers[p]?.draw(g);
      this.node(`score-${p}`)!.textContent = g.score.toLocaleString();
      this.node(`callout-${p}`)!.textContent = g.messageTime > 0 ? g.message : '';
      const garbage = g.incoming.reduce((n, v) => n + v.amount, 0);
      this.node(`garbage-${p}`)!.textContent = String(garbage);
      this.node(`garbage-bar-${p}`)!.style.width =
        `${Math.min(100, (garbage / (g.kind === 'puyo' ? 30 : 8)) * 100)}%`;
      preview(this.node<HTMLCanvasElement>(`next-${p}`)!, g.kind, g.next);
      if (g.kind === 'tetris') {
        preview(
          this.node<HTMLCanvasElement>(`hold-${p}`)!,
          'tetris',
          g.hold ? [g.hold] : [],
          g.holdUsed,
        );
        this.node(`detail-${p}`)!.textContent = `LINES ${g.lines}`;
        this.node(`combo-${p}`)!.textContent =
          `${g.combo > 0 ? `${g.combo} COMBO` : ''}${g.b2b ? ' · B2B' : ''}`;
      } else {
        this.node(`detail-${p}`)!.textContent = `BEST CHAIN ${g.bestChain}`;
        this.node(`combo-${p}`)!.textContent = g.chain ? `${g.chain} CHAIN` : '';
      }
    }
    const countdown = this.node('online-countdown')!;
    countdown.hidden = s.state !== 'countdown';
    countdown.firstElementChild!.textContent = String(Math.max(1, Math.ceil(s.countdown / 800)));
    const status = this.node('online-status')!;
    status.textContent = !this.client.connected
      ? this.client.status
      : s.disconnected.length
        ? `切断したプレイヤーの復帰待ち · あと ${Math.max(0, Math.ceil((Math.min(...s.disconnected.map((d) => d.until)) - Date.now()) / 1000))} 秒`
        : performance.now() - this.client.lastSnapshotAt > 1500
          ? '通信が遅れています…'
          : this.client.status;
    const key = `${s.state}:${s.saved}`;
    if (key !== this.resultKey) {
      this.resultKey = key;
      const result = this.node('online-result')!;
      result.innerHTML =
        s.state === 'finished'
          ? `<strong>${s.winner === null ? 'DRAW' : `${esc(s.players[s.winner].username)} WIN`}</strong><span>${s.reason ? reasonLabel[s.reason] : ''} · ${s.saved ? '記録しました' : '結果を保存中…'}</span>${s.saved ? `<button class="primary" id="online-result-back">${this.client.session?.lobby ? '部屋に戻る' : 'オンラインメニューへ'}</button>${s.type === 'quick' ? '<button id="online-again">もう一度検索</button>' : '<span>大会では次の対戦へ自動的に進みます。</span>'}` : ''}`
          : '';
      this.on('online-result-back', async () => {
        await this.command({ type: 'match.dismiss' });
        this.refresh(true);
      });
      this.on('online-again', async () => {
        await this.command({ type: 'match.dismiss' });
        await this.command({ type: 'quick.join', game: s.game });
      });
      if (s.saved) void this.auth.loadProfile();
    }
  }
}
