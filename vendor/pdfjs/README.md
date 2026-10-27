PDF.js 6.4.299, official pdfjs-dist package.
Source: https://github.com/mozilla/pdf.js/releases/tag/v6.4.299
Legacy browser build, worker, CMaps, fonts and JavaScript image-decoder fallbacks.
PDF rendering runs locally; no PDF scripting or XFA viewer is loaded. WebAssembly is disabled to preserve the existing CSP.
Main license: Apache-2.0. Font/CMap/decoder license notices are retained in their folders.


The renderer and worker are classic IIFE bundles, to support hosts that do not serve ES modules. Built with esbuild 0.28.2 from the pinned official legacy distribution:

esbuild legacy/build/pdf.min.mjs --bundle --format=iife --global-name=pdfjsLib --platform=browser --target=es2022 --minify --external:node:* --outfile=pdf.js --footer:js="globalThis.pdfjsLib = pdfjsLib;"
esbuild legacy/build/pdf.worker.min.mjs --bundle --format=iife --global-name=pdfjsWorker --platform=browser --target=es2022 --minify --external:node:* --outfile=pdf.worker.js --footer:js="globalThis.pdfjsWorker = pdfjsWorker;"

The worker handler is also loaded as a classic script for the library's built-in main-thread fallback when previews block Web Workers. Normal browsing uses a dedicated classic Worker port.
