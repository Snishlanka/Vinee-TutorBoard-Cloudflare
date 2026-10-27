const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const file = path.join(root, req.url.split('?')[0]);
    const ext = path.extname(file);
    res.setHeader(
      'Content-Type',
      { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[ext] ||
        'application/octet-stream'
    );
    fs.readFile(file, (err, data) => {
      res.statusCode = err ? 404 : 200;
      res.end(err ? 'Not found' : data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${server.address().port}/whiteboard.html`);
    await p.evaluate(() => openTextBox({ x: 100, y: 100, w: 700, h: 180 }));
    await p.locator('#text-editor').press('A');
    await p.locator('#text-editor').press('Enter');
    await p.locator('#text-editor').press('B');
    assert.equal(await p.evaluate(() => document.getElementById('text-editor').value), 'A\nB');
    await p.locator('#text-editor').fill('Hello world');
    await p.evaluate(() => {
      const e = document.getElementById('text-editor'),
        r = document.createRange();
      r.setStart(e.firstChild, 0);
      r.setEnd(e.firstChild, 5);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await p.keyboard.press('Control+b');
    await p.keyboard.press('Control+u');
    let runs = await p.evaluate(() => editorRuns());
    assert.equal(
      runs
        .filter((r) => r.bold && r.underline)
        .map((r) => r.text)
        .join(''),
      'Hello'
    );
    assert.equal(
      runs
        .filter((r) => !r.bold && !r.underline)
        .map((r) => r.text)
        .join(''),
      ' world'
    );
    await p.locator('#text-editor').press('Control+Enter');
    assert.equal(await p.evaluate(() => page().objects[0].runs[0].bold), true);
    assert.ok(await p.evaluate(() => page().objects[0].h >= 180));
    await p.evaluate(() => openTextBox(page().objects[0], page().objects[0]));
    assert.equal(await p.evaluate(() => editorRuns()[0].underline), true);
    const snapshot = await p.evaluate(() => TutorBoard.snapshot());
    assert.equal(snapshot.lesson.pages[0].objects.length, 1);
    assert.equal(snapshot.lesson.pages[0].objects[0].runs[0].bold, true);
    assert.equal(
      await p.locator('#text-next-page').isVisible(),
      false,
      'Next page is hidden while normal text fits'
    );
    await p.locator('#text-editor').press('Control+Enter');
    await p.locator('#quick-add').click();
    await p.evaluate(() => openTextBox({ x: 40, y: 40, w: 700, h: 180 }));
    assert.equal(await p.evaluate(() => pages.length), 2);
    await p.locator('#text-editor').fill('A long exercise line. '.repeat(1500));
    assert.equal(await p.evaluate(() => pendingTextRuns.length > 0), true);
    assert.equal(
      await p.locator('#text-next-page').isVisible(),
      true,
      'Next page appears only when text overflows'
    );
    const originalStream = await p.evaluate(
      () =>
        document.getElementById('text-editor').value + pendingTextRuns.map((r) => r.text).join('')
    );
    assert.equal(originalStream, 'A long exercise line. '.repeat(1500));
    assert.equal(
      await p.evaluate(() => {
        const e = document.getElementById('text-editor'),
          b = canvas.getBoundingClientRect(),
          r = e.getBoundingClientRect();
        return r.right <= b.right + 2 && r.bottom <= b.bottom + 2;
      }),
      true
    );
    const overflowSnapshot = await p.evaluate(() => TutorBoard.snapshot());
    assert.equal(
      await p.evaluate(
        (s) => s.lesson.pages.every((p) => p.objects.every(validObject)),
        overflowSnapshot
      ),
      true
    );
    await p.locator('#text-next-page').click();
    await p.evaluate(() => commitText());
    assert.equal(
      await p.evaluate(
        () =>
          pages
            .flatMap((p) => p.objects)
            .filter((o) => o.type === 'text')
            .map((o) => o.text)
            .join('').length
      ),
      11 + 'A long exercise line. '.repeat(1500).length
    );
    assert.equal(await p.evaluate(() => pages.every((p) => p.objects.every(validObject))), true);
    await p.locator('#exercise-timer summary').click();
    await p.locator('[data-timer-minutes="3"]').click();
    assert.equal(await p.locator('#timer-preview-time').textContent(), '03:00');
    await p.locator('#timer-start').click();
    assert.equal(await p.locator('#exercise-timer').getAttribute('open'), null);
    assert.equal(await p.locator('#exercise-timer').getAttribute('data-state'), 'running');
    await p.locator('#exercise-timer summary').click();
    await p.locator('#timer-start').click();
    assert.equal(await p.locator('#exercise-timer').getAttribute('data-state'), 'paused');
    const pausedTime = await p.locator('#timer-display').textContent();
    await p.waitForTimeout(1100);
    assert.equal(await p.locator('#timer-display').textContent(), pausedTime);
    await p.locator('#timer-start').click();
    assert.equal(await p.locator('#exercise-timer').getAttribute('open'), null);
    await p.locator('#exercise-timer summary').click();
    await p.locator('#timer-reset').click();
    await p.locator('#timer-minutes').fill('0');
    await p.locator('#timer-seconds').fill('0');
    await p.locator('#timer-start').click();
    assert.notEqual(await p.locator('#exercise-timer').getAttribute('open'), null);
    assert.match(await p.locator('#timer-message').textContent(), /above zero/);
    await p.locator('#timer-seconds').fill('1');
    if (process.env.PREVIEW_PATH)
      await p.screenshot({ path: process.env.PREVIEW_PATH + '-setup.png' });
    await p.locator('#timer-start').click();
    await p.waitForFunction(() => document.getElementById('timer-finish-dialog').open);
    await p.waitForTimeout(300);
    assert.equal(await p.locator('#timer-finish-heading').textContent(), 'Time’s up!');
    assert.equal(await p.locator('#exercise-timer').getAttribute('data-state'), 'finished');
    if (process.env.PREVIEW_PATH)
      await p.screenshot({ path: process.env.PREVIEW_PATH + '-complete.png' });
    await p.locator('#timer-restart').click();
    assert.equal(await p.locator('#timer-finish-dialog').getAttribute('open'), null);
    assert.equal(await p.locator('#exercise-timer').getAttribute('open'), null);
    await p.waitForFunction(() => document.getElementById('timer-finish-dialog').open);
    await p.waitForTimeout(300);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#timer-finish-dialog').getAttribute('open'), null);
    await p.locator('#exercise-timer summary').click();
    await p.locator('#timer-reset').click();
    assert.equal(await p.locator('#timer-display').textContent(), '05:00');
    await p.keyboard.press('Escape');
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await p.setViewportSize(viewport);
      await p.evaluate(() => {
        commitText();
        openTextBox({ x: 0, y: 0, w: 2100, h: 1080 });
        formatText({ fontSize: 46 });
      });
      await p.locator('#text-editor').fill(Array(14).fill('A').join('\n'));
      await p.waitForTimeout(150);
      assert.equal(
        await p.evaluate(() => {
          const toolbar = document.getElementById('text-options').getBoundingClientRect();
          const board = canvas.getBoundingClientRect();
          return toolbar.bottom <= board.top && toolbar.left >= 0 && toolbar.right <= innerWidth;
        }),
        true,
        'Formatting must reserve space above the board on every screen'
      );
      assert.equal(
        await p.evaluate(() => {
          const ed = document.getElementById('text-editor'),
            range = document.createRange();
          range.selectNodeContents(ed);
          const last = [...range.getClientRects()].at(-1);
          return last.bottom <= ed.getBoundingClientRect().bottom;
        }),
        true,
        'The lowest typing line remains visible'
      );
      if (process.env.PREVIEW_PATH)
        await p.screenshot({ path: process.env.PREVIEW_PATH + '-' + viewport.width + '.png' });
      await p.locator('#text-editor').press('Escape');
    }
    await p.evaluate(() => {
      commitText();
      document.documentElement.dataset.theme = 'dark';
    });
    await p.locator('#exercise-timer summary').click();
    await p.waitForTimeout(200);
    assert.equal(
      await p.evaluate(() => {
        const r = document.getElementById('timer-panel').getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      }),
      true,
      'Timer panel fits a narrow screen'
    );
    if (process.env.PREVIEW_PATH)
      await p.screenshot({ path: process.env.PREVIEW_PATH + '-mobile-dark.png' });
    await p.locator('#timer-minutes').fill('0');
    await p.locator('#timer-seconds').fill('1');
    await p.locator('#timer-start').click();
    await p.waitForFunction(() => document.getElementById('timer-finish-dialog').open);
    await p.waitForTimeout(300);
    if (process.env.PREVIEW_PATH)
      await p.screenshot({ path: process.env.PREVIEW_PATH + '-mobile-complete.png' });
    await p.locator('#timer-finish-dismiss').click();
    assert.deepEqual(errors, []);
    console.log('Text selection, saved runs, page continuation, bounds and timer checks passed.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
