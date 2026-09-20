const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('app.js', 'utf8');
function setup(count = 3, index = 1) {
  const elements = {},
    events = [];
  const c = {
    pages: Array.from({ length: count }, (_, i) => ({
      id: i,
      background: 'grid',
      boardColor: 'green',
      objects: [{ id: i }],
      undo: [i],
      redo: [],
    })),
    index,
    $: (id) =>
      (elements[id] ||= {
        hidden: false,
        setAttribute(name, value) {
          this[name] = value;
        },
      }),
    end: () => events.push('end'),
    commitText: () => events.push('commit'),
    newPage: (settings) => ({
      background: settings.background,
      boardColor: settings.boardColor,
      objects: [],
      undo: [],
      redo: [],
    }),
    toast: () => {},
    boardLayoutReady: true,
    layoutBoard: () => events.push('layout'),
  };
  c.page = () => c.pages[c.index];
  c.update = () => {
    events.push('update');
    c.syncPageNavigation();
  };
  vm.createContext(c);
  for (const [start, end] of [
    ['function add()', "$('add').onclick"],
    ['function togglePaperControls()', "$('previous-page').onclick"],
  ]) {
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), c);
  }
  return { c, elements, events };
}
test('new pages insert immediately after the active page and inherit paper settings', () => {
  for (const index of [0, 1, 2]) {
    const { c, events } = setup(3, index),
      old = [...c.pages];
    c.add();
    assert.equal(c.index, index + 1);
    assert.equal(c.pages.length, 4);
    assert.equal(c.page().background, 'grid');
    assert.equal(c.page().boardColor, 'green');
    assert.equal(c.page().objects.length, 0);
    assert.deepEqual(
      c.pages.filter((p) => p !== c.page()),
      old
    );
    assert.deepEqual(events, ['end', 'commit', 'update']);
  }
});
test('reorder keeps the active page, its content and history while updating its position', () => {
  const { c, events } = setup(),
    active = c.page();
  c.moveCurrentPage(-1);
  assert.equal(c.index, 0);
  assert.equal(c.page(), active);
  assert.deepEqual(
    c.pages.map((p) => p.id),
    [1, 0, 2]
  );
  c.moveCurrentPage(1);
  assert.equal(c.index, 1);
  assert.equal(c.page(), active);
  assert.deepEqual(
    c.pages.map((p) => p.id),
    [0, 1, 2]
  );
  assert.deepEqual(active.undo, [1]);
  assert.equal(active.objects[0].id, 1);
  assert.equal(events.filter((e) => e === 'update').length, 2);
});
test('first/last/single-page boundaries disable reorder and reject invalid moves', () => {
  for (const [count, index, offset] of [
    [3, 0, -1],
    [3, 2, 1],
    [1, 0, -1],
    [1, 0, 1],
  ]) {
    const { c, elements, events } = setup(count, index);
    c.syncPageNavigation();
    assert.equal(elements['move-page-earlier'].disabled, index === 0);
    assert.equal(elements['move-page-later'].disabled, index === count - 1);
    const old = [...c.pages];
    c.moveCurrentPage(offset);
    assert.deepEqual(c.pages, old);
    assert.equal(events.length, 0);
  }
});
test('paper toggle collapses the whole toolbar row and updates accessibility/layout without altering lessons', () => {
  const { c, elements, events } = setup();
  const old = [...c.pages];
  c.togglePaperControls();
  assert.equal(elements['paper-controls'].hidden, true);
  assert.equal(elements['board-controls'].hidden, true);
  assert.equal(elements['toggle-paper']['aria-expanded'], 'false');
  assert.equal(elements['toggle-paper'].textContent, 'Show paper controls');
  c.togglePaperControls();
  assert.equal(elements['paper-controls'].hidden, false);
  assert.equal(elements['board-controls'].hidden, false);
  assert.equal(elements['toggle-paper']['aria-expanded'], 'true');
  assert.equal(elements['toggle-paper'].textContent, 'Hide paper controls');
  assert.deepEqual(c.pages, old);
  assert.deepEqual(events, ['layout', 'layout']);
});
