const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('pdf-tools.js', 'utf8');
const resolver = source.slice(
  source.indexOf('function resolvePDFAssetBase('),
  source.indexOf('  const pdfAssetBase =')
);
function resolve(document) {
  const context = { URL, document };
  vm.createContext(context);
  vm.runInContext(resolver, context);
  return context.resolvePDFAssetBase();
}
test('PDF assets use absolute URLs in root and subdirectory previews', () => {
  assert.equal(
    resolve({ baseURI: 'https://board.test/whiteboard.html', currentScript: null, scripts: [] }),
    'https://board.test/vendor/pdfjs/'
  );
  assert.equal(
    resolve({
      baseURI: 'https://board.test/lessons/whiteboard.html',
      currentScript: { src: 'about:blank' },
      scripts: [],
    }),
    'https://board.test/lessons/vendor/pdfjs/'
  );
});
test('about:blank previews can resolve PDF assets from the script URL', () => {
  assert.equal(
    resolve({
      baseURI: 'about:blank',
      currentScript: { src: 'https://board.test/studio/pdf-tools.js?v=2' },
      scripts: [],
    }),
    'https://board.test/studio/vendor/pdfjs/'
  );
  assert.equal(
    resolve({
      baseURI: 'about:blank',
      currentScript: null,
      scripts: [{ src: 'https://board.test/pdf-tools.js' }],
    }),
    'https://board.test/vendor/pdfjs/'
  );
});
test('missing preview bases fail explicitly instead of importing a relative module', () => {
  assert.equal(resolve({ baseURI: 'about:blank', currentScript: null, scripts: [] }), null);
});
