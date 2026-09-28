import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __STACK_DUEL__: any;
    __fakePads: any[];
  }
}
async function start(
  page: Page,
  kind: 'puyo' | 'tetris',
  mode: 'cpu' | 'local' = 'local',
  difficulty = 'normal',
) {
  await page.goto('/');
  await page.getByRole('button', { name: 'ゲームをはじめる' }).click();
  await page.locator(`#choose-${kind}`).click();
  await page.locator(`#choose-${mode}`).click();
  if (mode === 'cpu') await page.locator(`#diff-${difficulty}`).click();
  await page.getByRole('button', { name: '対戦スタート' }).click();
  await expect(page.locator('#countdown')).toBeVisible();
  await page.waitForFunction(() => window.__STACK_DUEL__.battle?.state === 'playing');
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  (page as any).__errors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as any).__errors).toEqual([]);
});

test('home, menu navigation, settings persistence and key conflicts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ぷよテト' })).toBeVisible();
  await page.screenshot({ path: 'test-results/home-1366.png' });
  await page.getByRole('button', { name: '操作設定', exact: true }).click();
  await page.locator('#key-0-left').click();
  await page.keyboard.press('x');
  await expect(page.locator('#key-0-left')).toHaveText('X');
  await page.locator('#key-1-left').click();
  await page.keyboard.press('x');
  await expect(page.locator('#capture-message')).toContainText('使用中');
  await page.keyboard.press('Escape');
  await page.locator('#das').fill('170');
  await page.locator('#das').blur();
  await page.locator('#arr').fill('0');
  await page.locator('#arr').blur();
  await page.reload();
  await page.getByRole('button', { name: '操作設定', exact: true }).click();
  await expect(page.locator('#key-0-left')).toHaveText('X');
  await expect(page.locator('#das')).toHaveValue('170');
  await expect(page.locator('#arr')).toHaveValue('0');
  await page.getByRole('button', { name: '初期設定に戻す' }).click();
  await expect(page.locator('#key-0-left')).toHaveText('←');
  await page.getByRole('button', { name: '完了', exact: true }).click();
  await page.getByRole('button', { name: 'ゲームをはじめる' }).click();
  await page.screenshot({ path: 'test-results/select-1366.png' });
  await page.locator('#choose-puyo').click();
  await page.locator('#choose-cpu').click();
  await page.locator('#diff-hard').click();
  await expect(page.locator('#diff-hard')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/setup-1366.png' });
});

for (const kind of ['puyo', 'tetris'] as const)
  test(`${kind}: keyboard two-player, pause, real top-out and rematch`, async ({ page }) => {
    await start(page, kind);
    const initial = await page.evaluate(() =>
      window.__STACK_DUEL__.battle.games.map((g: any) => g.active.x),
    );
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('d');
    await expect
      .poll(() =>
        page.evaluate(() => window.__STACK_DUEL__.battle.games.map((g: any) => g.active.x)),
      )
      .toEqual([initial[0] - 1, initial[1] + 1]);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('e');
    await expect
      .poll(() =>
        page.evaluate(() => window.__STACK_DUEL__.battle.games.map((g: any) => g.active.r)),
      )
      .toEqual([1, 1]);
    if (kind === 'tetris') {
      await page.keyboard.press('c');
      await expect
        .poll(() => page.evaluate(() => window.__STACK_DUEL__.battle.games[0].hold))
        .not.toBeNull();
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: '一時停止' })).toBeVisible();
    const elapsed = await page.evaluate(() => window.__STACK_DUEL__.battle.elapsed);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__STACK_DUEL__.battle.elapsed)).toBe(elapsed);
    await page.getByRole('button', { name: '対戦に戻る', exact: true }).click();
    for (let n = 0; n < 22; n++) {
      if (await page.evaluate(() => window.__STACK_DUEL__.battle.state === 'finished')) break;
      await page.waitForFunction(() => {
        const b = window.__STACK_DUEL__.battle;
        return b.state === 'finished' || b.games[0].phase === 'falling';
      });
      if (await page.evaluate(() => window.__STACK_DUEL__.battle.state === 'finished')) break;
      if (kind === 'puyo') {
        await page.keyboard.down('ArrowDown');
        await page.waitForTimeout(820);
        await page.keyboard.up('ArrowDown');
      } else await page.keyboard.press('Space');
      await page.waitForTimeout(95);
    }
    await expect(page.getByRole('heading', { name: 'PLAYER 2 WIN' })).toBeVisible();
    await expect(page.locator('#round-score')).toHaveText('0:1');
    await page.screenshot({ path: `test-results/${kind}-result.png` });
    await page.getByRole('button', { name: 'もう一度対戦' }).click();
    await expect(page.locator('#countdown')).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.__STACK_DUEL__.battle.games.every((g: any) => !g.lost && g.score === 0),
      ),
    ).toBe(true);
  });

