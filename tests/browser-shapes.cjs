// Requires the same local server and Playwright setup as browser-editing.cjs.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const p = await context.newPage(),
      errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(process.env.BOARD_URL || 'http://127.0.0.1:8765');
    await p.waitForFunction(() => window.TutorBoard);
    async function moveTo(point) {
      const b = await p.locator('#board').boundingBox();
      await p.mouse.move(b.x + (point.x * b.width) / 2880, b.y + (point.y * b.height) / 1080);
    }
    async function drag(a, b) {
      await moveTo(a);
      await p.mouse.down();
      await moveTo(b);
      await p.mouse.up();
    }
    await p.locator('[data-tool="rect"]').click();
    await drag({ x: 300, y: 300 }, { x: 900, y: 650 });
    assert.equal(await p.evaluate(() => tool), 'rect');
    await moveTo({ x: 600, y: 450 });
    assert.equal(await p.locator('#board').evaluate((c) => c.style.cursor), 'grab');
    await drag({ x: 600, y: 450 }, { x: 650, y: 500 });
    assert.ok(
      await p.evaluate(
        () => tool === 'rect' && page().objects.length === 1 && Math.abs(selected.x - 350) < 1
      )
    );
    await p.keyboard.down('Alt');
    await drag({ x: 500, y: 450 }, { x: 650, y: 550 });
    await p.keyboard.up('Alt');
    assert.equal(await p.evaluate(() => page().objects.length), 2);
    await p.locator('#undo').click();
    await moveTo({ x: 650, y: 500 });
    await drag({ x: 650, y: 500 }, { x: 650, y: 500 });
    await p.locator('#shape-fill-enabled').check();
    for (const pattern of ['forward', 'backward', 'solid']) {
      await p.locator('#shape-fill-pattern').selectOption(pattern);
      assert.equal(await p.evaluate(() => selected.fillPattern), pattern);
      const painted = await p.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const paint = c.getContext('2d');
        drawObject(paint, selected);
        const pixels = paint.getImageData(selected.x + 50, selected.y + 50, 100, 100).data;
        let colored = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) colored++;
        return colored;
      });
      assert.ok(painted > 0);
      assert.equal(pattern === 'solid', painted === 10000);
    }
    let h = await p.evaluate(() =>
      selectionHandles(selected).find((h) => h.kind === 'corner' && h.u === 1 && h.v === 1)
    );
    await moveTo(h);
    assert.equal(await p.locator('#board').evaluate((c) => c.style.cursor), 'nwse-resize');
    h = await p.evaluate(() => selectionHandles(selected).find((h) => h.kind === 'rotate'));
    await moveTo(h);
    assert.ok((await p.locator('#board').evaluate((c) => c.style.cursor)).startsWith('url('));
    await p.locator('#shape-fill-pattern').selectOption('backward');
    await p.locator('#copy-object').focus();
    await p.keyboard.press('Control+c');
    await p.waitForFunction(() => shapeClipboard?.fillPattern === 'backward');
    await p.keyboard.press('Control+v');
    await p.waitForFunction(() => page().objects.length === 2);
    assert.ok(
      await p.evaluate(
        () =>
          selected.fillPattern === 'backward' &&
          Math.abs(selected.x - page().objects[0].x - 24) < 1e-6
      )
    );
    await p.locator('#undo').click();
    assert.equal(await p.evaluate(() => page().objects.length), 1);
    await p.locator('#redo').click();
    assert.equal(await p.evaluate(() => page().objects.length), 2);
    await p.locator('#quick-add').click();
    await p.locator('#paste-object').click();
    assert.ok(await p.evaluate(() => index === 1 && selected.fillPattern === 'backward'));
    await p.locator('#shape-fill-pattern').selectOption('forward');
    await p.locator('#shape-fill-enabled').uncheck();
    assert.equal(await p.evaluate(() => selected.fill), null);
    await p.locator('#shape-fill-enabled').check();
    assert.equal(await p.evaluate(() => selected.fillPattern), 'forward');
    // Native form copy/paste remains normal text even with a board clipboard.
    await p.locator('#title').fill('Clipboard text');
    await p.locator('#title').selectText();
    await p.keyboard.press('Control+c');
    await p.locator('#tutor-name').focus();
    await p.keyboard.press('Control+v');
    assert.equal(await p.locator('#tutor-name').inputValue(), 'Clipboard text');
    assert.equal(await p.evaluate(() => page().objects.length), 1);
    const saved = p.waitForEvent('download');
    await p.locator('#save').click();
    const lesson = JSON.parse(await fs.readFile(await (await saved).path(), 'utf8'));
    assert.equal(lesson.pages[0].objects[0].fillPattern, 'backward');
    assert.equal(lesson.pages[1].objects[0].fillPattern, 'forward');
    assert.ok(
      await p.evaluate((lesson) => lesson.pages.every((p) => p.objects.every(validObject)), lesson)
    );
    p.on('dialog', (dialog) => dialog.accept());
    await p.locator('#lesson-file').setInputFiles({
      name: 'copy-fill.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(lesson)),
    });
    await p.waitForFunction(() => index === 0 && pages.length === 2 && page().objects.length === 2);
    const png = p.waitForEvent('download');
    await p.locator('#export').click();
    assert.ok((await fs.stat(await (await png).path())).size > 1000);
    await p.screenshot({
      path: process.env.TEMP + '/vinee-shape-fill-preview.png',
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      'Native shape/text copy-paste, fill patterns, cursors, history, lesson reopen and PNG export passed.'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
