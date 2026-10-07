const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('sw.js', 'utf8');
const base = 'https://example.test/';
function worker({ cached, storageError = false, scope = base } = {}) {
  const handlers = {},
    added = [],
    lookups = [],
    network = [];
  const cache = {
    addAll: async (requests) => added.push(...requests.map((r) => r.url)),
    match: async (key) => {
      lookups.push(key);
      return cached;
    },
  };
  vm.runInNewContext(source, {
    URL,
    Request,
    Response,
    self: {
      registration: { scope },
      addEventListener: (type, handler) => (handlers[type] = handler),
    },
    caches: {
      open: async () => {
        if (storageError) throw Error('Storage unavailable');
        return cache;
      },
      delete: async () => true,
    },
    fetch: async (request) => {
      network.push(request.url);
      return new Response('network');
    },
  });
  return { handlers, added, lookups, network };
}
async function navigate(w, url) {
  let result;
  w.handlers.fetch({
    request: { url, method: 'GET', mode: 'navigate', redirect: 'manual' },
    respondWith: (value) => (result = value),
  });
  return result;
}
test('installation caches the whiteboard application route', async () => {
  for (const scope of [base, base + 'app/']) {
    const w = worker({ scope });
    let installed;
    w.handlers.install({ waitUntil: (value) => (installed = value) });
    await installed;
    assert.ok(w.added.includes(scope + 'whiteboard.html'));
    assert.ok(w.added.includes(scope + 'studio.js'));
    assert.ok(w.added.includes(scope + 'studio.css'));
    assert.ok(!w.added.includes(scope));
  }
});
test('reopening whiteboard route and its query URL works from cache offline', async () => {
  for (const path of ['whiteboard.html', 'whiteboard.html?return=1']) {
    const w = worker({ cached: new Response('cached lesson app') });
    assert.equal(await (await navigate(w, base + path)).text(), 'cached lesson app');
    assert.deepEqual(w.lookups, [base + 'whiteboard.html']);
    assert.equal(w.network.length, 0);
  }
});
test('redirected cached HTML becomes a navigation-safe response', async () => {
  const cached = new Response('<html>app</html>', {
    headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'" },
  });
  Object.defineProperty(cached, 'redirected', { value: true });
  const response = await navigate(worker({ cached }), base + 'whiteboard.html');
  assert.equal(response.redirected, false);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/html');
  assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'self'");
  assert.equal(await response.text(), '<html>app</html>');
});
test('missing cache or unavailable storage falls back to network', async () => {
  for (const options of [{}, { storageError: true }]) {
    const w = worker(options);
    assert.equal(await (await navigate(w, base + 'whiteboard.html')).text(), 'network');
    assert.deepEqual(w.network, [base + 'whiteboard.html']);
  }
});
test('unknown paths are not replaced by the cached homepage', async () => {
  const w = worker({ cached: new Response('app') });
  assert.equal(await navigate(w, base + 'missing'), undefined);
  assert.equal(w.lookups.length, 0);
});
