const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    res.setHeader(
      'Content-Type',
      { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)] ||
        'application/octet-stream'
    );
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'"
    );
    fs.readFile(file, (error, data) => {
      res.statusCode = error ? 404 : 200;
      res.end(error ? 'Not found' : data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/whiteboard.html`);
    await page.waitForFunction(() => window.TutorPWA?.library?.ready);
    const bytes = await page.evaluate(async () => {
      const doc = await PDFLib.PDFDocument.create();
      for (let n = 1; n <= 4; n++) {
        const sheet = doc.addPage([600, 800]);
        sheet.drawText(`Exercise ${n}: show your working`, { x: 45, y: 700, size: 22 });
        sheet.drawText('Answer: 42', { x: 45, y: 450, size: 24 });
      }
      return Array.from(await doc.save());
    });
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#pdf-import').click();
    await (
      await chooser
    ).setFiles({ name: 'Exercises.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
    const ready = async () =>
      page.waitForFunction(
        () =>
          document.getElementById('pdf-reader').open &&
          !document.getElementById('pdf-reader').classList.contains('pdf-is-loading')
      );
    await ready();
    assert.equal(
      await page.locator('#pdf-book-sidebar').isVisible(),
      false,
      'Sidebar preserves initial reading space'
    );
    await page.locator('#pdf-sidebar-toggle').click();
    await page.locator('.pdf-thumb-card[data-page="1"] canvas').waitFor();
    await page.locator('.pdf-thumb-card[data-page="3"]').click();
    await ready();
    assert.equal(await page.locator('#pdf-page-number').inputValue(), '3');
    assert.equal(
      await page.locator('.pdf-thumb-card[data-page="3"]').getAttribute('aria-current'),
      'page'
    );
    await page.locator('#pdf-bookmark-toggle').click();
    await page.locator('#pdf-bookmark-name').fill('Fractions practice');
    await page.locator('#pdf-bookmark-save').click();
    await page.waitForFunction(() =>
      TutorPDF.snapshot().bookmarks?.some(
        (item) => item.title === 'Fractions practice' && item.page === 3
      )
    );
    await page.locator('#pdf-side-next').click();
    await ready();
    await page.locator('#pdf-sidebar-bookmarks').click();
    await page
      .locator('.pdf-bookmark-item')
      .filter({ hasText: 'Fractions practice' })
      .locator('button')
      .first()
      .click();
    await ready();
    assert.equal(await page.locator('#pdf-page-number').inputValue(), '3');
    await page.locator('#pdf-sidebar-toggle').click();
    await page.locator('#pdf-zoom-fit').click();
    await page.locator('#pdf-reveal-tool').click();
    const frame = await page.locator('#pdf-reveal-layer').boundingBox();
    await page.mouse.move(frame.x + frame.width * 0.15, frame.y + frame.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(frame.x + frame.width * 0.65, frame.y + frame.height * 0.55, {
      steps: 8,
    });
    await page.mouse.up();
    assert.equal(await page.locator('.pdf-answer-cover').count(), 1);
    let cover = await page.evaluate(() => TutorPDF.snapshot().covers[3][0]);
    assert.ok(
      Math.abs(cover.x - 0.15) < 0.02 && Math.abs(cover.w - 0.5) < 0.02,
      'Cover geometry is normalized: ' + JSON.stringify({ cover, frame })
    );
    assert.equal(cover.revealed, false);
    await page.locator('.pdf-answer-cover').click();
    assert.equal(
      await page.locator('.pdf-answer-cover').evaluate((e) => e.classList.contains('is-revealed')),
      true
    );
    await page.locator('#pdf-hide-all').click();
    assert.equal(await page.evaluate(() => TutorPDF.snapshot().covers[3][0].revealed), false);
    await page.locator('.pdf-answer-cover').focus();
    await page.keyboard.press('Enter');
    assert.equal(
      await page.evaluate(() => TutorPDF.snapshot().covers[3][0].revealed),
      true,
      'Keyboard can reveal an answer'
    );
    await page.locator('#pdf-hide-all').click();
    const exportResources = await page.evaluate(async () => {
      const doc = await PDFLib.PDFDocument.create();
      await TutorPDF.appendToExport(doc, TutorPDF.snapshot());
      const restored = await PDFLib.PDFDocument.load(await doc.save());
      const images = restored.getPage(2).node.Resources().lookup(PDFLib.PDFName.of('XObject'));
      return { pages: restored.getPageCount(), hasRasterCover: !!images?.keys().length };
    });
    assert.equal(exportResources.pages, 4);
    assert.equal(
      exportResources.hasRasterCover,
      false,
      'Teaching covers do not hide original PDF answers in exports'
    );
    if (process.env.PREVIEW_PATH)
      await page.screenshot({ path: process.env.PREVIEW_PATH + '-reader.png', fullPage: true });
    await page.keyboard.press('p');
    assert.equal(
      await page.locator('#pdf-reveal-tool').getAttribute('aria-pressed'),
      'false',
      'Drawing shortcut exits cover mode'
    );
    assert.equal(await page.locator('[data-pdf-tool="pen"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#pdf-side-prev').click();
    await ready();
    assert.equal(
      await page.locator('.pdf-answer-cover').count(),
      0,
      'Covers belong to their PDF page'
    );
    await page.locator('#pdf-side-next').click();
    await ready();
    assert.equal(await page.locator('.pdf-answer-cover').count(), 1);
    const saved = await page.evaluate(() => TutorBoard.snapshot());
    await page.locator('#pdf-reader-close').click();
    await page.evaluate((snapshot) => {
      pendingTextRuns = [{ text: 'Stale overflow', bold: false, underline: false }];
      TutorBoard.restore(snapshot);
    }, saved);
    assert.equal(
      await page.evaluate(() => pendingTextRuns.length),
      0,
      'Restoring a lesson clears transient text overflow'
    );
    await page.locator('#pdf-import').click();
    await ready();
    assert.equal(
      await page.locator('.pdf-answer-cover').count(),
      1,
      'Board restore retains book covers'
    );
    assert.equal(
      await page.evaluate(() => TutorPDF.snapshot().bookmarks[0].title),
      'Fractions practice'
    );
    await page.locator('#pdf-reader-close').click();
    await page.locator('#title').fill('Fractions lesson');
    await page.evaluate(async () => {
      document.dispatchEvent(new Event('lessonchange'));
      await TutorPWA.flush();
    });
    assert.ok(
      (await page.evaluate(() => TutorPWA.library.list())).some(
        (item) => item.title === 'Fractions lesson'
      )
    );
    await page.evaluate(async () => {
      const scope = new URL('./', location.href).href;
      const store = await new TutorDraftStore(scope).open();
      const other = TutorBoard.snapshot();
      other.lesson.title = 'Algebra archive';
      other.lesson.loadedPDF = null;
      await store.put({
        id: 'archived-test',
        savedAt: Date.now() - 10000,
        subject: 'Mathematics',
        snapshot: other,
      });
      store.db.close();
    });
    // Library UI checks follow the public DOM contract; the helper API checks saved state independently.
    await page.locator('#show-drafts').click();
    await page.locator('#lesson-library[open]').waitFor();
    assert.ok((await page.locator('#lesson-library').textContent()).includes('Fractions lesson'));
    assert.ok((await page.locator('#lesson-library').textContent()).includes('Algebra archive'));
    await page.locator('#lesson-library-search').fill('Mathematics');
    assert.equal(await page.locator('.lesson-card').count(), 1, 'Search matches subject');
    await page.locator('#lesson-library-search').fill('not-a-real-lesson');
    assert.equal(await page.locator('.lesson-library-empty').isVisible(), true);
    await page.locator('#lesson-library-search').fill('');
    const currentId = await page.evaluate(() => TutorPWA.library.currentId);
    assert.equal(
      await page.locator(`[data-lesson-delete="${currentId}"]`).isDisabled(),
      true,
      'Current lesson cannot be deleted'
    );
    if (process.env.PREVIEW_PATH)
      await page.screenshot({ path: process.env.PREVIEW_PATH + '-library.png', fullPage: true });
    await page.locator('[data-lesson-open="archived-test"]').click();
    await page.waitForFunction(() => !document.getElementById('lesson-library').open);
    assert.equal(await page.locator('#title').inputValue(), 'Algebra archive');
    assert.equal(await page.evaluate(() => TutorPDF.snapshot()), null);
    await page.evaluate(async () => {
      const records = await TutorPWA.library.list();
      await TutorPWA.library.open(records.find((item) => item.title === 'Fractions lesson').id);
    });
    assert.equal(await page.locator('#title').inputValue(), 'Fractions lesson');
    assert.equal(
      await page.evaluate(() => TutorPDF.snapshot().covers[3].length),
      1,
      'Library resume restores loaded PDF and teaching covers'
    );
    await page.evaluate(async () =>
      TutorPWA.library.updateMetadata(TutorPWA.library.currentId, {
        title: 'Fractions refined',
        subject: 'Grade 6 Mathematics',
      })
    );
    const current = await page.evaluate(async () =>
      (await TutorPWA.library.list()).find((item) => item.id === TutorPWA.library.currentId)
    );
    assert.equal(current.title, 'Fractions refined');
    assert.equal(current.subject, 'Grade 6 Mathematics');
    await page.locator('#show-drafts').click();
    await page.locator('#lesson-library[open]').waitFor();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('[data-lesson-delete="archived-test"]').click();
    assert.equal(
      await page.locator('[data-lesson-delete="archived-test"]').count(),
      1,
      'Cancel deletion retains the lesson'
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-lesson-delete="archived-test"]').click();
    await page.waitForFunction(
      () => !document.querySelector('[data-lesson-delete="archived-test"]')
    );
    await page.evaluate(() => {
      window.realDraftPut = TutorDraftStore.prototype.put;
      TutorDraftStore.prototype.put = () =>
        Promise.reject(new DOMException('Storage full', 'QuotaExceededError'));
    });
    await page.locator('.lesson-library-save').click();
    await page.waitForFunction(() =>
      document.getElementById('lesson-library-status').classList.contains('state-error')
    );
    assert.match(await page.locator('#lesson-library-status').textContent(), /save|backup/i);
    assert.equal(
      await page.locator('.lesson-library-save').isEnabled(),
      true,
      'Storage failure does not leave UI busy'
    );
    const beforeFailedCreate = await page.evaluate(() => ({
      id: TutorPWA.library.currentId,
      title: document.getElementById('title').value,
    }));
    await page.locator('#lesson-library-new').click();
    await page.waitForFunction(() =>
      document.getElementById('lesson-library-status').classList.contains('state-error')
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        id: TutorPWA.library.currentId,
        title: document.getElementById('title').value,
      })),
      beforeFailedCreate,
      'Failed new lesson preserves the current lesson'
    );
    await page.evaluate(async () => {
      TutorDraftStore.prototype.put = window.realDraftPut;
      await TutorPWA.flush();
    });
    await page.evaluate(() => {
      TutorDraftStore.prototype.put = () =>
        Promise.reject(new DOMException('Storage full for new record', 'QuotaExceededError'));
    });
    await page.locator('#lesson-library-new').click();
    await page.waitForFunction(() =>
      document.getElementById('lesson-library-status').classList.contains('state-error')
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        id: TutorPWA.library.currentId,
        title: document.getElementById('title').value,
      })),
      beforeFailedCreate,
      'Failed initial new-record write preserves the saved current lesson'
    );
    await page.evaluate(() => {
      TutorDraftStore.prototype.put = window.realDraftPut;
    });
    await page.locator('#lesson-library-new').click();
    await page.waitForFunction(() => !document.getElementById('lesson-library').open);
    assert.notEqual(await page.evaluate(() => TutorPWA.library.currentId), beforeFailedCreate.id);
    assert.equal(await page.locator('#title').inputValue(), 'Untitled lesson');
    assert.equal(await page.evaluate(() => TutorPDF.snapshot()), null);
    assert.equal(
      await page.evaluate(() => TutorBoard.snapshot().lesson.pages[0].objects.length),
      0
    );
    assert.ok(
      (await page.evaluate(() => TutorPWA.library.list())).some(
        (record) => record.id === beforeFailedCreate.id
      ),
      'New lesson keeps previous work'
    );
    await page.locator('#file-menu summary').click();
    await page.locator('#lesson-library-open').click();
    await page.locator(`[data-lesson-open="${beforeFailedCreate.id}"]`).click();
    await page.waitForFunction(() => !document.getElementById('lesson-library').open);
    assert.equal(await page.evaluate(() => TutorPDF.snapshot().covers[3].length), 1);
    const otherTab = await page.context().newPage();
    await otherTab.goto(page.url());
    await otherTab.waitForFunction(() => window.TutorPWA?.library?.ready);
    const lockedTitle = await otherTab.locator('#title').inputValue();
    const conflict = await otherTab.evaluate(async (id) => {
      try {
        await TutorPWA.library.open(id);
        return '';
      } catch (error) {
        return error.message;
      }
    }, beforeFailedCreate.id);
    assert.match(conflict, /another window/i, 'Another tab cannot overwrite the active lesson');
    assert.equal(await otherTab.locator('#title').inputValue(), lockedTitle);
    await otherTab.close();
    await page.locator('#show-drafts').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    const mobileLibrary = await page.locator('#lesson-library').boundingBox();
    assert.ok(
      mobileLibrary.x >= 0 && mobileLibrary.x + mobileLibrary.width <= 391,
      'Library fits a narrow screen'
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true
    );
    if (process.env.PREVIEW_PATH)
      await page.screenshot({
        path: process.env.PREVIEW_PATH + '-library-mobile.png',
        fullPage: true,
      });
    await page.locator('.lesson-library-close').click();
    await page.locator('#pdf-import').click();
    await ready();
    await page.locator('#pdf-sidebar-toggle').click();
    assert.equal(await page.locator('#pdf-book-sidebar').isVisible(), true);
    const mobileSidebar = await page.locator('#pdf-book-sidebar').boundingBox();
    assert.ok(
      mobileSidebar.x >= 0 && mobileSidebar.x + mobileSidebar.width <= 391,
      'Sidebar fits a narrow reader'
    );
    if (process.env.PREVIEW_PATH)
      await page.screenshot({
        path: process.env.PREVIEW_PATH + '-reader-mobile.png',
        fullPage: true,
      });
    await page.locator('#pdf-reader-close').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const offlineSnapshot = await page.evaluate(() => TutorBoard.snapshot());
    await page.context().setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.TutorPWA?.library?.ready && window.TutorPDF);
    assert.ok(
      (await page.evaluate(() => TutorPWA.library.list())).some(
        (record) => record.title === 'Fractions refined'
      ),
      'Library persists across offline reload'
    );
    await page.evaluate((snapshot) => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      TutorBoard.restore(snapshot);
    }, offlineSnapshot);
    await page.locator('#pdf-import').click();
    await ready();
    assert.equal(
      await page.locator('.pdf-answer-cover').count(),
      1,
      'New reading aids work offline'
    );
    await page.locator('#pdf-reader-close').click();
    await page.context().setOffline(false);
    const longBook = await page.evaluate(async () => {
      const doc = await PDFLib.PDFDocument.create();
      for (let n = 1; n <= 51; n++)
        doc.addPage([600, 800]).drawText(`Page ${n}`, { x: 40, y: 700, size: 24 });
      return Array.from(await doc.save());
    });
    await page.locator('#pdf-file').setInputFiles({
      name: 'Long book.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(longBook),
    });
    await ready();
    await page.locator('#pdf-sidebar-toggle').click();
    assert.equal(await page.locator('.pdf-thumb-card').count(), 24);
    assert.equal(await page.locator('#pdf-earlier-pages').isVisible(), false);
    await page.locator('#pdf-more-pages').click();
    assert.equal(
      await page.locator('.pdf-thumb-card').count(),
      24,
      'Thumbnail DOM stays bounded between batches'
    );
    assert.equal(await page.locator('.pdf-thumb-card').first().getAttribute('data-page'), '25');
    await page.locator('#pdf-more-pages').click();
    assert.equal(await page.locator('.pdf-thumb-card').count(), 3);
    assert.equal(await page.locator('#pdf-more-pages').isVisible(), false);
    await page.locator('#pdf-earlier-pages').click();
    assert.equal(await page.locator('.pdf-thumb-card').first().getAttribute('data-page'), '25');
    await page.locator('.pdf-thumb-card[data-page="26"]').click();
    await ready();
    assert.equal(await page.locator('#pdf-page-number').inputValue(), '26');
    assert.deepEqual(errors, []);
    console.log(
      'v2.3.0 thumbnails, bookmarks, answer reveal, persistence and lesson library passed.'
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
