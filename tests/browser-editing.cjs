// Run against the local server: PLAYWRIGHT_MODULE may point to a temporary install.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(process.env.BOARD_URL || 'http://127.0.0.1:8765');
    await p.waitForFunction(
      () =>
        typeof window.TutorBoard !== 'undefined' || document.getElementById('input-mode').onchange
    );
    async function drag(a, b) {
      const r = await p.locator('#board').boundingBox();
      await p.mouse.move(r.x + (a.x * r.width) / 2880, r.y + (a.y * r.height) / 1080);
      await p.mouse.down();
      await p.mouse.move(r.x + (b.x * r.width) / 2880, r.y + (b.y * r.height) / 1080, {
        steps: 12,
      });
      await p.mouse.up();
    }
    assert.equal(await p.locator('#empty-hint').isVisible(), true);
    await p.locator('[data-tool="text"]').click();
    await drag({ x: 500, y: 300 }, { x: 1200, y: 600 });
    assert.equal(await p.locator('#text-editor').isVisible(), true);
    assert.equal(await p.locator('#empty-hint').isVisible(), false);
    await p.evaluate(() => render());
    assert.equal(await p.locator('#empty-hint').isVisible(), false);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#empty-hint').isVisible(), true);
    await drag({ x: 500, y: 300 }, { x: 1200, y: 600 });
    await p.locator('#text-editor').fill('First text box');
    await p.locator('#text-place').click();
    assert.equal(await p.locator('#empty-hint').isVisible(), false);
    await p.locator('#undo').click();
    assert.equal(await p.locator('#empty-hint').isVisible(), true);
    await p.locator('[data-tool="rect"]').click();
    await drag({ x: 200, y: 200 }, { x: 650, y: 450 });
    assert.equal(await p.evaluate(() => selected.type), 'rect');
    let handle = await p.evaluate(() => selectionHandles(selected).find((h) => h.kind === 'skew'));
    await drag(handle, { x: handle.x + 100, y: handle.y });
    assert.ok(await p.evaluate(() => selected.skew > 0.1));
    handle = await p.evaluate(() => selectionHandles(selected).find((h) => h.kind === 'rotate'));
    await drag(handle, { x: 800, y: 350 });
    assert.ok(await p.evaluate(() => selected.rotation > 10));
    await p.locator('#connector-toggle').click();
    await p.locator('#connector-menu [data-tool="arrow"]').click();
    await drag({ x: 900, y: 250 }, { x: 1500, y: 250 });
    handle = await p.evaluate(() => selectionHandles(selected).find((h) => h.kind === 'bend'));
    await drag(handle, { x: handle.x, y: handle.y + 130 });
    assert.ok(await p.evaluate(() => selected.bendY > 200 && validObject(selected)));
    await p.locator('[data-tool="text"]').click();
    let r = await p.locator('#board').boundingBox();
    await p.mouse.click(r.x + (800 * r.width) / 2880, r.y + (650 * r.height) / 1080);
    await p.locator('#text-editor').fill('First point\nSecond point');
    await p.locator('#text-list').selectOption('number');
    await p.locator('#text-align').selectOption('center');
    await p.locator('#text-place').click();
    assert.ok(
      await p.evaluate(
        () =>
          selected.w > 500 &&
          selected.h > 170 &&
          selected.list === 'number' &&
          validObject(selected)
      )
    );
    await p.locator('#text-edit-selected').click();
    await p.locator('#text-editor').fill('Edited point\nSecond point');
    await p.locator('#text-place').click();
    assert.equal(await p.evaluate(() => page().objects.length), 3);
    assert.ok(await p.evaluate(() => page().objects[2].text.startsWith('Edited')));
    await p.locator('#undo').click();
    assert.ok(await p.evaluate(() => page().objects[2].text.startsWith('First')));
    await p.locator('#redo').click();
    assert.ok(await p.evaluate(() => page().objects[2].text.startsWith('Edited')));
    // Exercise the real event handlers with multiple independent pointer IDs.
    await p.locator('[data-tool="pen"]').click();
    await p.locator('#input-mode').selectOption('pen');
    await p.evaluate(() => {
      const r = canvas.getBoundingClientRect();
      window.emitPointer = (name, id, type, x, y, primary = true) =>
        canvas.dispatchEvent(
          new PointerEvent(name, {
            pointerId: id,
            pointerType: type,
            isPrimary: primary,
            button: 0,
            buttons: name === 'pointerup' ? 0 : 1,
            clientX: r.left + (x * r.width) / W,
            clientY: r.top + (y * r.height) / H,
            bubbles: true,
          })
        );
      // Synthetic events have no browser-owned capture; unit tests cover cancellation.
      canvas.setPointerCapture = () => {};
      emitPointer('pointerdown', 9, 'touch', 300, 600);
      emitPointer('pointermove', 9, 'touch', 350, 620);
      emitPointer('pointerup', 9, 'touch', 350, 620);
    });
    assert.equal(await p.evaluate(() => page().objects.length), 3);
    await p.evaluate(() => {
      emitPointer('pointerdown', 10, 'pen', 200, 700);
      emitPointer('pointermove', 10, 'pen', 240, 750);
      emitPointer('pointerdown', 11, 'touch', 800, 700, false);
      emitPointer('pointermove', 11, 'touch', 900, 750, false);
      emitPointer('pointerup', 11, 'touch', 900, 750, false);
      emitPointer('pointermove', 10, 'pen', 280, 700);
      emitPointer('pointerup', 10, 'pen', 320, 750);
    });
    assert.ok(
      await p.evaluate(
        () => page().objects.length === 4 && page().objects[3].points.every((p) => p.x < 400)
      )
    );
    assert.ok(
      await p.evaluate(() =>
        page().objects.every((o) => validObject(JSON.parse(JSON.stringify(o))))
      )
    );

    await p.locator('#input-mode').selectOption('touch');
    assert.equal(await p.locator('.quick-tools [data-tool="move"]').count(), 1);
    await p.locator('#eraser-toggle').click();
    assert.equal(await p.locator('#eraser-menu').isVisible(), true);
    await p.locator('[data-eraser-mode="object"]').click();
    assert.equal(await p.evaluate(() => eraserMode), 'object');
    assert.equal(await p.locator('#eraser-menu').isVisible(), false);
    await p.locator('#eraser-toggle').click();
    assert.equal(await p.locator('#eraser-size').isDisabled(), true);
    await p.locator('[data-eraser-mode="point"]').click();
    assert.equal(await p.evaluate(() => eraserMode), 'point');
    await p.locator('[data-tool="triangle"]').click();
    await drag({ x: 1600, y: 300 }, { x: 2100, y: 650 });
    handle = await p.evaluate(() => selectionHandles(selected).find((h) => h.kind === 'apex'));
    await drag(handle, { x: 1550, y: 400 });
    assert.ok(await p.evaluate(() => selected.apexX < 0 && selected.apexY > 0));
    let count = await p.evaluate(() => page().objects.length);
    await p.keyboard.press('Delete');
    assert.equal(await p.evaluate(() => page().objects.length), count - 1);
    await p.locator('#undo').click();
    assert.equal(await p.evaluate(() => page().objects.length), count);
    await p.locator('#redo').click();
    assert.equal(await p.evaluate(() => page().objects.length), count - 1);
    await p.locator('[data-tool="text"]').click();
    await drag({ x: 1600, y: 500 }, { x: 2300, y: 850 });
    await p.locator('#text-editor').fill('A proper text box\nWith optional border');
    await p.locator('#text-place').click();
    assert.ok(await p.evaluate(() => selected.box && selected.w > 690 && selected.h > 340));
    await p.locator('#text-border').uncheck();
    assert.equal(await p.evaluate(() => selected.border), false);
    await p.locator('#text-edit-selected').click();
    count = await p.evaluate(() => page().objects.length);
    await p.keyboard.press('Delete');
    assert.equal(await p.evaluate(() => page().objects.length), count);
    await p.locator('#text-place').click();
    assert.equal(await p.evaluate(() => selected.border), false);
    await p.locator('#text-border').check();
    assert.equal(await p.evaluate(() => selected.border), true);
    await p.locator('#delete-object').click();
    assert.equal(await p.evaluate(() => page().objects.length), count - 1);
    await p.locator('#undo').click();
    assert.ok(await p.evaluate(() => page().objects.at(-1).box && page().objects.at(-1).border));
    await p.screenshot({ path: process.env.TEMP + '/vinee-board-preview.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Browser editing, text history, geometry, and multi-pointer checks passed.');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
