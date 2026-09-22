const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(process.env.BOARD_URL || 'http://127.0.0.1:8765');
    await p.waitForFunction(() => window.TutorBoard);
    for (const kind of ['pen', 'rect', 'line']) {
      await p.evaluate(kind => { page().objects = []; selected = null; setTool(kind); render(); }, kind);
      const b = await p.locator('#board').boundingBox();
      await p.mouse.move(b.x + b.width * .2, b.y + b.height * .3);
      await p.mouse.down();
      await p.mouse.move(b.x + b.width * .4, b.y + b.height * .5, { steps: 10 });
      await p.mouse.up();
      for (const board of ['black', 'green', 'blue', 'white']) {
        await p.locator('#board-color').selectOption(board);
        assert.ok(await p.evaluate(() => selected === page().objects[0]));
        assert.equal(await p.locator('#delete-object').isEnabled(), true);
      }
      await p.locator('#delete-object').click();
      assert.equal(await p.evaluate(() => page().objects.length), 0);
      await p.locator('#undo').click();
      assert.equal(await p.evaluate(() => page().objects.length), 1);
    }
    await p.evaluate(() => { selected = page().objects[0]; add(); });
    assert.equal(await p.evaluate(() => selected), null);
    assert.equal(await p.locator('#delete-object').isEnabled(), false);
    await p.evaluate(() => { index = 0; update(); selected = page().objects[0]; syncSelection(); moveCurrentPage(1); });
    assert.ok(await p.evaluate(() => selected === page().objects[0]));
    await p.locator('#delete-object').click();
    assert.equal(await p.evaluate(() => page().objects.length), 0);
    assert.deepEqual(errors, []);
    console.log('Board colors preserve selection and Delete; undo, page isolation and reorder passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
