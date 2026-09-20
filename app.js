'use strict';
const $ = (id) => document.getElementById(id),
  canvas = $('board'),
  ctx = canvas.getContext('2d');
const W = 2880,
  H = 1080,
  colors = ['#ef4444', '#facc15', '#3b82f6', '#171717', '#ffffff', '#22c55e'];
let pages = [newPage()],
  index = 0,
  tool = 'pen',
  color = colors[3],
  width = 3,
  gesture = null,
  preview = null,
  images = new Map(),
  toastTimer,
  eraserMode = 'point',
  eraserSize = 24;
let eraseLayer = null,
  selected = null,
  pendingPageDelete = null;
let textStyle = { fontSize: 28, bold: false, underline: false };
function newPage(settings = {}) {
  return {
    background: settings.background || 'blank',
    boardColor: settings.boardColor || 'white',
    objects: [],
    undo: [],
    redo: [],
  };
}
function page() {
  return pages[index];
}
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}
function checkpoint() {
  page().undo.push(clone(page().objects));
  if (page().undo.length > 60) page().undo.shift();
  page().redo = [];
}
function toast(s) {
  $('toast').textContent = s;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2500);
}
function drawObject(c, o, boardColor = page().boardColor, skipErasures = false) {
  if (o.erasures?.length && !skipErasures) {
    if (!eraseLayer) {
      eraseLayer = document.createElement('canvas');
      eraseLayer.width = W;
      eraseLayer.height = H;
    }
    const layer = eraseLayer.getContext('2d');
    layer.clearRect(0, 0, W, H);
    drawObject(layer, o, boardColor, true);
    layer.save();
    layer.globalCompositeOperation = 'destination-out';
    layer.strokeStyle = '#000';
    layer.fillStyle = '#000';
    layer.lineCap = 'round';
    layer.lineJoin = 'round';
    for (const mask of o.erasures) {
      layer.lineWidth = mask.radius * 2;
      layer.beginPath();
      mask.points.forEach((p, i) => (i ? layer.lineTo(p.x, p.y) : layer.moveTo(p.x, p.y)));
      if (mask.points.length === 1) {
        layer.arc(mask.points[0].x, mask.points[0].y, mask.radius, 0, Math.PI * 2);
        layer.fill();
      } else layer.stroke();
    }
    layer.restore();
    c.drawImage(eraseLayer, 0, 0);
    return;
  }
  c.save();
  c.strokeStyle = o.color;
  c.fillStyle = o.color;
  c.lineWidth = o.width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (o.type === 'highlighter') {
    c.globalAlpha = 0.28;
    c.lineWidth = o.width * 5;
  }
  if (o.type === 'pen' || o.type === 'highlighter') {
    c.beginPath();
    o.points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    if (o.points.length === 1) {
      c.arc(o.points[0].x, o.points[0].y, c.lineWidth / 2, 0, Math.PI * 2);
      c.fill();
    } else c.stroke();
    if (o.type === 'pen') {
      c.globalAlpha = 0.45;
      c.strokeStyle = boardColors[boardColor || 'white'];
      c.lineWidth = Math.max(0.4, o.width * 0.13);
      for (let i = 1; i < o.points.length; i += 2) {
        const p = o.points[i];
        c.beginPath();
        c.moveTo(p.x - 0.6, p.y - 0.7);
        c.lineTo(p.x + 0.8, p.y + 0.5);
        c.stroke();
      }
    }
  }
  if (o.type === 'line') {
    c.beginPath();
    c.moveTo(o.x, o.y);
    c.lineTo(o.x + o.w, o.y + o.h);
    c.stroke();
  }
  if (o.type === 'graph') TutorMath.graph(c, o, boardColor || 'white');
  if (o.type === 'geometry') TutorMath.geometry(c, o);
  if (o.type === 'triangle') {
    c.beginPath();
    c.moveTo(o.x + o.w / 2, o.y);
    c.lineTo(o.x + o.w, o.y + o.h);
    c.lineTo(o.x, o.y + o.h);
    c.closePath();
    c.stroke();
  }
  if (o.type === 'rect') c.strokeRect(o.x, o.y, o.w, o.h);
  if (o.type === 'circle') {
    c.beginPath();
    c.ellipse(
      o.x + o.w / 2,
      o.y + o.h / 2,
      Math.abs(o.w / 2),
      Math.abs(o.h / 2),
      0,
      0,
      Math.PI * 2
    );
    c.stroke();
  }
  if (o.type === 'text') {
    const size = o.fontSize || 28;
    c.font = textFont(o);
    c.textBaseline = 'top';
    o.text.split('\n').forEach((line, i) => {
      const y = o.y + i * textLineHeight(o);
      c.fillText(line, o.x, y);
      if (o.underline && line) {
        c.lineWidth = Math.max(1, size / 18);
        c.beginPath();
        c.moveTo(o.x, y + size * 1.08);
        c.lineTo(o.x + c.measureText(line).width, y + size * 1.08);
        c.stroke();
      }
    });
  }
  if (o.type === 'image') {
    let im = images.get(o.src);
    if (!im) {
      im = new Image();
      images.set(o.src, im);
      im.onload = () => {
        render();
        thumbnails();
      };
      im.src = o.src;
    }
    if (im.complete && im.naturalWidth) {
      if (o.rotation) {
        c.translate(o.x + o.w / 2, o.y + o.h / 2);
        c.rotate((o.rotation * Math.PI) / 180);
        c.translate(-o.x - o.w / 2, -o.y - o.h / 2);
      }
      c.drawImage(im, o.x, o.y, o.w, o.h);
    }
  }
  c.restore();
}
const boardColors = { white: '#ffffff', black: '#1d2229', green: '#164f3f', blue: '#183f72' };
function drawPaper(c, bg, boardColor = 'white') {
  c.fillStyle = boardColors[boardColor] || boardColors.white;
  c.fillRect(0, 0, W, H);
  c.lineWidth = 1;
  c.strokeStyle = boardColor === 'white' ? '#e4eaf4' : '#ffffff20';
  if (bg === 'grid') {
    for (let x = 0; x < W; x += 36) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, H);
      c.stroke();
    }
  }
  if (bg !== 'blank') {
    for (let y = 0; y < H; y += 36) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
  }
}

