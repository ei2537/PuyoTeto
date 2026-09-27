import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:4174';
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4174',
    '--strictPort',
  ],
  { stdio: 'pipe', windowsHide: true },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      ready = (await fetch(origin)).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Production preview server did not start');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  for (const kind of ['puyo', 'tetris']) {
    await page.goto(origin);
    assert.equal(
      await page.evaluate(() => typeof window.__STACK_DUEL__),
      'undefined',
      'QA hook must not ship in production',
    );
    await page.getByRole('button', { name: 'ゲームをはじめる' }).click();
    await page.locator(`#choose-${kind}`).click();
    await page.locator('#choose-cpu').click();
    await page.locator('#diff-hard').click();
    await page.locator('#start-match').click();
    await page.waitForFunction(
      () => Number(document.querySelector('#score-1')?.textContent.replaceAll(',', '')) > 0,
    );
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => Number(document.querySelector('#score-0')?.textContent.replaceAll(',', '')) > 0,
    );
    console.log(`Production ${kind}: CPU Worker, player input, canvas and HUD OK`);
  }
  assert.deepEqual(errors, []);
  console.log('Production console: 0 errors; development hook absent');
} finally {
  await browser?.close();
  server.kill();
}
