const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const app = fs.readFileSync('app.js', 'utf8');
function setup({ failRead = false, failImage = false, changePage = false } = {}) {
  const original = { objects: [] },
    other = { objects: [] };
  let active = original;
  const messages = [],
    calls = [],
    elements = {};
  const context = {
    page: () => active,
    color: '#000000',
    width: 3,
    selected: null,
    $: (id) => (elements[id] ||= {}),
    toast: (message) => messages.push(message),
    end: () => {},
    commitText: () => {},
    checkpoint: () => calls.push('checkpoint'),
    setTool: (tool) => calls.push(tool),
    syncSelection: () => {},
    render: () => {},
    thumbnails: () => calls.push('changed'),
    document: {
      querySelector: () => null,
      addEventListener: () => {},
      createElement: () => ({
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => 'data:image/png;base64,a',
      }),
    },
    FileReader: class {
      readAsDataURL() {
        if (failRead) this.onerror();
        else {
          this.result = 'data:image/png;base64,a';
          this.onload();
        }
      }
    },
    Image: class {
      width = 1800;
      height = 1200;
      set src(value) {
        if (changePage) active = other;
        if (failImage) this.onerror();
        else this.onload();
      }
    },
  };
  vm.createContext(context);
  vm.runInContext(
    app.slice(app.indexOf('async function insertImageFile('), app.indexOf('function download(')),
    context
  );
  return { context, original, other, messages, calls };
}
const png = { type: 'image/png', size: 100 };
test('image insertion resizes, selects Move, checkpoints, and signals autosave', async () => {
  const { context, original, calls } = setup();
  await context.insertImageFile(png);
  assert.equal(original.objects.length, 1);
  assert.equal(original.objects[0].w, 900);
  assert.equal(original.objects[0].h, 600);
  assert.equal(context.selected, original.objects[0]);
  assert.deepEqual(calls, ['checkpoint', 'move', 'changed']);
});
test('unsupported, oversized, unreadable and broken images do not change the lesson', async () => {
  for (const [options, file] of [
    [{}, { type: 'image/svg+xml', size: 10 }],
    [{}, { ...png, size: 16 * 1024 * 1024 }],
    [{ failRead: true }, png],
    [{ failImage: true }, png],
  ]) {
    const w = setup(options);
    await w.context.insertImageFile(file);
    assert.equal(w.original.objects.length, 0);
    assert.equal(w.calls.length, 0);
    assert.equal(w.messages.length, 1);
  }
});
test('changing the page during image loading never inserts on the wrong page', async () => {
  const w = setup({ changePage: true });
  await w.context.insertImageFile(png);
  assert.equal(w.original.objects.length, 0);
  assert.equal(w.other.objects.length, 0);
  assert.match(w.messages[0], /page changed/);
});
test('paste accepts clipboard image items and file-list fallback exactly once', () => {
  for (const clipboardData of [
    { items: [{ kind: 'file', type: 'image/png', getAsFile: () => png }], files: [png] },
    { files: [png] },
  ]) {
    const w = setup();
    const files = [];
    let prevented = 0;
    w.context.insertImageFile = (file) => files.push(file);
    w.context.pasteImage({ target: {}, clipboardData, preventDefault: () => prevented++ });
    assert.deepEqual(files, [png]);
    assert.equal(prevented, 1);
  }
});
test('paste preserves text fields, contenteditable, dialogs, handled events and text-only paste', () => {
  for (const kind of ['input', 'editable', 'dialog', 'handled', 'text', 'empty']) {
    const w = setup();
    let inserted = 0,
      prevented = 0;
    w.context.insertImageFile = () => inserted++;
    if (kind === 'dialog') w.context.document.querySelector = () => ({});
    w.context.pasteImage({
      target: {
        closest: () => (kind === 'input' ? {} : null),
        isContentEditable: kind === 'editable',
      },
      defaultPrevented: kind === 'handled',
      clipboardData: kind === 'empty' ? null : { files: kind === 'text' ? [] : [png] },
      preventDefault: () => prevented++,
    });
    assert.equal(inserted, 0, kind);
    assert.equal(prevented, 0, kind);
  }
});