function render(showSelection = true) {
  drawPaper(ctx, page().background, page().boardColor);
  for (const o of page().objects) drawObject(ctx, o);
  if (preview) drawObject(ctx, preview);
  if (showSelection && selected && tool === 'move') drawSelection();
  $('empty-hint').style.display = page().objects.length || preview ? 'none' : 'flex';
  $('undo').disabled = !page().undo.length;
  $('redo').disabled = !page().redo.length;
}
function thumbnails() {
  document.dispatchEvent(new Event('lessonchange'));
  const list = $('page-list');
  list.innerHTML = '';
  pages.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'page-card' + (i === index ? ' active' : '');
    const b = document.createElement('button');
    b.className = 'page-open';
    b.setAttribute('aria-label', 'Go to page ' + (i + 1));
    b.setAttribute('aria-current', String(i === index));
    const c = document.createElement('canvas');
    c.width = 288;
    c.height = Math.round((H * 288) / W);
    const cc = c.getContext('2d');
    cc.scale(288 / W, 288 / W);
    drawPaper(cc, p.background, p.boardColor);
    p.objects.forEach((o) => drawObject(cc, o, p.boardColor));
    b.append(c);
    const label = document.createElement('div');
    label.className = 'page-label';
    label.textContent = 'Page ' + (i + 1);
    b.append(label);
    b.onclick = () => {
      commitText();
      index = pages.indexOf(p);
      update();
    };
    card.append(b);
    if (pages.length > 1) {
      const del = document.createElement('button');
      del.className = 'page-delete';
      del.textContent = '×';
      del.title = 'Delete page';
      del.setAttribute('aria-label', 'Delete page ' + (i + 1));
      del.onclick = (e) => {
        e.stopPropagation();
        commitText();
        pendingPageDelete = p;
        $('delete-page-heading').textContent = 'Delete page ' + (pages.indexOf(p) + 1) + '?';
        $('delete-page-dialog').showModal();
      };
      card.append(del);
    }
    list.append(card);
  });
}
$('delete-page-cancel').onclick = () => {
  pendingPageDelete = null;
  $('delete-page-dialog').close();
};
$('delete-page-confirm').onclick = () => {
  const at = pages.indexOf(pendingPageDelete);
  $('delete-page-dialog').close();
  pendingPageDelete = null;
  if (at < 0 || pages.length <= 1) return;
  const active = page();
  pages.splice(at, 1);
  index = pages.indexOf(active);
  if (index < 0) index = Math.min(at, pages.length - 1);
  update();
  toast('Page deleted.');
};
$('delete-page-dialog').addEventListener('cancel', () => {
  pendingPageDelete = null;
});

function update() {
  syncPageNavigation();
  selected = null;
  syncSelection();
  gesture = null;
  preview = null;
  $('page-title').textContent = 'Page ' + (index + 1);
  $('count').textContent = 'Page ' + (index + 1) + ' of ' + pages.length;
  $('background').value = page().background;
  $('board-color').value = page().boardColor || 'white';
  $('empty-hint').style.color =
    (page().boardColor || 'white') === 'white' ? '#98a3b5' : '#ffffff80';
  render();
  thumbnails();
}
// Functional cursor icons use a small SVG with a precise drawing hotspot.
function toolCursor(t) {
  if (t === 'move') return 'grab';
  if (t === 'text') return 'text';
  if (t !== 'pen' && t !== 'eraser') return 'crosshair';
  const ink = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
  const chalk =
    '<path d="M5 27L8 19L22 4Q24 2 26 4L29 7Q31 9 29 11L14 26Z" fill="' +
    ink +
    '" stroke="#ffffff" stroke-width="3"/><path d="M5 27L8 19L22 4Q24 2 26 4L29 7Q31 9 29 11L14 26Z" fill="' +
    ink +
    '" stroke="#536174" stroke-width="1.2"/><path d="M8 19L14 26M23 5L28 10" fill="none" stroke="#9aa6b7" stroke-width="1"/><circle cx="5" cy="27" r="1.2" fill="#536174"/>';
  const eraser =
    '<path d="M4 20L17 5Q19 3 21 5L29 12Q31 14 29 16L18 28H12Z" fill="#ffffff" stroke="#ffffff" stroke-width="3"/><path d="M4 20L17 5Q19 3 21 5L29 12Q31 14 29 16L18 28H12Z" fill="#eff3f9" stroke="#536174" stroke-width="1.3"/><path d="M10 13L17 5Q19 3 21 5L29 12Q31 14 29 16L23 22Z" fill="#16834a" stroke="#536174" stroke-width="1.2"/><path d="M12 28H22" stroke="#536174" stroke-width="1.5"/>';
  const cursorSize = t === 'pen' ? 24 : 32;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    cursorSize +
    '" height="' +
    cursorSize +
    '" viewBox="0 0 32 32">' +
    (t === 'pen' ? chalk : eraser) +
    '</svg>';
  return (
    'url("data:image/svg+xml,' +
    encodeURIComponent(svg) +
    '") ' +
    (t === 'pen' ? '4 20' : '12 28') +
    ', crosshair'
  );
}
function refreshCursor() {
  canvas.style.cursor = toolCursor(tool);
}
function setTool(t) {
  commitText();
  tool = t;
  if (t !== 'move') selected = null;
  syncSelection();
  render();
  document.querySelectorAll('[data-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === t);
    b.setAttribute('aria-pressed', b.dataset.tool === t);
  });
  refreshCursor();
  $('eraser-options').hidden = t !== 'eraser';
  $('eraser-size').disabled = eraserMode === 'object';
  $('status').textContent =
    t === 'eraser'
      ? eraserMode === 'point'
        ? 'Point eraser · Erase only the area you touch'
        : 'Whole-object eraser · Touch a mark to remove it'
      : t === 'move'
        ? 'Move · Drag a mark, text, or image'
        : t === 'text'
          ? 'Text · Click to type; Ctrl + Enter to place'
          : t === 'pen'
            ? 'Chalk ready · Hold Shift for a straight line'
            : t.charAt(0).toUpperCase() + t.slice(1) + ' ready · Draw anywhere on the page';
}
function setColor(v) {
  color = v;
  $('custom').value = v;
  $('stroke-dot').style.background = v;
  document
    .querySelectorAll('#colors button')
    .forEach((b) => b.classList.toggle('active', b.dataset.color === v));
  refreshCursor();
}
colors.forEach((v) => {
  const b = document.createElement('button');
  b.style.background = v;
  b.dataset.color = v;
  const names = ['Red', 'Yellow', 'Blue', 'Black', 'White', 'Green', 'Purple', 'Orange'];
  b.title = names[colors.indexOf(v)];
  b.setAttribute('aria-label', b.title + ' chalk');
  b.onclick = () => setColor(v);
  $('colors').append(b);
});
setColor(color);
document
  .querySelectorAll('[data-tool]')
  .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
