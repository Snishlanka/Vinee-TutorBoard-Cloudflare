// Offline app shell. Bump REVISION whenever cached application files change.
const REVISION = 'v2.2.0-pdf-book-view-final-ui';
const ASSETS = [
  'pdf-tools.js',
  'pdf-teaching.js',
  'pdf-editing.js',
  'vendor/pdfjs/LICENSE',
  'vendor/pdfjs/cmaps/78-EUC-H.bcmap',
  'vendor/pdfjs/cmaps/78-EUC-V.bcmap',
  'vendor/pdfjs/cmaps/78-H.bcmap',
  'vendor/pdfjs/cmaps/78-RKSJ-H.bcmap',
  'vendor/pdfjs/cmaps/78-RKSJ-V.bcmap',
  'vendor/pdfjs/cmaps/78-V.bcmap',
  'vendor/pdfjs/cmaps/78ms-RKSJ-H.bcmap',
  'vendor/pdfjs/cmaps/78ms-RKSJ-V.bcmap',
  'vendor/pdfjs/cmaps/83pv-RKSJ-H.bcmap',
  'vendor/pdfjs/cmaps/90ms-RKSJ-H.bcmap',
  'vendor/pdfjs/cmaps/90ms-RKSJ-V.bcmap',
  'vendor/pdfjs/cmaps/90msp-RKSJ-H.bcmap',
  'vendor/pdfjs/cmaps/90msp-RKSJ-V.bcmap',
  'vendor/pdfjs/cmaps/90pv-RKSJ-H.bcmap',
  'vendor/pdfjs/cmaps/90pv-RKSJ-V.bcmap',
  'vendor/pdfjs/cmaps/Add-H.bcmap',
  'vendor/pdfjs/cmaps/Add-RKSJ-H.bcmap',
  'vendor/pdfjs/cmaps/Add-RKSJ-V.bcmap',
  'vendor/pdfjs/cmaps/Add-V.bcmap',
  'vendor/pdfjs/cmaps/Adobe-CNS1-0.bcmap',
  'vendor/pdfjs/cmaps/Adobe-CNS1-1.bcmap',
  'vendor/pdfjs/cmaps/Adobe-CNS1-2.bcmap',
  'vendor/pdfjs/cmaps/Adobe-CNS1-3.bcmap',
  'vendor/pdfjs/cmaps/Adobe-CNS1-4.bcmap',
  'vendor/pdfjs/cmaps/Adobe-CNS1-5.bcmap',
  'vendor/pdfjs/cmaps/Adobe-CNS1-6.bcmap',
  'vendor/pdfjs/cmaps/Adobe-CNS1-UCS2.bcmap',
  'vendor/pdfjs/cmaps/Adobe-GB1-0.bcmap',
  'vendor/pdfjs/cmaps/Adobe-GB1-1.bcmap',
  'vendor/pdfjs/cmaps/Adobe-GB1-2.bcmap',
  'vendor/pdfjs/cmaps/Adobe-GB1-3.bcmap',
  'vendor/pdfjs/cmaps/Adobe-GB1-4.bcmap',
  'vendor/pdfjs/cmaps/Adobe-GB1-5.bcmap',
  'vendor/pdfjs/cmaps/Adobe-GB1-UCS2.bcmap',
  'vendor/pdfjs/cmaps/Adobe-Japan1-0.bcmap',
  'vendor/pdfjs/cmaps/Adobe-Japan1-1.bcmap',
  'vendor/pdfjs/cmaps/Adobe-Japan1-2.bcmap',
  'vendor/pdfjs/cmaps/Adobe-Japan1-3.bcmap',
  'vendor/pdfjs/cmaps/Adobe-Japan1-4.bcmap',
  'vendor/pdfjs/cmaps/Adobe-Japan1-5.bcmap',
  'vendor/pdfjs/cmaps/Adobe-Japan1-6.bcmap',
  'vendor/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap',
  'vendor/pdfjs/cmaps/Adobe-Korea1-0.bcmap',
  'vendor/pdfjs/cmaps/Adobe-Korea1-1.bcmap',
  'vendor/pdfjs/cmaps/Adobe-Korea1-2.bcmap',
  'vendor/pdfjs/cmaps/Adobe-Korea1-UCS2.bcmap',
  'vendor/pdfjs/cmaps/B5-H.bcmap',
  'vendor/pdfjs/cmaps/B5-V.bcmap',
  'vendor/pdfjs/cmaps/B5pc-H.bcmap',
  'vendor/pdfjs/cmaps/B5pc-V.bcmap',
  'vendor/pdfjs/cmaps/CNS-EUC-H.bcmap',
  'vendor/pdfjs/cmaps/CNS-EUC-V.bcmap',
  'vendor/pdfjs/cmaps/CNS1-H.bcmap',
  'vendor/pdfjs/cmaps/CNS1-V.bcmap',
  'vendor/pdfjs/cmaps/CNS2-H.bcmap',
  'vendor/pdfjs/cmaps/CNS2-V.bcmap',
  'vendor/pdfjs/cmaps/ETHK-B5-H.bcmap',
  'vendor/pdfjs/cmaps/ETHK-B5-V.bcmap',
  'vendor/pdfjs/cmaps/ETen-B5-H.bcmap',
  'vendor/pdfjs/cmaps/ETen-B5-V.bcmap',
  'vendor/pdfjs/cmaps/ETenms-B5-H.bcmap',
  'vendor/pdfjs/cmaps/ETenms-B5-V.bcmap',
  'vendor/pdfjs/cmaps/EUC-H.bcmap',
  'vendor/pdfjs/cmaps/EUC-V.bcmap',
  'vendor/pdfjs/cmaps/Ext-H.bcmap',
  'vendor/pdfjs/cmaps/Ext-RKSJ-H.bcmap',
  'vendor/pdfjs/cmaps/Ext-RKSJ-V.bcmap',
  'vendor/pdfjs/cmaps/Ext-V.bcmap',
  'vendor/pdfjs/cmaps/GB-EUC-H.bcmap',
  'vendor/pdfjs/cmaps/GB-EUC-V.bcmap',
  'vendor/pdfjs/cmaps/GB-H.bcmap',
  'vendor/pdfjs/cmaps/GB-V.bcmap',
  'vendor/pdfjs/cmaps/GBK-EUC-H.bcmap',
  'vendor/pdfjs/cmaps/GBK-EUC-V.bcmap',
  'vendor/pdfjs/cmaps/GBK2K-H.bcmap',
  'vendor/pdfjs/cmaps/GBK2K-V.bcmap',
  'vendor/pdfjs/cmaps/GBKp-EUC-H.bcmap',
  'vendor/pdfjs/cmaps/GBKp-EUC-V.bcmap',
  'vendor/pdfjs/cmaps/GBT-EUC-H.bcmap',
  'vendor/pdfjs/cmaps/GBT-EUC-V.bcmap',
  'vendor/pdfjs/cmaps/GBT-H.bcmap',
  'vendor/pdfjs/cmaps/GBT-V.bcmap',
  'vendor/pdfjs/cmaps/GBTpc-EUC-H.bcmap',
  'vendor/pdfjs/cmaps/GBTpc-EUC-V.bcmap',
  'vendor/pdfjs/cmaps/GBpc-EUC-H.bcmap',
  'vendor/pdfjs/cmaps/GBpc-EUC-V.bcmap',
  'vendor/pdfjs/cmaps/H.bcmap',
  'vendor/pdfjs/cmaps/HKdla-B5-H.bcmap',
  'vendor/pdfjs/cmaps/HKdla-B5-V.bcmap',
  'vendor/pdfjs/cmaps/HKdlb-B5-H.bcmap',
  'vendor/pdfjs/cmaps/HKdlb-B5-V.bcmap',
  'vendor/pdfjs/cmaps/HKgccs-B5-H.bcmap',
  'vendor/pdfjs/cmaps/HKgccs-B5-V.bcmap',
  'vendor/pdfjs/cmaps/HKm314-B5-H.bcmap',
  'vendor/pdfjs/cmaps/HKm314-B5-V.bcmap',
  'vendor/pdfjs/cmaps/HKm471-B5-H.bcmap',
  'vendor/pdfjs/cmaps/HKm471-B5-V.bcmap',
  'vendor/pdfjs/cmaps/HKscs-B5-H.bcmap',
  'vendor/pdfjs/cmaps/HKscs-B5-V.bcmap',
  'vendor/pdfjs/cmaps/Hankaku.bcmap',
  'vendor/pdfjs/cmaps/Hiragana.bcmap',
  'vendor/pdfjs/cmaps/KSC-EUC-H.bcmap',
  'vendor/pdfjs/cmaps/KSC-EUC-V.bcmap',
  'vendor/pdfjs/cmaps/KSC-H.bcmap',
  'vendor/pdfjs/cmaps/KSC-Johab-H.bcmap',
  'vendor/pdfjs/cmaps/KSC-Johab-V.bcmap',
  'vendor/pdfjs/cmaps/KSC-V.bcmap',
  'vendor/pdfjs/cmaps/KSCms-UHC-H.bcmap',
  'vendor/pdfjs/cmaps/KSCms-UHC-HW-H.bcmap',
  'vendor/pdfjs/cmaps/KSCms-UHC-HW-V.bcmap',
  'vendor/pdfjs/cmaps/KSCms-UHC-V.bcmap',
  'vendor/pdfjs/cmaps/KSCpc-EUC-H.bcmap',
  'vendor/pdfjs/cmaps/KSCpc-EUC-V.bcmap',
  'vendor/pdfjs/cmaps/Katakana.bcmap',
  'vendor/pdfjs/cmaps/LICENSE',
  'vendor/pdfjs/cmaps/NWP-H.bcmap',
  'vendor/pdfjs/cmaps/NWP-V.bcmap',
  'vendor/pdfjs/cmaps/RKSJ-H.bcmap',
  'vendor/pdfjs/cmaps/RKSJ-V.bcmap',
  'vendor/pdfjs/cmaps/Roman.bcmap',
  'vendor/pdfjs/cmaps/UniCNS-UCS2-H.bcmap',
  'vendor/pdfjs/cmaps/UniCNS-UCS2-V.bcmap',
  'vendor/pdfjs/cmaps/UniCNS-UTF16-H.bcmap',
  'vendor/pdfjs/cmaps/UniCNS-UTF16-V.bcmap',
  'vendor/pdfjs/cmaps/UniCNS-UTF32-H.bcmap',
  'vendor/pdfjs/cmaps/UniCNS-UTF32-V.bcmap',
  'vendor/pdfjs/cmaps/UniCNS-UTF8-H.bcmap',
  'vendor/pdfjs/cmaps/UniCNS-UTF8-V.bcmap',
  'vendor/pdfjs/cmaps/UniGB-UCS2-H.bcmap',
  'vendor/pdfjs/cmaps/UniGB-UCS2-V.bcmap',
  'vendor/pdfjs/cmaps/UniGB-UTF16-H.bcmap',
  'vendor/pdfjs/cmaps/UniGB-UTF16-V.bcmap',
  'vendor/pdfjs/cmaps/UniGB-UTF32-H.bcmap',
  'vendor/pdfjs/cmaps/UniGB-UTF32-V.bcmap',
  'vendor/pdfjs/cmaps/UniGB-UTF8-H.bcmap',
  'vendor/pdfjs/cmaps/UniGB-UTF8-V.bcmap',
  'vendor/pdfjs/cmaps/UniJIS-UCS2-H.bcmap',
  'vendor/pdfjs/cmaps/UniJIS-UCS2-HW-H.bcmap',
  'vendor/pdfjs/cmaps/UniJIS-UCS2-HW-V.bcmap',
  'vendor/pdfjs/cmaps/UniJIS-UCS2-V.bcmap',
  'vendor/pdfjs/cmaps/UniJIS-UTF16-H.bcmap',
  'vendor/pdfjs/cmaps/UniJIS-UTF16-V.bcmap',
  'vendor/pdfjs/cmaps/UniJIS-UTF32-H.bcmap',
  'vendor/pdfjs/cmaps/UniJIS-UTF32-V.bcmap',
  'vendor/pdfjs/cmaps/UniJIS-UTF8-H.bcmap',
  'vendor/pdfjs/cmaps/UniJIS-UTF8-V.bcmap',
  'vendor/pdfjs/cmaps/UniJIS2004-UTF16-H.bcmap',
  'vendor/pdfjs/cmaps/UniJIS2004-UTF16-V.bcmap',
  'vendor/pdfjs/cmaps/UniJIS2004-UTF32-H.bcmap',
  'vendor/pdfjs/cmaps/UniJIS2004-UTF32-V.bcmap',
  'vendor/pdfjs/cmaps/UniJIS2004-UTF8-H.bcmap',
  'vendor/pdfjs/cmaps/UniJIS2004-UTF8-V.bcmap',
  'vendor/pdfjs/cmaps/UniJISPro-UCS2-HW-V.bcmap',
  'vendor/pdfjs/cmaps/UniJISPro-UCS2-V.bcmap',
  'vendor/pdfjs/cmaps/UniJISPro-UTF8-V.bcmap',
  'vendor/pdfjs/cmaps/UniJISX0213-UTF32-H.bcmap',
  'vendor/pdfjs/cmaps/UniJISX0213-UTF32-V.bcmap',
  'vendor/pdfjs/cmaps/UniJISX02132004-UTF32-H.bcmap',
  'vendor/pdfjs/cmaps/UniJISX02132004-UTF32-V.bcmap',
  'vendor/pdfjs/cmaps/UniKS-UCS2-H.bcmap',
  'vendor/pdfjs/cmaps/UniKS-UCS2-V.bcmap',
  'vendor/pdfjs/cmaps/UniKS-UTF16-H.bcmap',
  'vendor/pdfjs/cmaps/UniKS-UTF16-V.bcmap',
  'vendor/pdfjs/cmaps/UniKS-UTF32-H.bcmap',
  'vendor/pdfjs/cmaps/UniKS-UTF32-V.bcmap',
  'vendor/pdfjs/cmaps/UniKS-UTF8-H.bcmap',
  'vendor/pdfjs/cmaps/UniKS-UTF8-V.bcmap',
  'vendor/pdfjs/cmaps/V.bcmap',
  'vendor/pdfjs/cmaps/WP-Symbol.bcmap',
  'vendor/pdfjs/pdf.js',
  'vendor/pdfjs/pdf.worker.js',
  'vendor/pdfjs/standard_fonts/FoxitDingbats.pfb',
  'vendor/pdfjs/standard_fonts/FoxitFixed.pfb',
  'vendor/pdfjs/standard_fonts/FoxitFixedBold.pfb',
  'vendor/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb',
  'vendor/pdfjs/standard_fonts/FoxitFixedItalic.pfb',
  'vendor/pdfjs/standard_fonts/FoxitSerif.pfb',
  'vendor/pdfjs/standard_fonts/FoxitSerifBold.pfb',
  'vendor/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb',
  'vendor/pdfjs/standard_fonts/FoxitSerifItalic.pfb',
  'vendor/pdfjs/standard_fonts/FoxitSymbol.pfb',
  'vendor/pdfjs/standard_fonts/LICENSE_FOXIT',
  'vendor/pdfjs/standard_fonts/LICENSE_LIBERATION',
  'vendor/pdfjs/standard_fonts/LiberationSans-Bold.ttf',
  'vendor/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf',
  'vendor/pdfjs/standard_fonts/LiberationSans-Italic.ttf',
  'vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf',
  'vendor/pdfjs/wasm/LICENSE_JBIG2',
  'vendor/pdfjs/wasm/LICENSE_OPENJPEG',
  'vendor/pdfjs/wasm/LICENSE_PDFJS_JBIG2',
  'vendor/pdfjs/wasm/LICENSE_PDFJS_OPENJPEG',
  'vendor/pdfjs/wasm/LICENSE_PDFJS_QCMS',
  'vendor/pdfjs/wasm/LICENSE_QCMS',
  'vendor/pdfjs/wasm/jbig2_nowasm_fallback.js',
  'vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js',

  'whiteboard.html',
  'theme.js',
  'style.css',
  'app.js',
  'text-timer.js',
  'studio.js',
  'color-picker.js',
  'data-tools.js',
  'data-tools-ui.js',
  'studio.css',
  'math.js',
  'pwa.css',
  'board-persistence.js',
  'pwa.js',
  'draft-store.js',
  'manifest.webmanifest',
  'favicon.svg',
  'vendor/pdf-lib.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];
('use strict');
// Each deployment is an atomic app shell. Never mix old HTML with new scripts.
const BASE = self.registration.scope;
const PREFIX = 'vinee-shell:' + BASE + ':';
const CACHE = PREFIX + REVISION;
// Cloudflare redirects index.html to the directory URL. Cache that URL directly:
// redirected responses cannot satisfy navigation requests with redirect='manual'.
const HOME = new URL('whiteboard.html', BASE).href;
const urls = new Set(ASSETS.map((asset) => new URL(asset, BASE).href));
function navigationResponse(response, request) {
  if (request.mode !== 'navigate' || !response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        await cache.addAll([...urls].map((url) => new Request(url, { cache: 'reload' })));
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
      // No skipWaiting: an update must not interrupt an open lesson in ANY tab.
    })()
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== new URL(BASE).origin) return;
  url.search = '';
  url.hash = '';
  let key = url.href;
  if (request.mode === 'navigate' && key === HOME) key = HOME;
  if (!urls.has(key)) return; // No HTML fallback for missing assets or other apps.
  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(key);
        if (cached) return navigationResponse(cached, request);
      } catch {
        // Browser storage can be unavailable; online navigation must still work.
      }
      return fetch(request);
    })()
  );
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'OFFLINE_STATUS')
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        const complete = (await Promise.all([...urls].map((url) => cache.match(url)))).every(
          Boolean
        );
        event.ports[0]?.postMessage({ complete, revision: REVISION });
      })()
    );
});
