// PDF annotations use the board's drawing renderer, with a separate history per PDF page.
function createPDFTeaching({ dialog, frame, getReader, changed, crop }) {
  const toolbar = document.createElement('div');
  toolbar.id = 'pdf-teaching-toolbar';
  toolbar.className = 'board-head pdf-teaching-head';
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'PDF teaching tools');
  const boardTools = document.querySelector('#board-controls .board-toolbar').cloneNode(true);
  const ids = new Map();
  for (const node of boardTools.querySelectorAll('[id]')) {
    const old = node.id,
      next = old === 'width' ? 'pdf-pen-width' : 'pdf-board-' + old;
    ids.set(old, next);
    node.id = next;
  }
  for (const node of boardTools.querySelectorAll('[for],[aria-controls]')) {
    for (const attr of ['for', 'aria-controls'])
      if (ids.has(node.getAttribute(attr)))
        node.setAttribute(attr, ids.get(node.getAttribute(attr)));
  }
  boardTools.querySelectorAll('[data-tool]').forEach((node) => {
    node.dataset.pdfTool = node.dataset.tool;
    delete node.dataset.tool;
  });
  boardTools.querySelectorAll('[data-color]').forEach((node) => {
    node.dataset.pdfColor = node.dataset.color;
  });
  boardTools.querySelectorAll('[data-eraser-mode]').forEach((node) => {
    node.dataset.pdfEraserMode = node.dataset.eraserMode;
    delete node.dataset.eraserMode;
  });
  boardTools.querySelector('#pdf-board-colors').classList.add('pdf-board-colors');
  const undoTools = document.createElement('div');
  undoTools.className = 'pdf-history-tools';
  undoTools.innerHTML =
    '<button type="button" id="pdf-ink-undo" title="Undo PDF mark (Ctrl/Cmd+Z)" aria-label="Undo PDF mark">↶</button><button type="button" id="pdf-ink-redo" title="Redo PDF mark (Ctrl/Cmd+Shift+Z)" aria-label="Redo PDF mark">↷</button>';
  boardTools.append(undoTools);
  const cropButton = document.createElement('button');
  cropButton.id = 'pdf-crop-tool';
  cropButton.type = 'button';
  cropButton.title = 'Crop PDF area to the board';
  cropButton.setAttribute('aria-label', 'Crop PDF area');
  cropButton.setAttribute('aria-pressed', 'false');
  cropButton.innerHTML =
    '<svg class="studio-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 2v15h15M2 7h15v15M10 7h7v7"/></svg>';
  boardTools.querySelector('.quick-tools').append(cropButton);
  cropButton.onclick = () => {
    editing.commit();
    crop();
  };
  toolbar.append(boardTools);
  dialog.querySelector('.pdf-reader-tools').after(toolbar);
  const eraserMenu = toolbar.querySelector('#pdf-board-eraser-menu'),
    connectorMenu = toolbar.querySelector('#pdf-board-connector-menu');
  eraserMenu.classList.add('pdf-board-menu');
  connectorMenu.classList.add('pdf-board-menu');
  eraserMenu.hidden = true;
  connectorMenu.hidden = true;
  let pdfEraserMode = 'point';
  function closeMenus() {
    eraserMenu.hidden = true;
    connectorMenu.hidden = true;
    toolbar.querySelector('#pdf-board-eraser-toggle').setAttribute('aria-expanded', 'false');
    toolbar.querySelector('#pdf-board-connector-toggle').setAttribute('aria-expanded', 'false');
  }
  const overlay = document.createElement('canvas');
  overlay.id = 'pdf-ink-canvas';
  overlay.setAttribute('aria-label', 'Draw on this PDF page');
  frame.append(overlay);
  let currentTool = 'laser',
    ink = color,
    active = null,
    selectedMark = null;
  const laserCanvas = document.createElement('canvas');
  laserCanvas.id = 'pdf-laser-canvas';
  frame.append(laserCanvas);
  let laserTrailsLocal = [],
    laserAnimation = null;
  const handleUnit = () => (4 * overlay.width) / Math.max(1, overlay.getBoundingClientRect().width);
  const editing = createPDFObjectEditing({
    dialog,
    frame,
    canvas: overlay,
    getReader,
    getObjects: currentObjects,
    getSelected: () => selectedMark,
    setSelected: (o) => {
      selectedMark = o;
    },
    saveUndo: pushUndo,
    changed: announceChange,
    paint,
    isInteracting: () => !!active,
  });
  function clearPDFLaser() {
    if (laserAnimation !== null) cancelAnimationFrame(laserAnimation);
    laserAnimation = null;
    laserTrailsLocal = [];
    laserCanvas.getContext('2d').clearRect(0, 0, laserCanvas.width, laserCanvas.height);
  }
  function paintPDFLaser(now) {
    laserAnimation = null;
    laserTrailsLocal = renderLaserTrails(
      laserCanvas.getContext('2d'),
      laserTrailsLocal,
      now,
      overlay.width / Math.max(1, overlay.clientWidth),
      active?.trail
    );
    if (laserTrailsLocal.some((t) => t.length))
      laserAnimation = requestAnimationFrame(paintPDFLaser);
  }
  function addPDFLaser(p) {
    const trail = active.trail,
      last = trail.at(-1),
      now = performance.now();
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.5) last.time = now;
    else trail.push({ ...p, time: now });
    if (laserAnimation === null) laserAnimation = requestAnimationFrame(paintPDFLaser);
  }
  function currentObjects() {
    const r = getReader();
    if (!r) return [];
    return (r.annotations[r.number] ||= []);
  }
  function history() {
    const r = getReader();
    return (r.histories[r.number] ||= { undo: [], redo: [] });
  }
  function historyButtons() {
    const r = getReader();
    toolbar.querySelector('#pdf-ink-undo').disabled = !r || !history().undo.length;
    toolbar.querySelector('#pdf-ink-redo').disabled = !r || !history().redo.length;
  }
  function announceChange() {
    const r = getReader();
    if (r) {
      r.dirty = true;
      changed();
    }
    historyButtons();
  }
  function pushUndo(before) {
    const h = history();
    h.undo.push(before);
    if (h.undo.length > 40) h.undo.shift();
    h.redo = [];
  }
  function paint() {
    const r = getReader();
    if (!r?.canvas) return;
    if (overlay.width !== r.canvas.width || overlay.height !== r.canvas.height) {
      overlay.width = r.canvas.width;
      overlay.height = r.canvas.height;
    }
    const c = overlay.getContext('2d');
    c.clearRect(0, 0, overlay.width, overlay.height);
    for (const o of currentObjects()) if (o !== editing.editingObject()) drawObject(c, o);
    if (active?.preview) drawObject(c, active.preview);
    if (
      selectedMark &&
      currentObjects().includes(selectedMark) &&
      !editing.isEditing() &&
      !r.cropMode &&
      currentTool !== 'eraser'
    )
      drawSelection(c, selectedMark, handleUnit(), overlay.height);
    if (laserCanvas.width !== overlay.width || laserCanvas.height !== overlay.height) {
      laserCanvas.width = overlay.width;
      laserCanvas.height = overlay.height;
    }
    overlay.style.pointerEvents = r.cropMode ? 'none' : 'auto';
    if (!active) overlay.style.cursor = toolCursor(currentTool, ink);
    cropButton.setAttribute('aria-pressed', String(r.cropMode));
    cropButton.classList.toggle('active', r.cropMode);
    editing.sync();
    editing.position();
    toolbar.classList.toggle('pdf-teaching-crop', r.cropMode);
    historyButtons();
  }
  function setTool(name) {
    editing.commit();
    cancel();
    clearPDFLaser();
    currentTool = name;
    selectedMark = null;
    toolbar.querySelectorAll('[data-pdf-tool]').forEach((b) => {
      b.classList.toggle('active', b.dataset.pdfTool === name);
      b.setAttribute('aria-pressed', String(b.dataset.pdfTool === name));
    });
    const connector = toolbar.querySelector('#pdf-board-connector-toggle');
    connector.classList.toggle('active', ['line', 'arrow'].includes(name));
    if (['line', 'arrow'].includes(name))
      connector.innerHTML = globalThis.TutorStudio.connectorMarkup(name);
    closeMenus();
    editing.sync();
    paint();
  }
  toolbar
    .querySelectorAll('[data-pdf-tool]')
    .forEach((b) => (b.onclick = () => setTool(b.dataset.pdfTool)));
  toolbar.querySelectorAll('[data-pdf-color]').forEach(
    (b) =>
      (b.onclick = () => {
        ink = b.dataset.pdfColor;
        toolbar.querySelectorAll('[data-pdf-color]').forEach((o) => {
          o.setAttribute('aria-pressed', String(o === b));
          o.classList.toggle('active', o === b);
        });
        toolbar.querySelector('#pdf-board-custom').value = ink;
        paint();
      })
  );
  toolbar.querySelector('#pdf-board-custom').oninput = (event) => {
    ink = event.target.value;
    toolbar.querySelectorAll('[data-pdf-color]').forEach((b) => {
      b.classList.toggle('active', b.dataset.pdfColor === ink);
      b.setAttribute('aria-pressed', String(b.dataset.pdfColor === ink));
    });
  };
  toolbar.querySelector('[data-pdf-tool="text"]').title =
    'Text box (T): drag to size, then type; Ctrl/Cmd+Enter to place';
  toolbar.querySelector('[data-pdf-tool="move"]').title =
    'Move (V): move a mark or pan a zoomed page';
  toolbar.querySelector('#pdf-pen-width').oninput = (event) => {
    toolbar.querySelector('#pdf-board-width-value').textContent = event.target.value + ' px';
  };
  toolbar.querySelector('#pdf-board-eraser-toggle').onclick = () => {
    const wasOpen = !eraserMenu.hidden;
    setTool('eraser');
    eraserMenu.hidden = wasOpen;
    toolbar
      .querySelector('#pdf-board-eraser-toggle')
      .setAttribute('aria-expanded', String(!wasOpen));
  };
  toolbar.querySelector('#pdf-board-connector-toggle').onclick = () => {
    const wasOpen = !connectorMenu.hidden;
    closeMenus();
    connectorMenu.hidden = wasOpen;
    toolbar
      .querySelector('#pdf-board-connector-toggle')
      .setAttribute('aria-expanded', String(!wasOpen));
  };
  toolbar.querySelectorAll('[data-pdf-eraser-mode]').forEach(
    (b) =>
      (b.onclick = () => {
        pdfEraserMode = b.dataset.pdfEraserMode;
        toolbar
          .querySelectorAll('[data-pdf-eraser-mode]')
          .forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
        toolbar.querySelector('#pdf-board-eraser-size').disabled = pdfEraserMode === 'object';
        closeMenus();
      })
  );
  toolbar.querySelector('#pdf-board-eraser-size').oninput = (e) => {
    toolbar.querySelector('#pdf-board-eraser-size-value').textContent = e.target.value + ' px';
  };
  dialog.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#pdf-board-eraser-picker,#pdf-board-connector-picker')) closeMenus();
  });
  function point(event) {
    const rect = overlay.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(overlay.width, ((event.clientX - rect.left) * overlay.width) / rect.width)
      ),
      y: Math.max(
        0,
        Math.min(overlay.height, ((event.clientY - rect.top) * overlay.height) / rect.height)
      ),
    };
  }
  function eraseAt(p) {
    const objects = currentObjects(),
      from = active.lastErase || p;
    active.lastErase = p;
    if (pdfEraserMode === 'object') {
      const steps = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / 6));
      for (let i = objects.length - 1; i >= 0; i--)
        for (let step = 0; step <= steps; step++) {
          const q = {
            x: from.x + ((p.x - from.x) * step) / steps,
            y: from.y + ((p.y - from.y) * step) / steps,
          };
          if (hit(objects[i], q, overlay.height)) {
            objects.splice(i, 1);
            break;
          }
        }
      return;
    }
    const radius = +toolbar.querySelector('#pdf-board-eraser-size').value / 2;
    active.eraseMasks ||= new Map();
    for (const o of objects) {
      const b = objectBounds(o, overlay.height);
      if (
        Math.max(from.x, p.x) + radius < b.x ||
        Math.min(from.x, p.x) - radius > b.right ||
        Math.max(from.y, p.y) + radius < b.y ||
        Math.min(from.y, p.y) - radius > b.bottom
      )
        continue;
      let mask = active.eraseMasks.get(o);
      if (!mask) {
        mask = { radius, points: [{ ...from }] };
        (o.erasures ||= []).push(mask);
        active.eraseMasks.set(o, mask);
      }
      if (p.x !== mask.points.at(-1).x || p.y !== mask.points.at(-1).y) mask.points.push({ ...p });
    }
  }
  function cancel() {
    if (active && getReader()) getReader().annotations[getReader().number] = active.before;
    active = null;
    clearPDFLaser();
    paint();
  }
  overlay.addEventListener('contextmenu', (event) => event.preventDefault());
  overlay.onpointerdown = (event) => {
    if (event.button === 2 && getReader()?.canvas && !active) {
      event.preventDefault();
      editing.commit();
      overlay.setPointerCapture(event.pointerId);
      active = {
        id: event.pointerId,
        pointerType: event.pointerType,
        before: clone(currentObjects()),
        kind: 'pan',
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: frame.parentElement.scrollLeft,
        scrollTop: frame.parentElement.scrollTop,
      };
      overlay.style.cursor = 'grabbing';
      return;
    }
    observePen(event);
    if (event.pointerType === 'pen' && active?.pointerType === 'touch' && inputMode !== 'touch')
      cancel();
    const r = getReader();
    if (
      !r?.canvas ||
      r.cropMode ||
      dialog.classList.contains('pdf-is-loading') ||
      active ||
      !event.isPrimary ||
      event.button !== 0 ||
      !acceptsPointer(event)
    )
      return;
    event.preventDefault();
    overlay.setPointerCapture(event.pointerId);
    editing.commit();
    const p = point(event),
      objects = currentObjects();
    if (objects.length >= 1000 && !['eraser', 'move', 'laser'].includes(currentTool)) {
      toast('This PDF page has 1,000 marks. Erase a mark or use another page.');
      return;
    }
    const before = clone(objects),
      scale = overlay.width / Math.max(1, overlay.clientWidth),
      stroke = Math.max(1, Math.min(24, +toolbar.querySelector('#pdf-pen-width').value));
    if (!['pen', 'eraser', 'laser'].includes(currentTool) && !event.altKey) {
      const handle = selectedMark && controlAt(selectedMark, p, handleUnit(), overlay.height);
      const target = handle
        ? selectedMark
        : [...objects].reverse().find((o) => hit(o, p, overlay.height));
      if (target) {
        selectedMark = target;
        active = {
          id: event.pointerId,
          pointerType: event.pointerType,
          before,
          kind: handle ? 'control' : 'move',
          handle,
          start: p,
          target,
          original: clone(target),
        };
        paint();
        return;
      }
    }
    if (currentTool === 'text') {
      selectedMark = null;
      active = {
        id: event.pointerId,
        pointerType: event.pointerType,
        before,
        kind: 'text-box',
        start: p,
        preview: {
          type: 'text',
          text: '',
          box: true,
          border: true,
          x: p.x,
          y: p.y,
          w: 80,
          h: 40,
          color: ink,
          width: stroke,
          fontSize: 28,
        },
      };
      paint();
      return;
    }
    if (currentTool === 'laser') {
      active = {
        id: event.pointerId,
        pointerType: event.pointerType,
        before,
        kind: 'laser',
        trail: [],
        start: p,
      };
      laserTrailsLocal.push(active.trail);
      addPDFLaser(p);
      paint();
      return;
    }
    if (currentTool === 'move') {
      selectedMark = [...objects].reverse().find((o) => hit(o, p, overlay.height)) || null;
      if (!selectedMark) {
        active = {
          id: event.pointerId,
          pointerType: event.pointerType,
          before,
          kind: 'pan',
          clientX: event.clientX,
          clientY: event.clientY,
          scrollLeft: frame.parentElement.scrollLeft,
          scrollTop: frame.parentElement.scrollTop,
        };
        paint();
        return;
      }
      if (selectedMark)
        active = {
          id: event.pointerId,
          pointerType: event.pointerType,
          before,
          kind: 'move',
          start: p,
          target: selectedMark,
          original: clone(selectedMark),
        };
      paint();
      return;
    }
    selectedMark = null;
    if (currentTool === 'eraser') {
      active = {
        id: event.pointerId,
        pointerType: event.pointerType,
        before,
        kind: 'eraser',
        start: p,
      };
      eraseAt(p);
      paint();
      return;
    }
    const drawTool = currentTool === 'pen' && event.shiftKey ? 'line' : currentTool;
    const object = ['pen', 'highlighter'].includes(drawTool)
      ? { type: drawTool, points: [p], color: ink, width: stroke }
      : { type: drawTool, x: p.x, y: p.y, w: 0, h: 0, color: ink, width: stroke };
    active = {
      id: event.pointerId,
      pointerType: event.pointerType,
      before,
      kind: 'draw',
      start: p,
      preview: object,
    };
    paint();
  };
  function move(event) {
    if (!active) {
      const p = point(event),
        handle = selectedMark && controlAt(selectedMark, p, handleUnit(), overlay.height);
      if (!['pen', 'eraser', 'laser'].includes(currentTool) && !event.altKey)
        overlay.style.cursor = handle
          ? controlCursor(handle, selectedMark)
          : [...currentObjects()].reverse().some((o) => hit(o, p, overlay.height))
            ? 'grab'
            : toolCursor(currentTool, ink);
      else overlay.style.cursor = toolCursor(currentTool, ink);
      return;
    }
    if (active.id !== event.pointerId) return;
    const p = point(event);
    if (active.kind === 'control') {
      dragControl(active, p, event.shiftKey, { width: overlay.width, height: overlay.height });
      paint();
      return;
    }
    if (active.kind === 'text-box') {
      const o = active.preview;
      o.x = Math.min(active.start.x, p.x);
      o.y = Math.min(active.start.y, p.y);
      o.w = Math.max(80, Math.min(overlay.width - o.x, Math.abs(p.x - active.start.x)));
      o.h = Math.max(40, Math.min(overlay.height - o.y, Math.abs(p.y - active.start.y)));
      paint();
      return;
    }
    if (active.kind === 'pan') {
      frame.parentElement.scrollLeft = active.scrollLeft - (event.clientX - active.clientX);
      frame.parentElement.scrollTop = active.scrollTop - (event.clientY - active.clientY);
      return;
    }
    if (active.kind === 'laser') {
      for (const sample of event.getCoalescedEvents?.().length
        ? event.getCoalescedEvents()
        : [event])
        addPDFLaser(point(sample));
      return;
    }
    if (active.kind === 'eraser') {
      eraseAt(p);
      paint();
      return;
    }
    if (active.kind === 'move') {
      const dx = p.x - active.start.x,
        dy = p.y - active.start.y,
        o = active.target,
        original = active.original;
      if (original.erasures)
        o.erasures = original.erasures.map((m) => ({
          ...m,
          points: m.points.map((q) => ({ x: q.x + dx, y: q.y + dy })),
        }));
      if (original.points)
        o.points = original.points.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy }));
      else {
        o.x = original.x + dx;
        o.y = original.y + dy;
      }
      paint();
      return;
    }
    const o = active.preview;
    if (o.points) {
      for (const sample of event.getCoalescedEvents?.().length
        ? event.getCoalescedEvents()
        : [event])
        if (o.points.length < 50000) o.points.push(point(sample));
    } else if (['rect', 'circle', 'triangle'].includes(o.type)) {
      o.x = Math.min(active.start.x, p.x);
      o.y = Math.min(active.start.y, p.y);
      o.w = Math.abs(p.x - active.start.x);
      o.h = Math.abs(p.y - active.start.y);
    } else {
      o.w = p.x - active.start.x;
      o.h = p.y - active.start.y;
    }
    paint();
  }
  overlay.onpointermove = move;
  overlay.onpointerup = (event) => {
    if (active?.id !== event.pointerId) return;
    move(event);
    const gesture = active;
    active = null;
    if (gesture.kind === 'pan') {
      paint();
      return;
    }
    if (gesture.kind === 'laser') {
      paint();
      return;
    }
    if (gesture.kind === 'text-box') {
      const o = gesture.preview;
      if (Math.hypot(o.w, o.h) < 100) {
        o.w = 520;
        o.h = 180;
      }
      editing.open(o);
      return;
    }
    if (gesture.preview) {
      currentObjects().push(gesture.preview);
      selectedMark = gesture.preview;
    }
    if (JSON.stringify(currentObjects()) !== JSON.stringify(gesture.before)) {
      pushUndo(gesture.before);
      announceChange();
    }
    paint();
  };
  overlay.onpointercancel = (event) => {
    if (active?.id === event.pointerId) cancel();
  };
  overlay.onlostpointercapture = (event) => {
    if (active?.id === event.pointerId) cancel();
  };
  overlay.addEventListener('pointerover', (event) => {
    observePen(event);
    if (event.pointerType === 'pen' && active?.pointerType === 'touch' && inputMode !== 'touch')
      cancel();
  });
  function undo(redo = false) {
    editing.commit();
    cancel();
    const r = getReader();
    if (!r) return;
    const h = history(),
      from = redo ? h.redo : h.undo,
      to = redo ? h.undo : h.redo;
    if (!from.length) return;
    to.push(clone(currentObjects()));
    r.annotations[r.number] = from.pop();
    selectedMark = null;
    announceChange();
    paint();
  }
  toolbar.querySelector('#pdf-ink-undo').onclick = () => undo();
  toolbar.querySelector('#pdf-ink-redo').onclick = () => undo(true);
  dialog.addEventListener('keydown', (event) => {
    if (event.isComposing || event.target.closest('input,textarea,[contenteditable]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.stopPropagation();
      undo(event.shiftKey);
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const shortcut = {
        p: 'pen',
        h: 'highlighter',
        e: 'eraser',
        t: 'text',
        v: 'move',
        l: 'laser',
      }[event.key.toLowerCase()];
      if (shortcut) {
        event.preventDefault();
        setTool(shortcut);
      }
    }
    if (event.key === 'Delete' && selectedMark) {
      const objects = currentObjects(),
        i = objects.indexOf(selectedMark);
      if (i >= 0) {
        pushUndo(clone(objects));
        objects.splice(i, 1);
        selectedMark = null;
        announceChange();
        paint();
      }
    }
  });
  overlay.ondblclick = (event) => {
    if (['pen', 'eraser', 'laser'].includes(currentTool) || event.altKey) return;
    const p = point(event),
      target = [...currentObjects()]
        .reverse()
        .find((o) => o.type === 'text' && hit(o, p, overlay.height));
    if (target) editing.open(target, target);
  };
  function snapshotAnnotations() {
    const r = getReader();
    if (!r) return {};
    const result = clone(r.annotations),
      pending = editing.snapshot();
    if (pending) {
      const i = currentObjects().indexOf(editing.editingObject());
      if (i >= 0) result[r.number][i] = pending;
      else (result[r.number] ||= []).push(pending);
    }
    return result;
  }
  function composite(base, objects) {
    const c = document.createElement('canvas');
    c.width = base.width;
    c.height = base.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(base, 0, 0);
    for (const o of objects || []) drawObject(ctx, o);
    return c;
  }
  globalThis.TutorColorPicker?.attach(toolbar.querySelector('#pdf-board-custom'));
  setTool('laser');
  return {
    paint,
    cancel,
    composite,
    reset() {
      active = null;
      selectedMark = null;
      clearPDFLaser();
      editing.reset();
      paint();
    },
    getObjects: currentObjects,
    snapshotAnnotations,
    commitText: editing.commit,
    cancelText: editing.cancel,
    isInteracting: () => !!active,
    selectTool: setTool,
  };
}
