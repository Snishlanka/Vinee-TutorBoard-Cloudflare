// Run with the local server; PLAYWRIGHT_MODULE can point to a temporary install.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(process.env.BOARD_URL || 'http://127.0.0.1:8765/whiteboard.html');
    await p.waitForFunction(() => window.TutorStudio && window.TutorPWA);
    if (await p.locator('#drafts-dialog').isVisible()) await p.locator('#drafts-close').click();
    assert.equal(await p.locator('#about-open').innerText(), 'v2.0.0');
    for (const swatch of ['#facc15', '#ffffff', '#3b82f6']) {
      const selectedColor = p.locator(`#colors button[data-color="${swatch}"]`);
      await selectedColor.click();
      assert.equal(await p.locator('#colors button.active').count(), 1);
      assert.equal(await selectedColor.getAttribute('aria-pressed'), 'true');
      assert.equal(await selectedColor.evaluate(button => getComputedStyle(button, '::after').borderLeftWidth), '2px');
    }
    await p.locator('#about-open').click();
    assert.equal(await p.locator('#about-dialog').isVisible(), true);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#about-dialog').isVisible(), false);
    await p.locator('#file-menu summary').click();
    assert.equal(await p.locator('#save').isVisible(), true);
    const downloadPromise = p.waitForEvent('download');
    await p.locator('#save').click();
    assert.ok((await downloadPromise).suggestedFilename().endsWith('.json'));
    assert.equal(await p.locator('#file-menu').getAttribute('open'), null);
    await p.locator('#file-menu summary').click();
    const pngDownload = p.waitForEvent('download');
    await p.locator('#export').click();
    assert.ok((await pngDownload).suggestedFilename().endsWith('.png'));
    await p.locator('#file-menu summary').click();
    const pdfDownload = p.waitForEvent('download');
    await p.locator('#export-pdf').click();
    assert.ok((await pdfDownload).suggestedFilename().endsWith('.pdf'));
    await p.locator('#file-menu summary').focus();
    await p.keyboard.press('Enter');
    assert.equal(await p.locator('#open').isVisible(), true);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#file-menu').getAttribute('open'), null);
    await p.locator('#board-settings summary').click();
    await p.locator('#board-color').selectOption('blue');
    assert.equal(await p.evaluate(() => page().boardColor), 'blue');
    await p.locator('#background').selectOption('grid');
    await p.keyboard.press('Escape');
    await p.locator('#toggle-tools').click();
    await p.locator('[data-tool="text"]').click();
    assert.equal(await p.locator('#text-options').isVisible(), false);
    assert.equal(await p.locator('#tools-panel #text-options').count(), 0);
    await p.evaluate(() => openTextBox({ x: 300, y: 180, w: 650, h: 260 }));
    await p.locator('#text-options').waitFor({ state: 'visible' });
    await p.locator('#text-editor').fill('ありがとうございます。\nWelcome to your teaching studio');
    await p.locator('#text-color').click();
    await p.locator('#picker-hex').fill('#ef4444');
    await p.locator('#picker-hex').press('Tab');
    assert.equal(await p.locator('#text-editor').evaluate(editor => editor.dataset.color), '#ef4444');
    await p.screenshot({ path: path.join(os.tmpdir(), 'tutorboard-v2-color-picker.png'), fullPage: true });
    await p.locator('#picker-apply').click();
    assert.equal(await p.locator('#studio-color-picker').isVisible(), false);
    assert.equal(await p.locator('#text-editor').isVisible(), true);
    assert.equal(await p.locator('#text-editor').evaluate(editor => editor.dataset.color), '#ef4444');
    await p.locator('#text-bold').click();
    assert.equal(await p.locator('#text-editor').isVisible(), true);
    await p.screenshot({ path: path.join(os.tmpdir(), 'tutorboard-v2-text.png'), fullPage: true });
    // Leaving the editor places text automatically; the formatting button stays usable.
    await p.locator('#text-editor').focus();
    await p.locator('body > header .brand strong').click();
    assert.ok(await p.evaluate(() => page().objects.at(-1).text.includes('ありがとうございます。')));
    assert.equal(await p.evaluate(() => selected.color), '#ef4444');
    await p.locator('#text-options').waitFor({ state: 'visible' });
    await p.locator('#text-color').click();
    await p.locator('#picker-hex').fill('#3b82f6');
    await p.locator('#picker-hex').press('Tab');
    assert.equal(await p.evaluate(() => selected.color), '#3b82f6');
    await p.locator('#picker-apply').click();
    assert.equal(await p.evaluate(() => selected.color), '#3b82f6');
    await p.evaluate(() => undo());
    assert.equal(await p.evaluate(() => page().objects.at(-1).color), '#ef4444');
    await p.evaluate(() => { redo(); selected = page().objects.at(-1); syncSelection(); render(); });
    assert.equal(await p.evaluate(() => selected.color), '#3b82f6');
    await p.locator('#text-underline').click();
    assert.equal(await p.evaluate(() => selected.underline), true);
    const selectedText = await p.evaluate(() => page().objects.length - 1);
    for (const [width, height] of [[390,844], [1024,768], [1440,900]]) {
      await p.setViewportSize({ width, height });
      await p.evaluate(i => {
        selected = page().objects[i]; selected.x = 2750; selected.y = 950;
        render(); syncTextControls();
      }, selectedText);
      await p.waitForTimeout(150);
      const toolbar = await p.locator('#text-options').boundingBox();
      assert.ok(toolbar && toolbar.x >= 0 && toolbar.y >= 0 && toolbar.x + toolbar.width <= width + 1 && toolbar.y + toolbar.height <= height + 1,
        `floating formatting should fit the viewport at ${width}`);
    }
    await p.locator('[data-tool="pen"]').click();
    assert.equal(await p.locator('#text-options').isVisible(), false);
    await p.locator('#connector-toggle').click();
    await p.locator('[data-tool="line"]').click();
    assert.equal(await p.locator('#connector-toggle svg').count(), 1);
    await p.locator('#theme-toggle').click();
    assert.equal(await p.locator('html').getAttribute('data-theme'), 'dark');
    await p.waitForTimeout(200);
    const shot = name => p.screenshot({ path: path.join(os.tmpdir(), `tutorboard-v2-${name}.png`), fullPage: true });
    await shot('dark');
    await p.locator('#theme-toggle').click();
    await p.waitForTimeout(200);
    await shot('light');
    await p.locator('#toggle-tools').click();
    await p.locator('#toggle-pages').click();
    await p.evaluate(() => {
      const shape = { type: 'rect', x: 850, y: 420, w: 500, h: 280, color: '#ffffff', width: 3, fill: '#facc15', fillPattern: 'forward', rotation: 15 };
      page().objects.push(shape); selected = shape; syncSelection(); render();
    });
    await p.waitForTimeout(200);
    assert.equal(await p.locator('#shape-fill-hex').innerText(), '#FACC15');
    await p.locator('#shape-fill-color').click();
    await p.locator('#picker-hex').fill('#22c55e');
    await p.locator('#picker-hex').press('Tab');
    assert.equal(await p.evaluate(() => selected.fill), '#22c55e');
    await p.locator('#picker-apply').click();
    assert.equal(await p.locator('#shape-fill-hex').innerText(), '#22C55E');
    await p.locator('#shape-rotate-right').click();
    assert.equal(await p.evaluate(() => selected.rotation), 30);
    await p.locator('#tools-panel').evaluate(panel => { panel.scrollTop = 0; });
    assert.equal(await p.locator('#shape-fill-enabled').isVisible(), true);
    await shot('shape-light');
    await p.locator('#theme-toggle').click();
    await p.waitForTimeout(200);
    await shot('shape-dark');
    await p.locator('#theme-toggle').click();
    assert.equal(await p.locator('#pages-panel').isVisible(), true);
    // Selecting a shape/line opens a collapsed inspector after the pointer finishes.
    for (const type of ['rect', 'line']) {
      await p.evaluate(type => {
        setTool('move');
        selected = null;
        page().objects.push({ type, x: 400, y: 720, w: 450, h: type === 'rect' ? 160 : 0, color: '#ffffff', width: 4 });
        syncSelection(); render();
      }, type);
      if (await p.locator('#tools-panel').isVisible()) await p.locator('#toggle-tools').click();
      const position = await p.evaluate(() => {
        const object = page().objects.at(-1), rect = canvas.getBoundingClientRect();
        return { x: rect.left + (object.x + object.w / 2) * rect.width / W,
          y: rect.top + (object.y + object.h / 2) * rect.height / H, width: rect.width };
      });
      await p.mouse.move(position.x, position.y);
      await p.mouse.down();
      assert.equal(await p.locator('#tools-panel').isVisible(), false);
      assert.equal(await p.locator('#board').evaluate(board => board.getBoundingClientRect().width), position.width);
      await p.mouse.up();
      await p.locator('#tools-panel').waitFor({ state: 'visible' });
      assert.equal(await p.evaluate(() => selected.type), type);
    }
    await shot('pages');
    await p.locator('#toggle-pages').click();
    const iconSizes = [];
    for (const [width, height] of [[2560,1440],[1920,1080],[1536,864],[1366,768],[1280,720],[1200,720],[1100,720],[1024,768],[800,1100],[390,844]]) {
      await p.setViewportSize({ width, height });
      await p.waitForTimeout(150);
      iconSizes.push(await p.locator('[data-tool="pen"] svg').evaluate(icon => icon.getBoundingClientRect().width));
      const toolButton = await p.locator('[data-tool="pen"]').boundingBox();
      if (width >= 1024) {
        const header = await p.locator('body > header').boundingBox();
        const actions = await p.locator('.workspace-controls').boundingBox();
        assert.ok(header.height <= 38 && actions.height <= 30, `application rows should stay compact at ${width}`);
      }
      assert.ok(toolButton.width >= 36 && toolButton.height >= 36, `tool target too small at ${width}`);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `horizontal overflow at ${width}`);
      const board = await p.locator('#board').boundingBox();
      assert.ok(board.height >= 200, `board too short at ${width}: ${board.height}`);
      if (width > 600) {
        const toolbar = await p.locator('.board-toolbar').boundingBox();
        const settingsButton = await p.locator('#board-settings summary').boundingBox();
        assert.ok(settingsButton.y >= toolbar.y - 1 && settingsButton.y + settingsButton.height <= toolbar.y + toolbar.height + 1,
          `Board settings should stay beside the toolbar at ${width}`);
        assert.ok(board.y - toolbar.y - toolbar.height < 12, `extra empty row above board at ${width}`);
        if ([1536,1280].includes(width)) await shot(`monitor-${width}`);
      }
      await p.locator('#board-settings summary').click();
      const settings = await p.locator('#paper-controls').boundingBox();
      assert.ok(settings.x >= 0 && settings.x + settings.width <= width + 1, `settings clipped at ${width}`);
      await p.keyboard.press('Escape');
      if (width === 390) await shot('mobile');
      if ([1280,390].includes(width)) {
        await p.locator('#custom').click();
        const picker = await p.locator('#studio-color-picker').boundingBox();
        assert.ok(picker.x >= 0 && picker.y >= 0 && picker.x + picker.width <= width && picker.y + picker.height <= height,
          `color picker should stay inside the viewport at ${width}`);
        await p.locator('#picker-spectrum').click({ position: { x: 100, y: 55 } });
        const liveColor = await p.locator('#custom').inputValue();
        assert.equal(await p.evaluate(() => color), liveColor);
        await p.locator('#picker-apply').click();
        assert.equal(await p.locator('#studio-color-picker').isVisible(), false);
      }
    }
    assert.ok(iconSizes[0] > iconSizes.at(-1), 'icons should grow on wider viewports');
    assert.ok(iconSizes.every((size, i) => i === 0 || size <= iconSizes[i - 1]), 'icon scaling should be consistent');
    const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await touch.goto(process.env.BOARD_URL || 'http://127.0.0.1:8765/whiteboard.html');
    await touch.waitForFunction(() => window.TutorStudio);
    const touchTool = await touch.locator('[data-tool="pen"]').boundingBox();
    assert.ok(touchTool.width >= 44 && touchTool.height >= 44, 'touch tools need larger targets');
    assert.equal(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await touch.close();
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.locator('#focus').click();
    assert.equal(await p.evaluate(() => document.body.classList.contains('present')), true);
    assert.equal(await p.locator('#tools-panel').isVisible(), false);
    await p.keyboard.press('Escape');
    assert.equal(await p.evaluate(() => document.body.classList.contains('present')), false);
    await p.evaluate(async () => {
      await navigator.serviceWorker.ready;
      const cacheName = (await caches.keys()).find(name => name.includes('v2.0.0-final'));
      if (!cacheName) throw Error('v2.0.0 offline cache is missing');
      const cache = await caches.open(cacheName);
      for (const asset of ['studio.js', 'studio.css', 'color-picker.js']) {
        if (!(await cache.match(new URL(asset, location.href).href))) throw Error(`Offline asset missing: ${asset}`);
      }
    });
    await p.context().setOffline(true);
    await p.reload();
    await p.waitForFunction(() => window.TutorStudio?.version === '2.0.0');
    assert.equal(await p.locator('#about-open').innerText(), 'v2.0.0');
    await p.locator('#drafts-close').click();
    await p.locator('#file-menu summary').click();
    assert.equal(await p.locator('#save').isVisible(), true);
    await p.context().setOffline(false);
    assert.deepEqual(errors, []);
    console.log('v2.0.0 menus, version, Japanese text, contextual formatting, themes, responsive layout and offline assets passed.');
    console.log(`Visual previews: ${path.join(os.tmpdir(), 'tutorboard-v2-{light,dark,mobile}.png')}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