$('custom').oninput = (e) => setColor(e.target.value);
$('width').oninput = (e) => {
  width = +e.target.value;
  $('width-value').textContent = width + ' px';
  $('stroke-dot').style.width = width + 'px';
  $('stroke-dot').style.height = width + 'px';
};
function point(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
function segmentDist(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function hit(o, p) {
  if (
    o.erasures?.some((m) =>
      m.points.length === 1
        ? Math.hypot(p.x - m.points[0].x, p.y - m.points[0].y) < m.radius
        : m.points.some((a, i) => i && segmentDist(p, m.points[i - 1], a) < m.radius)
    )
  )
    return false;
  if (['geometry', 'image'].includes(o.type) && o.rotation)
    p = rotatePoint(p, { x: o.x + o.w / 2, y: o.y + o.h / 2 }, -o.rotation);
  const pad = 12 + o.width;
  if (o.points) {
    if (o.points.length === 1) return Math.hypot(p.x - o.points[0].x, p.y - o.points[0].y) < pad;
    return o.points.some(
      (a, i) =>
        i && segmentDist(p, o.points[i - 1], a) < pad + (o.type === 'highlighter' ? o.width * 2 : 0)
    );
  }
  if (o.type === 'line')
    return segmentDist(p, { x: o.x, y: o.y }, { x: o.x + o.w, y: o.y + o.h }) < pad;
  let w = o.w,
    h = o.h;
  if (o.type === 'text') {
    ctx.font = textFont(o);
    w = Math.max(...o.text.split('\n').map((s) => ctx.measureText(s).width));
    h = o.text.split('\n').length * textLineHeight(o);
  }
  return (
    p.x >= Math.min(o.x, o.x + w) - pad &&
    p.x <= Math.max(o.x, o.x + w) + pad &&
    p.y >= Math.min(o.y, o.y + h) - pad &&
    p.y <= Math.max(o.y, o.y + h) + pad
  );
}
function objectBounds(o) {
  if (['geometry', 'image'].includes(o.type) && o.rotation) {
    const center = { x: o.x + o.w / 2, y: o.y + o.h / 2 },
      ps = [
        { x: o.x, y: o.y },
        { x: o.x + o.w, y: o.y },
        { x: o.x + o.w, y: o.y + o.h },
        { x: o.x, y: o.y + o.h },
      ].map((p) => rotatePoint(p, center, o.rotation));
    return {
      x: Math.min(...ps.map((p) => p.x)) - 24,
      y: Math.min(...ps.map((p) => p.y)) - 24,
      right: Math.max(...ps.map((p) => p.x)) + 24,
      bottom: Math.max(...ps.map((p) => p.y)) + 24,
    };
  }
  if (o.points) {
    const xs = o.points.map((p) => p.x),
      ys = o.points.map((p) => p.y);
    let x = Infinity,
      y = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      x = Math.min(x, xs[i]);
      right = Math.max(right, xs[i]);
      y = Math.min(y, ys[i]);
      bottom = Math.max(bottom, ys[i]);
    }
    const pad = o.type === 'highlighter' ? o.width * 2.5 : o.width / 2;
    return { x: x - pad, y: y - pad, right: right + pad, bottom: bottom + pad };
  }
  let w = o.w,
    h = o.h;
  if (o.type === 'text') {
    ctx.font = textFont(o);
    w = Math.max(...o.text.split('\n').map((s) => ctx.measureText(s).width));
    h = o.text.split('\n').length * textLineHeight(o);
  }
  return {
    x: Math.min(o.x, o.x + w) - o.width,
    y: Math.min(o.y, o.y + h) - o.width,
    right: Math.max(o.x, o.x + w) + o.width,
    bottom: Math.max(o.y, o.y + h) + o.width,
  };
}
function erase(p) {
  const from = gesture.lastErase || p;
  gesture.lastErase = p;
  if (eraserMode === 'object') {
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / 6));
    page().objects = page().objects.filter((o) => {
      for (let i = 0; i <= steps; i++) {
        const q = {
          x: from.x + ((p.x - from.x) * i) / steps,
          y: from.y + ((p.y - from.y) * i) / steps,
        };
        if (hit(o, q)) return false;
      }
      return true;
    });
    return;
  }
  const radius = eraserSize / 2;
  for (const o of page().objects) {
    const b = objectBounds(o);
    if (
      Math.max(from.x, p.x) + radius < b.x ||
      Math.min(from.x, p.x) - radius > b.right ||
      Math.max(from.y, p.y) + radius < b.y ||
      Math.min(from.y, p.y) - radius > b.bottom
    )
      continue;
    let mask = gesture.eraseMasks.get(o);
    if (!mask) {
      mask = { radius, points: [{ ...from }] };
      (o.erasures ??= []).push(mask);
      gesture.eraseMasks.set(o, mask);
    }
    if (p.x !== mask.points.at(-1).x || p.y !== mask.points.at(-1).y) mask.points.push({ ...p });
  }
}
$('eraser-mode').onchange = (e) => {
  eraserMode = e.target.value;
  setTool('eraser');
};
$('eraser-size').oninput = (e) => {
  eraserSize = +e.target.value;
  $('eraser-size-value').textContent = eraserSize + ' px';
};
canvas.onpointerdown = (e) => {
  if (e.button !== 0) return;
  commitText();
  const p = point(e);
  if (tool === 'text') {
    e.preventDefault();
    const r = canvas.getBoundingClientRect(),
      ed = $('text-editor'),
      place = $('text-place'),
      left = Math.min((p.x / W) * r.width, Math.max(0, r.width - 270)),
      top = Math.min((p.y / H) * r.height, Math.max(0, r.height - 150));
    ed.hidden = false;
    ed.style.left = left + 'px';
    ed.style.top = top + 'px';
    ed.style.width = Math.min(260, r.width - 16) + 'px';
    ed.dataset.x = (left / r.width) * W;
    ed.dataset.y = (top / r.height) * H;
    ed.dataset.color = color;
    ed.value = '';
    ed.style.color = color;
    ed.style.background = boardColors[page().boardColor || 'white'];
    ed.classList.toggle('dark-board', page().boardColor !== 'white');
    place.hidden = false;
    place.style.left = left + 'px';
    place.style.top = top + 95 + 'px';
    $('empty-hint').style.display = 'none';
    syncTextControls();
    ed.focus({ preventScroll: true });
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  if (tool === 'move') {
    if (
      selected &&
      selected.type !== 'text' &&
      Math.hypot(p.x - resizeCorner(selected).x, p.y - resizeCorner(selected).y) < 22
    ) {
      checkpoint();
      gesture = { kind: 'resize', start: p, original: clone(selected), target: selected };
      canvas.style.cursor = 'nwse-resize';
      return;
    }
    const target = [...page().objects].reverse().find((o) => hit(o, p));
    selected = target && ['geometry', 'image', 'text'].includes(target.type) ? target : null;
    syncSelection();
    render();
    if (!target) return;
    checkpoint();
    gesture = { kind: 'move', start: p, original: clone(target), target };
    canvas.style.cursor = 'grabbing';
    return;
  }
  checkpoint();
  gesture = { kind: tool, start: p, eraseMasks: new Map() };
  if (tool === 'eraser') {
    erase(p);
    render();
    return;
  }
  preview = {
    type: tool === 'pen' && e.shiftKey ? 'line' : tool,
    color,
    width,
    ...(['pen', 'highlighter'].includes(tool) && !(tool === 'pen' && e.shiftKey)
      ? { points: [p] }
      : { x: p.x, y: p.y, w: 0, h: 0 }),
  };
  render();
};
canvas.onpointermove = (e) => {
  if (!gesture) return;
  const p = point(e);
  if (gesture.kind === 'eraser') {
    erase(p);
    render();
    return;
  }
  if (gesture.kind === 'resize') {
    resizeByPointer(gesture.target, gesture.original, p);
    syncSelection();
    render();
    return;
  }
  if (gesture.kind === 'move') {
    const dx = p.x - gesture.start.x,
      dy = p.y - gesture.start.y,
      o = gesture.target,
      old = gesture.original;
    if (old.erasures)
      o.erasures = old.erasures.map((m) => ({
        ...m,
        points: m.points.map((a) => ({ x: a.x + dx, y: a.y + dy })),
      }));
    if (old.points) o.points = old.points.map((a) => ({ x: a.x + dx, y: a.y + dy }));
    else {
      o.x = old.x + dx;
      o.y = old.y + dy;
    }
    render();
    return;
  }
  if (gesture.kind === 'pen' && e.shiftKey && preview.points) {
    preview = {
      type: 'line',
      color,
      width,
      x: gesture.start.x,
      y: gesture.start.y,
      w: p.x - gesture.start.x,
      h: p.y - gesture.start.y,
    };
  }
  if (preview.type === 'line' && e.shiftKey && gesture.kind === 'line') {
    const dx = p.x - preview.x,
      dy = p.y - preview.y,
      angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4),
      len = Math.hypot(dx, dy);
    preview.w = Math.cos(angle) * len;
    preview.h = Math.sin(angle) * len;
    render();
    return;
  }
  if (preview.points) {
    for (const ev of e.getCoalescedEvents?.() || [e]) preview.points.push(point(ev));
  } else {
    preview.w = p.x - preview.x;
    preview.h = p.y - preview.y;
  }
  render();
};
function end() {
  if (!gesture) return;
  if (preview) page().objects.push(preview);
  gesture = null;
  preview = null;
  refreshCursor();
  render();
  thumbnails();
}
canvas.onpointerup = end;
canvas.onpointercancel = end;
function commitText() {
  const ed = $('text-editor');
  if (ed.hidden) return;
  const size = Number($('text-size').value);
  if (Number.isFinite(size) && size >= 10 && size <= 120) textStyle.fontSize = size;
  const value = ed.value.trim();
  ed.hidden = true;
  $('text-place').hidden = true;
  if (value) {
    checkpoint();
    page().objects.push({
      type: 'text',
      text: value,
      x: +ed.dataset.x,
      y: +ed.dataset.y,
      color: ed.dataset.color || color,
      width,
      ...textStyle,
    });
    render();
    thumbnails();
  } else render();
}
$('text-place').onpointerdown = (e) => e.preventDefault();
$('text-place').onclick = () => commitText();
$('text-editor').onkeydown = (e) => {
  if (e.isComposing) return;
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    commitText();
  }
  if (e.key === 'Escape') {
    $('text-editor').hidden = true;
    $('text-place').hidden = true;
    render();
  }
};
$('text-editor').onblur = (e) => {
  if (!e.relatedTarget?.closest('#text-options')) commitText();
};
function add() {
  commitText();
  pages.push(newPage(page()));
  index = pages.length - 1;
  update();
}
$('add').onclick = add;
$('add-bottom').onclick = add;
$('board-color').onchange = (e) => {
  commitText();
  page().boardColor = e.target.value;
  if (page().boardColor === 'white' && color === '#ffffff') setColor('#171717');
  else if (page().boardColor !== 'white' && ['#171717', '#243653'].includes(color))
    setColor('#ffffff');
  update();
};
$('background').onchange = (e) => {
  page().background = e.target.value;
  render();
  thumbnails();
};
$('clear').onclick = () => {
  commitText();
  if (!page().objects.length) {
    toast('This page is already clear.');
    return;
  }
  $('clear-dialog').showModal();
};
$('clear-cancel').onclick = () => $('clear-dialog').close();
$('clear-confirm').onclick = () => {
  checkpoint();
  page().objects = [];
  selected = null;
  syncSelection();
  gesture = null;
  preview = null;
  $('clear-dialog').close();
  render();
  thumbnails();
  toast('Page cleared. Use Undo to restore it.');
};
function undo() {
  commitText();
  if (!page().undo.length) return;
  page().redo.push(clone(page().objects));
  page().objects = page().undo.pop();
  selected = null;
  syncSelection();
  render();
  thumbnails();
}
function redo() {
  if (!page().redo.length) return;
  page().undo.push(clone(page().objects));
  page().objects = page().redo.pop();
  selected = null;
  syncSelection();
  render();
  thumbnails();
}
$('undo').onclick = undo;
$('redo').onclick = redo;
$('image').onclick = () => {
  commitText();
  $('image-file').click();
};
$('image-file').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 15 * 1024 * 1024) {
    toast('Choose an image smaller than 15 MB.');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const im = new Image();
    im.onload = () => {
      const ratio = Math.min(1, 900 / im.width, 600 / im.height);
      const off = document.createElement('canvas');
      off.width = Math.round(im.width * ratio);
      off.height = Math.round(im.height * ratio);
      off.getContext('2d').drawImage(im, 0, 0, off.width, off.height);
      const src = off.toDataURL('image/png');
      checkpoint();
      page().objects.push({
        type: 'image',
        src,
        x: 80,
        y: 80,
        w: off.width,
        h: off.height,
        color,
        width,
      });
      render();
      thumbnails();
      setTool('move');
      selected = page().objects.at(-1);
      syncSelection();
      render();
      toast('Image added. Drag it to position, then choose Chalk.');
    };
    im.onerror = () => toast('This image could not be opened.');
    im.src = reader.result;
  };
  reader.readAsDataURL(f);
  e.target.value = '';
};
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function filename() {
  return (
    ($('title').value.trim() || 'lesson').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80) || 'lesson'
  );
}
$('save').onclick = () => {
  commitText();
  download(
    new Blob(
      [
        JSON.stringify({
          format: 'tutorboard',
          version: 2,
          boardWidth: W,
          boardHeight: H,
          title: $('title').value,
          tutorName: $('tutor-name').value,
          pages: pages.map((p) => ({
            background: p.background,
            boardColor: p.boardColor || 'white',
            objects: p.objects,
          })),
        }),
      ],
      { type: 'application/json' }
    ),
    filename() + '.json'
  );
  toast('Lesson downloaded. Open this file to continue later.');
};
$('open').onclick = () => $('lesson-file').click();
function validObject(o) {
  if (
    !o ||
    ![
      'pen',
      'highlighter',
      'line',
      'rect',
      'circle',
      'text',
      'image',
      'triangle',
      'graph',
      'geometry',
    ].includes(o.type) ||
    typeof o.color !== 'string' ||
    !Number.isFinite(o.width) ||
    o.width < 1 ||
    o.width > 24
  )
    return false;
  if (
    o.erasures &&
    (!Array.isArray(o.erasures) ||
      o.erasures.length > 10000 ||
      !o.erasures.every(
        (m) =>
          m &&
          Number.isFinite(m.radius) &&
          m.radius > 0 &&
          m.radius <= 3600 &&
          Array.isArray(m.points) &&
          m.points.length > 0 &&
          m.points.length <= 100000 &&
          m.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      ))
  )
    return false;
  if (o.type === 'graph' || o.type === 'geometry') return TutorMath.valid(o);
  if (o.points)
    return (
      ['pen', 'highlighter'].includes(o.type) &&
      Array.isArray(o.points) &&
      o.points.length > 0 &&
      o.points.length <= 100000 &&
      o.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    );
  if (['pen', 'highlighter'].includes(o.type)) return false;
  if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) return false;
  if (o.type === 'text')
    return (
      typeof o.text === 'string' &&
      o.text.length <= 10000 &&
      (o.fontSize === undefined ||
        (Number.isFinite(o.fontSize) && o.fontSize >= 10 && o.fontSize <= 120)) &&
      (o.bold === undefined || typeof o.bold === 'boolean') &&
      (o.underline === undefined || typeof o.underline === 'boolean')
    );
  if (!Number.isFinite(o.w) || !Number.isFinite(o.h)) return false;
  if (o.type === 'image')
    return (
      (o.rotation === undefined || Number.isFinite(o.rotation)) &&
      o.w > 0 &&
      o.h > 0 &&
      typeof o.src === 'string' &&
      /^data:image\/(png|jpeg|webp);base64,/.test(o.src)
    );
  return true;
}
$('lesson-file').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 40 * 1024 * 1024) throw Error();
    const data = JSON.parse(await f.text());
    if (
      data.format !== 'tutorboard' ||
      ![1, 2].includes(data.version) ||
      (data.version === 2 && (data.boardWidth !== W || ![900, H].includes(data.boardHeight))) ||
      !Array.isArray(data.pages) ||
      !data.pages.length ||
      data.pages.length > 100 ||
      !data.pages.every(
        (p) =>
          ['blank', 'grid', 'ruled'].includes(p.background) &&
          (!p.boardColor || Object.hasOwn(boardColors, p.boardColor)) &&
          Array.isArray(p.objects) &&
          p.objects.length <= 10000 &&
          p.objects.every(validObject)
      )
    )
      throw Error();
    if (
      pages.some((p) => p.objects.length) &&
      !confirm(
        'Replace this board with the saved lesson? Save your current lesson first if needed.'
      )
    )
      return;
    commitText();
    pages = data.pages.map((p) => ({
      ...p,
      boardColor: p.boardColor || 'white',
      undo: [],
      redo: [],
    }));
    index = 0;
    $('tutor-name').value = typeof data.tutorName === 'string' ? data.tutorName.slice(0, 100) : '';
    $('title').value =
      typeof data.title === 'string' ? data.title.slice(0, 100) : 'Untitled lesson';
    update();
    toast('Lesson opened.');
  } catch {
    toast('Could not open this file. Choose a Vinee TutorBoard lesson JSON file.');
  } finally {
    e.target.value = '';
  }
};
$('export').onclick = () => {
  commitText();
  render(false);
  canvas.toBlob((b) => {
    if (b) download(b, filename() + '-page-' + (index + 1) + '.png');
  }, 'image/png');
  render();
  toast('This page is downloading as an image.');
};
let panelsBeforePresent = null;
function syncPanels() {
  if (boardLayoutReady) layoutBoard();
  for (const [id, kind] of [
    ['toggle-pages', 'pages'],
    ['toggle-tools', 'tools'],
  ]) {
    const hidden = document.body.classList.contains(kind + '-hidden');
    $(id).textContent = (hidden ? 'Show ' : 'Hide ') + kind;
    $(id).setAttribute('aria-expanded', String(!hidden));
  }
}
for (const kind of ['pages', 'tools'])
  $('toggle-' + kind).onclick = () => {
    commitText();
    document.body.classList.toggle(kind + '-hidden');
    syncPanels();
  };
