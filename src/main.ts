import './style.css';
import { Battle } from './core/Battle';
import { CPUController } from './core/CPUController';
import { ACTIONS, type Action, type Difficulty, type GameKind } from './core/types';
import { InputManager } from './input/InputManager';
import {
  defaults,
  loadSettings,
  saveSettings,
  keyLabel,
  padLabel,
  type PadBinding,
} from './input/settings';
import { BoardRenderer, preview, drawEmblem } from './ui/Renderer';
import { AudioManager } from './ui/AudioManager';

type Screen = 'home' | 'select' | 'mode' | 'setup' | 'settings' | 'rules' | 'game';
const labels: Record<Action, string> = {
  left: '左に移動',
  right: '右に移動',
  down: 'ソフトドロップ',
  rotateLeft: '左回転',
  rotateRight: '右回転',
  hardDrop: 'ハードドロップ',
  hold: 'HOLD（テトリス）',
};
const settings = loadSettings(),
  input = new InputManager(settings),
  audio = new AudioManager(settings.volume);
const config: { kind: GameKind; mode: 'cpu' | 'local'; difficulty: Difficulty } = {
  kind: 'puyo',
  mode: 'cpu',
  difficulty: 'normal',
};
let screen: Screen = 'home',
  settingsReturn: Screen = 'home',
  ruleReturn: Screen = 'home',
  battle: Battle | null = null,
  cpu: CPUController | null = null;
let renderers: BoardRenderer[] = [],
  wins = [0, 0],
  resultCounted = false,
  overlayState = '',
  toastTimer = 0,
  resultShownAt = 0;
let capture: { player: number; action: Action; kind: 'keyboard' | 'pad'; ready: boolean } | null =
  null;
let lastPadSignature = '',
  menuPadPrevious = new Set<string>(),
  menuRepeat = 0;
const app = document.querySelector<HTMLDivElement>('#app')!;
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
app.innerHTML = /* HTML */ `<header class="app-header">
    <button class="brand" id="brand" aria-label="ホーム">
      <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span
      ><span class="brand-name">STACK <span>/</span> DUEL</span>
    </button>
    <div class="header-actions">
      <span class="connection" id="connection">KEYBOARD READY</span
      ><button id="sound" aria-label="サウンド切替"></button
      ><button id="settings-open">操作設定</button>
    </div>
  </header>
  <main id="main"></main>
  <footer class="app-footer">
    <span id="footer-help">KEYBOARD / GAMEPAD · 1–2 PLAYERS</span
    ><span>STACK / DUEL &nbsp; — &nbsp; LOCAL ARCADE</span>
  </footer>
  <div id="overlay-root"></div>
  <div class="toast" id="toast" role="status" hidden></div>`;
