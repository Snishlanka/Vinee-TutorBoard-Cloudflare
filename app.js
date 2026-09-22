'use strict';
const $ = (id) => document.getElementById(id),
  canvas = $('board'),
  ctx = canvas.getContext('2d');
const W = 2880,
  H = 1080,
  colors = ['#facc15', '#ef4444', '#ffffff', '#171717', '#3b82f6'];
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
let activePointer = null;
let inputMode = 'auto';
let penSeen = false;
let pointerSnapshot = null;
let editingText = null;
let textStyle = {
  fontSize: 28,
  bold: false,
  underline: false,
  list: 'none',
  align: 'left',
  spacing: 1.35,
  border: true,
};
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
function isEditableShape(o) {
  return !!o && ['rect', 'circle', 'line', 'triangle', 'parallelogram', 'arrow'].includes(o.type);
}
function canTransform(o) {
  return isEditableShape(o) || ['geometry', 'image'].includes(o.type);
}
// Midpoint quadratic interpolation keeps the stroke inside its sampled path
// and works identically for live ink, thumbnails, PNG, and PDF rendering.
function smoothStroke(c, points) {
  if (!points.length) return;
  c.moveTo(points[0].x, points[0].y);
  if (points.length === 2) {
    c.lineTo(points[1].x, points[1].y);
    return;
  }
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i],
      next = points[i + 1];
    c.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
  }
  if (points.length > 2) {
    const last = points[points.length - 1];
    c.lineTo(last.x, last.y);
  }
}
function trianglePoints(o) {
  return [
    { x: o.x + o.w * (o.apexX ?? 0.5), y: o.y + o.h * (o.apexY ?? 0) },
    { x: o.x + o.w, y: o.y + o.h },
    { x: o.x, y: o.y + o.h },
  ];
}
function connectorControl(o) {
  return { x: o.x + o.w / 2 + (o.bendX || 0), y: o.y + o.h / 2 + (o.bendY || 0) };
}
function connectorPoint(o, t) {
  const b = connectorControl(o),
    u = 1 - t;
  return {
    x: u * u * o.x + 2 * u * t * b.x + t * t * (o.x + o.w),
    y: u * u * o.y + 2 * u * t * b.y + t * t * (o.y + o.h),
  };
}
function connectorPath(c, o) {
  if (o.bendX || o.bendY) {
    const b = connectorControl(o);
    c.quadraticCurveTo(b.x, b.y, o.x + o.w, o.y + o.h);
  } else c.lineTo(o.x + o.w, o.y + o.h);
}
function textLayout(o, c) {
  c.font = textFont(o);
  const lines = [],
    maxWidth = o.w ? Math.max(1, o.w - (o.box ? 24 : 0)) : Infinity;
  o.text.split('\n').forEach((paragraph, index) => {
    const prefix = o.list === 'bullet' ? '\u2022 ' : o.list === 'number' ? index + 1 + '. ' : '';
    let line = prefix;
    for (const word of paragraph.split(/(\s+)/u)) {
      if (line && c.measureText(line + word).width > maxWidth) {
        lines.push({ text: line, width: c.measureText(line).width });
        line = '';
      }
      for (const char of word) {
        if (line && c.measureText(line + char).width > maxWidth) {
          lines.push({ text: line, width: c.measureText(line).width });
          line = '';
        }
        line += char;
      }
    }
    lines.push({ text: line, width: c.measureText(line).width });
  });
  return lines;
}
function textBoxHeight(o, c) {
  return Math.max(o.h || 0, textLayout(o, c).length * textLineHeight(o) + (o.box ? 24 : 0));
}
function arrowPoints(o) {
  const end = { x: o.x + o.w, y: o.y + o.h };
  const bend = connectorControl(o);
  const angle = Math.atan2(end.y - bend.y, end.x - bend.x);
  const head = Math.min(Math.hypot(o.w, o.h) * 0.3, Math.max(16, o.width * 4));
  return [
    end,
    ...[-Math.PI / 6, Math.PI / 6].map((offset) => ({
      x: end.x - head * Math.cos(angle + offset),
      y: end.y - head * Math.sin(angle + offset),
    })),
  ];
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
  if (isEditableShape(o) && o.rotation) {
    c.translate(o.x + o.w / 2, o.y + o.h / 2);
    c.rotate((o.rotation * Math.PI) / 180);
    c.translate(-o.x - o.w / 2, -o.y - o.h / 2);
  }
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
    smoothStroke(c, o.points);
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
    connectorPath(c, o);
    c.stroke();
  }
  if (o.type === 'graph') TutorMath.graph(c, o, boardColor || 'white');
  if (o.type === 'geometry') TutorMath.geometry(c, o);
  if (o.type === 'triangle') {
    c.beginPath();
    trianglePoints(o).forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.stroke();
  }
  if (o.type === 'parallelogram' || (o.type === 'rect' && o.skew)) {
    c.beginPath();
    c.moveTo(o.x + o.w * (o.skew ?? 0.25), o.y);
    c.lineTo(o.x + o.w, o.y);
    c.lineTo(o.x + o.w * (1 - (o.skew ?? 0.25)), o.y + o.h);
    c.lineTo(o.x, o.y + o.h);
    c.closePath();
    c.stroke();
  }
  if (o.type === 'arrow') {
    const [tip, left, right] = arrowPoints(o);
    c.beginPath();
    c.moveTo(o.x, o.y);
    connectorPath(c, o);
    c.moveTo(left.x, left.y);
    c.lineTo(tip.x, tip.y);
    c.lineTo(right.x, right.y);
    c.stroke();
  }
  if (o.type === 'rect' && !o.skew) c.strokeRect(o.x, o.y, o.w, o.h);
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
    const layout = textLayout(o, c),
      padding = o.box ? 12 : 0;
    if (o.box && o.border !== false) {
      c.lineWidth = 1.5;
      c.strokeRect(o.x, o.y, o.w, textBoxHeight(o, c));
    }
    layout.forEach((line, i) => {
      const y = o.y + padding + i * textLineHeight(o);
      const available = o.w ? o.w - padding * 2 : line.width;
      const x =
        o.x +
        padding +
        (o.align === 'center'
          ? (available - line.width) / 2
          : o.align === 'right'
            ? available - line.width
            : 0);
      c.fillText(line.text, x, y);
      if (o.underline && line.text) {
        c.lineWidth = Math.max(1, size / 18);
        c.beginPath();
        c.moveTo(x, y + size * 1.08);
        c.lineTo(x + line.width, y + size * 1.08);
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
  $('empty-hint').style.display =
    page().objects.length || preview || !$('text-editor').hidden ? 'none' : 'flex';
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
  activePointer = null;
  pointerSnapshot = null;
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
  if (activePointer) end();
  commitText();
  tool = t;
  if (t !== 'move') selected = null;
  syncSelection();
  render();
  document.querySelectorAll('[data-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === t);
    b.setAttribute('aria-pressed', b.dataset.tool === t);
  });
  $('connector-toggle').classList.toggle('active', ['line', 'arrow'].includes(t));
  refreshCursor();
  if (t !== 'eraser') closeEraserMenu();
  $('eraser-size').disabled = eraserMode === 'object';
  $('status').textContent =
    t === 'eraser'
      ? eraserMode === 'point'
        ? 'Point eraser · Erase only the area you touch'
        : 'Whole-object eraser · Touch a mark to remove it'
      : t === 'move'
        ? 'Move · Drag a mark, text, or image'
        : t === 'text'
          ? 'Text box · Drag to size, then type; Ctrl + Enter to place'
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
  const names = ['Yellow', 'Red', 'White', 'Black', 'Blue'];
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
  if (canTransform(o) && o.rotation)
    p = rotatePoint(p, { x: o.x + o.w / 2, y: o.y + o.h / 2 }, -o.rotation);
  const pad = 12 + o.width;
  if (o.points) {
    if (o.points.length === 1) return Math.hypot(p.x - o.points[0].x, p.y - o.points[0].y) < pad;
    return o.points.some(
      (a, i) =>
        i && segmentDist(p, o.points[i - 1], a) < pad + (o.type === 'highlighter' ? o.width * 2 : 0)
    );
  }
  if (o.type === 'triangle') {
    const vertices = trianglePoints(o);
    if (vertices.some((a, i) => segmentDist(p, a, vertices[(i + 1) % 3]) < pad)) return true;
    const sides = vertices.map((a, i) => {
      const b = vertices[(i + 1) % 3];
      return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    });
    return sides.every((v) => v >= 0) || sides.every((v) => v <= 0);
  }
  if (o.type === 'arrow' || o.type === 'line') {
    let previous = { x: o.x, y: o.y };
    for (let i = 1; i <= 64; i++) {
      const next = connectorPoint(o, i / 64);
      if (segmentDist(p, previous, next) < pad) return true;
      previous = next;
    }
    if (o.type === 'line') return false;
    const [tip, left, right] = arrowPoints(o);
    return segmentDist(p, tip, left) < pad || segmentDist(p, tip, right) < pad;
  }
  let w = o.w,
    h = o.h;
  if (o.type === 'text') {
    ctx.font = textFont(o);
    w = o.w || Math.max(1, ...textLayout(o, ctx).map((line) => line.width));
    h = textBoxHeight(o, ctx);
  }
  return (
    p.x >= Math.min(o.x, o.x + w) - pad &&
    p.x <= Math.max(o.x, o.x + w) + pad &&
    p.y >= Math.min(o.y, o.y + h) - pad &&
    p.y <= Math.max(o.y, o.y + h) + pad
  );
}
function objectBounds(o) {
  if (['arrow', 'line', 'triangle'].includes(o.type)) {
    const center = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    const points = (
      o.type === 'triangle'
        ? trianglePoints(o)
        : [{ x: o.x, y: o.y }, connectorControl(o), ...arrowPoints(o)]
    ).map((p) => rotatePoint(p, center, o.rotation || 0));
    return {
      x: Math.min(...points.map((p) => p.x)) - o.width,
      y: Math.min(...points.map((p) => p.y)) - o.width,
      right: Math.max(...points.map((p) => p.x)) + o.width,
      bottom: Math.max(...points.map((p) => p.y)) + o.width,
    };
  }
  if (canTransform(o) && o.rotation) {
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
    w = o.w || Math.max(1, ...textLayout(o, ctx).map((line) => line.width));
    h = textBoxHeight(o, ctx);
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
document.querySelectorAll('[data-eraser-mode]').forEach((button) => {
  button.onclick = () => {
    eraserMode = button.dataset.eraserMode;
    document
      .querySelectorAll('[data-eraser-mode]')
      .forEach((option) =>
        option.setAttribute('aria-pressed', String(option.dataset.eraserMode === eraserMode))
      );
    setTool('eraser');
    closeEraserMenu(true);
  };
});
$('eraser-size').oninput = (e) => {
  eraserSize = +e.target.value;
  $('eraser-size-value').textContent = eraserSize + ' px';
};
// A stroke belongs to one pointer. Detecting a stylus disables touch until
// the user explicitly chooses Finger drawing; Pen only also protects the first stroke.
function acceptsPointer(e) {
  if (e.pointerType === 'pen') return true;
  if (inputMode === 'pen') return false;
  if (e.pointerType === 'touch')
    return e.isPrimary !== false && (inputMode === 'touch' || !penSeen);
  return true;
}
function cancelPointer() {
  if (pointerSnapshot) {
    page().objects = pointerSnapshot.objects;
    page().undo = pointerSnapshot.undo;
    page().redo = pointerSnapshot.redo;
  }
  const id = activePointer?.id;
  activePointer = null;
  pointerSnapshot = null;
  gesture = null;
  preview = null;
  selected = null;
  if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  syncSelection();
  refreshCursor();
  render();
}
function observePen(e) {
  if (e.pointerType !== 'pen' || inputMode === 'touch') return;
  penSeen = true;
  if (activePointer?.type === 'touch') cancelPointer();
  $('input-hint').textContent = 'Pen detected: palm touch is ignored';
}
canvas.addEventListener('pointerover', observePen);
$('input-mode').onchange = (e) => {
  if (activePointer) cancelPointer();
  inputMode = e.target.value;
  penSeen = false;
  $('input-hint').textContent =
    inputMode === 'pen'
      ? 'Stylus only; palm and finger touches are ignored'
      : inputMode === 'touch'
        ? 'Draw with one finger at a time'
        : 'Touch drawing turns off when a stylus is detected';
  try {
    localStorage.setItem('vinee-input-mode', inputMode);
  } catch {}
};
try {
  const saved = localStorage.getItem('vinee-input-mode');
  if (['auto', 'pen', 'touch'].includes(saved)) {
    inputMode = saved;
    $('input-mode').value = saved;
    $('input-mode').onchange({ target: { value: saved } });
  }
} catch {}
canvas.onpointerdown = (e) => {
  observePen(e);
  if (e.button !== 0 || !acceptsPointer(e) || activePointer) return;
  e.preventDefault();
  commitText();
  const p = point(e);
  activePointer = { id: e.pointerId, type: e.pointerType };
  pointerSnapshot = {
    objects: clone(page().objects),
    undo: page().undo.slice(),
    redo: page().redo.slice(),
  };
  canvas.setPointerCapture(e.pointerId);
  if (tool === 'text') {
    gesture = { kind: 'text-box', start: p, moved: false };
    preview = {
      type: 'text',
      box: true,
      text: '',
      x: p.x,
      y: p.y,
      w: 80,
      h: 40,
      color,
      width,
      ...textStyle,
    };
    render();
    return;
  }
  if (tool === 'move') {
    const handle =
      selected &&
      selectionHandles(selected).find((h) => Math.hypot(p.x - h.x, p.y - h.y) < handleSize() * 1.6);
    if (handle) {
      checkpoint();
      gesture = { kind: 'control', handle, start: p, original: clone(selected), target: selected };
      return;
    }
    const target = [...page().objects].reverse().find((o) => hit(o, p));
    selected = target || null;
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
  observePen(e);
  if (!gesture || e.pointerId !== activePointer?.id) return;
  const p = point(e);
  if (gesture.kind === 'text-box') {
    const start = gesture.start;
    gesture.moved = Math.hypot(p.x - start.x, p.y - start.y) > 10;
    preview.x = Math.max(0, Math.min(start.x, p.x));
    preview.y = Math.max(0, Math.min(start.y, p.y));
    preview.w = Math.max(80, Math.min(W - preview.x, Math.abs(p.x - start.x)));
    preview.h = Math.max(40, Math.min(H - preview.y, Math.abs(p.y - start.y)));
    render();
    return;
  }
  if (gesture.kind === 'eraser') {
    erase(p);
    render();
    return;
  }
  if (gesture.kind === 'control') {
    dragControl(gesture, p, e.shiftKey);
    syncSelection();
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
    const samples = e.getCoalescedEvents?.();
    for (const ev of samples?.length ? samples : [e]) {
      const next = point(ev),
        last = preview.points.at(-1);
      if (Math.hypot(next.x - last.x, next.y - last.y) >= 0.5) preview.points.push(next);
    }
  } else {
    preview.w = p.x - preview.x;
    preview.h = p.y - preview.y;
  }
  render();
};
function end(e) {
  if (e && e.pointerId !== activePointer?.id) return;
  if (e && gesture && Number.isFinite(e.clientX)) canvas.onpointermove(e);
  const id = activePointer?.id;
  activePointer = null;
  pointerSnapshot = null;
  if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  if (!gesture) return;
  if (gesture.kind === 'text-box') {
    const box = { ...preview };
    if (!gesture.moved) {
      box.w = 520;
      box.h = 180;
    }
    gesture = null;
    preview = null;
    render();
    openTextBox(box);
    return;
  }
  if (preview) {
    const created = preview;
    page().objects.push(created);
    if (isEditableShape(created)) {
      setTool('move');
      selected = created;
      syncSelection();
    }
  }
  gesture = null;
  preview = null;
  refreshCursor();
  render();
  thumbnails();
}
canvas.onpointerup = end;
canvas.onpointercancel = (e) => {
  if (e.pointerId === activePointer?.id) cancelPointer();
};
canvas.onlostpointercapture = (e) => {
  if (e.pointerId === activePointer?.id) cancelPointer();
};
function commitText() {
  const ed = $('text-editor');
  if (ed.hidden) return;
  const size = Number($('text-size').value);
  if (Number.isFinite(size) && size >= 10 && size <= 120) textStyle.fontSize = size;
  const value = ed.value.trim();
  const editorBounds = ed.getBoundingClientRect();
  const boardBounds = canvas.getBoundingClientRect();
  ed.hidden = true;
  $('text-place').hidden = true;
  if (value) {
    checkpoint();
    const box = {
      type: 'text',
      box: true,
      text: value,
      x: +ed.dataset.x,
      y: +ed.dataset.y,
      color: ed.dataset.color || color,
      width,
      ...textStyle,
      w: Math.max(80, Math.min(W, (editorBounds.width * W) / boardBounds.width)),
      h: Math.max(40, Math.min(H, (editorBounds.height * H) / boardBounds.height)),
    };
    if (editingText) Object.assign(editingText, box);
    else page().objects.push(box);
    selected = editingText || box;
    editingText = null;
    setTool('move');
    syncSelection();
    render();
    thumbnails();
  } else {
    editingText = null;
    render();
  }
}
function openTextBox(p, existing = null) {
  const r = canvas.getBoundingClientRect(),
    ed = $('text-editor'),
    scale = r.width / W;
  editingText = existing;
  if (existing)
    textStyle = {
      fontSize: existing.fontSize || 28,
      bold: !!existing.bold,
      underline: !!existing.underline,
      list: existing.list || 'none',
      align: existing.align || 'left',
      spacing: existing.spacing || 1.35,
      border: existing.border !== false,
    };
  const x = Math.max(0, Math.min(p.x, W - 100)),
    y = Math.max(0, Math.min(p.y, H - 50));
  ed.hidden = false;
  ed.style.left = x * scale + 'px';
  ed.style.top = y * scale + 'px';
  ed.style.width = Math.min(existing?.w || p.w || 520, W - x) * scale + 'px';
  ed.style.height = Math.min(existing?.h || p.h || 180, H - y) * scale + 'px';
  ed.dataset.x = x;
  ed.dataset.y = y;
  ed.dataset.color = existing?.color || color;
  ed.value = existing?.text || '';
  ed.style.color = ed.dataset.color;
  ed.style.background = boardColors[page().boardColor || 'white'];
  ed.classList.toggle('dark-board', page().boardColor !== 'white');
  const place = $('text-place');
  place.hidden = false;
  place.style.left = x * scale + 'px';
  place.style.top =
    Math.min(r.height - 32, y * scale + Math.min(existing?.h || p.h || 180, H - y) * scale + 6) +
    'px';
  syncTextControls();
  render();
  ed.focus({ preventScroll: true });
}
canvas.ondblclick = (e) => {
  if (!['move', 'text'].includes(tool) || (e.pointerType && !acceptsPointer(e))) return;
  const p = point(e),
    target = [...page().objects].reverse().find((o) => o.type === 'text' && hit(o, p));
  if (target) {
    commitText();
    selected = target;
    openTextBox(target, target);
  }
};
$('text-edit-selected').onclick = () => {
  if (selected?.type === 'text') openTextBox(selected, selected);
};
$('text-list').onchange = (e) => formatText({ list: e.target.value });
$('text-align').onchange = (e) => formatText({ align: e.target.value });
$('text-border').onchange = (e) => formatText({ border: e.target.checked });
$('text-spacing').onchange = (e) => formatText({ spacing: +e.target.value });
function positionToolMenu(menu, toggle) {
  const anchor = toggle.getBoundingClientRect();
  menu.hidden = false;
  menu.style.left =
    Math.max(8, Math.min(anchor.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = anchor.bottom + 6 + 'px';
  toggle.setAttribute('aria-expanded', 'true');
  menu.querySelector('button').focus();
}
function closeEraserMenu(returnFocus = false) {
  $('eraser-menu').hidden = true;
  $('eraser-toggle').setAttribute('aria-expanded', 'false');
  if (returnFocus) $('eraser-toggle').focus();
}
$('eraser-toggle').onclick = () => {
  const wasOpen = !$('eraser-menu').hidden;
  setTool('eraser');
  closeConnectorMenu();
  if (wasOpen) closeEraserMenu();
  else positionToolMenu($('eraser-menu'), $('eraser-toggle'));
};
function closeConnectorMenu(returnFocus = false) {
  $('connector-menu').hidden = true;
  $('connector-toggle').setAttribute('aria-expanded', 'false');
  if (returnFocus) $('connector-toggle').focus();
}
$('connector-toggle').onclick = () => {
  const menu = $('connector-menu');
  if (!menu.hidden) {
    closeConnectorMenu();
    return;
  }
  closeEraserMenu();
  positionToolMenu(menu, $('connector-toggle'));
};
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#connector-picker')) closeConnectorMenu();
  if (!e.target.closest('#eraser-picker')) closeEraserMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('eraser-menu').hidden) {
    e.preventDefault();
    closeEraserMenu(true);
  }
  if (e.key === 'Escape' && !$('connector-menu').hidden) {
    e.preventDefault();
    closeConnectorMenu(true);
  }
});
window.addEventListener('resize', () => {
  closeConnectorMenu();
  closeEraserMenu();
});
document.addEventListener(
  'scroll',
  () => {
    closeConnectorMenu();
    closeEraserMenu();
  },
  true
);
document.querySelectorAll('#connector-menu [data-tool]').forEach((button) => {
  button.onclick = () => {
    setTool(button.dataset.tool);
    closeConnectorMenu(true);
    $('connector-toggle').textContent =
      button.dataset.tool === 'arrow' ? '\u2197 \u25be' : '\u2571 \u25be';
    $('connector-toggle').title =
      (button.dataset.tool === 'arrow' ? 'Arrow' : 'Line') + ' (choose line or arrow)';
  };
});
$('text-place').onpointerdown = (e) => e.preventDefault();
$('text-place').onclick = () => commitText();
$('text-editor').onkeydown = (e) => {
  if (e.isComposing) return;
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    commitText();
  }
  if (e.key === 'Escape') {
    editingText = null;
    $('text-editor').hidden = true;
    $('text-place').hidden = true;
    render();
  }
};
$('text-editor').onblur = (e) => {
  if (!e.relatedTarget?.closest('#text-options')) commitText();
};
function add() {
  end();
  commitText();
  pages.splice(index + 1, 0, newPage(page()));
  index++;
  update();
}
function moveCurrentPage(offset) {
  const destination = index + offset;
  if (!Number.isInteger(destination) || destination < 0 || destination >= pages.length) return;
  end();
  commitText();
  const active = pages.splice(index, 1)[0];
  pages.splice(destination, 0, active);
  index = destination;
  update();
  toast('Page moved to position ' + (index + 1) + '.');
}
$('move-page-earlier').onclick = () => moveCurrentPage(-1);
$('move-page-later').onclick = () => moveCurrentPage(1);
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
  if (activePointer) end();
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
  if (activePointer) end();
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
// File selection and screenshot paste share validation, resizing, and history.
async function insertImageFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    toast('Choose a PNG, JPEG, or WebP image.');
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    toast('Choose an image smaller than 15 MB.');
    return;
  }
  end();
  commitText();
  const targetPage = page();
  try {
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('This image could not be read.'));
      reader.onabort = () => reject(new Error('Image loading was canceled.'));
      reader.readAsDataURL(file);
    });
    const im = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('This image could not be opened.'));
      image.src = source;
    });
    // Do not insert into another page if navigation happened during decoding.
    if (page() !== targetPage) {
      toast('The page changed. Insert or paste the image again on this page.');
      return;
    }
    const ratio = Math.min(1, 900 / im.width, 600 / im.height);
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(im.width * ratio));
    off.height = Math.max(1, Math.round(im.height * ratio));
    off.getContext('2d').drawImage(im, 0, 0, off.width, off.height);
    const src = off.toDataURL('image/png');
    end();
    commitText();
    checkpoint();
    const object = {
      type: 'image',
      src,
      x: 80,
      y: 80,
      w: off.width,
      h: off.height,
      color,
      width,
    };
    targetPage.objects.push(object);
    setTool('move');
    selected = object;
    syncSelection();
    render();
    thumbnails();
    toast('Image added. Drag it to position, then choose Chalk.');
  } catch (error) {
    toast(error.message || 'This image could not be opened.');
  }
}
$('image-file').onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  void insertImageFile(file);
};
function pasteImage(event) {
  const target = event.target;
  // Preserve normal text/form paste and avoid changing a board behind a dialog.
  if (
    event.defaultPrevented ||
    target?.closest?.('input, textarea, select') ||
    target?.isContentEditable ||
    document.querySelector('dialog[open]')
  )
    return;
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const file =
    Array.from(clipboard.items || [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .find(Boolean) ||
    Array.from(clipboard.files || []).find((file) => file.type.startsWith('image/'));
  if (!file) return;
  event.preventDefault();
  void insertImageFile(file);
}
document.addEventListener('paste', pasteImage);
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
      'parallelogram',
      'arrow',
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
  if (
    ['bendX', 'bendY', 'skew', 'apexX', 'apexY'].some(
      (key) => o[key] !== undefined && !Number.isFinite(o[key])
    )
  )
    return false;
  if (o.apexX !== undefined && (o.apexX < -2 || o.apexX > 3)) return false;
  if (o.apexY !== undefined && (o.apexY < -2 || o.apexY > 0.95)) return false;
  if (o.skew !== undefined && (o.skew < 0 || o.skew > 0.9)) return false;
  if (canTransform(o) && o.rotation !== undefined && !Number.isFinite(o.rotation)) return false;
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
      (o.box === undefined || typeof o.box === 'boolean') &&
      (o.border === undefined || typeof o.border === 'boolean') &&
      (o.box !== true || (Number.isFinite(o.w) && Number.isFinite(o.h))) &&
      (o.w === undefined || (Number.isFinite(o.w) && o.w >= 40 && o.w <= W)) &&
      (o.h === undefined || (Number.isFinite(o.h) && o.h >= 20 && o.h <= H)) &&
      (o.list === undefined || ['none', 'bullet', 'number'].includes(o.list)) &&
      (o.align === undefined || ['left', 'center', 'right'].includes(o.align)) &&
      (o.spacing === undefined ||
        (Number.isFinite(o.spacing) && o.spacing >= 1 && o.spacing <= 2)) &&
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
function positionPanelToggles() {
  const pagesHidden = document.body.classList.contains('pages-hidden');
  const toolsHidden = document.body.classList.contains('tools-hidden');
  $('toggle-pages').style.left = pagesHidden
    ? ''
    : $('pages-panel').getBoundingClientRect().right + 'px';
  $('toggle-tools').style.right = toolsHidden
    ? ''
    : window.innerWidth - $('tools-panel').getBoundingClientRect().left + 'px';
  const stage = document.querySelector('.board-stage').getBoundingClientRect();
  $('toggle-paper').style.left = stage.left + stage.width / 2 + 'px';
  $('toggle-paper').style.top = stage.top + 'px';
}
function syncPanels() {
  if (boardLayoutReady) layoutBoard();
  for (const [id, kind] of [
    ['toggle-pages', 'pages'],
    ['toggle-tools', 'tools'],
  ]) {
    const hidden = document.body.classList.contains(kind + '-hidden');
    const label = (hidden ? 'Show ' : 'Hide ') + kind;
    $(id).textContent = (kind === 'pages' ? hidden : !hidden) ? '\u203a' : '\u2039';
    $(id).title = label;
    $(id).setAttribute('aria-label', label);
    $(id).setAttribute('aria-expanded', String(!hidden));
  }
  positionPanelToggles();
}
for (const kind of ['pages', 'tools'])
  $('toggle-' + kind).onclick = () => {
    commitText();
    document.body.classList.toggle(kind + '-hidden');
    syncPanels();
  };
function togglePaperControls() {
  const panel = $('paper-controls');
  panel.hidden = !panel.hidden;
  // Collapse the entire heading row, including drawing tools, to free board height.
  $('board-controls').hidden = panel.hidden;
  const label = panel.hidden ? 'Show paper controls' : 'Hide paper controls';
  $('toggle-paper').textContent = panel.hidden ? '\u25be' : '\u25b4';
  $('toggle-paper').title = label;
  $('toggle-paper').setAttribute('aria-label', label);
  $('toggle-paper').setAttribute('aria-expanded', String(!panel.hidden));
  if (boardLayoutReady) layoutBoard();
}
$('toggle-paper').onclick = togglePaperControls;
function syncPageNavigation() {
  $('page-position').textContent = index + 1 + ' / ' + pages.length;
  $('previous-page').disabled = index === 0;
  $('next-page').disabled = index === pages.length - 1;
  $('move-page-earlier').disabled = index === 0;
  $('move-page-later').disabled = index === pages.length - 1;
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

function deleteSelected() {
  if (activePointer) end();
  commitText();
  const at = page().objects.indexOf(selected);
  if (tool !== 'move' || at < 0) return;
  checkpoint();
  page().objects.splice(at, 1);
  selected = null;
  syncSelection();
  render();
  thumbnails();
}
$('delete-object').onpointerdown = (e) => e.preventDefault();
$('delete-object').onclick = deleteSelected;

document.addEventListener('keydown', (e) => {
  if (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) ||
    document.activeElement.isContentEditable ||
    document.querySelector('dialog[open]')
  )
    return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  } else if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    $('save').click();
  } else if (!mod) {
    if (e.key === 'Delete' && selected && tool === 'move') {
      e.preventDefault();
      deleteSelected();
      return;
    }
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
  $('delete-object').disabled = !selected || !page().objects.includes(selected) || tool !== 'move';
  const visible =
    selected && canTransform(selected) && page().objects.includes(selected) && tool === 'move';
  $('object-options').hidden = !visible;
  $('geometry-edit').hidden = !visible || selected.type !== 'geometry';
  $('image-edit').hidden = !visible || selected.type !== 'image';
  $('shape-edit').hidden = !visible || !isEditableShape(selected);
  if (!visible) return;
  $('object-heading').textContent =
    selected.type === 'geometry'
      ? 'SELECTED DIAGRAM'
      : isEditableShape(selected)
        ? 'SELECTED SHAPE'
        : 'SELECTED IMAGE';
  if (isEditableShape(selected)) {
    $('shape-rotation').value = Math.round((selected.rotation || 0) * 100) / 100;
    $('shape-width').value = Math.round(Math.abs(selected.w));
    $('shape-height').value = Math.round(Math.abs(selected.h));
  } else if (selected.type === 'geometry') {
    $('object-rotation').value = Math.round((selected.rotation || 0) * 100) / 100;
    $('object-names').value = (selected.pointNames || []).join(', ');
    $('diagram-size').value = Math.round(selected.w);
  } else {
    $('image-width').value = Math.round(selected.w);
    $('image-rotation').value = Math.round((selected.rotation || 0) * 100) / 100;
  }
}
function handleSize() {
  return (4 * W) / canvas.getBoundingClientRect().width;
}
function selectionHandles(o) {
  if (!canTransform(o) && o.type !== 'text') return [];
  const center = { x: o.x + (o.w || 0) / 2, y: o.y + (o.h || 0) / 2 };
  const world = (p) => rotatePoint(p, center, o.rotation || 0);
  const gap = handleSize() * 5;
  if (o.type === 'line' || o.type === 'arrow')
    return [
      { ...world(o), kind: 'start' },
      { ...world({ x: o.x + o.w, y: o.y + o.h }), kind: 'end' },
      { ...world(connectorPoint(o, 0.5)), kind: 'bend' },
    ];
  const b =
    o.type === 'text' ? objectBounds(o) : { x: o.x, y: o.y, right: o.x + o.w, bottom: o.y + o.h };
  const handles = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([u, v]) => ({
    ...world({ x: b.x + (b.right - b.x) * u, y: b.y + (b.bottom - b.y) * v }),
    kind: 'corner',
    u,
    v,
  }));
  if (o.type !== 'text')
    handles.push({ ...world({ x: center.x, y: Math.min(o.y, o.y + o.h) - gap }), kind: 'rotate' });
  if (o.type === 'rect' || o.type === 'parallelogram')
    handles.unshift({
      ...world({
        x: o.x + o.w * (o.skew ?? (o.type === 'rect' ? 0 : 0.25)),
        y: o.y + Math.sign(o.h || 1) * handleSize() * 2.5,
      }),
      kind: 'skew',
    });
  if (o.type === 'triangle') handles.unshift({ ...world(trianglePoints(o)[0]), kind: 'apex' });
  return handles;
}
function drawSelection() {
  const radius = handleSize();
  ctx.save();
  ctx.strokeStyle = '#16834a';
  ctx.lineWidth = radius / 3;
  ctx.setLineDash([]);
  for (const h of selectionHandles(selected)) {
    ctx.fillStyle = ['skew', 'bend', 'apex'].includes(h.kind) ? '#fbbf24' : '#ffffff';
    ctx.beginPath();
    if (['rotate', 'bend', 'apex'].includes(h.kind)) ctx.arc(h.x, h.y, radius, 0, Math.PI * 2);
    else ctx.rect(h.x - radius, h.y - radius, radius * 2, radius * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
function dragControl(g, p, snap) {
  const o = g.target,
    old = g.original,
    h = g.handle;
  const center = { x: old.x + (old.w || 0) / 2, y: old.y + (old.h || 0) / 2 };
  const local = rotatePoint(p, center, -(old.rotation || 0));
  if (h.kind === 'rotate') {
    const initial = Math.atan2(g.start.y - center.y, g.start.x - center.x);
    let degrees =
      (old.rotation || 0) +
      ((Math.atan2(p.y - center.y, p.x - center.x) - initial) * 180) / Math.PI;
    if (snap) degrees = Math.round(degrees / 15) * 15;
    o.rotation = normalizeRotation(degrees);
    if (old.erasures)
      o.erasures = old.erasures.map((m) => ({
        ...m,
        points: m.points.map((q) => rotatePoint(q, center, degrees - (old.rotation || 0))),
      }));
  } else if (h.kind === 'bend') {
    o.bendX = 2 * (local.x - center.x);
    o.bendY = 2 * (local.y - center.y);
  } else if (h.kind === 'apex') {
    o.apexX = Math.max(-2, Math.min(3, (local.x - old.x) / (old.w || 1)));
    o.apexY = Math.max(-2, Math.min(0.95, (local.y - old.y) / (old.h || 1)));
  } else if (h.kind === 'skew') {
    o.skew = Math.max(0, Math.min(0.9, (local.x - old.x) / (old.w || 1)));
  } else if (h.kind === 'start' || h.kind === 'end') {
    const a = rotatePoint(old, center, old.rotation || 0);
    const b = rotatePoint({ x: old.x + old.w, y: old.y + old.h }, center, old.rotation || 0);
    const bend = rotatePoint(connectorControl(old), center, old.rotation || 0);
    const start = h.kind === 'start' ? p : a,
      end = h.kind === 'end' ? p : b;
    Object.assign(o, {
      x: start.x,
      y: start.y,
      w: end.x - start.x,
      h: end.y - start.y,
      rotation: 0,
    });
    o.bendX = bend.x - o.x - o.w / 2;
    o.bendY = bend.y - o.y - o.h / 2;
    if (!old.bendX && !old.bendY) {
      o.bendX = 0;
      o.bendY = 0;
    }
  } else if (o.type === 'text') {
    const bounds = objectBounds(old),
      anchor = { x: h.u ? old.x : bounds.right, y: h.v ? old.y : bounds.bottom };
    o.w = Math.max(80, Math.min(W, Math.abs(p.x - anchor.x)));
    o.h = Math.max(40, Math.min(H, Math.abs(p.y - anchor.y)));
    o.x = h.u ? anchor.x : anchor.x - o.w;
    o.y = h.v ? anchor.y : anchor.y - o.h;
  } else if (o.type === 'geometry' || o.type === 'image') {
    // Existing diagrams preserve their aspect ratio from the opposite corner.
    resizeFromCorner(o, old, p, h, true);
  } else resizeFromCorner(o, old, p, h, snap);
}
function resizeFromCorner(o, old, p, h, proportional) {
  const center = { x: old.x + old.w / 2, y: old.y + old.h / 2 };
  const anchor = rotatePoint(
    { x: old.x + (1 - h.u) * old.w, y: old.y + (1 - h.v) * old.h },
    center,
    old.rotation || 0
  );
  const delta = rotatePoint(
    { x: p.x - anchor.x, y: p.y - anchor.y },
    { x: 0, y: 0 },
    -(old.rotation || 0)
  );
  let w = Math.max(10, Math.min(W, Math.abs(delta.x))),
    height = Math.max(10, Math.min(H, Math.abs(delta.y)));
  if (proportional) {
    const scale = Math.min(w / (Math.abs(old.w) || 1), height / (Math.abs(old.h) || 1));
    w = Math.abs(old.w) * scale;
    height = Math.abs(old.h) * scale;
  }
  resizeShape(o, old, w, height);
  const nextAnchor = rotatePoint(
    { x: o.x + (1 - h.u) * o.w, y: o.y + (1 - h.v) * o.h },
    { x: o.x + o.w / 2, y: o.y + o.h / 2 },
    o.rotation || 0
  );
  const dx = anchor.x - nextAnchor.x,
    dy = anchor.y - nextAnchor.y;
  o.x += dx;
  o.y += dy;
  if (o.erasures)
    o.erasures.forEach((m) =>
      m.points.forEach((q) => {
        q.x += dx;
        q.y += dy;
      })
    );
}
function changeRotation(degrees) {
  if (!selected || !canTransform(selected) || !Number.isFinite(degrees)) return;
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
function resizeShape(o, old, w, h) {
  const sx = Math.abs(old.w) > 0 ? w / Math.abs(old.w) : 1;
  const sy = Math.abs(old.h) > 0 ? h / Math.abs(old.h) : 1;
  if (old.bendX !== undefined) o.bendX = old.bendX * sx;
  if (old.bendY !== undefined) o.bendY = old.bendY * sy;
  o.w = (old.w < 0 ? -1 : 1) * w;
  o.h = (old.h < 0 ? -1 : 1) * h;
  o.x = old.x;
  o.y = old.y;
  if (old.erasures) {
    const center = { x: old.x + old.w / 2, y: old.y + old.h / 2 };
    const nextCenter = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    o.erasures = old.erasures.map((mask) => ({
      ...mask,
      radius: mask.radius * Math.sqrt(sx * sy),
      points: mask.points.map((p) => {
        const local = rotatePoint(p, center, -(old.rotation || 0));
        return rotatePoint(
          { x: old.x + (local.x - old.x) * sx, y: old.y + (local.y - old.y) * sy },
          nextCenter,
          old.rotation || 0
        );
      }),
    }));
  }
}
$('shape-rotation').onchange = (e) => changeRotation(+e.target.value);
$('shape-rotate-left').onclick = () => changeRotation((selected?.rotation || 0) - 15);
$('shape-rotate-right').onclick = () => changeRotation((selected?.rotation || 0) + 15);
$('apply-shape-size').onclick = () => {
  const w = +$('shape-width').value,
    h = +$('shape-height').value;
  if (!isEditableShape(selected)) return;
  if (
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w < 0 ||
    h < 0 ||
    w > W ||
    h > H ||
    Math.max(w, h) < 10 ||
    (!['arrow', 'line'].includes(selected.type) && Math.min(w, h) < 10)
  ) {
    toast('Choose shape dimensions from 10 to the board size. Arrows may have one zero dimension.');
    return;
  }
  checkpoint();
  resizeShape(selected, clone(selected), w, h);
  syncSelection();
  render();
  thumbnails();
};
function resizeByPointer(o, old, p) {
  const center = { x: old.x + old.w / 2, y: old.y + old.h / 2 },
    anchor = rotatePoint({ x: old.x, y: old.y }, center, old.rotation || 0),
    corner = resizeCorner(old),
    dx = corner.x - anchor.x,
    dy = corner.y - anchor.y,
    factor = ((p.x - anchor.x) * dx + (p.y - anchor.y) * dy) / (dx * dx + dy * dy || 1);
  if (isEditableShape(old)) {
    const size = Math.max(Math.abs(old.w), Math.abs(old.h));
    if (!size) return;
    const scale = Math.max(
      10 / size,
      Math.min(factor, W / (Math.abs(old.w) || 1), H / (Math.abs(old.h) || 1))
    );
    resizeShape(o, old, Math.abs(old.w) * scale, Math.abs(old.h) * scale);
  } else resizeImage(o, old, old.w * factor);
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
  return (o.fontSize || 28) * (o.spacing || 1.35);
}
function syncTextControls() {
  const target = selected?.type === 'text' && page().objects.includes(selected) ? selected : null;
  const style = editingText ? textStyle : target || textStyle;
  $('text-edit-selected').hidden = !target || !!editingText;
  $('text-options').hidden = tool !== 'text' && !target && $('text-editor').hidden;
  $('text-list').value = style.list || 'none';
  $('text-align').value = style.align || 'left';
  $('text-spacing').value = style.spacing || 1.35;
  $('text-border').checked = style.border !== false;
  $('text-size').value = style.fontSize || 28;
  $('text-bold').setAttribute('aria-pressed', String(!!style.bold));
  $('text-underline').setAttribute('aria-pressed', String(!!style.underline));
  const ed = $('text-editor');
  if (!ed.hidden) {
    const scale = canvas.getBoundingClientRect().width / W;
    ed.style.textAlign = textStyle.align || 'left';
    ed.style.lineHeight = textStyle.spacing || 1.35;
    ed.style.padding = 12 * scale + 'px';
    ed.style.fontSize = textStyle.fontSize * scale + 'px';
    ed.style.fontWeight = textStyle.bold ? 'bold' : 'normal';
    ed.style.textDecoration = textStyle.underline ? 'underline' : 'none';
  }
}
function formatText(change) {
  const target = selected?.type === 'text' && page().objects.includes(selected) ? selected : null;
  if (target && !editingText) {
    checkpoint();
    Object.assign(target, change);
    textStyle = {
      fontSize: target.fontSize || 28,
      bold: !!target.bold,
      underline: !!target.underline,
      list: target.list || 'none',
      align: target.align || 'left',
      spacing: target.spacing || 1.35,
      border: target.border !== false,
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
// Keep browser context menus out of the drawing area.
boardStage.addEventListener('contextmenu', (event) => event.preventDefault());
function layoutBoard() {
  positionPanelToggles();
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
