'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function editorHarness() {
  const listeners = {};
  const editor = { hidden: false, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const place = { hidden: false };
  let commits = 0;
  const context = vm.createContext({
    $: (id) => id === 'text-editor' ? editor : place,
    editingText: {}, render: () => {}, commitText: () => { commits++; },
  });
  const source = fs.readFileSync('app.js', 'utf8');
  const start = source.indexOf('let textComposing = false;');
  const end = source.indexOf("$('text-editor').onblur", start);
  vm.runInContext(source.slice(start, end), context);
  return { editor, listeners, commits: () => commits };
}

test('IME candidate keys leave the editor open and do not place text', () => {
  for (const mode of ['composition', 'isComposing', 'legacy']) {
    const h = editorHarness();
    if (mode === 'composition') h.listeners.compositionstart();
    for (const key of ['Escape', 'Enter', 'Tab', 'ArrowDown', ' ']) {
      h.editor.onkeydown({ key, ctrlKey: true, isComposing: mode === 'isComposing',
        keyCode: mode === 'legacy' ? 229 : 0,
        preventDefault: () => assert.fail('IME key must retain native behavior') });
    }
    assert.equal(h.editor.hidden, false);
    assert.equal(h.commits(), 0);
  }
});

test('normal editor shortcuts resume after composition ends', () => {
  const h = editorHarness();
  h.listeners.compositionstart();
  h.listeners.compositionend();
  let prevented = false;
  h.editor.onkeydown({ key: 'Enter', ctrlKey: true, preventDefault: () => { prevented = true; } });
  assert.equal(h.commits(), 1);
  assert.equal(prevented, true);
  h.editor.onkeydown({ key: 'Escape' });
  assert.equal(h.editor.hidden, true);
});
