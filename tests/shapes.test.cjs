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
    ctx: { measureText: () => ({ width: 100 }) },
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
