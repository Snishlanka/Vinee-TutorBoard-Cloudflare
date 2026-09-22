const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('app.js', 'utf8');
function setup() {
  const elements = {},
    calls = [],
    page = { objects: [] };
  const context = {
    W: 2880,
    H: 1080,
    selected: null,
    shapeClipboard: null,
    shapeFillTiles: new Map(),
    tool: 'move',
    Math,
    Number,
    page: () => page,
    $: (id) => (elements[id] ||= { value: 0, hidden: false }),
    clone: (o) => JSON.parse(JSON.stringify(o)),
    syncTextControls() {},
    render() {},
    checkpoint: () => calls.push('checkpoint'),
    thumbnails: () => calls.push('change'),
    toast: (message) => calls.push(message),
    boardColors: { white: '#fff' },
    images: new Map(),
    ctx: { measureText: (s) => ({ width: s.length * 10 }) },
    canvas: { getBoundingClientRect: () => ({ width: 1440 }) },
    textFont: () => '',
    textLineHeight: () => 30,
    TutorMath: { valid: () => true },
    eraseLayer: null,
  };
  vm.createContext(context);
  for (const [start, end] of [
    ['function isEditableShape(', 'const boardColors ='],
    ['function segmentDist(', 'function erase('],
    ['function validObject(', "$('lesson-file').onchange"],
    ['function rotatePoint(', "$('export-pdf').onclick"],
  ])
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), context);
  return { c: context, elements, calls, page };
}
const shape = (type, w = 200, h = 100) => ({
  type,
  x: 100,
  y: 100,
  w,
  h,
  width: 3,
  color: '#123456',
  rotation: 0,
});
test('all requested shapes validate through JSON, rotate with history, and expose shape controls', () => {
  for (const type of ['rect', 'triangle', 'parallelogram', 'arrow']) {
    const { c, elements, calls, page } = setup();
    const o = shape(type);
    page.objects.push(o);
    c.selected = o;
    c.changeRotation(90);
    assert.equal(o.rotation, 90);
    assert.equal(elements['shape-edit'].hidden, false);
    assert.deepEqual(calls, ['checkpoint', 'change']);
    assert.equal(c.validObject(JSON.parse(JSON.stringify(o))), true);
    assert.equal(c.validObject({ ...o, rotation: NaN }), false);
    assert.equal(c.validObject({ ...o, rotation: '90' }), false);
  }
});
test('corner resize preserves the rotated anchor and handles negative and zero dimensions', () => {
  for (const type of ['rect', 'triangle', 'parallelogram', 'arrow']) {
    for (const [w, h] of [
      [200, 100],
      [-200, -100],
      [200, -100],
      ...(type === 'arrow'
        ? [
            [200, 0],
            [0, -200],
          ]
        : []),
    ]) {
      const { c } = setup();
      const old = { ...shape(type, w, h), rotation: 37 };
      const o = { ...old };
      const center = { x: old.x + w / 2, y: old.y + h / 2 };
      const anchor = c.rotatePoint(old, center, 37);
      const corner = c.resizeCorner(old);
      c.resizeByPointer(o, old, {
        x: anchor.x + 2 * (corner.x - anchor.x),
        y: anchor.y + 2 * (corner.y - anchor.y),
      });
      assert.ok(Math.abs(o.w - 2 * w) < 1e-7);
      assert.ok(Math.abs(o.h - 2 * h) < 1e-7);
      const next = c.rotatePoint(o, { x: o.x + o.w / 2, y: o.y + o.h / 2 }, 37);
      assert.ok(Math.hypot(next.x - anchor.x, next.y - anchor.y) < 1e-7);
      assert.equal(c.validObject(o), true);
    }
  }
});
test('rotated arrows have hittable shafts and bounds include arrowheads', () => {
  const { c } = setup();
  const o = { ...shape('arrow', 200, 0), rotation: 90 };
  assert.equal(c.hit(o, { x: 200, y: 170 }), true);
  assert.equal(c.hit(o, { x: 400, y: 100 }), false);
  const b = c.objectBounds(o),
    center = { x: 200, y: 100 };
  for (const p of c.arrowPoints(o).map((p) => c.rotatePoint(p, center, 90))) {
    assert.ok(p.x >= b.x && p.x <= b.right && p.y >= b.y && p.y <= b.bottom);
  }
});
test('erasure masks follow shape rotation and proportional resizing', () => {
  const { c, page } = setup();
  const o = shape('rect');
  o.erasures = [{ radius: 5, points: [{ x: 120, y: 130 }] }];
  page.objects.push(o);
  c.selected = o;
  c.changeRotation(90);
  const expected = c.rotatePoint({ x: 120, y: 130 }, { x: 200, y: 150 }, 90);
  assert.equal(o.erasures[0].points[0].x, expected.x);
  const old = JSON.parse(JSON.stringify(o));
  c.resizeShape(o, old, 400, 200);
  assert.equal(o.erasures[0].radius, 10);
  assert.ok(Number.isFinite(o.erasures[0].points[0].y));
});
test('new shapes draw paths under rotation for board and export renderer', () => {
  for (const type of ['parallelogram', 'arrow']) {
    const { c } = setup();
    const calls = [];
    const canvas = new Proxy(
      {},
      {
        get:
          (_, name) =>
          (...args) => {
            calls.push([name, ...args]);
          },
      }
    );
    c.drawObject(canvas, { ...shape(type), rotation: 45 }, 'white');
    assert.ok(calls.some((call) => call[0] === 'rotate'));
    assert.ok(calls.filter((call) => call[0] === 'lineTo').length >= 3);
    assert.ok(calls.some((call) => call[0] === 'stroke'));
  }
});