function syncPageNavigation() {
  $('page-position').textContent = index + 1 + ' / ' + pages.length;
  $('previous-page').disabled = index === 0;
  $('next-page').disabled = index === pages.length - 1;
}
$('previous-page').onclick = () => {
  if (index > 0) {
    commitText();
    index--;
    update();
  }
};
$('next-page').onclick = () => {
  if (index < pages.length - 1) {
    commitText();
    index++;
    update();
  }
};
$('quick-add').onclick = add;
$('focus').onclick = () => {
  commitText();
  const entering = !document.body.classList.contains('present');
  if (entering) {
    panelsBeforePresent = ['pages', 'tools'].map((kind) =>
      document.body.classList.contains(kind + '-hidden')
    );
    document.body.classList.add('pages-hidden', 'tools-hidden');
  } else if (panelsBeforePresent) {
    ['pages', 'tools'].forEach((kind, i) =>
      document.body.classList.toggle(kind + '-hidden', panelsBeforePresent[i])
    );
  }
  document.body.classList.toggle('present', entering);
  $('focus').textContent = entering ? 'Exit present \u26f6' : 'Present \u26f6';
  syncPanels();
};
syncPanels();

document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  } else if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    $('save').click();
  } else if (!mod) {
    const keys = { p: 'pen', h: 'highlighter', e: 'eraser', t: 'text', v: 'move' };
    if (keys[e.key.toLowerCase()]) setTool(keys[e.key.toLowerCase()]);
    if (e.key === 'Escape' && document.body.classList.contains('present')) $('focus').click();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (window.TutorPWA?.hasUnsavedChanges?.() ?? pages.some((p) => p.objects.length)) {
    e.preventDefault();
    e.returnValue = '';
  }
});
update();

