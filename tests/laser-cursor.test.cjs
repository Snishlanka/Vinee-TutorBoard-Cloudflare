'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
const start = source.indexOf('function toolCursor(');
const end = source.indexOf('function refreshCursor(', start);
const context = vm.createContext({ color: '#243653', encodeURIComponent });
vm.runInContext(source.slice(start, end), context);

test('laser tool uses a centered red dot cursor', () => {
  const cursor = context.toolCursor('laser');
  assert.match(cursor, /^url\("data:image\/svg\+xml,/);
  assert.match(decodeURIComponent(cursor), /#ff253e/);
  assert.match(cursor, /\) 16 16, crosshair$/);
});