test('curved connector hits, bounds and tangent arrowhead follow the bend', () => {
  const { c } = setup(),
    o = { ...shape('arrow', 200, 0), bendX: 0, bendY: 200 };
  assert.equal(c.hit(o, { x: 200, y: 200 }), true);
  assert.equal(c.hit(o, { x: 200, y: 100 }), false);
  const b = c.objectBounds(o);
  for (let i = 0; i <= 100; i++) {
    const p = c.connectorPoint(o, i / 100);
    assert.ok(p.x >= b.x && p.x <= b.right && p.y >= b.y && p.y <= b.bottom);
  }
  const [tip, left, right] = c.arrowPoints(o);
  assert.ok((left.y + right.y) / 2 > tip.y);
  assert.equal(c.validObject({ ...o, bendY: Infinity }), false);
});
test('on-object controls bend, slant, rotate and resize without changing opposite anchor', () => {
  const { c } = setup();
  let old = { ...shape('arrow', 200, 0), rotation: 90 },
    target = { ...old };
  c.dragControl({ original: old, target, handle: { kind: 'bend' } }, { x: 150, y: 100 }, false);
  assert.ok(Math.abs(target.bendY - 100) < 1e-8);
  old = shape('rect');
  target = { ...old };
  c.dragControl({ original: old, target, handle: { kind: 'skew' } }, { x: 160, y: 100 }, false);
  assert.equal(target.skew, 0.3);
  for (const [u, v] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]) {
    old = { ...shape('rect'), rotation: 37 };
    target = { ...old };
    const center = { x: 200, y: 150 };
    const anchor = c.rotatePoint(
      { x: old.x + (1 - u) * old.w, y: old.y + (1 - v) * old.h },
      center,
      37
    );
    const corner = c.rotatePoint({ x: old.x + u * old.w, y: old.y + v * old.h }, center, 37);
    c.dragControl(
      { original: old, target, handle: { kind: 'corner', u, v } },
      { x: anchor.x + 2 * (corner.x - anchor.x), y: anchor.y + 2 * (corner.y - anchor.y) },
      false
    );
    const next = c.rotatePoint(
      { x: target.x + (1 - u) * target.w, y: target.y + (1 - v) * target.h },
      { x: target.x + target.w / 2, y: target.y + target.h / 2 },
      37
    );
    assert.ok(Math.hypot(next.x - anchor.x, next.y - anchor.y) < 1e-7);
    assert.ok(Math.abs(target.w - 400) < 1e-7);
  }
});
test('text boxes wrap long words and preserve list layout through lesson validation', () => {
  const { c } = setup();
  const o = {
    ...shape('text', 80, 80),
    text: 'abcdefghijk\nsecond',
    list: 'number',
    align: 'center',
    spacing: 1.5,
    fontSize: 28,
  };
  const lines = c.textLayout(o, c.ctx);
  assert.ok(lines.length > 2);
  assert.ok(lines.every((line) => line.width <= 80));
  assert.ok(lines[0].text.startsWith('1. '));
  assert.equal(c.validObject(JSON.parse(JSON.stringify(o))), true);
  assert.equal(c.validObject({ ...o, spacing: NaN }), false);
  assert.equal(c.validObject({ ...o, list: 'invalid' }), false);
});
test('freehand smoothing emits quadratic curves and retains both stroke endpoints', () => {
  const { c } = setup(),
    calls = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_, key) =>
        (...args) =>
          calls.push([key, ...args]),
    }
  );
  c.smoothStroke(ctx, [
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 20, y: 0 },
    { x: 30, y: 20 },
  ]);
  assert.deepEqual(calls[0], ['moveTo', 0, 0]);
  assert.equal(calls.filter((x) => x[0] === 'quadraticCurveTo').length, 2);
  assert.deepEqual(calls.at(-1), ['lineTo', 30, 20]);
});

