import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { MatchSnapshot } from '../../shared/protocol';

// Opt-in: real Supabase test accounts + a real running game server, never an auth bypass.
test.skip(
  process.env.ONLINE_QA !== '1',
  'Set ONLINE_QA=1 after provisioning the isolated QA accounts.',
);
test.setTimeout(150_000);
const snapshots = new Map<Page, MatchSnapshot>();
let contexts: BrowserContext[] = [];
async function players(browser: Browser, count = 2) {
  const credentials = JSON.parse(
    await readFile(new URL('../../.env.qa.json', import.meta.url), 'utf8'),
  ) as { email: string; password: string; username: string }[];
  const pages: Page[] = [];
  for (let i = 0; i < count; i++) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    context.setDefaultTimeout(15_000);
    contexts.push(context);
    const page = await context.newPage();
    pages.push(page);
    page.on('pageerror', (error) => {
      throw error;
    });
    page.on('websocket', (socket) =>
      socket.on('framereceived', ({ payload }) => {
        const text = String(payload);
        if (!text.startsWith('42')) return;
        try {
          const [event, value] = JSON.parse(text.slice(2));
          if (event === 'snapshot') snapshots.set(page, value);
        } catch {}
      }),
    );
    await page.goto(process.env.QA_BASE_URL || 'http://127.0.0.1:5173');
    await page.locator('#account-open').click();
    await page.locator('[name=email]').fill(credentials[i].email);
    await page.locator('[name=password]').fill(credentials[i].password);
    await page.locator('#auth-form button[type=submit]').click();
    await expect(page.locator('#profile-form [name=username]')).toHaveValue(
      credentials[i].username,
    );
    await page.locator('#online-back').click();
    await expect(page.locator('#online-status')).toHaveText('接続済み');
  }
  return pages;
}
async function surrender(page: Page) {
  await page.bringToFront();
  await page.locator('#online-surrender').click();
  await page.locator('#confirm-yes').click();
  await expect(page.locator('#online-result')).toContainText('記録しました');
}
async function returnLobby(page: Page) {
  await page.bringToFront();
  if (await page.locator('#online-result-back').count())
    await page.locator('#online-result-back').click();
}
async function create(
  pages: Page[],
  category: 'room' | 'tournament' | 'league',
  privateRoom = false,
) {
  const host = pages[0];
  // Each simulated player owns a tab; activate it before user interactions.
  // Chromium may suspend animation frames in inactive Windows tabs.
  await host.bringToFront();
  await host.locator('#online-tetris').click();
  await host.locator('#create-lobby').click();
  await host.locator('#create-category').selectOption(category);
  await host.locator('#create-form [name=name]').fill(`QA ${category} ${Date.now()}`);
  if (privateRoom) await host.locator('#create-form [name=visibility]').selectOption('private');
  await host.locator('#create-form button[type=submit]').click();
  await expect(host.locator('#copy-code')).toBeVisible();
  const code = (await host.locator('#copy-code').innerText()).match(/[A-Z2-9]{10}/)![0];
  for (const page of pages.slice(1)) {
    await page.bringToFront();
    await page.locator('#join-code').fill(code);
    await page.locator('#code-form button').click();
    await expect(page.locator('.member-row')).toHaveCount(pages.indexOf(page) + 1);
  }
  return code;
}
test.afterEach(async () => {
  // Use normal application commands to withdraw; closed browsers alone intentionally have a grace period.
  const cleanupErrors: string[] = [];
  for (const context of contexts) {
    const page = context.pages()[0];
    if (!page || page.isClosed()) continue;
    try {
      await page.bringToFront();
      // History is an account view over the still-active lobby. Return before leaving it.
      if (await page.locator('#profile-form').count()) await page.locator('#online-back').click();
      if (
        (await page.locator('#online-surrender').count()) &&
        snapshots.get(page)?.state !== 'finished'
      )
        await surrender(page);
      await returnLobby(page);
      if (await page.locator('#leave-lobby').count()) {
        await page.locator('#leave-lobby').click();
        if (await page.locator('#confirm-yes').count()) await page.locator('#confirm-yes').click();
        await expect(page.locator('#quick')).toBeVisible();
      }
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  await Promise.all(contexts.map((c) => c.close()));
  contexts = [];
  snapshots.clear();
  expect(cleanupErrors).toEqual([]);
});
for (const kind of ['puyo', 'tetris'] as const)
  test(`online: ${kind} login, quick match, input, reconnect, saved result and rematch`, async ({
    browser,
  }) => {
    const [a, b] = await players(browser);
    for (const p of [a, b]) {
      await p.locator(`#online-${kind}`).click();
      await p.locator('#quick').click();
    }
    await expect(a.locator('canvas.board')).toHaveCount(2);
    await expect.poll(() => snapshots.get(a)?.state).toBe('playing');
    const first = snapshots.get(a)!,
      index = first.players.findIndex((p) => p.username.endsWith('_1')),
      x = first.games[index].active!.x;
    await a.keyboard.press('ArrowLeft');
    await expect.poll(() => snapshots.get(a)?.games[index].active?.x).toBe(x - 1);
    if (kind === 'tetris') {
      const positions = await a
        .locator('.player')
        .first()
        .evaluate((el) => ({
          hold: el.querySelector('.hold-rail')!.getBoundingClientRect().x,
          board: el.querySelector('.board')!.getBoundingClientRect().x,
          next: el.querySelector('.rail')!.getBoundingClientRect().x,
        }));
      expect(positions.hold).toBeLessThan(positions.board);
      expect(positions.next).toBeGreaterThan(positions.board);
    } else {
      await a.keyboard.press('Space');
      await a.waitForTimeout(150);
      expect(
        snapshots
          .get(a)!
          .games[index].board.flat()
          .every((v) => v === 0),
      ).toBe(true);
      const y = snapshots.get(a)!.games[index].active!.y;
      await a.keyboard.down('ArrowDown');
      await a.waitForTimeout(180);
      await a.keyboard.up('ArrowDown');
      expect(snapshots.get(a)!.games[index].active!.y).toBeGreaterThan(y);
    }
    await a.reload();
    await a.locator('#account-open').click();
    await expect(a.locator('#profile-form')).toBeVisible();
    await a.locator('#online-back').click();
    await expect(a.locator('canvas.board')).toHaveCount(2);
    await expect.poll(() => snapshots.get(a)?.id).toBe(first.id);
    await surrender(a);
    await expect(b.locator('#online-result')).toContainText('記録しました');
    expect(
      await a.evaluate(() => ({
        vertical: document.documentElement.scrollHeight <= innerHeight,
        horizontal: document.documentElement.scrollWidth <= innerWidth,
      })),
    ).toEqual({ vertical: true, horizontal: true });
    await a.screenshot({ path: `test-results/online-${kind}-result.png` });
    for (const p of [a, b]) await p.locator('#online-again').click();
    await expect.poll(() => snapshots.get(a)?.id).not.toBe(first.id);
    await surrender(a);
    await returnLobby(a);
    await a.locator('#online-account').click();
    await a.locator('#history-load').click();
    await expect(a.locator('#online-history')).toContainText('LOSE');
  });
test('online: private room, four members, two simultaneous matches and return to room', async ({
  browser,
}) => {
  const pages = await players(browser, 4);
  await create(pages, 'room', true);
  for (const p of pages) await p.locator('#room-queue').click();
  await expect.poll(() => new Set(pages.map((p) => snapshots.get(p)?.id)).size).toBe(2);
  await Promise.all(pages.map((p) => expect(p.locator('canvas.board')).toHaveCount(2)));
  await surrender(pages[0]);
  await surrender(pages[2]);
  for (const p of pages) await returnLobby(p);
  await expect(pages[0].locator('.member-row')).toHaveCount(4);
  await expect(pages[0].locator('#room-queue')).toContainText('対戦キューに参加');
  await pages[0].screenshot({ path: 'test-results/online-room.png' });
});
for (const category of ['tournament', 'league'] as const)
  test(`online: ${category} completes every round and shows durable standings`, async ({
    browser,
  }) => {
    const pages = await players(browser, 4);
    await create(pages, category);
    for (const p of pages) {
      await p.bringToFront();
      await p.locator('#ready').click();
    }
    await pages[0].bringToFront();
    await pages[0].locator('#start-competition').click();
    const completed = new Set<string>(),
      total = category === 'tournament' ? 3 : 6;
    for (let round = 0; completed.size < total && round < 8; round++) {
      await expect
        .poll(
          () =>
            pages.some((p) => {
              const s = snapshots.get(p);
              return s && !completed.has(s.id) && s.state === 'playing';
            }),
          { timeout: 30_000 },
        )
        .toBe(true);
      const group = new Map<string, Page>();
      for (const p of pages) {
        const s = snapshots.get(p);
        if (s && !completed.has(s.id)) group.set(s.id, p);
      }
      for (const [id, p] of group) {
        await surrender(p);
        completed.add(id);
      }
    }
    expect(completed.size).toBe(total);
    for (const p of pages) await returnLobby(p);
    await expect(pages[0].locator('.competition-result')).toBeVisible();
    if (category === 'league') {
      await expect(pages[0].locator('.standings tbody tr')).toHaveCount(4);
      await expect(pages[0].locator('.fixture')).toHaveCount(6);
    }
    await pages[0].screenshot({ path: `test-results/online-${category}.png` });
    await pages[0].locator('#online-account').click();
    await pages[0].locator('#history-load').click();
    await expect(pages[0].locator('#online-history')).toContainText('finished');
  });
