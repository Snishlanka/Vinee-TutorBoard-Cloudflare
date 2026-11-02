const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const context = {
  W: 2880,
  H: 1080,
  canFillShape: () => false,
  canTransform: (o) => o.type === 'image',
  TutorMath: { valid: () => false },
  TutorData: { valid: () => false },
};
vm.createContext(context);
vm.runInContext(
  source.slice(
    source.indexOf('function validObject('),
    source.indexOf("$('lesson-file').onchange")
  ),
  context
);
const valid = (o) => context.validObject(o);
function book() {
  return {
    type: 'image',
    x: 80,
    y: 80,
    w: 600,
    h: 800,
    color: '#172231',
    width: 3,
    src: 'data:image/jpeg;base64,/9j/',
    pdfBook: {
      data: Buffer.from('%PDF-1.7\n').toString('base64'),
      name: 'Mathematics.pdf',
      totalPages: 3,
      pageNumber: 2,
      annotations: {
        1: [
          {
            type: 'pen',
            points: [
              { x: 10, y: 20 },
              { x: 90, y: 60 },
            ],
            color: '#ef4444',
            width: 3,
          },
        ],
        2: [
          {
            type: 'text',
            x: 20,
            y: 30,
            text: 'Show your working',
            fontSize: 32,
            color: '#172231',
            width: 3,
          },
        ],
      },
    },
  };
}
test('PDF books and page-specific vector marks survive lesson JSON validation', () => {
  assert.equal(valid(book()), true);
  assert.equal(valid(JSON.parse(JSON.stringify(book()))), true);
  const legacy = book();
  delete legacy.pdfBook;
  assert.equal(valid(legacy), true);
});
test('PDF metadata rejects invalid page positions, oversized sources and external PDF URLs', () => {
  for (const change of [
    { pageNumber: 0 },
    { pageNumber: 4 },
    { pageNumber: 1.5 },
    { totalPages: 2001 },
    { totalPages: 0 },
    { data: 'https://example.test/book.pdf' },
    { data: '%%%=' },
    { data: 'abc' },
    { name: 'x'.repeat(201) },
  ]) {
    const o = book();
    Object.assign(o.pdfBook, change);
    assert.equal(valid(o), false, JSON.stringify(change));
  }
  const o = book();
  o.pdfBook.data = 'A'.repeat(139810140);
  assert.equal(valid(o), false);
});
test('PDF annotations reject invalid page keys, nested books and malformed drawing data', () => {
  for (const annotations of [
    [],
    null,
    { 4: [] },
    { 0: [] },
    { __proto__: null, 'not-a-page': [] },
    { 1: [book()] },
    { 1: [{ type: 'pen', points: [{ x: Infinity, y: 0 }], width: 3, color: '#000000' }] },
    { 1: Array(1001).fill(book().pdfBook.annotations[1][0]) },
  ]) {
    const o = book();
    o.pdfBook.annotations = annotations;
    assert.equal(valid(o), false);
  }
});

test('lesson-level loaded PDFs validate independently of board objects', () => {
  assert.equal(context.validLoadedPDF(null), true);
  assert.equal(context.validLoadedPDF(undefined), true);
  assert.equal(context.validLoadedPDF(book().pdfBook), true);
  const invalid = book().pdfBook;
  invalid.pageNumber = 99;
  assert.equal(context.validLoadedPDF(invalid), false);
  assert.equal(context.validLoadedPDF({ data: 'javascript:alert(1)' }), false);
});

test('portrait PDF text boxes can exceed board height without loosening board text limits', () => {
  const text = {
    type: 'text',
    box: true,
    text: 'Portrait note',
    x: 50,
    y: 100,
    w: 500,
    h: 1500,
    fontSize: 28,
    width: 3,
    color: '#171717',
  };
  assert.equal(valid(text), false);
  const metadata = book().pdfBook;
  metadata.annotations = { 1: [text] };
  assert.equal(context.validLoadedPDF(metadata), true);
});

test('board text validation remains safe as an Array.every callback', () => {
  const text = {
    type: 'text',
    box: true,
    text: 'Board note',
    x: 10,
    y: 10,
    w: 200,
    h: 100,
    fontSize: 28,
    width: 3,
    color: '#171717',
  };
  assert.equal([text, { ...text, text: 'Second note' }].every(context.validObject), true);
});

test('v2.3 bookmarks and answer covers survive JSON without becoming board ink', () => {
  const metadata = book().pdfBook;
  metadata.bookmarks = [{ page: 2, title: 'Exercise 01' }];
  metadata.covers = { 2: [{ x: 0.1, y: 0.25, w: 0.7, h: 0.2, revealed: false }] };
  assert.equal(context.validLoadedPDF(JSON.parse(JSON.stringify(metadata))), true);
  metadata.covers[2][0].revealed = true;
  assert.equal(context.validLoadedPDF(metadata), true);
});

test('bookmarks reject duplicate pages, malformed titles and pages outside the loaded book', () => {
  for (const bookmarks of [
    null,
    {},
    [{ page: 0, title: 'Start' }],
    [{ page: 4, title: 'End' }],
    [{ page: 1.5, title: 'Page' }],
    [{ page: 1, title: '' }],
    [{ page: 1, title: ' ' }],
    [{ page: 1, title: 'x'.repeat(81) }],
    [
      { page: 1, title: 'One' },
      { page: 1, title: 'Duplicate' },
    ],
  ])
    assert.equal(
      context.validLoadedPDF({ ...book().pdfBook, bookmarks }),
      false,
      JSON.stringify(bookmarks)
    );
});

test('answer covers reject invalid page keys, unbounded geometry and excessive cover counts', () => {
  const cover = { x: 0.1, y: 0.2, w: 0.3, h: 0.4, revealed: false };
  for (const covers of [
    null,
    [],
    { 0: [] },
    { 4: [] },
    { '01': [] },
    { 1: null },
    { 1: [{ ...cover, x: -1 }] },
    { 1: [{ ...cover, x: NaN }] },
    { 1: [{ ...cover, w: Infinity }] },
    { 1: [{ ...cover, w: 0 }] },
    { 1: [{ ...cover, h: -1 }] },
    { 1: [{ ...cover, x: 0.9 }] },
    { 1: [{ ...cover, y: 0.9 }] },
    { 1: [{ ...cover, revealed: 'false' }] },
    { 1: Array(101).fill(cover) },
  ])
    assert.equal(context.validLoadedPDF({ ...book().pdfBook, covers }), false);
});