test('triangle top vertex moves in local coordinates and survives transforms and validation', () => {
  const { c } = setup();
  for (const [w, h] of [
    [200, 100],
    [-200, -100],
  ]) {
    const old = { ...shape('triangle', w, h), rotation: 37 },
      target = { ...old };
    const center = { x: old.x + w / 2, y: old.y + h / 2 };
    const position = c.rotatePoint({ x: old.x - w / 2, y: old.y + h / 4 }, center, 37);
    c.dragControl({ original: old, target, handle: { kind: 'apex' } }, position, false);
    assert.ok(Math.abs(target.apexX + 0.5) < 1e-8);
    assert.ok(Math.abs(target.apexY - 0.25) < 1e-8);
    const vertex = c.selectionHandles(target).find((h) => h.kind === 'apex');
    assert.ok(Math.hypot(vertex.x - position.x, vertex.y - position.y) < 1e-7);
    assert.equal(c.hit(target, position), true);
    const bounds = c.objectBounds(target);
    assert.ok(
      position.x >= bounds.x &&
        position.x <= bounds.right &&
        position.y >= bounds.y &&
        position.y <= bounds.bottom
    );
    assert.equal(c.validObject(JSON.parse(JSON.stringify(target))), true);
    assert.equal(c.validObject({ ...target, apexX: Infinity }), false);
    assert.equal(c.validObject({ ...target, apexY: 1 }), false);
    c.resizeShape(target, { ...target }, 400, 200);
    assert.ok(Math.abs(target.apexX + 0.5) < 1e-8);
  }
});
test('connector controls omit rotation and selection does not draw a surrounding box', () => {
  const { c } = setup(),
    calls = [];
  c.ctx = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args) =>
          calls.push([name, ...args]),
    }
  );
  for (const type of ['line', 'arrow']) {
    c.selected = shape(type);
    assert.equal(
      c.selectionHandles(c.selected).some((h) => h.kind === 'rotate'),
      false
    );
    c.drawSelection();
  }
  assert.equal(
    calls.some((call) => call[0] === 'strokeRect'),
    false
  );
  assert.equal(
    calls.some((call) => call[0] === 'setLineDash' && call[1].length),
    false
  );
});
test('text box border can be hidden without changing layout or validation', () => {
  const { c } = setup(),
    calls = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, name) =>
        name === 'measureText'
          ? (s) => ({ width: s.length * 10 })
          : (...args) => calls.push([name, ...args]),
    }
  );
  const o = { ...shape('text'), box: true, text: 'Hello world', fontSize: 28, border: true };
  c.drawObject(ctx, o, 'white');
  assert.ok(calls.some((call) => call[0] === 'strokeRect'));
  const layout = JSON.stringify(c.textLayout(o, ctx));
  calls.length = 0;
  o.border = false;
  c.drawObject(ctx, o, 'white');
  assert.equal(
    calls.some((call) => call[0] === 'strokeRect'),
    false
  );
  assert.equal(JSON.stringify(c.textLayout(o, ctx)), layout);
  assert.equal(c.validObject(o), true);
  assert.equal(c.validObject({ ...o, border: 'false' }), false);
});