// Mathematics tools share the same objects, history, movement, export and lesson files.
const mathDialog = $('math-dialog');
function mathTab(name) {
  $('graph-form').hidden = name !== 'graph';
  $('geometry-form').hidden = name !== 'geometry';
  $('tab-graph').classList.toggle('active', name === 'graph');
  $('tab-geometry').classList.toggle('active', name === 'geometry');
  $('math-heading').textContent =
    name === 'graph' ? 'Graphs & coordinate axes' : 'Geometry diagrams';
  $('math-error').textContent = '';
}
function openMath(name) {
  commitText();
  mathTab(name);
  mathDialog.showModal();
}
$('graph-tools').onclick = () => openMath('graph');
$('geometry-tools').onclick = () => openMath('geometry');
$('math-close').onclick = () => mathDialog.close();
$('tab-graph').onclick = () => mathTab('graph');
$('tab-geometry').onclick = () => mathTab('geometry');
mathDialog.addEventListener('click', (e) => {
  if (e.target === mathDialog) {
    const r = mathDialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      mathDialog.close();
  }
});
document.querySelectorAll('[data-expression]').forEach(
  (b) =>
    (b.onclick = () => {
      $('functions').value = b.dataset.expression;
    })
);
function insertMath(o) {
  commitText();
  checkpoint();
  page().objects.push(o);
  render();
  thumbnails();
  mathDialog.close();
  setTool('move');
  selected = o.type === 'geometry' ? o : null;
  syncSelection();
  render();
  toast('Added to the board. Drag with Move; write over it with Chalk.');
}
function insertGraph(axesOnly = false) {
  try {
    const xmin = +$('xmin').value,
      xmax = +$('xmax').value,
      ymin = +$('ymin').value,
      ymax = +$('ymax').value;
    const expressions = axesOnly
      ? []
      : $('functions')
          .value.split(/\n|;/)
          .map((s) => s.trim().replace(/^y\s*=\s*/i, ''))
          .filter(Boolean);
    if (expressions.length > 4) throw Error('Use no more than four functions per graph.');
    const curveColors = [color, color === '#3b82f6' ? '#f97316' : '#3b82f6', '#ef4444', '#22c55e'];
    const curves = expressions.map((expression, i) => {
      TutorMath.compile(expression);
      return { expression, color: curveColors[i] };
    });
    const o = {
      type: 'graph',
      x: 120,
      y: 90,
      w: 900,
      h: 650,
      xmin,
      xmax,
      ymin,
      ymax,
      curves,
      color,
      width,
    };
    if (!TutorMath.valid(o))
      throw Error(
        'Choose increasing x and y ranges (span at least 0.01; endpoints within ±1,000,000).'
      );
    insertMath(o);
  } catch (e) {
    $('math-error').textContent = e.message;
  }
}
$('graph-form').onsubmit = (e) => {
  e.preventDefault();
  insertGraph();
};
$('axes-only').onclick = () => insertGraph(true);
$('geometry-kind').onchange = () => {
  $('sides-label').hidden = $('geometry-kind').value !== 'polygon';
  $('angle-label').hidden = $('geometry-kind').value !== 'angle';
};
$('geometry-form').onsubmit = (e) => {
  e.preventDefault();
  const size = +$('geometry-size').value,
    kind = $('geometry-kind').value;
  const o = {
    type: 'geometry',
    kind,
    x: 180,
    y: 180,
    w: size,
    h: size,
    sides: +$('geometry-sides').value,
    angle: +$('geometry-angle').value,
    labels: $('geometry-labels').checked,
    rotation: normalizeRotation(+$('geometry-rotation').value),
    pointNames: parseNames($('geometry-names').value),
    color,
    width,
  };
  if (size < 180 || size > 700 || !TutorMath.valid(o)) {
    $('math-error').textContent =
      'Use a size from 180 to 700, 3–12 polygon sides, and an angle between 0° and 180°.';
    return;
  }
  insertMath(o);
};

