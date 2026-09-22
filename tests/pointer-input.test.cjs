const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('app.js', 'utf8');
function setup() {
  const elements = {},
    board = { objects: [], undo: [], redo: [] };
  const c = {
    activePointer: null,
    inputMode: 'auto',
    penSeen: false,
    pointerSnapshot: null,
    gesture: null,
    preview: null,
    selected: null,
    tool: 'pen',
    color: '#000000',
    width: 3,
    Math,
    Number,
    Map,
    clone: (o) => JSON.parse(JSON.stringify(o)),
    page: () => board,
    $: (id) => (elements[id] ||= { value: 'auto', textContent: '' }),
    canvas: {
      addEventListener() {},
      setPointerCapture() {},
      hasPointerCapture() {
        return false;
      },
      style: {},
    },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    point: (e) => ({ x: e.clientX, y: e.clientY }),
    commitText() {},
    syncSelection() {},
    refreshCursor() {},
    updateHoverCursor() {},
    controlAt: () => null,
    hit: () => false,
    render() {},
    thumbnails() {},
    checkpoint() {
      board.undo.push(c.clone(board.objects));
      board.redo = [];
    },
    isEditableShape() {
      return false;
    },
  };
  vm.createContext(c);
  vm.runInContext(
    source.slice(source.indexOf('// A stroke belongs'), source.indexOf('function commitText()')),
    c
  );
  return { c, board, elements };
}
function event(id, type, x = 10, y = 10, primary = true) {
  return {
    pointerId: id,
    pointerType: type,
    isPrimary: primary,
    button: 0,
    clientX: x,
    clientY: y,
    preventDefault() {},
  };
}
test('secondary touches cannot append to or finish the active finger stroke', () => {
  const { c, board } = setup();
  c.canvas.onpointerdown(event(1, 'touch'));
  c.canvas.onpointerdown(event(2, 'touch', 50, 50, false));
  c.canvas.onpointermove(event(2, 'touch', 80, 80, false));
  c.canvas.onpointerup(event(2, 'touch', 80, 80, false));
  assert.equal(c.preview.points.length, 1);
  assert.equal(c.activePointer.id, 1);
  c.canvas.onpointerup(event(1, 'touch', 30, 40));
  assert.equal(board.objects.length, 1);
  assert.equal(board.objects[0].points.at(-1).x, 30);
  assert.equal(c.activePointer, null);
});
test('stylus detection rolls back palm-first stroke and locks out subsequent touches', () => {
  const { c, board } = setup();
  board.redo.push(['saved redo']);
  c.canvas.onpointerdown(event(1, 'touch'));
  c.canvas.onpointermove(event(1, 'touch', 40, 40));
  c.canvas.onpointerdown(event(2, 'pen'));
  assert.equal(c.activePointer.id, 2);
  assert.equal(board.undo.length, 1);
  c.canvas.onpointerup(event(1, 'touch'));
  assert.equal(c.activePointer.id, 2);
  c.canvas.onpointerup(event(2, 'pen', 50, 60));
  c.canvas.onpointerdown(event(3, 'touch'));
  assert.equal(c.activePointer, null);
  assert.equal(board.objects.length, 1);
  assert.equal(board.objects[0].points[0].x, 10);
});
test('pen-only rejects first palm, while finger mode explicitly restores touch', () => {
  const { c, elements } = setup();
  elements['input-mode'].onchange({ target: { value: 'pen' } });
  c.canvas.onpointerdown(event(1, 'touch'));
  assert.equal(c.activePointer, null);
  c.canvas.onpointerdown(event(2, 'pen'));
  assert.equal(c.activePointer.id, 2);
  c.canvas.onpointerup(event(2, 'pen'));
  elements['input-mode'].onchange({ target: { value: 'touch' } });
  c.canvas.onpointerdown(event(3, 'touch'));
  assert.equal(c.activePointer.id, 3);
});
test('pointer cancellation restores history and an empty coalesced list still draws', () => {
  const { c, board } = setup();
  board.redo.push(['saved']);
  c.canvas.onpointerdown(event(1, 'pen'));
  c.canvas.onpointermove({ ...event(1, 'pen', 40, 40), getCoalescedEvents: () => [] });
  assert.equal(c.preview.points.length, 2);
  c.canvas.onpointercancel(event(1, 'pen'));
  assert.equal(board.objects.length, 0);
  assert.equal(board.undo.length, 0);
  assert.equal(board.redo.length, 1);
  assert.equal(c.activePointer, null);
});

for (const tool of ['pen', 'highlighter', 'rect', 'circle', 'triangle', 'line', 'arrow']) {
  test(`${tool} remains active after drawing successive objects`, () => {
    const { c, board } = setup();
    c.tool = tool;
    for (let id = 1; id <= 2; id++) {
      c.canvas.onpointerdown(event(id, 'mouse', 100 * id, 100));
      c.canvas.onpointerup(event(id, 'mouse', 100 * id + 50, 150));
      assert.equal(c.tool, tool);
      assert.equal(board.objects.length, id);
      assert.equal(c.selected, board.objects.at(-1));
    }
  });
}
for (const type of ['pen', 'line', 'rect', 'text', 'image', 'graph', 'geometry']) {
  test(`direct dragging moves ${type} while retaining the drawing tool`, () => {
    const { c, board } = setup();
    const object =
      type === 'pen'
        ? {
            type,
            points: [
              { x: 10, y: 10 },
              { x: 20, y: 20 },
            ],
          }
        : { type, x: 10, y: 10, w: 100, h: 100 };
    board.objects.push(object);
    c.hit = () => true;
    c.canvas.onpointerdown(event(1, 'mouse'));
    assert.equal(c.gesture.kind, 'move');
    assert.equal(c.canvas.style.cursor, 'grabbing');
    c.canvas.onpointerup(event(1, 'mouse', 40, 50));
    assert.equal(c.tool, 'pen');
    assert.equal(board.objects.length, 1);
    assert.equal((object.points?.[0] || object).x, 40);
    assert.equal((object.points?.[0] || object).y, 50);
    assert.equal(board.undo.length, 1);
  });
}
test('Alt draws over an object and eraser still erases instead of moving', () => {
  const { c, board } = setup();
  board.objects.push({ type: 'rect', x: 0, y: 0, w: 100, h: 100 });
  c.hit = () => true;
  c.canvas.onpointerdown({ ...event(1, 'mouse'), altKey: true });
  assert.equal(c.gesture.kind, 'pen');
  c.canvas.onpointerup({ ...event(1, 'mouse', 40, 50), altKey: true });
  assert.equal(board.objects.length, 2);
  let erased = false;
  c.erase = () => {
    erased = true;
  };
  c.tool = 'eraser';
  c.canvas.onpointerdown(event(2, 'mouse'));
  assert.equal(c.gesture.kind, 'eraser');
  assert.equal(erased, true);
});
