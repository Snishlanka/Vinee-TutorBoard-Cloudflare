const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.wasm': 'application/wasm',
      }[path.extname(f)] || 'application/octet-stream'
    );
    const crossScriptOrigin = process.env.PDF_CROSS_ORIGIN_SCRIPT
      ? `http://localhost:${server.address().port}`
      : '';
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' ${crossScriptOrigin}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'`
    );
    fs.readFile(f, (e, data) => {
      res.statusCode = e ? 404 : 200;
      if (!e && crossScriptOrigin && f.endsWith('whiteboard.html'))
        data = data
          .toString('utf8')
          .replace(
            '<script src="pdf-tools.js"></script>',
            `<script src="${crossScriptOrigin}/pdf-tools.js"></script>`
          );
      res.end(e ? 'Not found' : data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    p.on('pageerror', (e) => {
      errors.push(e.message);
      console.error('PDF browser error:', e.message);
    });
    if (process.env.PDF_CLASSIC_PREVIEW) {
      await p.addInitScript(() => {
        window.Worker = class {
          constructor() {
            throw new DOMException('Workers blocked in preview', 'SecurityError');
          }
        };
      });
      await p.route('**/*.mjs', (route) => route.abort());
    }

    p.on('console', (m) => {
      if (m.type() === 'error') console.log('Browser:', m.text());
    });
    await p.goto(`http://127.0.0.1:${server.address().port}/whiteboard.html`);
    const bytes = await p.evaluate(async () => {
      const doc = await PDFLib.PDFDocument.create(),
        font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      for (let i = 1; i <= 3; i++) {
        const page = doc.addPage([600, 800]);
        page.drawRectangle({ x: 0, y: 0, width: 600, height: 800, color: PDFLib.rgb(1, 1, 1) });
        page.drawRectangle({
          x: 38,
          y: 654,
          width: 524,
          height: 94,
          color: PDFLib.rgb(0.89, 0.95, 0.92),
        });
        page.drawText('MATHEMATICS / CHAPTER ' + i, {
          x: 56,
          y: 710,
          size: 11,
          font,
          color: PDFLib.rgb(0.08, 0.4, 0.27),
        });
        page.drawText(
          ['Understanding fractions', 'Working with equations', 'Shapes and space'][i - 1],
          { x: 56, y: 678, size: 25, font }
        );
        page.drawText('Exercise ' + i + '.1', { x: 56, y: 600, size: 21, font });
        for (let n = 1; n <= 7; n++)
          page.drawText(n + '.  Solve the problem and show your working.', {
            x: 56,
            y: 550 - n * 45,
            size: 14,
            font,
          });
        page.drawText('Vinee sample textbook / ' + i, { x: 56, y: 40, size: 11, font });
      }
      return Array.from(await doc.save());
    });
    let fileChoosers = 0;
    p.on('filechooser', () => fileChoosers++);
    const chooser = p.waitForEvent('filechooser');
    await p.locator('#pdf-import').click();
    await (
      await chooser
    ).setFiles({
      name: 'Mathematics textbook.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(bytes),
    });
    async function ready(fit = true) {
      await p.waitForFunction(
        () =>
          document.getElementById('pdf-reader').open &&
          !document.getElementById('pdf-reader').classList.contains('pdf-is-loading') &&
          !document.getElementById('pdf-page-frame').hidden
      );
      if (fit) await p.locator('#pdf-zoom-fit').click();
    }
    async function closed() {
      await p.waitForFunction(() => !document.getElementById('pdf-reader').open);
    }
    async function draw(tool, a, b) {
      await p.locator(`[data-pdf-tool="${tool}"]`).click();
      const r = await p.locator('#pdf-ink-canvas').boundingBox();
      await p.mouse.move(r.x + a[0] * r.width, r.y + a[1] * r.height);
      await p.mouse.down();
      await p.mouse.move(r.x + b[0] * r.width, r.y + b[1] * r.height, { steps: 10 });
      await p.mouse.up();
    }
    await ready(false);
    assert.equal(await p.locator('[data-pdf-tool="laser"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await p.locator('#pdf-fit-window').getAttribute('aria-pressed'), 'true');
    const chromeHeight = await p.evaluate(
      () =>
        document.getElementById('pdf-preview-stage').getBoundingClientRect().top -
        document.getElementById('pdf-reader-shell').getBoundingClientRect().top
    );
    assert.ok(chromeHeight < 130, 'Compact reader chrome leaves room for the PDF');
    const beforeRight = await p.locator('#pdf-preview-stage').evaluate((e) => e.scrollTop),
      rightBox = await p.locator('#pdf-ink-canvas').boundingBox(),
      stageBox = await p.locator('#pdf-preview-stage').boundingBox();
    const rightX = stageBox.x + stageBox.width * 0.8,
      rightY = stageBox.y + stageBox.height * 0.6;
    await p.mouse.move(rightX, rightY);
    await p.mouse.down({ button: 'right' });
    await p.mouse.move(rightX, rightY - 60, { steps: 6 });
    await p.mouse.up({ button: 'right' });
    assert.ok(
      (await p.locator('#pdf-preview-stage').evaluate((e) => e.scrollTop)) > beforeRight,
      'Right-drag pans while Laser remains selected'
    );
    assert.equal(await p.locator('[data-pdf-tool="laser"]').getAttribute('aria-pressed'), 'true');
    const pdfAnchor = async () =>
      p.evaluate(
        ({ x, y }) => {
          const r = document.getElementById('pdf-ink-canvas').getBoundingClientRect();
          return { x: (x - r.left) / r.width, y: (y - r.top) / r.height };
        },
        { x: rightX, y: rightY }
      );
    const wheelBefore = await pdfAnchor();
    await p.mouse.move(rightX, rightY);
    await p.keyboard.down('Control');
    await p.mouse.wheel(0, -100);
    await p.keyboard.up('Control');
    await p.waitForTimeout(80);
    const wheelAfter = await pdfAnchor();
    assert.ok(
      Math.abs(wheelBefore.y - wheelAfter.y) < 0.02,
      'Ctrl+wheel keeps the pointed PDF region anchored'
    );
    assert.notEqual(await p.locator('#pdf-zoom-fit').textContent(), 'Fit page');
    await p.locator('#pdf-zoom-fit').click();
    assert.equal(await p.locator('#pdf-page-total').textContent(), 'of 3');
    assert.equal(await p.evaluate(() => page().objects.length), 0);
    assert.equal(await p.evaluate(() => TutorBoard.snapshot().lesson.loadedPDF.totalPages), 3);
    assert.equal(await p.locator('#pdf-book-bar').count(), 0);
    assert.equal(
      await p.locator('#pdf-teaching-toolbar [data-pdf-tool]').count(),
      await p.locator('#board-controls .board-toolbar [data-tool]').count()
    );
    assert.equal(
      await p.locator('#pdf-teaching-toolbar [data-pdf-color]').count(),
      await p.locator('#colors button').count()
    );
    assert.equal(
      await p.evaluate(
        () => getComputedStyle(document.getElementById('pdf-preview-stage')).backgroundImage
      ),
      'none'
    );
    await p.locator('#pdf-reader-close').click();
    await closed();
    await p.locator('#pdf-import').click();
    await ready();
    assert.equal(fileChoosers, 1, 'Loaded PDF opens without a file picker');
    const replacementPicker = p.waitForEvent('filechooser');
    await p.locator('#pdf-reader-change').click();
    await (await replacementPicker).setFiles([]);
    assert.equal(await p.evaluate(() => TutorPDF.snapshot().name), 'Mathematics textbook.pdf');
    await p.locator('[data-pdf-color="#ef4444"]').click();
    await draw('pen', [0.15, 0.3], [0.65, 0.34]);
    assert.match(
      await p.locator('#pdf-ink-canvas').evaluate((e) => getComputedStyle(e).cursor),
      /data:image\/svg\+xml/,
      'PDF Chalk uses the board chalk cursor'
    );
    const beforeLaser = await p.evaluate(() => TutorPDF.snapshot().annotations[1].length);
    await draw('laser', [0.2, 0.2], [0.7, 0.25]);
    await p.waitForTimeout(80);
    const laserPixels = () =>
      p.locator('#pdf-laser-canvas').evaluate((c) => {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let count = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i]) count++;
        return count;
      });
    assert.ok((await laserPixels()) > 10, 'Laser trail remains visible immediately after lifting');
    await p.waitForTimeout(1250);
    assert.equal(await laserPixels(), 0, 'Laser fades like the board');
    assert.equal(
      await p.evaluate(() => TutorPDF.snapshot().annotations[1].length),
      beforeLaser,
      'Laser is never saved as ink'
    );

    await p.locator('#pdf-ink-undo').click();
    assert.equal(await p.locator('#pdf-ink-redo').isEnabled(), true);
    await p.locator('#pdf-ink-redo').click();
    await draw('pen', [0.15, 0.78], [0.7, 0.78]);
    await draw('eraser', [0.42, 0.78], [0.45, 0.78]);
    const erasure = await p.evaluate(() => {
      const c = document.getElementById('pdf-ink-canvas'),
        ctx = c.getContext('2d');
      return {
        left: ctx.getImageData(Math.round(c.width * 0.22), Math.round(c.height * 0.78), 1, 1)
          .data[3],
        middle: ctx.getImageData(Math.round(c.width * 0.44), Math.round(c.height * 0.78), 1, 1)
          .data[3],
      };
    });
    assert.ok(
      erasure.left > 0,
      'Point erasing retains marks below the board height on a portrait PDF'
    );
    assert.equal(erasure.middle, 0, 'Point erasing cuts only the touched area');
    assert.ok(
      (await p
        .locator('[data-pdf-tool="pen"]')
        .evaluate((e) => parseFloat(getComputedStyle(e).width))) <=
        (await p
          .locator('#board-controls [data-tool="pen"]')
          .evaluate((e) => parseFloat(getComputedStyle(e).width)))
    );
    const originalHeight = await p.locator('#pdf-page-frame').evaluate((e) => e.offsetHeight);
    await p.locator('#pdf-zoom-in').click();
    await p.locator('#pdf-zoom-in').click();
    assert.ok(
      (await p.locator('#pdf-page-frame').evaluate((e) => e.offsetHeight)) > originalHeight
    );
    assert.equal(await p.locator('#pdf-zoom-fit').textContent(), '150%');
    assert.equal(await p.evaluate(() => TutorPDF.snapshot().annotations[1].length), 2);
    await p.locator('[data-pdf-tool="move"]').click();
    const panBox = await p.locator('#pdf-ink-canvas').boundingBox(),
      oldScroll = await p.locator('#pdf-preview-stage').evaluate((e) => e.scrollTop);
    await p.mouse.move(panBox.x + panBox.width * 0.95, panBox.y + panBox.height * 0.5);
    await p.mouse.down();
    await p.mouse.move(panBox.x + panBox.width * 0.95, panBox.y + panBox.height * 0.5 - 40, {
      steps: 5,
    });
    await p.mouse.up();
    assert.ok(
      (await p.locator('#pdf-preview-stage').evaluate((e) => e.scrollTop)) > oldScroll,
      'Move pans a zoomed PDF without editing notes'
    );
    await p.locator('#pdf-zoom-fit').click();
    assert.equal(await p.locator('#pdf-zoom-fit').textContent(), 'Fit page');
    await p.locator('#pdf-reader-next').click();
    await ready();
    await draw('highlighter', [0.1, 0.45], [0.75, 0.45]);
    await draw('text', [0.18, 0.62], [0.78, 0.83]);
    await p.locator('#pdf-text-editor').fill('Show your working');
    await p.evaluate(() => {
      const e = document.getElementById('pdf-text-editor'),
        r = document.createRange();
      r.setStart(e.firstChild, 0);
      r.setEnd(e.firstChild, 4);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await p.locator('#pdf-text-editor').press('Control+b');
    await p.locator('#pdf-text-editor').press('Control+u');

    await p.locator('#pdf-text-editor').press('Control+Enter');
    assert.ok(
      (await p.locator('#pdf-text-options').evaluate((e) => e.getBoundingClientRect().height)) < 55,
      'Text formatting stays compact on desktop'
    );
    await p.locator('#pdf-reader-fullscreen').click();
    await p.waitForFunction(() => document.fullscreenElement?.id === 'pdf-reader-shell');
    assert.equal(await p.locator('#pdf-teaching-toolbar').isVisible(), true);
    if (process.env.PREVIEW_PATH)
      await p.screenshot({ path: process.env.PREVIEW_PATH + '-fullscreen.png' });
    await p.locator('#pdf-reader-next').click();
    await ready();
    await draw('rect', [0.15, 0.25], [0.55, 0.45]);
    assert.equal(await p.locator('#pdf-object-panel').isVisible(), true);
    await p.locator('#pdf-shape-width').fill('500');
    await p.locator('#pdf-shape-height').fill('300');
    await p.locator('#pdf-apply-shape-size').click();
    assert.equal(await p.evaluate(() => TutorPDF.snapshot().annotations[3][0].w), 500);
    await p.locator('#pdf-shape-fill-enabled').check();
    await p.locator('#pdf-shape-fill-pattern').selectOption('forward');
    await p.locator('#pdf-shape-fill-color').click();
    await p.locator('#picker-hex').fill('#33aa77');
    await p.locator('#picker-hex').press('Tab');
    await p.locator('#picker-apply').click();
    assert.equal(
      await p.evaluate(() => TutorPDF.snapshot().annotations[3][0].fill),
      '#33aa77',
      'PDF uses the board RGB/hex picker'
    );

    await p.locator('#pdf-shape-rotate-right').click();
    assert.equal(await p.evaluate(() => TutorPDF.snapshot().annotations[3][0].rotation), 15);
    const handle = await p.evaluate(() => {
      const c = document.getElementById('pdf-ink-canvas'),
        o = TutorPDF.snapshot().annotations[3][0];
      return selectionHandles(o, (4 * c.width) / c.getBoundingClientRect().width, c.height).find(
        (h) => h.kind === 'corner' && h.u === 1 && h.v === 1
      );
    });
    let shapeBox = await p.locator('#pdf-ink-canvas').boundingBox();
    const raw = await p.locator('#pdf-ink-canvas').evaluate((c) => ({ w: c.width, h: c.height }));
    await p.mouse.move(
      shapeBox.x + (handle.x / raw.w) * shapeBox.width,
      shapeBox.y + (handle.y / raw.h) * shapeBox.height
    );
    await p.mouse.down();
    await p.mouse.move(
      shapeBox.x + ((handle.x + 80) / raw.w) * shapeBox.width,
      shapeBox.y + ((handle.y + 40) / raw.h) * shapeBox.height,
      { steps: 8 }
    );
    await p.mouse.up();
    assert.ok(
      (await p.evaluate(() => TutorPDF.snapshot().annotations[3][0].w)) > 500,
      'Shared corner handles resize PDF shapes'
    );
    await p.locator('#pdf-fit-window').click();
    await p.waitForTimeout(80);
    assert.equal(await p.locator('#pdf-fit-window').getAttribute('aria-pressed'), 'true');
    assert.ok(
      (await p.locator('#pdf-page-frame').evaluate((e) => e.offsetWidth)) >
        (await p.locator('#pdf-preview-stage').evaluate((e) => e.clientWidth)) * 0.8,
      'Fit to window fills the available reading width'
    );
    await p.locator('#pdf-zoom-fit').click();
    await p.locator('#pdf-reader-close').click();
    await closed();
    assert.equal(await p.evaluate(() => document.fullscreenElement), null);
    assert.equal(
      await p.evaluate(() => page().objects.length),
      0,
      'Reading and notes must never insert a book onto the board'
    );
    assert.equal(await p.evaluate(() => TutorPDF.snapshot().pageNumber), 3);
    await p.locator('#pdf-import').click();
    await ready();
    assert.equal(await p.locator('#pdf-page-number').inputValue(), '3');
    await p.locator('#pdf-crop-tool').click();
    assert.equal(await p.locator('#pdf-mode-crop').getAttribute('aria-pressed'), 'true');
    assert.equal(
      await p.locator('#pdf-crop-layer').evaluate((e) => getComputedStyle(e).cursor),
      'crosshair'
    );
    assert.equal(await p.locator('#board-controls #pdf-crop-tool').count(), 0);
    await p.locator('#pdf-zoom-in').click();
    const cr = await p.locator('#pdf-crop-layer').boundingBox();
    await p.mouse.move(cr.x + cr.width * 0.08, cr.y + cr.height * 0.22);
    await p.mouse.down();
    await p.mouse.move(cr.x + cr.width * 0.9, cr.y + cr.height * 0.46, { steps: 8 });
    await p.mouse.up();
    if (process.env.PREVIEW_PATH)
      await p.screenshot({ path: process.env.PREVIEW_PATH + '-crop.png' });
    await p.locator('#pdf-reader-apply').click();
    await closed();
    assert.equal(await p.evaluate(() => page().objects.length), 1);
    assert.equal(await p.evaluate(() => !!page().objects[0].pdfBook), false);
    assert.ok(await p.evaluate(() => page().objects[0].w > page().objects[0].h));
    await p.locator('#undo').click();
    assert.equal(await p.evaluate(() => page().objects.length), 0);
    assert.equal(await p.evaluate(() => TutorPDF.hasBook()), true);
    await p.locator('#redo').click();
    const lesson = await p.evaluate(() => TutorBoard.snapshot());
    assert.equal(lesson.lesson.loadedPDF.annotations[1].length, 2);
    assert.equal(lesson.lesson.loadedPDF.annotations[2].length, 2);
    assert.equal(
      lesson.lesson.loadedPDF.annotations[2][1].runs
        .filter((r) => r.bold && r.underline)
        .map((r) => r.text)
        .join(''),
      'Show'
    );
    assert.equal(
      await p.evaluate(
        (s) =>
          validLoadedPDF(s.lesson.loadedPDF) &&
          s.lesson.pages.every((p) => p.objects.every(validObject)),
        lesson
      ),
      true
    );
    await p.evaluate((s) => TutorBoard.restore(s), lesson);
    const jsonDownload = p.waitForEvent('download');
    await p.locator('#file-menu summary').click();
    await p.locator('#save').click();
    const json = fs.readFileSync(await (await jsonDownload).path());
    const saved = JSON.parse(json);
    assert.equal(saved.loadedPDF.name, 'Mathematics textbook.pdf');
    assert.equal(saved.pages[0].objects.length, 1);
    p.on('dialog', (d) => d.accept());
    await p
      .locator('#lesson-file')
      .setInputFiles({ name: 'reader-lesson.json', mimeType: 'application/json', buffer: json });
    await p.waitForFunction(
      () => document.getElementById('toast').textContent === 'Lesson opened.'
    );
    assert.equal(
      await p.evaluate(() => TutorPDF.snapshot().annotations[2][1].text),
      'Show your working'
    );
    await p.locator('#file-menu summary').click();
    await p.locator('#export-pdf').click();
    await p.locator('#pdf-export-dialog').waitFor({ state: 'visible' });
    if (process.env.PREVIEW_PATH)
      await p.screenshot({ path: process.env.PREVIEW_PATH + '-exports.png' });
    const lessonDownload = p.waitForEvent('download');
    await p.locator('#pdf-download-lesson').click();
    const lessonFile = await lessonDownload;
    const lessonPDF = fs.readFileSync(await lessonFile.path());
    assert.equal(
      await p.evaluate(
        async (bytes) => (await PDFLib.PDFDocument.load(new Uint8Array(bytes))).getPageCount(),
        Array.from(lessonPDF)
      ),
      1,
      'Lesson PDF contains only board pages'
    );
    const bookDownload = p.waitForEvent('download');
    await p.locator('#pdf-download-book').click();
    const bookFile = await bookDownload;
    assert.notEqual(bookFile.suggestedFilename(), lessonFile.suggestedFilename());
    const exportedBytes = fs.readFileSync(await bookFile.path());
    const exported = await p.evaluate(
      async (bytes) =>
        (await PDFLib.PDFDocument.load(new Uint8Array(bytes))).getPages().map((p) => p.getSize()),
      Array.from(exportedBytes)
    );
    assert.equal(exported.length, 3, 'Book PDF is separate and contains all three book pages');
    assert.equal(exported[0].width, 600);
    assert.equal(exported[2].height, 800);
    await p.locator('#pdf-export-close').click();
    const redPixels = await p.evaluate(async (bytes) => {
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), useWasm: false })
        .promise;
      const page = await doc.getPage(1),
        viewport = page.getViewport({ scale: 1 }),
        c = document.createElement('canvas');
      c.width = viewport.width;
      c.height = viewport.height;
      await page.render({ canvas: c, viewport }).promise;
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let red = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i] > 180 && data[i + 1] < 130 && data[i + 2] < 130) red++;
      await doc.loadingTask.destroy();
      return red;
    }, Array.from(exportedBytes));
    assert.ok(redPixels > 50, 'PDF teaching marks appear in the combined export');
    await p.locator('#pdf-import').click();
    await ready();
    await p.setViewportSize({ width: 390, height: 844 });
    await p.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
    await p.waitForTimeout(200);
    assert.equal(
      await p.evaluate(() => {
        const r = document.getElementById('pdf-reader').getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      }),
      true
    );
    await p.locator('#pdf-zoom-in').click();
    assert.equal(await p.locator('#pdf-zoom-fit').textContent(), '125%');
    await p.locator('#pdf-zoom-fit').click();
    if (process.env.PREVIEW_PATH)
      await p.screenshot({ path: process.env.PREVIEW_PATH + '-mobile.png' });
    await p.locator('#pdf-reader-close').click();
    await closed();
    await p.locator('#pdf-file').setInputFiles({
      name: 'broken.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('not a pdf'),
    });
    await p.waitForFunction(() => !document.getElementById('pdf-reader-error').hidden);
    assert.equal(await p.locator('#pdf-reader-apply').isDisabled(), true);
    await p.locator('#pdf-reader-close').click();
    await closed();
    assert.equal(
      await p.evaluate(() => TutorPDF.snapshot().name),
      'Mathematics textbook.pdf',
      'Bad replacement must retain the loaded book'
    );
    if (process.env.PDF_OFFLINE_CHECK) {
      const offlineLesson = await p.evaluate(() => TutorBoard.snapshot());
      await p.waitForFunction(() => !!navigator.serviceWorker.controller);
      await p.context().setOffline(true);
      await p.reload();
      await p.waitForFunction(() => !!window.TutorBoard && !!window.TutorPDF);
      await p.evaluate((s) => {
        for (const d of document.querySelectorAll('dialog[open]')) d.close();
        TutorBoard.restore(s);
      }, offlineLesson);
      await p.locator('#pdf-import').click();
      await ready();
      await p.locator('#pdf-reader-prev').click();
      await ready();
      assert.equal(await p.locator('#pdf-page-number').inputValue(), '2');
      await p.locator('#pdf-reader-close').click();
      await closed();
      await p.context().setOffline(false);
    }
    if (process.env.PDF_LARGE_CHECK) {
      const content = 'BT /F1 24 Tf 56 700 Td (Large textbook test) Tj ET';
      const filler = Buffer.alloc(32 * 1024 * 1024, 32);
      const bodies = [
        Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
        Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
        Buffer.from(
          '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'
        ),
        Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
        Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
        Buffer.concat([
          Buffer.from(`<< /Length ${filler.length} >>\nstream\n`),
          filler,
          Buffer.from('\nendstream'),
        ]),
      ];
      const chunks = [Buffer.from('%PDF-1.4\n')],
        offsets = [0];
      let position = chunks[0].length;
      bodies.forEach((body, i) => {
        const object = Buffer.concat([
          Buffer.from(`${i + 1} 0 obj\n`),
          body,
          Buffer.from('\nendobj\n'),
        ]);
        offsets.push(position);
        chunks.push(object);
        position += object.length;
      });
      const xref = `xref\n0 7\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
        .join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`;
      chunks.push(Buffer.from(xref));
      const largePDF = Buffer.concat(chunks);
      assert.ok(largePDF.length > 20 * 1024 * 1024);
      await p.locator('#pdf-file').setInputFiles({
        name: '32MB textbook.pdf',
        mimeType: 'application/pdf',
        buffer: largePDF,
      });
      await ready();
      await p.locator('#pdf-reader-close').click();
      await p.waitForFunction(() => !document.getElementById('pdf-reader').open);
      assert.equal(await p.evaluate(() => TutorPDF.snapshot().name), '32MB textbook.pdf');
      const download = p.waitForEvent('download');
      await p.locator('#file-menu summary').click();
      await p.locator('#save').click();
      const savedBuffer = fs.readFileSync(await (await download).path());
      assert.ok(savedBuffer.length > 40 * 1024 * 1024);

      await p.locator('#lesson-file').setInputFiles({
        name: 'large-lesson.json',
        mimeType: 'application/json',
        buffer: savedBuffer,
      });
      await p.waitForFunction(
        () =>
          TutorPDF.snapshot()?.name === '32MB textbook.pdf' &&
          document.getElementById('toast').textContent === 'Lesson opened.'
      );
      assert.equal(await p.evaluate(() => page().objects.every(validObject)), true);
      console.log('32 MB PDF import and >40 MB lesson save/reopen passed.');
    }
    assert.deepEqual(errors, []);
    console.log(
      'PDF Book View, shared editing tools, default Laser/Fit, right-drag/Ctrl+wheel, bottom navigation and separate PDF exports passed.'
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