const main = document.querySelector<HTMLElement>('#main')!;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
function text(id: string, value: string) {
  const el = document.getElementById(id);
  if (el && el.textContent !== value) el.textContent = value;
}
function on(id: string, fn: () => void) {
  $(id)?.addEventListener('click', () => {
    audio.unlock();
    fn();
  });
}
function toast(message: string) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 3500);
}
function persist() {
  if (!saveSettings(settings)) toast('設定を保存できません。このタブでは設定を保持します。');
}
function soundButton() {
  text('sound', audio.volume > 0 ? 'SOUND ON' : 'SOUND OFF');
  $('sound').setAttribute('aria-pressed', String(audio.volume > 0));
}
on('sound', () => {
  settings.volume = audio.volume > 0 ? 0 : 0.35;
  audio.volume = settings.volume;
  soundButton();
  persist();
});
soundButton();
on('brand', () => {
  if (screen === 'game' && battle && battle.state !== 'finished') pause();
  else navigate('home');
});
on('settings-open', () => openSettings());
function openSettings() {
  if (screen === 'settings') return;
  if (screen === 'game') battle?.pause();
  settingsReturn = screen;
  navigate('settings');
}
function navigate(next: Screen) {
  capture = null;
  input.keyboard.capture = null;
  input.reset();
  renderers.forEach((r) => r.destroy());
  renderers = [];
  screen = next;
  input.keyboard.enabled =
    screen === 'game' && battle?.state !== 'paused' && battle?.state !== 'finished';
  main.className = screen === 'game' ? 'game-main' : '';
  $('overlay-root').innerHTML = '';
  overlayState = '';
  if (screen !== 'game' && screen !== 'settings' && battle) {
    cpu?.destroy();
    cpu = null;
    battle = null;
  }
  if (screen === 'home') home();
  else if (screen === 'select') selectGame();
  else if (screen === 'mode') selectMode();
  else if (screen === 'setup') setup();
  else if (screen === 'settings') settingsScreen();
  else if (screen === 'rules') rules();
  else mountGame();
  text(
    'footer-help',
    screen === 'game' ? 'ESC / START · PAUSE' : 'KEYBOARD / GAMEPAD · 1–2 PLAYERS',
  );
  if (screen !== 'game')
    (
      main.querySelector<HTMLElement>('.primary') ||
      main.querySelector<HTMLElement>('.choice') ||
      main.querySelector<HTMLElement>('button')
    )?.focus({ preventScroll: true });
}
function menuTop(step: string, back: Screen) {
  return /* HTML */ `<div class="menu-top">
    <button class="back" data-back="${back}">← 戻る</button><span class="step-number">${step}</span>
  </div>`;
}
function bindBack() {
  main
    .querySelector<HTMLElement>('[data-back]')
    ?.addEventListener('click', (e) =>
      navigate((e.currentTarget as HTMLElement).dataset.back as Screen),
    );
}
function home() {
  main.innerHTML = /* HTML */ `<section class="menu">
    <div class="home-top">
      <div class="home-intro">
        <p class="eyebrow">Puyo Puyo Tetris</p>
        <h1>ぷよテト</h1>
        <p>めざせ大連鎖!</p>
      </div>
      <div class="home-art" aria-hidden="true">
        <canvas id="home-puyo"></canvas><canvas id="home-tetris"></canvas>
      </div>
    </div>
    <div class="home-actions">
      <button class="primary" id="begin">ゲームをはじめる &nbsp; →</button>
      <p class="home-note">
        ひとりで CPU 戦。ふたりで LOCAL 対戦。<br />キーボード・コントローラー対応
      </p>
    </div>
    <div class="home-foot">
      <span>Ver 1.0</span><button class="back" id="rules">遊び方・ルール →</button>
    </div>
  </section>`;
  drawEmblem($('home-puyo'), 'puyo');
  drawEmblem($('home-tetris'), 'tetris');
  on('begin', () => navigate('select'));
  on('rules', () => {
    ruleReturn = 'home';
    navigate('rules');
  });
}
function selectGame() {
  main.innerHTML = /* HTML */ `<section class="menu">
    ${menuTop('01 / 03', 'home')}
    <div class="menu-heading">
      <p class="eyebrow">GAME SELECT</p>
      <h1>どちらで、対戦する？</h1>
    </div>
    <div class="selection">
      <button class="choice" id="choose-puyo">
        <span class="index mono">01</span
        ><span
          ><span class="title">PUYO</span
          ><span class="description">4つをつなげて、連鎖をつくる。</span></span
        ><canvas id="puyo-art" aria-hidden="true"></canvas><span class="arrow">→</span></button
      ><button class="choice" id="choose-tetris">
        <span class="index mono">02</span
        ><span
          ><span class="title">TETRIS</span
          ><span class="description">積み重ねて、ラインを消す。</span></span
        ><canvas id="tetris-art" aria-hidden="true"></canvas><span class="arrow">→</span>
      </button>
    </div>
  </section>`;
  drawEmblem($('puyo-art'), 'puyo');
  drawEmblem($('tetris-art'), 'tetris');
  bindBack();
  for (const kind of ['puyo', 'tetris'] as const)
    on(`choose-${kind}`, () => {
      config.kind = kind;
      navigate('mode');
    });
}
function selectMode() {
  main.innerHTML = /* HTML */ `<section class="menu">
    ${menuTop('02 / 03', 'select')}
    <div class="menu-heading">
      <p class="eyebrow">${config.kind.toUpperCase()} / MODE SELECT</p>
      <h1>対戦相手を選ぶ</h1>
    </div>
    <div class="selection">
      <button class="choice" id="choose-cpu">
        <span class="index mono">01</span
        ><span
          ><span class="title">VS CPU</span
          ><span class="description">自分のペースで。3段階の難易度。</span></span
        ><span class="arrow">→</span></button
      ><button class="choice" id="choose-local">
        <span class="index mono">02</span
        ><span
          ><span class="title">LOCAL 2P</span
          ><span class="description">ひとつの画面で、ふたりの真剣勝負。</span></span
        ><span class="arrow">→</span>
      </button>
    </div>
  </section>`;
  bindBack();
  for (const mode of ['cpu', 'local'] as const)
    on(`choose-${mode}`, () => {
      config.mode = mode;
      navigate('setup');
    });
}
function deviceOptions(player: number) {
  return (
    `<option value="keyboard">キーボード</option>` +
    input.gamepads
      .connected()
      .map(
        (p) =>
          `<option value="${p.index}" ${settings.players[player].gamepad === p.index ? 'selected' : ''} ${settings.players[1 - player].gamepad === p.index ? 'disabled' : ''}>PAD ${p.index + 1} · ${esc(p.id.slice(0, 44))}</option>`,
      )
      .join('')
  );
}
function deviceSelect(player: number) {
  return /* HTML */ `<label class="field"
    ><span class="player-tag ${player ? 'p2' : ''}">PLAYER ${player + 1} · INPUT</span
    ><select id="device-${player}" aria-label="Player ${player + 1} 入力デバイス">
      ${deviceOptions(player)}</select
    ><span class="hint">キーボードは常に併用できます。</span></label
  >`;
}
function bindDevices() {
  for (const i of [0, 1])
    $<HTMLSelectElement>(`device-${i}`)?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value,
        index = value === 'keyboard' ? null : Number(value);
      if (index !== null && settings.players[1 - i].gamepad === index) {
        toast('同じコントローラーは2人に割り当てられません。');
        return;
      }
      settings.players[i].gamepad = index;
      persist();
      const other = $<HTMLSelectElement>(`device-${1 - i}`);
      if (other) other.innerHTML = deviceOptions(1 - i);
    });
}
function setup() {
  const local = config.mode === 'local';
  main.innerHTML = /* HTML */ `<section class="menu">
    ${menuTop('03 / 03', 'mode')}
    <div class="menu-heading">
      <p class="eyebrow">${config.kind.toUpperCase()} / ${local ? 'LOCAL 2P' : 'VS CPU'}</p>
      <h1>対戦の準備</h1>
    </div>
    <div class="setup">
      <div class="setup-panel">
        <h3>PLAYER 1</h3>
        ${deviceSelect(0)}
        <p class="settings-note">${controlsText(0)}</p>
      </div>
      <div class="setup-panel">
        <h3>${local ? 'PLAYER 2' : 'CPU'}</h3>
        ${local ? `${deviceSelect(1)}<p class="settings-note">${controlsText(1)}</p>` : `<div class="field"><span>難易度</span><div class="difficulty">${(['easy', 'normal', 'hard'] as const).map((d) => `<button id="diff-${d}" class="${config.difficulty === d ? 'selected' : ''}" aria-pressed="${config.difficulty === d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div><span class="hint" id="difficulty-hint"></span></div>`}
      </div>
    </div>
    <p class="settings-note">
      コントローラーを接続したら、いずれかのボタンを押して認識させてください。
    </p>
    <div class="setup-bottom">
      <button class="back" id="setup-settings">操作設定を変更 →</button
      ><button class="primary" id="start-match">対戦スタート &nbsp; →</button>
    </div>
  </section>`;
  bindBack();
  bindDevices();
  if (!local)
    for (const d of ['easy', 'normal', 'hard'] as const)
      on(`diff-${d}`, () => {
        config.difficulty = d;
        for (const x of ['easy', 'normal', 'hard']) {
          $(`diff-${x}`).classList.toggle('selected', x === d);
          $(`diff-${x}`).setAttribute('aria-pressed', String(x === d));
        }
        difficultyHint();
      });
  difficultyHint();
  on('setup-settings', openSettings);
  on('start-match', () => {
    wins = [0, 0];
    startMatch();
  });
}
function difficultyHint() {
  text(
    'difficulty-hint',
    {
      easy: 'ゆっくり考える相手。操作と連鎖の練習に。',
      normal: '盤面を見ながら、バランスよく積む相手。',
      hard: '次のピースを先読みし、素早く攻める相手。',
    }[config.difficulty],
  );
}
function controlsText(player: number) {
  const k = settings.players[player].keyboard;
  return `${esc(keyLabel(k.left))} ${esc(keyLabel(k.right))}：移動　${esc(keyLabel(k.down))}：落下<br>${esc(keyLabel(k.rotateLeft))} / ${esc(keyLabel(k.rotateRight))}：回転　${esc(keyLabel(k.hardDrop))}：一気に落とす${config.kind === 'tetris' ? `　${esc(keyLabel(k.hold))}：HOLD` : ''}`;
}
function settingsScreen() {
  main.innerHTML = /* HTML */ `<section class="menu settings">
    <div class="menu-top">
      <button class="back" id="settings-back">← 戻る</button
      ><span class="step-number">INPUT SETTINGS</span>
    </div>
    <div class="menu-heading">
      <h1>操作設定</h1>
      <p>変更するボタンを選び、割り当てたいキーやボタンを押してください。</p>
    </div>
    <div class="input-selects">${deviceSelect(0)}${deviceSelect(1)}</div>
    <table class="key-table">
      <thead>
        <tr>
          <th>操作</th>
          <th>1P KEY</th>
          <th>1P PAD</th>
          <th>2P KEY</th>
          <th>2P PAD</th>
        </tr>
      </thead>
      <tbody>
        ${ACTIONS.map((a) => `<tr><td>${labels[a]}</td>${[0, 1].map((p) => `<td><button class="binding" id="key-${p}-${a}" aria-label="Player ${p + 1} ${labels[a]} キーボード">${esc(keyLabel(settings.players[p].keyboard[a]))}</button></td><td><button class="binding" id="pad-${p}-${a}" aria-label="Player ${p + 1} ${labels[a]} コントローラー">${padLabel(settings.players[p].pad[a])}</button></td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
    <p class="settings-message" id="capture-message" role="status">設定は自動保存されます。</p>
    <div class="settings-tools">
      <label class="field"
        >DAS · 連続移動開始<input
          id="das"
          type="number"
          min="60"
          max="300"
          step="10"
          value="${settings.das}"
          aria-label="DAS ミリ秒" /></label
      ><label class="field"
        >ARR · 連続移動間隔<input
          id="arr"
          type="number"
          min="0"
          max="100"
          step="5"
          value="${settings.arr}"
          aria-label="ARR ミリ秒" /></label
      ><label class="field"
        >音量<input id="volume" type="range" min="0" max="1" step="0.05" value="${settings.volume}"
      /></label>
    </div>
    <p class="settings-note">
      単位：ms。ARR 0 は端まで即移動。標準PAD：十字 / 左スティックで移動、X 左回転、A 右回転、Y
      ドロップ、LB HOLD。<br />ESC / START：一時停止。割り当て待機中の ESC：キャンセル。PADの番号は
      B0 始まりです。
    </p>
    <div class="settings-bottom">
      <button id="reset-input">初期設定に戻す</button
      ><button class="primary" id="settings-done">完了</button>
    </div>
  </section>`;
  bindDevices();
  const back = () => {
    input.keyboard.capture = null;
    capture = null;
    navigate(settingsReturn);
  };
  on('settings-back', back);
  on('settings-done', back);
  for (const p of [0, 1])
    for (const a of ACTIONS) {
      on(`key-${p}-${a}`, () => beginCapture(p, a, 'keyboard'));
      on(`pad-${p}-${a}`, () => beginCapture(p, a, 'pad'));
    }
  for (const key of ['das', 'arr'] as const)
    $<HTMLInputElement>(key).addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement,
        n = Number(el.value);
      settings[key] = Math.max(
        key === 'das' ? 60 : 0,
        Math.min(key === 'das' ? 300 : 100, Number.isFinite(n) ? n : key === 'das' ? 140 : 30),
      );
      el.value = String(settings[key]);
      persist();
    });
  $<HTMLInputElement>('volume').addEventListener('input', (e) => {
    settings.volume = Number((e.target as HTMLInputElement).value);
    audio.volume = settings.volume;
    soundButton();
    persist();
  });
  on('reset-input', () => {
    const pads = settings.players.map((p) => p.gamepad);
    Object.assign(settings, defaults());
    settings.players.forEach((p, i) => (p.gamepad = pads[i]));
    audio.volume = settings.volume;
    soundButton();
    persist();
    settingsScreen();
  });
}
function beginCapture(player: number, action: Action, kind: 'keyboard' | 'pad') {
  if (kind === 'pad' && settings.players[player].gamepad === null) {
    text('capture-message', '先に、このプレイヤーのコントローラーを選択してください。');
    return;
  }
  capture = { player, action, kind, ready: false };
  input.keyboard.clear();
  main.querySelectorAll('.capturing').forEach((el) => el.classList.remove('capturing'));
  $(`${kind === 'keyboard' ? 'key' : 'pad'}-${player}-${action}`).classList.add('capturing');
  text(
    'capture-message',
    `Player ${player + 1} / ${labels[action]}：${kind === 'keyboard' ? 'キー' : 'ボタン、またはスティック'}を入力（ESCでキャンセル）`,
  );
  input.keyboard.capture = (code) => {
    if (code === 'Escape') {
      cancelCapture();
      return;
    }
    if (kind !== 'keyboard') return;
    if (['Tab', 'F5', 'F11', 'F12'].includes(code)) {
      text('capture-message', 'このキーはブラウザ操作用です。別のキーを選んでください。');
      return;
    }
    const conflicts = settings.players.flatMap((p, i) =>
      ACTIONS.filter((a) => p.keyboard[a] === code && !(i === player && a === action)).map((a) => ({
        i,
        a,
      })),
    );
    if (conflicts.length) {
      text(
        'capture-message',
        `Player ${conflicts[0].i + 1} の「${labels[conflicts[0].a]}」で使用中です。別のキーを選んでください。`,
      );
      return;
    }
    settings.players[player].keyboard[action] = code;
    persist();
    cancelCapture();
    text(`key-${player}-${action}`, keyLabel(code));
    text('capture-message', 'キーボード設定を保存しました。');
  };
}
function cancelCapture() {
  capture = null;
  input.keyboard.capture = null;
  input.reset();
  main.querySelectorAll('.capturing').forEach((el) => el.classList.remove('capturing'));
  text('capture-message', '設定は自動保存されます。');
}
function savePadBinding(binding: PadBinding) {
  if (!capture) return;
  const { player, action } = capture;
  if (binding.type === 'button' && binding.index === 9) {
    text('capture-message', 'START は一時停止用です。別のボタンを選んでください。');
    capture.ready = false;
    return;
  }
  const duplicate = ACTIONS.find(
    (a) =>
      a !== action && JSON.stringify(settings.players[player].pad[a]) === JSON.stringify(binding),
  );
  if (duplicate) {
    text('capture-message', `「${labels[duplicate]}」で使用中です。別のボタンを選んでください。`);
    capture.ready = false;
    return;
  }
  settings.players[player].pad[action] = binding;
  persist();
  cancelCapture();
  text(`pad-${player}-${action}`, padLabel(binding));
  text('capture-message', 'コントローラー設定を保存しました。');
}
function rules() {
  main.innerHTML = /* HTML */ `<section class="menu">
    ${menuTop('HOW TO PLAY', ruleReturn)}
    <div class="menu-heading"><h1>つなげて、消して、相手を追い込む。</h1></div>
    <h3>PUYO</h3>
    <ul class="rule-list">
      <li>同じ色を<strong>上下左右に4つ以上</strong>つなげると消去。続けて消えると連鎖。</li>
      <li>消去得点70点につき、おじゃま1個。連鎖ほど攻撃量が増えます。</li>
      <li>予告おじゃまは攻撃で相殺。1回の落下は最大30個。灰色は隣の色ぷよを消すと消えます。</li>
      <li>
        全消し後、次の消去に30個の攻撃ボーナス。上部の<strong>×の位置</strong>が埋まると敗北。
      </li>
    </ul>
    <h3>TETRIS</h3>
    <ul class="rule-list">
      <li>横一列を揃えると消去。4ライン同時消去、T-Spin、Comboで攻撃。</li>
      <li>HOLDでピースを保留。輪郭は落下先。SRS回転・7-bagを採用。</li>
      <li>消去で予告おじゃまを相殺。消去したターンはせり上がりを延期します。</li>
      <li>出現位置が埋まるか、ピース全体が盤面上部に固定されると敗北。</li>
    </ul>
    <p class="settings-note">
      同じ種類どうしの対戦です。両者に同じ順番のピースを配ります。<br />操作設定でキー割り当て、コントローラー、移動速度を変更できます。
    </p>
  </section>`;
  bindBack();
}
function startMatch() {
  audio.unlock();
  cpu?.destroy();
  battle = new Battle(config.kind);
  cpu = config.mode === 'cpu' ? new CPUController(config.difficulty) : null;
  resultCounted = false;
  navigate('game');
}
function mountGame() {
  if (!battle) {
    navigate('home');
    return;
  }
  main.innerHTML = /* HTML */ `<section
    class="arena"
    aria-label="${config.kind.toUpperCase()} 対戦画面"
  >
    <div class="match-bar">
      <div class="match-label">
        <h1>${config.kind.toUpperCase()}</h1>
        <span
          >${config.mode === 'cpu' ? `VS CPU · ${config.difficulty.toUpperCase()}` : 'LOCAL 2P'}</span
        >
      </div>
      <div class="match-actions">
        <span class="match-clock mono" id="match-clock">00:00</span
        ><button id="pause">一時停止 &nbsp; Ⅱ</button>
      </div>
    </div>
    <div class="versus-layout">
      ${playerMarkup(0)}
      <div class="middle-score">
        <div class="vs">VS</div>
        <div class="round-score mono" id="round-score">${wins[0]}:${wins[1]}</div>
        <div class="round-label">WINS</div>
      </div>
      ${playerMarkup(1)}
      <div class="countdown" id="countdown" hidden><span id="countdown-text">3</span></div>
    </div>
    <div class="match-help">
      <div><strong>1P</strong>　${controlsText(0)}</div>
      <div>
        ${config.mode === 'local' ? `<strong>2P</strong>　${controlsText(1)}` : `<strong>${config.kind === 'puyo' ? '4つつなげて消去' : '1列揃えて消去'}</strong><br>${config.kind === 'puyo' ? '×の位置が埋まると敗北' : '輪郭は落下先 · 接地後も回転できます'}`}
      </div>
    </div>
  </section>`;
  renderers = [0, 1].map((p) => new BoardRenderer($<HTMLCanvasElement>(`board-${p}`)));
  on('pause', pause);
  main.tabIndex = -1;
  main.focus({ preventScroll: true });
  drawGame();
}
function playerMarkup(p: number) {
  const isCPU = p === 1 && config.mode === 'cpu',
    dev = settings.players[p].gamepad;
  return /* HTML */ `<article class="player ${config.kind} ${p ? 'p2' : ''}">
    <div class="player-heading">
      <span class="player-name"><em>${p + 1}P</em>${isCPU ? 'CPU' : 'PLAYER ' + (p + 1)}</span
      ><span class="player-device"
        >${isCPU ? config.difficulty.toUpperCase() : dev === null ? 'KEYBOARD' : `PAD ${dev + 1}`}</span
      >
    </div>
    <div class="play-field">
      <div class="board-wrap">
        <canvas
          class="board"
          id="board-${p}"
          aria-label="${isCPU ? 'CPU' : 'Player ' + (p + 1)} の盤面"
        ></canvas>
        <div class="board-callout" id="callout-${p}"></div>
      </div>
      <aside class="rail">
        ${config.kind === 'tetris' ? `<div class="hold-box"><div class="rail-label">HOLD</div><canvas class="hold-preview" id="hold-${p}" aria-label="HOLD"></canvas></div>` : ''}
        <div class="rail-label">NEXT</div>
        <canvas class="preview" id="next-${p}" aria-label="次のピース"></canvas>
        <div class="stat">
          <div class="rail-label">SCORE</div>
          <div class="stat-value small mono" id="score-${p}">0</div>
        </div>
        <div class="stat">
          <div class="rail-label">GARBAGE</div>
          <div class="stat-value garbage-value mono" id="garbage-${p}">0</div>
          <div class="garbage-bar"><i id="garbage-bar-${p}" style="width:0"></i></div>
        </div>
      </aside>
    </div>
    <div class="player-bottom">
      <span id="detail-${p}">${config.kind === 'puyo' ? 'BEST CHAIN 0' : 'LINES 0'}</span
      ><span id="combo-${p}">—</span>
    </div>
  </article>`;
}
function pause() {
  if (!battle || screen !== 'game' || battle.state === 'finished') return;
  battle.pause();
  input.reset();
  drawGame();
}
function drawGame() {
  if (!battle || screen !== 'game') return;
  const b = battle;
  const secs = Math.floor(b.elapsed / 1000);
  text(
    'match-clock',
    `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`,
  );
  for (const p of [0, 1]) {
    const g = b.games[p];
    const device = settings.players[p].gamepad;
    const deviceLabel = main.querySelectorAll('.player-device')[p];
    const deviceText =
      p === 1 && config.mode === 'cpu'
        ? config.difficulty.toUpperCase()
        : device === null
          ? 'KEYBOARD'
          : `PAD ${device + 1}`;
    if (deviceLabel && deviceLabel.textContent !== deviceText) deviceLabel.textContent = deviceText;
    renderers[p]?.draw(g);
    text(`score-${p}`, g.score.toLocaleString());
    text(`callout-${p}`, g.messageTime > 0 ? g.message : '');
    const garbage = g.incoming.reduce((n, v) => n + v.amount, 0);
    text(`garbage-${p}`, String(garbage));
    $(`garbage-bar-${p}`).style.width =
      `${Math.min(100, (garbage / (g.kind === 'puyo' ? 30 : 8)) * 100)}%`;
    preview($(`next-${p}`), g.kind, g.next);
    if (g.kind === 'tetris') {
      preview($(`hold-${p}`), 'tetris', g.hold ? [g.hold] : [], g.holdUsed);
      text(`detail-${p}`, `LINES ${g.lines}`);
      text(
        `combo-${p}`,
        g.combo > 0 ? `${g.combo} COMBO${g.b2b ? ' · B2B' : ''}` : g.b2b ? 'B2B READY' : '—',
      );
    } else {
      text(`detail-${p}`, `BEST CHAIN ${g.bestChain}`);
      text(`combo-${p}`, g.chain > 0 ? `${g.chain} CHAIN` : '—');
    }
    for (const event of g.events.splice(0)) audio.play(g.kind, event);
  }
  $('countdown').hidden = b.state !== 'countdown';
  if (b.state === 'countdown')
    text(
      'countdown-text',
      b.countdown > 1600 ? '3' : b.countdown > 800 ? '2' : b.countdown > 200 ? '1' : 'GO',
    );
  if (b.state === 'finished' && !resultCounted) {
    if (b.winner !== null) wins[b.winner]++;
    resultCounted = true;
    resultShownAt = performance.now();
    text('round-score', `${wins[0]}:${wins[1]}`);
  }
  if (overlayState !== b.state) {
    overlayState = b.state;
    updateOverlay();
  }
}
function updateOverlay() {
  const b = battle;
  if (!b) return;
  const paused = b.state === 'paused',
    finished = b.state === 'finished';
  input.keyboard.enabled = !paused && !finished;
  if (!paused && !finished) {
    $('overlay-root').innerHTML = '';
    return;
  }
  input.reset();
  const name = b.winner === 1 && config.mode === 'cpu' ? 'CPU' : `PLAYER ${(b.winner ?? 0) + 1}`;
  const title = paused ? '一時停止' : b.winner === null ? 'DRAW' : `${name} WIN`;
  $('overlay-root').innerHTML =
    `<div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><p class="eyebrow">${paused ? 'TAKE YOUR TIME' : 'ROUND FINISHED'}</p><h2 id="dialog-title">${title}</h2><p>${paused ? '準備ができたら、対戦に戻りましょう。' : b.winner === null ? '両者が同時にトップアウト。もう一度、勝負。' : `${Math.floor(b.elapsed / 60000)}分${String(Math.floor(b.elapsed / 1000) % 60).padStart(2, '0')}秒の勝負。次の一戦へ。`}</p><div class="dialog-actions"><button class="primary" id="dialog-primary">${paused ? '対戦に戻る' : 'もう一度対戦'}</button>${paused ? '<button id="pause-settings">操作設定</button>' : ''}<button id="to-setup">対戦設定に戻る</button><button class="back" id="to-home">ホームへ</button></div></section></div>`;
  on('dialog-primary', () => {
    if (paused) {
      b.resume();
      input.reset();
      main.focus();
      drawGame();
    } else startMatch();
  });
  on('pause-settings', openSettings);
  on('to-setup', () => navigate('setup'));
  on('to-home', () => navigate('home'));
  $('dialog-primary').focus({ preventScroll: true });
}
function updateDevices(autoAssign = false) {
  input.gamepads.poll();
  const pads = input.gamepads.connected();
  if (autoAssign)
    for (const p of pads)
      if (!settings.players.some((s) => s.gamepad === p.index)) {
        const free = settings.players.find((s) => s.gamepad === null);
        if (free) free.gamepad = p.index;
      }
  text(
    'connection',
    pads.length
      ? `${pads.length} GAMEPAD${pads.length > 1 ? 'S' : ''} CONNECTED`
      : 'KEYBOARD READY',
  );
  $('connection').classList.toggle('online', pads.length > 0);
  if (screen === 'setup' || screen === 'settings')
    for (const p of [0, 1]) {
      const select = $<HTMLSelectElement>(`device-${p}`);
      if (select) select.innerHTML = deviceOptions(p);
    }
}
input.gamepads.onChange = () => updateDevices(true);
input.gamepads.onDisconnect = (index) => {
  if (
    screen === 'game' &&
    settings.players.some((p, i) => p.gamepad === index && (i === 0 || config.mode === 'local'))
  ) {
    pause();
    toast('コントローラーが切断されました。再接続、または操作設定で変更してください。');
  }
  settings.players.forEach((p) => {
    if (p.gamepad === index) p.gamepad = null;
  });
  cancelCapture();
};
window.addEventListener('blur', () => {
  if (screen === 'game') pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'game') pause();
});
// Do not turn the last drop/rotation of a lost round into an accidental rematch.
window.addEventListener('keydown', (e) => {
  if (
    screen === 'game' &&
    battle?.state === 'finished' &&
    performance.now() - resultShownAt < 500 &&
    (e.code === 'Space' || e.code === 'Enter')
  )
    e.preventDefault();
});

function menuGamepad(dt: number) {
  const down = new Set<string>();
  for (const p of input.gamepads.connected()) {
    if (p.buttons[12]?.pressed || (p.axes[1] || 0) < -0.55) down.add('up');
    if (p.buttons[13]?.pressed || (p.axes[1] || 0) > 0.55) down.add('down');
    if (p.buttons[14]?.pressed || (p.axes[0] || 0) < -0.55) down.add('left');
    if (p.buttons[15]?.pressed || (p.axes[0] || 0) > 0.55) down.add('right');
    if (p.buttons[0]?.pressed) down.add('accept');
    if (p.buttons[1]?.pressed) down.add('back');
  }
  if (
    capture ||
    (screen === 'game' && battle?.state !== 'paused' && battle?.state !== 'finished')
  ) {
    menuPadPrevious = down;
    return;
  }
  menuRepeat += dt;
  for (const direction of ['up', 'down', 'left', 'right'])
    if (down.has(direction) && (!menuPadPrevious.has(direction) || menuRepeat > 260)) {
      menuRepeat = 0;
      const active = document.activeElement;
      if ((direction === 'left' || direction === 'right') && active instanceof HTMLSelectElement) {
        const delta = direction === 'right' ? 1 : -1;
        let candidate = active.selectedIndex + delta;
        while (
          candidate >= 0 &&
          candidate < active.options.length &&
          active.options[candidate].disabled
        )
          candidate += delta;
        if (candidate >= 0 && candidate < active.options.length) {
          active.selectedIndex = candidate;
          active.dispatchEvent(new Event('change'));
        }
      } else {
        const root = $('overlay-root').children.length ? $('overlay-root') : main;
        const options = Array.from(
          root.querySelectorAll<HTMLElement>('button:not(:disabled),select,input'),
        ).filter((el) => el.offsetParent !== null);
        const i = options.indexOf(active as HTMLElement),
          delta = direction === 'up' || direction === 'left' ? -1 : 1;
        options[(i + delta + options.length) % options.length]?.focus();
      }
    }
  if (
    down.has('accept') &&
    !menuPadPrevious.has('accept') &&
    !(screen === 'game' && battle?.state === 'finished' && performance.now() - resultShownAt < 500)
  ) {
    audio.unlock();
    (document.activeElement as HTMLElement)?.click();
  }
  if (down.has('back') && !menuPadPrevious.has('back')) {
    if (screen === 'settings') navigate(settingsReturn);
    else if (screen === 'game' && battle?.state === 'paused') {
      $('dialog-primary').click();
    } else main.querySelector<HTMLElement>('.back')?.click();
  }
  menuPadPrevious = down;
}
let previous = performance.now(),
  accumulator = 0;
function frame(now: number) {
  const dt = Math.min(now - previous, 100);
  previous = now;
  input.gamepads.poll();
  const signature = input.gamepads
    .connected()
    .map((p) => `${p.index}:${p.id}`)
    .join('|');
  if (signature !== lastPadSignature) {
    lastPadSignature = signature;
    updateDevices(true);
  }
  if (capture?.kind === 'pad') {
    const index = settings.players[capture.player].gamepad;
    if (index !== null) {
      const binding = input.gamepads.detectBinding(index);
      if (!binding) capture.ready = true;
      else if (capture.ready) savePadBinding(binding);
    }
  }
  const pauseKey = input.pausePressed();
  if (screen === 'game' && battle && pauseKey) {
    if (battle.state === 'paused') {
      $('dialog-primary').click();
    } else pause();
  } else if (screen !== 'game' && input.keyboard.pressed.has('Escape') && !capture) {
    if (screen === 'settings') navigate(settingsReturn);
    else main.querySelector<HTMLElement>('.back')?.click();
  }
  menuGamepad(dt);
  if (screen === 'game' && battle) {
    if (battle.state === 'playing') {
      for (const p of [0, 1])
        if (p === 0 || config.mode === 'local') {
          const piece = battle.games[p].pieces;
          for (const action of input.actions(p, dt)) {
            battle.act(p, action);
            if (battle.games[p].pieces !== piece || battle.games[p].phase !== 'falling') break;
          }
        }
    }
    accumulator += dt;
    while (accumulator >= 1000 / 60) {
      if (battle.state === 'playing') cpu?.step(battle.games[1], 1000 / 60);
      battle.step(1000 / 60);
      accumulator -= 1000 / 60;
    }
    drawGame();
  } else accumulator = 0;
  input.endFrame();
  requestAnimationFrame(frame);
}

// Development-only inspection/fixture seam for deterministic browser QA. Removed by Vite production builds.
if (import.meta.env.DEV)
  Object.defineProperty(window, '__STACK_DUEL__', {
    value: {
      get battle() {
        return battle;
      },
      get screen() {
        return screen;
      },
      get input() {
        return input;
      },
      config,
      startMatch,
      draw: drawGame,
      finish: (loser: number) => {
        if (battle) {
          battle.countdown = 0;
          battle.state = 'playing';
          battle.games[loser].lost = true;
          battle.step(1);
          drawGame();
        }
      },
    },
  });
navigate('home');
updateDevices(true);
requestAnimationFrame(frame);