let presentationBeforeFullscreen = false,
  fullscreenActive = false;
function syncFullscreen(full) {
  if (full && !fullscreenActive) {
    presentationBeforeFullscreen = document.body.classList.contains('present');
    if (!presentationBeforeFullscreen) $('focus').click();
  }
  if (
    !full &&
    fullscreenActive &&
    document.body.classList.contains('present') !== presentationBeforeFullscreen
  )
    $('focus').click();
  fullscreenActive = full;
  $('fullscreen').textContent = full ? 'Exit full screen \u26f6' : 'Full screen \u26f6';
  $('fullscreen').setAttribute('aria-pressed', String(full));
}
$('fullscreen').onclick = async () => {
  commitText();
  try {
    if (window.tutorDesktop) {
      await window.tutorDesktop.toggleFullscreen();
      return;
    }
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen)
      await document.documentElement.requestFullscreen();
    else toast('Fullscreen is unavailable in this browser. Use Present or F11.');
  } catch {
    toast('Fullscreen could not open. Try F11.');
  }
};
if (window.tutorDesktop) {
  window.tutorDesktop.onFullscreenChanged(syncFullscreen);
  window.tutorDesktop
    .getFullscreen()
    .then(syncFullscreen)
    .catch(() => {});
} else
  document.addEventListener('fullscreenchange', () => syncFullscreen(!!document.fullscreenElement));