for (const kind of ['puyo', 'tetris'] as const)
  test(`${kind}: CPU worker plays, both supported desktop sizes fit`, async ({ page }) => {
    await start(page, kind, 'cpu');
    await page.waitForFunction(() => window.__STACK_DUEL__.battle.games[1].pieces >= 4);
    expect(
      await page.evaluate(() => window.__STACK_DUEL__.battle.games[1].board.flat().some(Boolean)),
    ).toBe(true);
    await page.keyboard.press('Space');
    for (const [width, height] of [
      [1366, 768],
      [1920, 1080],
      [1024, 720],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(100);
      const boxes = await page.locator('.board').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
        }),
      );
      for (const box of boxes) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThan(0);
        expect(box.bottom).toBeLessThan(height - 40);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const layout = await page.evaluate(() => ({
        height: innerHeight,
        scroll: document.documentElement.scrollHeight,
        regions: [...document.querySelectorAll('header,main,footer,.arena,.match-help')].map(
          (el) => ({
            name: el.className,
            top: el.getBoundingClientRect().top,
            bottom: el.getBoundingClientRect().bottom,
          }),
        ),
      }));
      expect(layout.scroll, JSON.stringify({ width, ...layout })).toBeLessThanOrEqual(height);
      await page.screenshot({ path: `test-results/${kind}-${width}.png` });
    }
  });

test('puyo: real chain animation, attack delivery and opposing garbage', async ({ page }) => {
  await start(page, 'puyo');
  await page.evaluate(() => {
    const [a, b] = window.__STACK_DUEL__.battle.games;
    a.board = Array.from({ length: 14 }, () => Array(6).fill(0));
    a.board[13] = [1, 2, 2, 2, 0, 0];
    a.board[12][0] = 1;
    a.board[11][0] = 1;
    a.board[10][0] = 1;
    a.board[9][0] = 2;
    a.active = null;
    a.phase = 'settle';
    a.phaseTime = 0;
    b.clock = 10000;
  });
  await expect(page.locator('#callout-0')).toHaveText('2 CHAIN');
  await expect(page.locator('#garbage-1')).toHaveText('5');
  await page.waitForTimeout(750);
  await page.keyboard.down('s');
  await page.waitForTimeout(850);
  await page.keyboard.up('s');
  await page.waitForFunction(
    () =>
      window.__STACK_DUEL__.battle.games[1].board.flat().filter((v: number) => v === 5).length ===
      5,
  );
});

test('tetris: T-Spin result is rendered and garbage rises', async ({ page }) => {
  await start(page, 'tetris');
  await page.evaluate(() => {
    const g = window.__STACK_DUEL__.battle.games[0];
    g.board[22].fill(8);
    for (const x of [3, 4, 5]) g.board[22][x] = 0;
    g.board[21][3] = 8;
    g.board[21][5] = 8;
    g.board[23][3] = 8;
    g.active = { type: 'T', x: 3, y: 21, r: 0 };
    g.lastRotation = true;
  });
  await page.keyboard.press('Space');
  await expect(page.locator('#callout-0')).toContainText('T-SPIN');
  await expect(page.locator('#garbage-1')).toHaveText('2');
  await page.waitForTimeout(750);
  await page.keyboard.press('w');
  await page.waitForFunction(
    () =>
      window.__STACK_DUEL__.battle.games[1].board[23].filter((v: number) => v === 8).length === 9,
  );
});

