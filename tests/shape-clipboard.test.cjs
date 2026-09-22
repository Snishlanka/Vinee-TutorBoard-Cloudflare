const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('app.js', 'utf8');
function setup() {
  const elements = {},
    listeners = {},
    pages = [
      { objects: [], undo: [], redo: [] },
      { objects: [], undo: [], redo: [] },
    ];
  const c = {
    W: 2880,
    H: 1080,
    Math,
    Number,
    selected: null,
    activePointer: null,
    tool: 'move',
    shapeClipboard: null,
    shapePasteCount: 0,
    SHAPE_CLIPBOARD_FORMAT: 'vinee-tutorboard-object',
    index: 0,
    $: (id) => (elements[id] ||= {}),
    clone: (o) => JSON.parse(JSON.stringify(o)),
    navigator: {},
    document: { querySelector: () => null, addEventListener: (name, fn) => (listeners[name] = fn) },
    commitText() {},
    end() {},
    syncSelection() {},
    render() {},
    thumbnails() {},
    toast() {},
    setTool(tool) {
      c.tool = tool;
      c.selected = null;
    },
    page: () => pages[c.index],
    checkpoint: () => {
      c.page().undo.push(c.clone(c.page().objects));
      c.page().redo = [];
    },
  };
  vm.createContext(c);
  for (const [start, end] of [
    ['function isEditableShape(', 'const boardColors ='],
    ['function rotatePoint(', 'function normalizeRotation('],
    ['function segmentDist(', 'function erase('],
    ['function validObject(', "$('lesson-file').onchange"],
    ['// Board-object clipboard', 'function deleteSelected()'],
  ])
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), c);
  return { c, pages, elements, listeners };
}
const arrow = () => ({
  type: 'arrow',
  x: 100,
  y: 100,
  w: 200,
  h: 100,
  color: '#171717',
  width: 3,
  bendX: 20,
  bendY: 80,
  erasures: [{ radius: 5, points: [{ x: 110, y: 110 }] }],
});
function event(text = '', blocked = false) {
  const data = { 'text/plain': text };
  return {
    target: { closest: () => blocked },
    defaultPrevented: false,
    clipboardData: {
      getData: (type) => data[type] || '',
      setData: (type, value) => (data[type] = value),
    },
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}
test('copy/paste keeps an independent snapshot including bends and translated erasures across pages', () => {
  const { c, pages } = setup();
  const original = arrow();
  pages[0].objects.push(original);
  c.selected = original;
  const copy = event();
  assert.equal(c.copySelectedShape(copy), true);
  assert.equal(copy.defaultPrevented, true);
  original.bendY = 0;
  original.erasures[0].points[0].x = 500;
  c.index = 1;
  const paste = event(copy.clipboardData.getData('text/plain'));
  c.pasteBoardShape(paste);
  assert.equal(paste.defaultPrevented, true);
  assert.equal(pages[1].objects.length, 1);
  assert.equal(pages[1].undo.length, 1);
  const inserted = pages[1].objects[0];
  assert.equal(inserted.bendY, 80);
  assert.equal(inserted.x, 124);
  assert.equal(inserted.erasures[0].points[0].x, 134);
  c.pasteShape();
  assert.equal(pages[1].objects[1].x, 148);
  assert.equal(original.x, 100);
  inserted.bendX = 900;
  assert.equal(c.shapeClipboard.bendX, 20);
});
test('shape clipboard preserves ordinary form and image paste and rejects malformed data', () => {
  const { c, pages } = setup();
  const o = arrow();
  pages[0].objects.push(o);
  c.selected = o;
  assert.equal(c.copySelectedShape(event('', true)), false);
  for (const value of [
    'plain text',
    '{bad',
    JSON.stringify({
      format: 'vinee-tutorboard-object',
      version: 1,
      object: { ...o, fill: 'red' },
    }),
  ]) {
    const paste = event(value);
    c.pasteBoardShape(paste);
    assert.equal(paste.defaultPrevented, false);
  }
  const valid = c.shapeClipboardText(o);
  let paste = event(valid, true);
  c.pasteBoardShape(paste);
  assert.equal(paste.defaultPrevented, false);
  paste = event(valid);
  paste.defaultPrevented = true;
  c.pasteBoardShape(paste);
  assert.equal(pages[0].objects.length, 1);
  c.document.querySelector = () => ({});
  assert.equal(c.copySelectedShape(event()), false);
});
test('paste keeps filled shapes on board and does not lose fill or geometry', () => {
  const { c, pages } = setup();
  const o = {
    ...arrow(),
    type: 'rect',
    x: 2700,
    y: 900,
    w: 170,
    h: 170,
    fill: '#facc15',
    skew: 0.3,
  };
  assert.equal(c.pasteShape(o), true);
  const inserted = pages[0].objects[0];
  assert.equal(inserted.fill, o.fill);
  assert.equal(inserted.skew, o.skew);
  const bounds = c.objectBounds(inserted);
  assert.ok(bounds.right <= 2880 && bounds.bottom <= 1080);
  assert.equal(c.validObject(inserted), true);
});
