// PDF editing uses the board's text renderer, rich-text runs and shape transformations.
function createPDFObjectEditing({
  dialog,
  frame,
  canvas,
  getReader,
  getObjects,
  getSelected,
  setSelected,
  saveUndo,
  changed,
  paint,
  isInteracting = () => false,
}) {
  const cloneControls = (source, prefix) => {
    const node = source.cloneNode(true),
      ids = new Map();
    for (const el of [node, ...node.querySelectorAll('[id]')])
      if (el.id) {
        const old = el.id;
        el.id = prefix + old;
        ids.set(old, el.id);
      }
    for (const el of node.querySelectorAll('[for],[aria-controls]'))
      for (const attr of ['for', 'aria-controls'])
        if (ids.has(el.getAttribute(attr))) el.setAttribute(attr, ids.get(el.getAttribute(attr)));
    return node;
  };
  const textControls = cloneControls(document.getElementById('text-options'), 'pdf-');
  textControls.className = 'pdf-text-options';
  textControls.hidden = true;
  dialog.querySelector('#pdf-teaching-toolbar').after(textControls);
  const body = document.createElement('div');
  body.className = 'pdf-reader-body';
  frame.parentElement.before(body);
  body.append(frame.parentElement);
  const panel = document.createElement('aside');
  panel.id = 'pdf-object-panel';
  panel.hidden = true;
  panel.innerHTML = '<div class="section-head">SELECTED SHAPE</div>';
  const shapeControls = cloneControls(document.getElementById('shape-edit'), 'pdf-');
  shapeControls.hidden = false;
  panel.append(shapeControls);
  const remove = document.createElement('button');
  remove.id = 'pdf-delete-object';
  remove.textContent = 'Delete selected';
  panel.append(remove);
  body.append(panel);
  const editor = document.createElement('div');
  editor.id = 'pdf-text-editor';
  editor.className = 'pdf-text-editor';
  editor.contentEditable = 'true';
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-multiline', 'true');
  editor.setAttribute('aria-label', 'Text to place on PDF');
  editor.hidden = true;
  frame.append(editor);
  const status = document.createElement('p');
  status.id = 'pdf-text-status';
  status.setAttribute('role', 'status');
  textControls.append(status);
  const el = (id) => textControls.querySelector('#pdf-' + id),
    shape = (id) => shapeControls.querySelector('#pdf-' + id);
  let editing = null,
    style = {
      fontSize: 28,
      bold: false,
      underline: false,
      list: 'none',
      align: 'left',
      spacing: 1.35,
      border: true,
    },
    beforeText = null,
    lastHTML = '',
    composing = false;
  const scale = () => canvas.getBoundingClientRect().width / Math.max(1, canvas.width);
  function object() {
    return {
      type: 'text',
      box: true,
      text: editorRuns(editor)
        .map((r) => r.text)
        .join(''),
      runs: editorRuns(editor),
      x: +editor.dataset.x,
      y: +editor.dataset.y,
      w: +editor.dataset.w,
      h: +editor.dataset.h,
      color: editor.dataset.color,
      width: 3,
      ...style,
    };
  }
  function position() {
    if (editor.hidden) return;
    const s = scale();
    Object.assign(editor.style, {
      left: +editor.dataset.x * s + 'px',
      top: +editor.dataset.y * s + 'px',
      width: +editor.dataset.w * s + 'px',
      height: +editor.dataset.h * s + 'px',
      fontSize: style.fontSize * s + 'px',
      lineHeight: style.spacing,
      padding: 12 * s + 'px',
      color: editor.dataset.color,
      textAlign: style.align,
      border: style.border ? '2px dashed #16834a' : '1px dashed #9aa6b5',
    });
  }
  new ResizeObserver(position).observe(frame);
  function fit(rejectOverflow = false) {
    const o = object(),
      need = textLayout(o, canvas.getContext('2d')).length * textLineHeight(o) + 24,
      available = canvas.height - o.y;
    if (rejectOverflow && (need > available || o.text.length > 10000)) {
      editor.innerHTML = lastHTML;
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      status.textContent = 'This area is full. Continue in a text box on another PDF page.';
      position();
      return false;
    }
    editor.dataset.h = Math.min(available, Math.max(40, +editor.dataset.h, need));
    lastHTML = editor.innerHTML;
    status.textContent = '';
    position();
    return true;
  }
  function textTarget() {
    return !editor.hidden ? object() : getSelected()?.type === 'text' ? getSelected() : null;
  }
  function syncText() {
    const target = textTarget();
    if (!isInteracting()) textControls.hidden = !target || !!getReader()?.cropMode;
    if (!target) return;
    for (const [id, key] of [
      ['text-size', 'fontSize'],
      ['text-list', 'list'],
      ['text-align', 'align'],
      ['text-spacing', 'spacing'],
    ])
      el(id).value = target[key] ?? style[key];
    el('text-border').checked = target.border !== false;
    el('text-bold').setAttribute('aria-pressed', String(!!target.bold));
    el('text-underline').setAttribute('aria-pressed', String(!!target.underline));
    if (el('text-color')) el('text-color').value = target.color || '#171717';
    el('text-edit-selected').hidden = !editor.hidden;
  }
  function open(p, existing = null) {
    commit();
    const objects = getObjects();
    beforeText = clone(objects);
    editing = existing;
    if (existing)
      style = {
        fontSize: existing.fontSize || 28,
        bold: !!existing.bold,
        underline: !!existing.underline,
        list: existing.list || 'none',
        align: existing.align || 'left',
        spacing: existing.spacing || 1.35,
        border: existing.border !== false,
      };
    editor.dataset.x = Math.max(0, Math.min(p.x, canvas.width - 80));
    editor.dataset.y = Math.max(0, Math.min(p.y, canvas.height - 50));
    editor.dataset.w = Math.max(
      80,
      Math.min(existing?.w || p.w || 520, canvas.width - +editor.dataset.x)
    );
    editor.dataset.h = Math.min(existing?.h || p.h || 180, canvas.height - +editor.dataset.y);
    editor.dataset.color = existing?.color || p.color || color;
    style.color = editor.dataset.color;
    setEditorRuns(existing ? textRuns(existing) : [], editor);
    editor.hidden = false;
    setSelected(existing);
    syncText();
    fit();
    paint();
    editor.focus({ preventScroll: true });
  }
  function commit() {
    if (editor.hidden) return;
    const value = object();
    editor.hidden = true;
    if (value.text) {
      saveUndo(beforeText);
      if (editing) Object.assign(editing, value);
      else getObjects().push(value);
      setSelected(editing || value);
    }
    editing = null;
    beforeText = null;
    status.textContent = '';
    changed();
    syncText();
    paint();
  }
  function cancel() {
    if (editor.hidden) return;
    editor.hidden = true;
    editing = null;
    beforeText = null;
    status.textContent = '';
    changed();
    syncText();
    paint();
  }
  function mutate(fn) {
    const target = getSelected();
    if (!target) return;
    saveUndo(clone(getObjects()));
    fn(target);
    changed();
    sync();
    paint();
  }
  function format(change) {
    const target = textTarget();
    if (!target) return;
    if (!editor.hidden) {
      if ('bold' in change || 'underline' in change) {
        editor.focus({ preventScroll: true });
        document.execCommand('bold' in change ? 'bold' : 'underline', false);
        fit(true);
        changed();
        return;
      }
      Object.assign(style, change);
      if (change.color) editor.dataset.color = change.color;
      fit();
      syncText();
      changed();
      return;
    }
    mutate((o) => {
      Object.assign(o, change);
      if (o.runs && ('bold' in change || 'underline' in change))
        o.runs = o.runs.map((r) => ({ ...r, ...change }));
    });
  }
  for (const id of ['text-bold', 'text-underline'])
    el(id).onclick = () => {
      const key = id === 'text-bold' ? 'bold' : 'underline';
      format({ [key]: el(id).getAttribute('aria-pressed') !== 'true' });
    };
  el('text-size').onchange = (e) =>
    format({ fontSize: Math.max(10, Math.min(120, +e.target.value || 28)) });
  el('text-smaller').onclick = () => format({ fontSize: Math.max(10, +el('text-size').value - 2) });
  el('text-larger').onclick = () => format({ fontSize: Math.min(120, +el('text-size').value + 2) });
  el('text-list').onchange = (e) => format({ list: e.target.value });
  el('text-align').onchange = (e) => format({ align: e.target.value });
  el('text-spacing').onchange = (e) => format({ spacing: +e.target.value });
  el('text-border').onchange = (e) => format({ border: e.target.checked });
  if (el('text-color')) el('text-color').oninput = (e) => format({ color: e.target.value });
  el('text-edit-selected').onclick = () => {
    const o = getSelected();
    if (o?.type === 'text') open(o, o);
  };
  textControls
    .querySelectorAll('button')
    .forEach((b) => (b.onpointerdown = (e) => e.preventDefault()));
  editor.onkeydown = (e) => {
    if (e.isComposing || composing || e.keyCode === 229) return;
    if ((e.ctrlKey || e.metaKey) && ['b', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      format(e.key.toLowerCase() === 'b' ? { bold: true } : { underline: true });
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertText', false, '\n');
    }
  };
  editor.oninput = () => {
    if (!composing) {
      fit(true);
      changed();
    }
  };
  editor.oncompositionstart = () => {
    composing = true;
  };
  editor.oncompositionend = () => {
    composing = false;
    fit(true);
    changed();
  };
  editor.onpaste = (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    fit(true);
  };
  editor.onblur = (e) => {
    if (!e.relatedTarget?.closest('#pdf-text-options,#studio-color-picker')) commit();
  };
  document.addEventListener('selectionchange', () => {
    if (editor.hidden || !getSelection()?.anchorNode || !editor.contains(getSelection().anchorNode))
      return;
    el('text-bold').setAttribute('aria-pressed', String(document.queryCommandState('bold')));
    el('text-underline').setAttribute(
      'aria-pressed',
      String(document.queryCommandState('underline'))
    );
  });
  function rotate(delta, absolute = false) {
    mutate((o) => {
      const next = normalizeRotation(absolute ? delta : (o.rotation || 0) + delta);
      if (o.erasures) {
        const center = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
        for (const mask of o.erasures)
          mask.points = mask.points.map((p) => rotatePoint(p, center, next - (o.rotation || 0)));
      }
      o.rotation = next;
    });
  }
  shape('shape-rotation').onchange = (e) => rotate(+e.target.value || 0, true);
  shape('shape-rotate-left').onclick = () => rotate(-15);
  shape('shape-rotate-right').onclick = () => rotate(15);
  const resize = shapeControls.querySelector('#pdf-apply-shape-size');
  if (resize)
    resize.onclick = () => {
      const w = +shape('shape-width').value,
        h = +shape('shape-height').value,
        o = getSelected();
      if (
        !o ||
        !Number.isFinite(w) ||
        !Number.isFinite(h) ||
        w < 0 ||
        h < 0 ||
        w > canvas.width ||
        h > canvas.height ||
        Math.max(w, h) < 10 ||
        (!['line', 'arrow'].includes(o.type) && Math.min(w, h) < 10)
      )
        return;
      mutate((target) => resizeShape(target, clone(target), w, h));
    };
  shape('shape-fill-enabled').onchange = (e) =>
    mutate((o) => {
      o.fill = e.target.checked ? shape('shape-fill-color').value : null;
    });
  shape('shape-fill-color').oninput = (e) =>
    mutate((o) => {
      o.fill = e.target.value;
    });
  shape('shape-fill-pattern').onchange = (e) =>
    mutate((o) => {
      o.fillPattern = e.target.value;
    });
  remove.onclick = () => {
    const o = getSelected(),
      objects = getObjects(),
      i = objects.indexOf(o);
    if (i < 0) return;
    saveUndo(clone(objects));
    objects.splice(i, 1);
    setSelected(null);
    changed();
    sync();
    paint();
  };
  function sync() {
    syncText();
    const o = getSelected(),
      visible = !!o && isEditableShape(o);
    if (!isInteracting()) panel.hidden = !visible || !!getReader()?.cropMode;
    if (!visible) return;
    shape('shape-width').max = canvas.width;
    shape('shape-height').max = canvas.height;
    shape('shape-width').value = Math.round(Math.abs(o.w));
    shape('shape-height').value = Math.round(Math.abs(o.h));
    shape('shape-rotation').value = Math.round(o.rotation || 0);
    shape('shape-fill-options').hidden = !canFillShape(o);
    shape('shape-fill-enabled').checked = !!o.fill;
    shape('shape-fill-color').value = o.fill || '#facc15';
    shape('shape-fill-color').disabled = !o.fill;
    const hex = shape('shape-fill-hex');
    if (hex) hex.textContent = (o.fill || shape('shape-fill-color').value).toUpperCase();
    shape('shape-fill-pattern').disabled = !o.fill;
    shape('shape-fill-pattern').value = o.fillPattern || 'solid';
  }
  globalThis.TutorColorPicker?.attach(el('text-color'));
  globalThis.TutorColorPicker?.attach(shape('shape-fill-color'));
  return {
    open,
    commit,
    cancel,
    sync,
    position,
    isEditing: () => !editor.hidden,
    editingObject: () => editing,
    snapshot: () => (editor.hidden ? null : object()),
    reset() {
      commit();
      setSelected(null);
      sync();
    },
  };
}