function rotatePoint(p, center, degrees) {
  const a = (degrees * Math.PI) / 180,
    dx = p.x - center.x,
    dy = p.y - center.y;
  return {
    x: center.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: center.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}
function normalizeRotation(v) {
  return Number.isFinite(v) ? ((v % 360) + 360) % 360 : 0;
}
function parseNames(value) {
  value = value.trim();
  if (/^[A-Z]{2,12}$/.test(value) && !/[ ,]/.test(value)) return value.split('');
  return value
    .split(/[,\s]+/u)
    .filter(Boolean)
    .slice(0, 12)
    .map((n) => n.slice(0, 12));
}
function syncSelection() {
  syncTextControls();
  const visible =
    selected && selected.type !== 'text' && page().objects.includes(selected) && tool === 'move';
  $('object-options').hidden = !visible;
  $('geometry-edit').hidden = !visible || selected.type !== 'geometry';
  $('image-edit').hidden = !visible || selected.type !== 'image';
  if (!visible) return;
  $('object-heading').textContent =
    selected.type === 'geometry' ? 'SELECTED DIAGRAM' : 'SELECTED IMAGE';
  if (selected.type === 'geometry') {
    $('object-rotation').value = Math.round((selected.rotation || 0) * 100) / 100;
    $('object-names').value = (selected.pointNames || []).join(', ');
    $('diagram-size').value = Math.round(selected.w);
  } else {
    $('image-width').value = Math.round(selected.w);
    $('image-rotation').value = Math.round((selected.rotation || 0) * 100) / 100;
  }
}
function drawSelection() {
  const b = objectBounds(selected);
  ctx.save();
  ctx.strokeStyle = '#16834a';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  ctx.strokeRect(b.x, b.y, b.right - b.x, b.bottom - b.y);
  ctx.setLineDash([]);
  if (selected.type === 'text') {
    ctx.restore();
    return;
  }
  const corner = resizeCorner(selected);
  ctx.fillStyle = '#fff';
  ctx.fillRect(corner.x - 10, corner.y - 10, 20, 20);
  ctx.strokeRect(corner.x - 10, corner.y - 10, 20, 20);
  ctx.restore();
}
function changeRotation(degrees) {
  if (!selected || !['geometry', 'image'].includes(selected.type) || !Number.isFinite(degrees))
    return;
  checkpoint();
  const next = normalizeRotation(degrees),
    delta = next - (selected.rotation || 0),
    center = { x: selected.x + selected.w / 2, y: selected.y + selected.h / 2 };
  if (selected.erasures)
    selected.erasures = selected.erasures.map((m) => ({
      ...m,
      points: m.points.map((p) => rotatePoint(p, center, delta)),
    }));
  selected.rotation = next;
  syncSelection();
  render();
  thumbnails();
}
$('object-rotation').onchange = (e) => changeRotation(+e.target.value);
$('rotate-left').onclick = () => changeRotation((selected?.rotation || 0) - 15);
$('rotate-right').onclick = () => changeRotation((selected?.rotation || 0) + 15);
$('apply-names').onclick = () => {
  if (selected?.type !== 'geometry') return;
  checkpoint();
  selected.pointNames = parseNames($('object-names').value);
  selected.labels = true;
  syncSelection();
  render();
  thumbnails();
};
function resizeCorner(o) {
  return rotatePoint(
    { x: o.x + o.w, y: o.y + o.h },
    { x: o.x + o.w / 2, y: o.y + o.h / 2 },
    o.rotation || 0
  );
}
function resizeImage(o, old, w) {
  const ratio = old.w / old.h,
    min = old.type === 'geometry' ? 100 : 40;
  w = Math.max(Math.max(min, min * ratio), Math.min(w, W, H * ratio));
  const factor = w / old.w;
  o.x = old.x;
  o.y = old.y;
  o.w = w;
  o.h = w / ratio;
  if (old.erasures) {
    const center = { x: old.x + old.w / 2, y: old.y + old.h / 2 },
      newcenter = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    o.erasures = old.erasures.map((m) => ({
      ...m,
      radius: m.radius * factor,
      points: m.points.map((p) => {
        const local = rotatePoint(p, center, -(old.rotation || 0));
        return rotatePoint(
          { x: old.x + (local.x - old.x) * factor, y: old.y + (local.y - old.y) * factor },
          newcenter,
          old.rotation || 0
        );
      }),
    }));
  }
}
function resizeByPointer(o, old, p) {
  const center = { x: old.x + old.w / 2, y: old.y + old.h / 2 },
    anchor = rotatePoint({ x: old.x, y: old.y }, center, old.rotation || 0),
    corner = resizeCorner(old),
    dx = corner.x - anchor.x,
    dy = corner.y - anchor.y,
    factor = ((p.x - anchor.x) * dx + (p.y - anchor.y) * dy) / (dx * dx + dy * dy);
  resizeImage(o, old, old.w * factor);
  const nextAnchor = rotatePoint(
      { x: o.x, y: o.y },
      { x: o.x + o.w / 2, y: o.y + o.h / 2 },
      old.rotation || 0
    ),
    shift = { x: anchor.x - nextAnchor.x, y: anchor.y - nextAnchor.y };
  o.x += shift.x;
  o.y += shift.y;
  if (o.erasures)
    o.erasures.forEach((m) =>
      m.points.forEach((p) => {
        p.x += shift.x;
        p.y += shift.y;
      })
    );
}
$('image-rotation').onchange = (e) => changeRotation(+e.target.value);
$('image-rotate-left').onclick = () => changeRotation((selected?.rotation || 0) - 15);
$('image-rotate-right').onclick = () => changeRotation((selected?.rotation || 0) + 15);
$('apply-diagram-size').onclick = () => {
  const size = +$('diagram-size').value;
  if (selected?.type !== 'geometry' || !Number.isFinite(size) || size < 100 || size > 900) {
    toast('Choose a diagram size from 100 to 900.');
    return;
  }
  checkpoint();
  resizeImage(selected, clone(selected), size);
  syncSelection();
  render();
  thumbnails();
};

$('apply-image-size').onclick = () => {
  const w = +$('image-width').value;
  if (selected?.type !== 'image' || !Number.isFinite(w) || w < 40 || w > W) {
    toast('Choose an image width from 40 to ' + W + '.');
    return;
  }
  checkpoint();
  resizeImage(selected, clone(selected), w);
  syncSelection();
  render();
  thumbnails();
};

$('export-pdf').onclick = async () => {
  commitText();
  const button = $('export-pdf'),
    originalLabel = button.textContent,
    snapshot = clone(
      pages.map((p) => ({ background: p.background, boardColor: p.boardColor, objects: p.objects }))
    ),
    name = filename(),
    lessonTitle = $('title').value.trim() || 'Untitled lesson',
    tutorName = $('tutor-name').value.trim();
  button.disabled = true;
  button.textContent = 'Preparing PDF…';
  try {
    const sources = [
      ...new Set(
        snapshot.flatMap((p) => p.objects.filter((o) => o.type === 'image').map((o) => o.src))
      ),
    ];
    await Promise.all(
      sources.map(async (src) => {
        let image = images.get(src);
        if (!image) {
          image = new Image();
          image.src = src;
          images.set(src, image);
        }
        if (image.decode) await image.decode();
        else if (!image.complete)
          await new Promise((resolve, reject) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', reject, { once: true });
          });
        if (!image.naturalWidth) throw Error('An inserted image could not be loaded.');
      })
    );
    const pdf = await PDFLib.PDFDocument.create();
    pdf.setTitle(lessonTitle);
    pdf.setAuthor(tutorName);
    pdf.setCreator('Vinee TutorBoard');
    await document.fonts.ready;
    // Rasterize the header with the browser's fonts to preserve Sinhala and other Unicode names.
    const header = document.createElement('canvas');
    header.width = 2400;
    header.height = 240;
    const hc = header.getContext('2d');
    hc.scale(3, 3);
    hc.fillStyle = '#ffffff';
    hc.fillRect(0, 0, 800, 80);
    function headerText(text, y, size, weight) {
      hc.font = weight + ' ' + size + 'px "Segoe UI",Arial,sans-serif';
      while (hc.measureText(text).width > 550 && size > 10) {
        size--;
        hc.font = weight + ' ' + size + 'px "Segoe UI",Arial,sans-serif';
      }
      hc.fillText(text, 0, y, 550);
    }
    hc.fillStyle = '#26344b';
    headerText(lessonTitle, 29, 24, 'bold');
    hc.fillStyle = '#58667d';
    headerText(tutorName, 56, 14, 'normal');
    hc.fillStyle = '#16834a';
    hc.beginPath();
    hc.roundRect(604, 10, 34, 34, 9);
    hc.fill();
    hc.fillStyle = '#ffffff';
    hc.font = 'bold 26px Arial,sans-serif';
    hc.textAlign = 'center';
    hc.fillText('V', 621, 37);
    hc.textAlign = 'left';
    hc.fillStyle = '#16834a';
    hc.font = 'bold 18px "Segoe UI",Arial,sans-serif';
    hc.fillText('Vinee TutorBoard', 648, 33);
    const headerImage = await pdf.embedPng(header.toDataURL('image/png')),
      footerFont = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    const output = document.createElement('canvas');
    output.width = W;
    output.height = H;
    const c = output.getContext('2d');
    for (let i = 0; i < snapshot.length; i++) {
      button.textContent = 'PDF page ' + (i + 1) + ' / ' + snapshot.length;
      const lessonPage = snapshot[i];
      drawPaper(c, lessonPage.background, lessonPage.boardColor);
      lessonPage.objects.forEach((o) => drawObject(c, o, lessonPage.boardColor));
      const png = await pdf.embedPng(output.toDataURL('image/png'));
      const sheetHeight = (793.89 * H) / W + 128,
        sheet = pdf.addPage([841.89, sheetHeight]),
        margin = 24,
        top = sheetHeight - 92,
        bottom = 36,
        scale = Math.min((841.89 - margin * 2) / W, (top - bottom) / H),
        w = W * scale,
        h = H * scale;
      sheet.drawImage(headerImage, {
        x: margin,
        y: sheetHeight - 84,
        width: 793.89,
        height: 79.389,
      });
      sheet.drawImage(png, {
        x: (841.89 - w) / 2,
        y: bottom + (top - bottom - h) / 2,
        width: w,
        height: h,
      });
      sheet.drawText('Created by TSN Peiris', {
        x: margin,
        y: 16,
        size: 5,
        font: footerFont,
        color: PDFLib.rgb(0.45, 0.49, 0.54),
      });
      const number = String(i + 1);
      sheet.drawText(number, {
        x: 841.89 - margin - footerFont.widthOfTextAtSize(number, 9),
        y: 16,
        size: 9,
        font: footerFont,
        color: PDFLib.rgb(0.35, 0.4, 0.46),
      });
    }

    const bytes = await pdf.save();
    if (window.tutorDesktop?.savePdf) {
      const result = await window.tutorDesktop.savePdf(bytes, name);
      if (result.canceled) {
        toast('PDF export canceled.');
        return;
      }
    } else download(new Blob([bytes], { type: 'application/pdf' }), name + '.pdf');
    toast('All ' + snapshot.length + ' lesson pages exported as PDF.');
  } catch (error) {
    console.error('PDF export failed', error);
    $('pdf-error-message').textContent = error.message || 'Please try again.';
    $('pdf-error-dialog').showModal();
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
};

function textFont(o) {
  return (o.bold ? 'bold ' : '') + (o.fontSize || 28) + 'px "Segoe UI",Arial,sans-serif';
}
function textLineHeight(o) {
  return (o.fontSize || 28) * 1.35;
}
function syncTextControls() {
  const target = selected?.type === 'text' && page().objects.includes(selected) ? selected : null;
  const style = target || textStyle;
  $('text-options').hidden = tool !== 'text' && !target;
  $('text-size').value = style.fontSize || 28;
  $('text-bold').setAttribute('aria-pressed', String(!!style.bold));
  $('text-underline').setAttribute('aria-pressed', String(!!style.underline));
  const ed = $('text-editor');
  if (!ed.hidden) {
    const scale = canvas.getBoundingClientRect().width / W;
    ed.style.fontSize = textStyle.fontSize * scale + 'px';
    ed.style.fontWeight = textStyle.bold ? 'bold' : 'normal';
    ed.style.textDecoration = textStyle.underline ? 'underline' : 'none';
  }
}
function formatText(change) {
  const target = selected?.type === 'text' && page().objects.includes(selected) ? selected : null;
  if (target) {
    checkpoint();
    Object.assign(target, change);
    textStyle = {
      fontSize: target.fontSize || 28,
      bold: !!target.bold,
      underline: !!target.underline,
    };
    render();
    thumbnails();
  } else Object.assign(textStyle, change);
  syncTextControls();
}
$('text-size').onchange = (e) => {
  const size = Number(e.target.value);
  if (!Number.isFinite(size)) {
    syncTextControls();
    return;
  }
  formatText({ fontSize: Math.max(10, Math.min(120, size)) });
};
$('text-smaller').onclick = () =>
  formatText({ fontSize: Math.max(10, Number($('text-size').value) - 2) });
$('text-larger').onclick = () =>
  formatText({ fontSize: Math.min(120, Number($('text-size').value) + 2) });
$('text-bold').onclick = () =>
  formatText({ bold: $('text-bold').getAttribute('aria-pressed') !== 'true' });
$('text-underline').onclick = () =>
  formatText({ underline: $('text-underline').getAttribute('aria-pressed') !== 'true' });
document
  .querySelectorAll('#text-options button')
  .forEach((button) => (button.onpointerdown = (e) => e.preventDefault()));
$('pdf-error-close').onclick = () => $('pdf-error-dialog').close();

// Zoom affects display only: lesson coordinates, PNGs and PDFs stay unchanged.
var boardLayoutReady = true;
let boardZoom = 1;
const boardStage = document.querySelector('.board-stage'),
  boardWrap = document.querySelector('.board-wrap');
function layoutBoard() {
  boardStage.style.overflow = boardZoom <= 1 ? 'hidden' : 'auto';
  const availableWidth = boardStage.offsetWidth,
    availableHeight = boardStage.offsetHeight;
  if (!availableWidth || !availableHeight) return;
  const fit = Math.min((availableWidth - 4) / W, (availableHeight - 4) / H);
  const w = Math.max(1, W * fit * boardZoom),
    h = Math.max(1, H * fit * boardZoom);
  boardWrap.style.width = w + 'px';
  boardWrap.style.height = h + 'px';
  // Auto margins cannot center oversized content safely; explicit positive offsets do.
  boardWrap.style.marginLeft = Math.max(2, (boardStage.clientWidth - w) / 2) + 'px';
  boardWrap.style.marginTop = Math.max(2, (boardStage.clientHeight - h) / 2) + 'px';
  boardWrap.style.marginRight = '2px';
  boardWrap.style.marginBottom = '2px';
  $('zoom-level').textContent = boardZoom === 1 ? 'Fit' : Math.round(boardZoom * 100) + '%';
  $('zoom-level').title = 'Zoom relative to fit-to-window size';
  $('zoom-fit').setAttribute('aria-pressed', String(boardZoom === 1));
  $('zoom-out').disabled = boardZoom <= 0.5;
  $('zoom-in').disabled = boardZoom >= 3;
  if (boardZoom === 1) {
    boardStage.scrollLeft = 0;
    boardStage.scrollTop = 0;
  }
  const ed = $('text-editor');
  if (!ed.hidden) {
    const scale = w / W;
    ed.style.left = Number(ed.dataset.x) * scale + 'px';
    ed.style.top = Number(ed.dataset.y) * scale + 'px';
    $('text-place').style.left = ed.style.left;
    $('text-place').style.top = Number(ed.dataset.y) * scale + 95 + 'px';
    syncTextControls();
  }
}
function setBoardZoom(value, anchor = null) {
  commitText();
  const old = canvas.getBoundingClientRect(),
    view = boardStage.getBoundingClientRect();
  const offsetX = anchor ? anchor.clientX - view.left : boardStage.clientWidth / 2,
    offsetY = anchor ? anchor.clientY - view.top : boardStage.clientHeight / 2;
  const centerX = (view.left + offsetX - old.left) / old.width,
    centerY = (view.top + offsetY - old.top) / old.height;
  boardZoom = Math.max(0.5, Math.min(3, Math.round(value * 100) / 100));
  layoutBoard();
  if (boardZoom !== 1) {
    boardStage.scrollLeft = boardWrap.offsetLeft + centerX * boardWrap.clientWidth - offsetX;
    boardStage.scrollTop = boardWrap.offsetTop + centerY * boardWrap.clientHeight - offsetY;
  }
}
$('zoom-in').onclick = () => setBoardZoom(boardZoom + 0.25);
$('zoom-out').onclick = () => setBoardZoom(boardZoom - 0.25);
$('zoom-fit').onclick = () => setBoardZoom(1);
const boardResizeObserver = new ResizeObserver(layoutBoard);
boardResizeObserver.observe(boardStage);
window.addEventListener('resize', layoutBoard);
layoutBoard();

// App appearance is independent of lesson paper and exported board colors.
function applyAppTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark',
    button = $('theme-toggle');
  button.textContent = dark ? 'Light theme' : 'Dark theme';
  button.setAttribute('aria-pressed', String(dark));
  button.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#172231' : '#16834a';
}
applyAppTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
$('theme-toggle').onclick = () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyAppTheme(theme);
  try {
    localStorage.setItem('tutorboard-theme', theme);
  } catch {}
};