async function fakePads(page: Page) {
  await page.addInitScript(() => {
    window.__fakePads = [0, 1].map((index) => ({
      index,
      id: `QA Standard Pad ${index + 1}`,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      timestamp: 1,
    }));
    Object.defineProperty(navigator, 'getGamepads', { value: () => window.__fakePads });
  });
}
async function padButton(page: Page, index: number, button: number) {
  await page.evaluate(
    ({ index, button }) => {
      window.__fakePads[index].buttons[button].pressed = true;
    },
    { index, button },
  );
  await page.waitForTimeout(65);
  await page.evaluate(
    ({ index, button }) => {
      window.__fakePads[index].buttons[button].pressed = false;
    },
    { index, button },
  );
  await page.waitForTimeout(65);
}
test('controller: menu navigation, two device assignment, remap, stick, pause and disconnect', async ({
  page,
}) => {
  await fakePads(page);
  await page.goto('/');
  await expect(page.locator('#connection')).toHaveText('2 GAMEPADS CONNECTED');
  await padButton(page, 0, 0);
  await expect(page.getByRole('heading', { name: 'どちらで、対戦する？' })).toBeVisible();
  await page.locator('#choose-tetris').click();
  await page.locator('#choose-local').click();
  await expect(page.locator('#device-0')).toHaveValue('0');
  await expect(page.locator('#device-1')).toHaveValue('1');
  await page.getByRole('button', { name: '操作設定を変更' }).click();
  await page.locator('#pad-0-rotateLeft').click();
  // Binding capture waits for a neutral pad sample before accepting a new press.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await padButton(page, 0, 5);
  await expect(page.locator('#pad-0-rotateLeft')).toHaveText('B5');
  await page.getByRole('button', { name: '完了', exact: true }).click();
  await page.getByRole('button', { name: '対戦スタート' }).click();
  await page.waitForFunction(() => window.__STACK_DUEL__.battle.state === 'playing');
  await padButton(page, 0, 14);
  await padButton(page, 1, 15);
  expect(
    await page.evaluate(() => window.__STACK_DUEL__.battle.games.map((g: any) => g.active.x)),
  ).toEqual([2, 4]);
  await padButton(page, 0, 5);
  expect(await page.evaluate(() => window.__STACK_DUEL__.battle.games[0].active.r)).toBe(3);
  await page.evaluate(() => (window.__fakePads[1].axes[0] = -1));
  await page.waitForTimeout(70);
  await page.evaluate(() => (window.__fakePads[1].axes[0] = 0));
  expect(await page.evaluate(() => window.__STACK_DUEL__.battle.games[1].active.x)).toBe(3);
  await padButton(page, 0, 9);
  await expect(page.getByRole('heading', { name: '一時停止' })).toBeVisible();
  await padButton(page, 0, 9);
  await expect(page.getByRole('heading', { name: '一時停止' })).not.toBeVisible();
  await padButton(page, 0, 3);
  expect(
    await page.evaluate(() => window.__STACK_DUEL__.battle.games[0].board.flat().some(Boolean)),
  ).toBe(true);
  await page.evaluate(() => {
    const pad = window.__fakePads[0];
    window.__fakePads[0] = null;
    const e = new Event('gamepaddisconnected');
    Object.defineProperty(e, 'gamepad', { value: pad });
    window.dispatchEvent(e);
  });
  await expect(page.getByRole('heading', { name: '一時停止' })).toBeVisible();
  await expect(page.locator('#toast')).toContainText('切断');
  await page.evaluate(() => {
    const pad = {
      index: 0,
      id: 'QA Standard Pad 1',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      timestamp: 2,
    };
    window.__fakePads[0] = pad;
    const e = new Event('gamepadconnected');
    Object.defineProperty(e, 'gamepad', { value: pad });
    window.dispatchEvent(e);
  });
  await expect(page.locator('#connection')).toHaveText('2 GAMEPADS CONNECTED');
  await expect(page.locator('.player-device').first()).toHaveText('PAD 1');
  await expect(page.getByRole('heading', { name: '一時停止' })).toBeVisible();
  await page.getByRole('button', { name: '対戦に戻る', exact: true }).click();
  await page.waitForFunction(() => window.__STACK_DUEL__.battle.games[0].phase === 'falling');
  await padButton(page, 0, 14);
  expect(await page.evaluate(() => window.__STACK_DUEL__.battle.games[0].active.x)).toBe(2);
});

test('CPU Hard and continuous simulations do not freeze the animation loop', async ({ page }) => {
  await start(page, 'tetris', 'cpu', 'hard');
  const metrics = await page.evaluate(async () => {
    const times: number[] = [];
    let last = performance.now();
    return new Promise<{ p95: number; frames: number }>((resolve) => {
      function tick(now: number) {
        times.push(now - last);
        last = now;
        if (times.length < 150) requestAnimationFrame(tick);
        else {
          times.sort((a, b) => a - b);
          resolve({ p95: times[Math.floor(times.length * 0.95)], frames: times.length });
        }
      }
      requestAnimationFrame(tick);
    });
  });
  expect(metrics.frames).toBe(150);
  expect(metrics.p95).toBeLessThan(60);
  console.log('Frame timing (test browser):', metrics);
});
