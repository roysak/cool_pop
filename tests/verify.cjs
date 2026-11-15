const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const postcss = require('postcss');

(async () => {
  for (const file of ['styles.css']) {
    const css = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
    css.walkRules(rule => assert.ok(rule.selector.trim(), `${file}: empty selector`));
  }
  for (const file of ['index.html', 'main.js', 'styles.css']) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/assets\/[\w./-]+/g)) {
      assert.ok(fs.existsSync(match[0]), `Missing asset: ${match[0]}`);
    }
  }
  const server = http.createServer((req, res) => {
    const file = path.join(process.cwd(), decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
    if (!file.startsWith(process.cwd() + path.sep)) { res.writeHead(403).end(); return; }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' };
    fs.readFile(file, (error, data) => {
      res.writeHead(error ? 404 : 200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(error ? '' : data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://www.youtube.com/**', route => route.abort());
    await page.addInitScript(() => {
      let callbacks = [], now = performance.now();
      window.requestAnimationFrame = callback => { callbacks.push(callback); return callbacks.length; };
      window.advanceGame = async (frames) => {
        for (let i = 0; i < frames; i++) {
          now += 100;
          const pending = callbacks; callbacks = [];
          pending.forEach(callback => callback(now));
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      };
      window.randomValue = 0.5;
      Math.random = () => window.randomValue;
    });
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url);
    const screen = expected => page.waitForFunction(expected => document.body.dataset.screen === expected, expected, { polling: 20 });
    page.setDefaultTimeout(5000);
    const click = id => page.locator(`#${id}`).evaluate(el => el.click());
    const advance = frames => page.evaluate(frames => window.advanceGame(frames), frames);
    await screen('start');
    assert.equal(await page.locator('.grid-cell').count(), 25);
    assert.equal(await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(el => el.id); return new Set(ids).size === ids.length; }), true);
    assert.equal(await page.evaluate(() => [...document.images].every(img => img.complete && img.naturalWidth > 0)), true);
    await click('howToPlayBtn'); assert.equal(await page.locator('#howToPlayModal').evaluate(el => el.open), true);
    await page.keyboard.press('Escape');
    await click('startGameBtn'); await screen('play');
    await advance(20);
    const balloon = await page.locator('#gridArena .tile-active.tile-safe').first().boundingBox();
    await page.mouse.click(balloon.x + balloon.width / 2, balloon.y + balloon.height / 2);
    assert.ok(Number(await page.locator('#scoreDisplay').textContent()) > 0);
    await click('gameHelpBtn'); await screen('pause');
    await click('gotItBtn'); await screen('play');
    await click('muteBtn'); assert.equal(await page.getAttribute('#muteBtn', 'aria-pressed'), 'true');
    await click('muteBtn'); assert.equal(await page.getAttribute('#muteBtn', 'aria-pressed'), 'false');
    await click('pauseBtn'); await screen('pause');
    await click('restartFromPauseBtn'); await screen('play');
    assert.equal(await page.locator('#scoreDisplay').textContent(), '0');
    assert.equal(await page.locator('#gridArena button').count(), 0);
    await click('pauseBtn'); await page.locator('#strictMissToggle').evaluate(el => el.click());
    await click('resumeGameBtn');
    await advance(150); await page.waitForTimeout(520); await screen('over');
    assert.equal(await page.locator('#finalScoreText').textContent(), '0');
    assert.equal(await page.locator('#newRecordBadge').isVisible(), false);
    await click('playAgainBtn'); await screen('play');
    await click('pauseBtn'); await page.locator('#strictMissToggle').evaluate(el => el.click());
    await click('resumeGameBtn');
    await advance(20);
    await page.locator('#gridArena .tile-active.tile-safe').first().evaluate(el => el.click());
    await advance(12);
    await page.locator('#gridArena .tile-active.tile-safe').first().evaluate(el => el.click());
    await page.evaluate(() => { window.randomValue = 0; });
    for (let i = 0; i < 3; i++) {
      await advance(18);
      await page.locator('#gridArena .tile-active.tile-hazard').first().evaluate(el => el.click());
    }
    await page.waitForTimeout(520); await screen('over');
    assert.ok(Number(await page.locator('#finalScoreText').textContent()) > 0);
    assert.equal(await page.locator('#newRecordBadge').isVisible(), true);
    await page.locator('#gameOverModal .home-button').evaluate(el => el.click()); await screen('start');
    await page.reload();
    assert.ok(Number(await page.locator('#bestScoreHud').textContent()) > 0);
    await page.evaluate(() => localStorage.setItem('cool_pop_yt_best_v1', '-100'));
    await page.reload(); assert.equal(await page.locator('#bestScoreHud').textContent(), '0');
    for (const [width, height] of [[320, 568], [844, 390], [1440, 1000]]) {
      await page.setViewportSize({ width, height });
      await click('howToPlayBtn');
      assert.equal(await page.locator('#howToPlayModal').isVisible(), true);
      await click('gotItBtn');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    // Exercise the native wrapper without depending on an external SDK/network.
    await page.addInitScript(() => {
      window.sdkCalls = [];
      window.ytgame = {
        IN_PLAYABLES_ENV: true,
        game: {
          firstFrameReady() { sdkCalls.push('frame'); },
          gameReady() { sdkCalls.push('ready'); },
          loadData: () => Promise.resolve('{"bestScore":1000}'),
          saveData: () => Promise.reject(new Error('offline'))
        },
        engagement: { sendScore: () => Promise.reject(new Error('offline')) },
        system: {
          isAudioEnabled: () => false,
          onAudioEnabledChange(callback) { window.platformAudio = callback; },
          onPause(callback) { window.platformPause = callback; },
          onResume() {}
        }
      };
    });
    await page.reload();
    assert.equal(await page.locator('#bestScoreHud').textContent(), '1,000');
    assert.deepEqual(await page.evaluate(() => sdkCalls), ['frame', 'ready']);
    assert.equal(await page.getAttribute('#muteBtn', 'aria-pressed'), 'true');
    await page.evaluate(() => platformAudio(true));
    assert.equal(await page.getAttribute('#muteBtn', 'aria-pressed'), 'false');
    await click('startGameBtn');
    await page.evaluate(() => platformPause()); await screen('pause');
    await page.locator('#strictMissToggle').evaluate(el => el.click());
    await click('resumeGameBtn');
    await advance(150); await page.waitForTimeout(520); await screen('over');
    assert.deepEqual(errors, []);
    console.log('PASS: CSS syntax, unique IDs, images, 25 cells, scoring, help, mute, pause/resume, restart cleanup, hard-mode misses, hazards, results, records, persistence, responsive layouts, native SDK hooks, and rejected SDK promises.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