test('solid fills render before outlines and validate only for closed shapes', () => {
  const { c } = setup();
  for (const type of ['rect', 'circle', 'triangle', 'parallelogram']) {
    const calls = [];
    const context = new Proxy(
      {},
      {
        get:
          (_, key) =>
          (...args) =>
            calls.push([key, ...args]),
      }
    );
    const o = { ...shape(type), rotation: 37, fill: '#facc15' };
    c.drawObject(context, o, 'white');
    assert.ok(
      calls.findIndex((call) => call[0] === 'fill') <
        calls.findIndex((call) => call[0] === 'stroke')
    );
    assert.equal(c.validObject(JSON.parse(JSON.stringify(o))), true);
    calls.length = 0;
    c.drawObject(context, { ...o, fill: null }, 'white');
    assert.equal(
      calls.some((call) => call[0] === 'fill'),
      false
    );
  }
  assert.equal(c.validObject({ ...shape('line'), fill: '#facc15' }), false);
  assert.equal(c.validObject({ ...shape('rect'), fill: 'url(bad)' }), false);
});
test('fill changes checkpoint once and clearing restores no-fill', () => {
  const { c, page, calls } = setup();
  c.selected = shape('rect');
  page.objects.push(c.selected);
  c.setShapeFill('#facc15');
  c.setShapeFill('#facc15');
  assert.equal(c.selected.fill, '#facc15');
  assert.deepEqual(calls, ['checkpoint', 'change']);
  c.setShapeFill(null);
  assert.equal(c.selected.fill, null);
  c.setShapeFill('bad');
  assert.deepEqual(calls, ['checkpoint', 'change', 'checkpoint', 'change']);
});
test('small visual controls retain wide hit targets, with orientation-aware cursors and rotation icon', () => {
  const { c } = setup();
  const o = shape('rect');
  const corner = c.selectionHandles(o).find((h) => h.kind === 'corner' && h.u === 1 && h.v === 1);
  assert.equal(c.controlAt(o, { x: corner.x + 10, y: corner.y }).kind, 'corner');
  assert.equal(c.controlCursor(corner, o), 'nwse-resize');
  assert.equal(c.controlCursor(corner, { ...o, rotation: 90 }), 'nesw-resize');
  assert.equal(c.controlCursor({ kind: 'bend' }, o), 'move');
  assert.ok(c.controlCursor({ kind: 'rotate' }, o).startsWith('url('));
  const calls = [];
  c.ctx = new Proxy(
    {},
    {
      get:
        (_, key) =>
        (...args) =>
          calls.push([key, ...args]),
    }
  );
  c.selected = o;
  c.drawSelection();
  const rect = calls.find((call) => call[0] === 'rect');
  assert.equal(rect[3], 8); // 4 display pixels at the test canvas scale.
  assert.ok(calls.some((call) => call[0] === 'fillText' && call[1] === '\u21bb'));
});

test('diagonal fill styles tile in opposite directions and preserve outline paths', () => {
  const { c } = setup(),
    tileCalls = [];
  c.document = {
    createElement: () => ({
      getContext: () =>
        new Proxy(
          {},
          {
            get:
              (_, name) =>
              (...args) =>
                tileCalls.push([name, ...args]),
          }
        ),
    }),
  };
  const fills = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, name) =>
        name === 'createPattern'
          ? (tile, repeat) => {
              fills.push([tile, repeat]);
              return 'pattern';
            }
          : () => {},
    }
  );
  for (const pattern of ['forward', 'backward']) {
    tileCalls.length = 0;
    const o = { ...shape('triangle'), fill: '#facc15', fillPattern: pattern };
    c.drawObject(ctx, o, 'white');
    const start = tileCalls.find((call) => call[0] === 'moveTo'),
      end = tileCalls.find((call) => call[0] === 'lineTo');
    assert.equal(start[2], pattern === 'forward' ? 18 : 0);
    assert.equal(end[2], pattern === 'forward' ? 0 : 18);
    assert.equal(c.validObject(JSON.parse(JSON.stringify(o))), true);
  }
  assert.equal(fills.length, 2);
  assert.ok(fills.every(([, repeat]) => repeat === 'repeat'));
  assert.equal(c.validObject({ ...shape('rect'), fillPattern: 'bad' }), false);
});
