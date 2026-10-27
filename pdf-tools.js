// A loaded PDF is lesson-level reading material; only extracted crops become board objects.
(() => {
  // Explicit URLs also work when a preview host evaluates classic scripts from about:blank.
  function resolvePDFAssetBase() {
    const candidates = [
      document.baseURI,
      document.currentScript?.src,
      [...document.scripts].find((script) => /(?:^|\/)pdf-tools\.js(?:[?#]|$)/.test(script.src))
        ?.src,
    ];
    for (const source of candidates) {
      try {
        const base = new URL(source);
        if (['http:', 'https:', 'file:'].includes(base.protocol))
          return new URL('vendor/pdfjs/', base).href;
      } catch {}
    }
    return null;
  }
  const pdfAssetBase = resolvePDFAssetBase();
  const MAX_PDF_BYTES = 100 * 1024 * 1024;
  const MAX_PDF_PAGES = 2000;
  const $pdf = (id) => document.getElementById(id);
  const bookIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v16M3 3h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z"/></svg>';
  const importButton = document.createElement('button');
  importButton.id = 'pdf-import';
  importButton.className = 'pdf-import-button';
  importButton.innerHTML = `${bookIcon}<span>PDF book</span>`;
  importButton.title = 'Read a PDF, flip its pages, or crop an exercise onto the board';
  $pdf('image').after(importButton);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/pdf,.pdf';
  fileInput.id = 'pdf-file';
  fileInput.hidden = true;
  document.body.append(fileInput);

  const dialog = document.createElement('dialog');
  dialog.id = 'pdf-reader';
  dialog.setAttribute('aria-labelledby', 'pdf-reader-title');
  dialog.innerHTML = `<div class="pdf-reader-header"><span class="pdf-reader-icon">${bookIcon}</span><div class="pdf-reader-heading"><span class="pdf-eyebrow">YOUR PDF WORKSPACE</span><h2 id="pdf-reader-title">Open a PDF book</h2></div><button id="pdf-reader-change" title="Load a different PDF for this lesson">Change PDF</button><button id="pdf-reader-fullscreen" title="Expand PDF reader to full screen" aria-label="Expand PDF reader to full screen">⛶</button><button id="pdf-reader-close"><span aria-hidden="true">←</span> Back to board</button></div>
    <div class="pdf-reader-tools"><div class="pdf-mode-tabs" role="group" aria-label="PDF view mode"><button id="pdf-mode-full" aria-pressed="true">Full page</button><button id="pdf-mode-crop" aria-pressed="false">Crop an area</button></div><div class="pdf-reader-zoom" role="group" aria-label="PDF zoom"><button id="pdf-zoom-out" aria-label="Zoom out PDF">−</button><button id="pdf-zoom-fit" title="Fit the PDF page to the reading area">Fit page</button><button id="pdf-fit-window" title="Fill the reading window while preserving page proportions">Fit to window</button><button id="pdf-zoom-in" aria-label="Zoom in PDF">+</button></div><div class="pdf-reader-paging"><button id="pdf-reader-prev" aria-label="Previous PDF page">‹</button><label for="pdf-page-number">Page <input id="pdf-page-number" type="number" min="1" value="1" inputmode="numeric" /></label><span id="pdf-page-total">of —</span><button id="pdf-reader-next" aria-label="Next PDF page">›</button></div></div>
    <div class="pdf-preview-stage" id="pdf-preview-stage"><div class="pdf-page-frame" id="pdf-page-frame" hidden><canvas id="pdf-preview-canvas" aria-label="PDF page preview"></canvas><div id="pdf-crop-layer" hidden><div id="pdf-crop-selection"><span></span><i></i><i></i><i></i><i></i></div></div></div><div class="pdf-loading" id="pdf-loading" role="status"><span class="pdf-loading-symbol">${bookIcon}</span><strong>Opening your book…</strong><span>The PDF stays on this device.</span></div></div>
    <div class="pdf-crop-fields" id="pdf-crop-fields" hidden><span>Fine-tune crop</span><label>Left %<input id="pdf-crop-x" type="number" min="0" max="99" step="1" /></label><label>Top %<input id="pdf-crop-y" type="number" min="0" max="99" step="1" /></label><label>Width %<input id="pdf-crop-w" type="number" min="1" max="100" step="1" /></label><label>Height %<input id="pdf-crop-h" type="number" min="1" max="100" step="1" /></label><button id="pdf-crop-reset">Reset crop</button></div>
    <div class="pdf-reader-footer"><p id="pdf-reader-hint">Use the teaching tools above. Your PDF marks follow each page.</p><div><span class="pdf-save-status" id="pdf-save-status">Included in your lesson</span><button id="pdf-reader-apply">Crop to board <span aria-hidden="true">↗</span></button></div></div><p id="pdf-reader-error" role="alert" hidden></p>`;
  function fullscreenMarkup(active) {
    return (
      '<svg class="studio-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="' +
      (active ? 'M8 3v5H3m13-5v5h5M3 16h5v5m8 0v-5h5' : 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5') +
      '"/></svg>'
    );
  }
  dialog.querySelector('#pdf-reader-fullscreen').innerHTML = fullscreenMarkup(false);
  const compactHeader = dialog.querySelector('.pdf-reader-header'),
    extraControls = dialog.querySelector('.pdf-reader-tools');
  compactHeader.insertBefore(
    dialog.querySelector('.pdf-reader-zoom'),
    document.getElementById('pdf-reader-change') ||
      compactHeader.querySelector('#pdf-reader-change')
  );
  const paging = dialog.querySelector('.pdf-reader-paging'),
    previous = paging.querySelector('#pdf-reader-prev'),
    next = paging.querySelector('#pdf-reader-next');
  const footer = dialog.querySelector('.pdf-reader-footer'),
    apply = footer.querySelector('#pdf-reader-apply'),
    hint = footer.querySelector('#pdf-reader-hint'),
    saveStatus = footer.querySelector('#pdf-save-status');
  previous.innerHTML =
    '<span aria-hidden="true">←</span><span class="pdf-turn-label">Previous</span>';
  next.innerHTML = '<span class="pdf-turn-label">Next</span><span aria-hidden="true">→</span>';
  const nextActions = document.createElement('div');
  nextActions.className = 'pdf-reader-next-actions';
  nextActions.append(apply, next);
  hint.hidden = true;
  saveStatus.hidden = true;
  footer.replaceChildren(previous, paging, nextActions, hint, saveStatus);
  footer.setAttribute('aria-label', 'PDF page navigation');
  extraControls.hidden = true;
  const readerShell = document.createElement('div');
  readerShell.id = 'pdf-reader-shell';
  readerShell.append(...dialog.childNodes);
  dialog.append(readerShell);
  document.body.append(dialog);
  const docs = new Map();
  let workerPromise,
    reader = null,
    loadedBook = null,
    readerToken = 0,
    drag = null;
  const preview = $pdf('pdf-preview-canvas');
  const stage = $pdf('pdf-preview-stage');
  const frame = $pdf('pdf-page-frame');
  const cropLayer = $pdf('pdf-crop-layer');
  const cropSelection = $pdf('pdf-crop-selection');
  const teaching = createPDFTeaching({
    dialog,
    frame,
    getReader: () => reader,
    changed: () => saveLoadedReader(true),
    crop: () => setMode(!reader?.cropMode),
  });
  function base64Bytes(data) {
    const binary = atob(data),
      bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function encodeBytes(bytes) {
    let result = '';
    for (let i = 0; i < bytes.length; i += 8192)
      result += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(result);
  }
  function getPDFWorker(lib) {
    workerPromise ||= new Promise((resolve) => {
      let port, timeout;
      const fallback = () => {
        clearTimeout(timeout);
        port?.terminate();
        resolve(null);
      };
      try {
        // A classic worker avoids preview hosts' module/MIME restrictions.
        port = new Worker(new URL('pdf.worker.js', pdfAssetBase).href);
        port.onerror = (event) => {
          event.preventDefault();
          fallback();
        };
        port.onmessage = (event) => {
          if (event.data?.action !== 'ready') return;
          clearTimeout(timeout);
          port.onmessage = null;
          port.onerror = null;
          resolve(new lib.PDFWorker({ port }));
        };
        timeout = setTimeout(fallback, 7000);
      } catch {
        fallback();
      }
    });
    return workerPromise;
  }
  async function loadDocument(data) {
    if (docs.has(data)) return docs.get(data);
    const pending = (async () => {
      const lib = globalThis.pdfjsLib;
      if (!lib?.getDocument || !globalThis.pdfjsWorker?.WorkerMessageHandler)
        throw new Error(
          'The PDF reader files are missing. Reload the board to get the latest version.'
        );
      lib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.js', pdfAssetBase).href;
      const pdfWorker = await getPDFWorker(lib);
      const task = lib.getDocument({
        data: base64Bytes(data),
        worker: pdfWorker,
        cMapUrl: new URL('cmaps/', pdfAssetBase).href,
        cMapPacked: true,
        standardFontDataUrl: new URL('standard_fonts/', pdfAssetBase).href,
        wasmUrl: new URL('wasm/', pdfAssetBase).href,
        useWasm: false,
        enableXfa: false,
      });
      let passwordRequired = false;
      task.onPassword = () => {
        passwordRequired = true;
        task.destroy();
      };
      try {
        const doc = await task.promise;
        if (doc.numPages > MAX_PDF_PAGES) {
          await doc.loadingTask.destroy();
          throw new Error('Choose a PDF with 2,000 pages or fewer.');
        }
        return doc;
      } catch (error) {
        if (passwordRequired)
          throw new Error('This PDF needs a password. Unlock a copy before importing it.');
        throw error;
      }
    })();
    docs.set(data, pending);
    try {
      return await pending;
    } catch (error) {
      docs.delete(data);
      throw error;
    } finally {
      if (docs.size > 2) {
        const first = docs.keys().next().value;
        if (first !== data) {
          const old = docs.get(first);
          docs.delete(first);
          old.then((doc) => doc.loadingTask.destroy()).catch(() => {});
        }
      }
    }
  }
  async function renderPDFPage(data, number) {
    const doc = await loadDocument(data);
    const pdfPage = await doc.getPage(number);
    const natural = pdfPage.getViewport({ scale: 1 });
    const scale = Math.min(2.5, 2200 / Math.max(natural.width, natural.height));
    const viewport = pdfPage.getViewport({ scale });
    const result = document.createElement('canvas');
    result.width = Math.max(1, Math.ceil(viewport.width));
    result.height = Math.max(1, Math.ceil(viewport.height));
    await pdfPage.render({
      canvas: result,
      canvasContext: result.getContext('2d'),
      viewport,
      background: '#ffffff',
    }).promise;
    pdfPage.cleanup();
    return { canvas: result, total: doc.numPages };
  }
  function setError(message = '') {
    $pdf('pdf-reader-error').textContent = message;
    $pdf('pdf-reader-error').hidden = !message;
  }
  function loading(isLoading, label = 'Turning the page…') {
    dialog.classList.toggle('pdf-is-loading', isLoading);
    dialog.setAttribute('aria-busy', String(isLoading));
    $pdf('pdf-loading').hidden = !isLoading;
    $pdf('pdf-loading').querySelector('strong').textContent = label;
    for (const id of [
      'pdf-reader-prev',
      'pdf-reader-next',
      'pdf-reader-apply',
      'pdf-page-number',
      'pdf-mode-full',
      'pdf-mode-crop',
    ])
      $pdf(id).disabled = isLoading;
    if (!isLoading && reader) {
      $pdf('pdf-reader-prev').disabled = reader.number <= 1;
      $pdf('pdf-reader-next').disabled = reader.number >= reader.total;
    }
  }
  function fitPreview() {
    if (!reader?.canvas || !dialog.open) return;
    const widthRatio = (stage.clientWidth - 32) / reader.canvas.width,
      heightRatio = (stage.clientHeight - 32) / reader.canvas.height;
    const ratio = reader.fitMode === 'window' ? widthRatio : Math.min(widthRatio, heightRatio);
    const zoom = reader.zoom || 1;
    stage.classList.toggle('pdf-zoomed', zoom > 1 || reader.fitMode === 'window');
    frame.style.width = Math.max(1, reader.canvas.width * ratio * zoom) + 'px';
    frame.style.height = Math.max(1, reader.canvas.height * ratio * zoom) + 'px';
    $pdf('pdf-zoom-fit').textContent = zoom === 1 ? 'Fit page' : Math.round(zoom * 100) + '%';
    $pdf('pdf-zoom-fit').setAttribute(
      'aria-pressed',
      String(zoom === 1 && reader.fitMode !== 'window')
    );
    $pdf('pdf-fit-window').setAttribute(
      'aria-pressed',
      String(reader.fitMode === 'window' && zoom === 1)
    );
    $pdf('pdf-zoom-out').disabled = zoom <= 0.25;
    $pdf('pdf-zoom-in').disabled = zoom >= 4;
  }
  function setPDFZoom(value, anchor = null) {
    if (!reader?.canvas) return;
    const rect = frame.getBoundingClientRect(),
      viewport = stage.getBoundingClientRect();
    const offsetX = anchor ? anchor.clientX - viewport.left : stage.clientWidth / 2,
      offsetY = anchor ? anchor.clientY - viewport.top : stage.clientHeight / 2;
    const cx = (viewport.left + offsetX - rect.left) / rect.width,
      cy = (viewport.top + offsetY - rect.top) / rect.height;
    reader.zoom = Math.max(0.25, Math.min(4, value));
    fitPreview();
    if (reader.zoom === 1) {
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
    } else {
      stage.scrollLeft = frame.offsetLeft + cx * frame.offsetWidth - offsetX;
      stage.scrollTop = frame.offsetTop + cy * frame.offsetHeight - offsetY;
    }
  }
  $pdf('pdf-zoom-in').onclick = () => setPDFZoom((reader?.zoom || 1) + 0.25);
  $pdf('pdf-zoom-out').onclick = () => setPDFZoom((reader?.zoom || 1) - 0.25);
  $pdf('pdf-zoom-fit').onclick = () => {
    if (reader) reader.fitMode = 'page';
    setPDFZoom(1);
  };
  $pdf('pdf-fit-window').onclick = () => {
    if (reader) {
      teaching.commitText();
      reader.fitMode = 'window';
      reader.zoom = 1;
      fitPreview();
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
    }
  };
  stage.addEventListener(
    'wheel',
    (event) => {
      if (!(event.ctrlKey || event.metaKey) || !reader?.canvas || !dialog.open) return;
      event.preventDefault();
      teaching.cancel();
      setPDFZoom((reader.zoom || 1) * Math.exp(-event.deltaY * 0.002), event);
    },
    { passive: false }
  );
  new ResizeObserver(fitPreview).observe(stage);
  function paintCrop() {
    if (!reader) return;
    const c = reader.crop;
    Object.assign(cropSelection.style, {
      left: c.x * 100 + '%',
      top: c.y * 100 + '%',
      width: c.w * 100 + '%',
      height: c.h * 100 + '%',
    });
    cropSelection.querySelector('span').textContent =
      `${Math.round(c.w * 100)}% × ${Math.round(c.h * 100)}%`;
    for (const key of ['x', 'y', 'w', 'h'])
      $pdf('pdf-crop-' + key).value = Math.round(c[key] * 100);
  }
  function setMode(crop) {
    if (!reader) return;
    teaching.commitText();
    teaching.cancel();
    reader.cropMode = crop;
    dialog.classList.toggle('pdf-crop-active', crop);
    cropLayer.hidden = !crop;
    $pdf('pdf-crop-fields').hidden = !crop;
    $pdf('pdf-mode-full').setAttribute('aria-pressed', String(!crop));
    $pdf('pdf-mode-crop').setAttribute('aria-pressed', String(crop));
    $pdf('pdf-reader-apply').hidden = !crop;
    $pdf('pdf-reader-apply').innerHTML = crop
      ? 'Insert crop on board <span aria-hidden="true">→</span>'
      : 'Crop to board <span aria-hidden="true">↗</span>';
    $pdf('pdf-reader-hint').textContent = crop
      ? 'Drag a rectangle over a question, diagram or paragraph. Only this area is inserted.'
      : 'Export prepares separate lesson and book PDFs.';
    paintCrop();
    teaching.paint();
    requestAnimationFrame(fitPreview);
  }
  async function showReaderPage(number) {
    if (!reader) return;
    teaching.commitText();
    teaching.cancel();
    const current = reader,
      token = ++readerToken;
    const nextNumber = Math.max(1, Math.min(current.total || MAX_PDF_PAGES, number));
    setError();
    loading(true);
    try {
      const result = await renderPDFPage(current.data, nextNumber);
      if (token !== readerToken || reader !== current || !dialog.open) return;
      current.number = nextNumber;
      current.total = result.total;
      current.canvas = result.canvas;
      preview.width = result.canvas.width;
      preview.height = result.canvas.height;
      preview.getContext('2d').drawImage(result.canvas, 0, 0);
      frame.hidden = false;
      $pdf('pdf-page-number').value = nextNumber;
      $pdf('pdf-page-number').max = result.total;
      $pdf('pdf-page-total').textContent = 'of ' + result.total;
      current.crop = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
      loading(false);
      teaching.reset();
      setMode(current.cropMode);
      fitPreview();
      saveLoadedReader(true);
    } catch (error) {
      if (token !== readerToken || reader !== current || !dialog.open) return;
      loading(false);
      // A failed turn must never insert the previously shown page under a new page number.
      $pdf('pdf-reader-apply').disabled = !current.canvas;
      setError(error.message || 'This PDF page could not be opened. Try another PDF.');
      $pdf('pdf-page-number').value = current.number;
    }
  }
  function openReader(context, fullScreen = false) {
    teaching.commitText();
    teaching.cancel();
    end();
    commitText();
    readerToken++;
    reader = {
      ...context,
      number: context.number || 1,
      cropMode: !!context.cropMode,
      crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
      canvas: null,
      zoom: 1,
      fitMode: 'window',
      annotations: clone(context.annotations || {}),
      histories: {},
      dirty: false,
    };
    teaching.selectTool('laser');
    frame.hidden = true;
    setError();
    $pdf('pdf-reader-title').textContent = context.name;
    $pdf('pdf-reader-title').title = context.name;
    if (!dialog.open) dialog.showModal();
    setMode(reader.cropMode);
    if (fullScreen) enterReaderFullscreen();
    showReaderPage(reader.number);
  }
  async function enterReaderFullscreen() {
    if (!readerShell.requestFullscreen) {
      toast('This browser uses the expanded reader instead of full screen.');
      return;
    }
    try {
      if (document.fullscreenElement === readerShell) await document.exitFullscreen();
      else await readerShell.requestFullscreen();
    } catch {
      toast('Full screen is unavailable here. You can still use the expanded reader.');
    }
  }
  let closingReader = false;
  async function closeReader() {
    if (closingReader) return;
    closingReader = true;
    teaching.commitText();
    teaching.cancel();
    try {
      saveLoadedReader(true);
    } catch (error) {
      setError(error.message || 'Your PDF marks could not be saved. Try again.');
      closingReader = false;
      return;
    }
    readerToken++;
    if (document.fullscreenElement === readerShell) await document.exitFullscreen().catch(() => {});
    if (dialog.open) dialog.close();
    closingReader = false;
    sync();
  }
  $pdf('pdf-reader-close').onclick = closeReader;
  $pdf('pdf-reader-fullscreen').onclick = enterReaderFullscreen;
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeReader();
  });
  dialog.addEventListener('close', () => {
    readerToken++;
    frame.hidden = true;
  });
  document.addEventListener('fullscreenchange', () => {
    $pdf('pdf-reader-fullscreen').innerHTML = fullscreenMarkup(
      document.fullscreenElement === readerShell
    );
    $pdf('pdf-reader-fullscreen').setAttribute(
      'aria-label',
      document.fullscreenElement === readerShell
        ? 'Exit full screen'
        : 'Expand PDF reader to full screen'
    );
    fitPreview();
  });
  importButton.onclick = () => {
    end();
    commitText();
    if (loadedBook) openLoaded();
    else fileInput.click();
  };
  $pdf('pdf-reader-change').onclick = () => {
    teaching.cancel();
    saveLoadedReader(true);
    fileInput.click();
  };
  function reportFileIssue(message) {
    if (dialog.open) setError(message);
    else toast(message);
  }
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      reportFileIssue('Choose a PDF file.');
      return;
    }
    if (!file.size || file.size > MAX_PDF_BYTES) {
      reportFileIssue('Choose a PDF up to 100 MB.');
      return;
    }
    const targetPage = page();
    try {
      const data = encodeBytes(new Uint8Array(await file.arrayBuffer()));
      if (targetPage !== page()) {
        toast('The board page changed. Choose your PDF again.');
        return;
      }
      openReader({ data, name: file.name, total: 0, number: 1, targetPage });
    } catch {
      toast('The PDF file could not be read.');
    }
  };
  $pdf('pdf-mode-full').onclick = () => setMode(false);
  $pdf('pdf-mode-crop').onclick = () => setMode(true);
  $pdf('pdf-reader-prev').onclick = () => showReaderPage(reader.number - 1);
  $pdf('pdf-reader-next').onclick = () => showReaderPage(reader.number + 1);
  $pdf('pdf-page-number').onchange = (e) => {
    const number = Number(e.target.value);
    if (!Number.isInteger(number) || number < 1 || number > reader.total) {
      e.target.value = reader.number;
      return;
    }
    showReaderPage(number);
  };
  dialog.addEventListener('keydown', (event) => {
    if (
      event.isComposing ||
      event.target.closest('input,button,[contenteditable]') ||
      reader?.cropMode ||
      dialog.classList.contains('pdf-is-loading')
    )
      return;
    if (event.key === 'ArrowRight' && reader?.number < reader?.total) {
      event.preventDefault();
      showReaderPage(reader.number + 1);
    }
    if (event.key === 'ArrowLeft' && reader?.number > 1) {
      event.preventDefault();
      showReaderPage(reader.number - 1);
    }
  });
  function cropPoint(event) {
    const r = cropLayer.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)),
    };
  }
  cropLayer.onpointerdown = (event) => {
    if (!event.isPrimary || event.button !== 0 || !reader?.canvas) return;
    event.preventDefault();
    cropLayer.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, start: cropPoint(event), previous: { ...reader.crop } };
  };
  cropLayer.onpointermove = (event) => {
    if (drag?.id !== event.pointerId) return;
    const p = cropPoint(event),
      start = drag.start;
    reader.crop = {
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.max(0.005, Math.abs(start.x - p.x)),
      h: Math.max(0.005, Math.abs(start.y - p.y)),
    };
    reader.crop.w = Math.min(reader.crop.w, 1 - reader.crop.x);
    reader.crop.h = Math.min(reader.crop.h, 1 - reader.crop.y);
    paintCrop();
  };
  cropLayer.onpointerup = (event) => {
    if (drag?.id !== event.pointerId) return;
    if (reader.crop.w < 0.01 || reader.crop.h < 0.01) reader.crop = drag.previous;
    drag = null;
    paintCrop();
  };
  cropLayer.onpointercancel = () => {
    if (drag && reader) reader.crop = drag.previous;
    drag = null;
    paintCrop();
  };
  $pdf('pdf-crop-reset').onclick = () => {
    reader.crop = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    paintCrop();
  };
  for (const key of ['x', 'y', 'w', 'h'])
    $pdf('pdf-crop-' + key).onchange = (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) {
        paintCrop();
        return;
      }
      reader.crop[key] = Math.max(
        key === 'w' || key === 'h' ? 0.01 : 0,
        Math.min(key === 'x' || key === 'y' ? 0.99 : 1, value / 100)
      );
      reader.crop.w = Math.min(reader.crop.w, 1 - reader.crop.x);
      reader.crop.h = Math.min(reader.crop.h, 1 - reader.crop.y);
      paintCrop();
    };
  async function preparedImage(canvas) {
    const src = canvas.toDataURL('image/jpeg', 0.92),
      image = new Image();
    image.src = src;
    await image.decode();
    images.set(src, image);
    return src;
  }
  function fittedSize(canvas) {
    const ratio = Math.min(1, (W * 0.72) / canvas.width, (H * 0.86) / canvas.height);
    return { w: canvas.width * ratio, h: canvas.height * ratio };
  }
  async function insertCrop() {
    const current = reader;
    if (!current?.canvas || dialog.classList.contains('pdf-is-loading')) return;
    if (!current.cropMode) {
      setMode(true);
      return;
    }
    loading(true, 'Preparing your crop…');
    setError();
    try {
      const composed = teaching.composite(current.canvas, current.annotations[current.number]);
      const c = current.crop,
        imageCanvas = document.createElement('canvas');
      imageCanvas.width = Math.max(1, Math.round(composed.width * c.w));
      imageCanvas.height = Math.max(1, Math.round(composed.height * c.h));
      imageCanvas
        .getContext('2d')
        .drawImage(
          composed,
          composed.width * c.x,
          composed.height * c.y,
          composed.width * c.w,
          composed.height * c.h,
          0,
          0,
          imageCanvas.width,
          imageCanvas.height
        );
      const src = await preparedImage(imageCanvas);
      if (
        !dialog.open ||
        reader !== current ||
        page() !== current.targetPage ||
        !pages.includes(current.targetPage)
      )
        throw new Error('The board page changed. Open the PDF again on this page.');
      const size = fittedSize(imageCanvas);
      checkpoint();
      const object = {
        type: 'image',
        src,
        x: Math.max(40, (W - size.w) / 2),
        y: 60,
        ...size,
        color,
        width,
      };
      current.targetPage.objects.push(object);
      selected = object;
      saveLoadedReader(false);
      setTool('move');
      syncSelection();
      render();
      thumbnails();
      await closeReader();
      toast('Cropped area added. Your PDF stays in PDF book.');
    } catch (error) {
      setError(error.message || 'This crop could not be inserted.');
    } finally {
      if (dialog.open && reader === current) loading(false);
    }
  }
  $pdf('pdf-reader-apply').onclick = insertCrop;
  function saveLoadedReader(notify = false) {
    if (!reader?.canvas || reader.total < 1) return;
    loadedBook = {
      data: reader.data,
      name: reader.name.slice(0, 200),
      totalPages: reader.total,
      pageNumber: reader.number,
      annotations: teaching.snapshotAnnotations(),
    };
    reader.dirty = false;
    sync();
    if (notify) document.dispatchEvent(new Event('lessonchange'));
  }
  function snapshot() {
    if (dialog.open && reader?.canvas) saveLoadedReader(false);
    return loadedBook ? { ...loadedBook, annotations: clone(loadedBook.annotations || {}) } : null;
  }
  function sync() {
    importButton.classList.toggle('pdf-book-loaded', !!loadedBook);
    importButton.title = loadedBook
      ? `Open ${loadedBook.name} · ${loadedBook.totalPages} pages`
      : 'Load a PDF textbook to read, annotate or crop';
    const badge = importButton.querySelector('.pdf-loaded-dot');
    if (loadedBook && !badge) {
      const dot = document.createElement('span');
      dot.className = 'pdf-loaded-dot';
      dot.setAttribute('aria-hidden', 'true');
      importButton.append(dot);
    } else if (!loadedBook) badge?.remove();
    if (loadedBook)
      $pdf('pdf-save-status').textContent = `${loadedBook.totalPages} pages · Included in lesson`;
  }
  function openLoaded(fullScreen = false) {
    if (!loadedBook) {
      fileInput.click();
      return;
    }
    openReader(
      {
        data: loadedBook.data,
        name: loadedBook.name,
        total: loadedBook.totalPages,
        number: loadedBook.pageNumber,
        annotations: loadedBook.annotations,
        targetPage: page(),
      },
      fullScreen
    );
  }
  function restore(book, oldPages = []) {
    teaching.cancelText();
    teaching.cancel();
    readerToken++;
    if (document.fullscreenElement === readerShell) document.exitFullscreen().catch(() => {});
    if (dialog.open) dialog.close();
    reader = null;
    // Preserve older lessons without removing their already placed board images.
    if (book === undefined)
      book = oldPages.flatMap((p) => p.objects || []).find((o) => o.pdfBook)?.pdfBook || null;
    loadedBook = book ? { ...book, annotations: clone(book.annotations || {}) } : null;
    sync();
  }
  async function appendToExport(pdf, book, progress = () => {}) {
    if (!book) return 0;
    let original = null;
    try {
      original = await PDFLib.PDFDocument.load(base64Bytes(book.data));
    } catch {}
    const annotated = Object.keys(book.annotations || {}).filter(
      (n) => book.annotations[n]?.length
    );
    const renderer = !original || annotated.length ? await loadDocument(book.data) : null;
    const count = original?.getPageCount() || renderer.numPages;
    for (let i = 0; i < count; i++) {
      progress(i + 1, count);
      const marks = book.annotations?.[i + 1];
      if (!original || marks?.length) {
        const result = await renderPDFPage(book.data, i + 1);
        const painted = teaching.composite(result.canvas, marks);
        const page = await renderer.getPage(i + 1),
          viewport = page.getViewport({ scale: 1 });
        const image = await pdf.embedPng(painted.toDataURL('image/png'));
        const sheet = pdf.addPage([viewport.width, viewport.height]);
        sheet.drawImage(image, { x: 0, y: 0, width: viewport.width, height: viewport.height });
        page.cleanup();
      } else {
        const [sheet] = await pdf.copyPages(original, [i]);
        pdf.addPage(sheet);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return count;
  }
  let exportDialog = null,
    exportURLs = [];
  function offerDownloads(lesson, book) {
    if (!exportDialog) {
      exportDialog = document.createElement('dialog');
      exportDialog.id = 'pdf-export-dialog';
      exportDialog.setAttribute('aria-labelledby', 'pdf-export-heading');
      exportDialog.innerHTML =
        '<span class="pdf-eyebrow">EXPORT READY</span><h2 id="pdf-export-heading">Your PDFs are ready</h2><p class="pdf-export-description">Download the lesson and annotated book as separate files.</p><div id="pdf-export-files"></div><button id="pdf-export-close">Back to board</button>';
      document.body.append(exportDialog);
      exportDialog.querySelector('#pdf-export-close').onclick = () => exportDialog.close();
      exportDialog.addEventListener('close', () => {
        const old = exportURLs;
        exportURLs = [];
        setTimeout(() => old.forEach((url) => URL.revokeObjectURL(url)), 1000);
      });
    }
    exportURLs.forEach((url) => URL.revokeObjectURL(url));
    exportURLs = [];
    const cards = [
      ['lesson', 'Lesson / board pages', lesson],
      ['book', 'PDF book with notes', book],
    ].map(([kind, label, file]) => {
      const card = document.createElement('section');
      card.className = 'pdf-export-file';
      const info = document.createElement('div'),
        title = document.createElement('strong'),
        name = document.createElement('span'),
        meta = document.createElement('small');
      title.textContent = label;
      name.textContent = file.name;
      meta.textContent = file.pages + ' ' + (file.pages === 1 ? 'page' : 'pages') + ' · PDF';
      info.append(title, name, meta);
      const url = URL.createObjectURL(new Blob([file.bytes], { type: 'application/pdf' }));
      exportURLs.push(url);
      const link = document.createElement('a');
      link.id = 'pdf-download-' + kind;
      link.className = 'pdf-export-download';
      link.href = url;
      link.download = file.name;
      link.textContent = kind === 'lesson' ? 'Download lesson' : 'Download book';
      link.onclick = () => {
        meta.textContent = 'Download started';
        card.classList.add('pdf-export-started');
      };
      card.append(info, link);
      return card;
    });
    exportDialog.querySelector('#pdf-export-files').replaceChildren(...cards);
    if (!exportDialog.open) exportDialog.showModal();
  }
  function patchSnapshot(lesson) {
    lesson.loadedPDF = snapshot();
  }
  globalThis.TutorPDF = Object.freeze({
    sync,
    patchSnapshot,
    snapshot,
    restore,
    appendToExport,
    offerDownloads,
    hasBook: () => !!loadedBook,
    isInteracting: teaching.isInteracting,
    cancelDrawing: teaching.cancel,
  });
  sync();
})();
