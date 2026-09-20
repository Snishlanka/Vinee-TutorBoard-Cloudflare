# Vinee TutorBoard

A browser-based teaching whiteboard for writing, drawing, and explaining lessons. Create multi-page lessons, annotate exam questions, plot functions, and export material for students.

Built with HTML, CSS, and vanilla JavaScript, TutorBoard runs entirely in the browser and is configured for deployment as Cloudflare Workers static assets. No application backend, account, database service, or frontend build step is required.

## Features

- **Drawing tools:** chalk, highlighter, straight lines, rectangles, ellipses, and triangles, with adjustable colors and stroke widths.
- **Flexible erasing:** erase an area or remove a whole object; undo and redo board edits.
- **Text and images:** enter Sinhala or English text, adjust size, bold and underline, and insert PNG, JPEG, or WebP images. Move objects and resize or rotate images.
- **Lesson pages:** create and delete pages, navigate with thumbnails, and choose blank, grid, or ruled paper on white, black, green, or blue boards.
- **Mathematics:** plot up to four functions on a coordinate grid, insert axes, and add labeled geometry diagrams with adjustable size and rotation.
- **Presentation controls:** light and dark interface themes, board zoom, fit-to-window, full screen, and a presentation mode that hides side panels.
- **Save and export:** download editable lesson JSON, export the current page as PNG, or export all lesson pages as PDF with lesson and tutor details.
- **Local drafts and offline access:** automatic browser storage, draft restoration, and an installable Progressive Web App (PWA).

## Run locally

Use a modern browser and serve the repository over HTTP. Opening `index.html` directly with `file://` does not enable local draft and PWA integration.

If Python 3 is installed, run this from the repository root:

```sh
python -m http.server 8080 --bind 127.0.0.1
```

Open [http://localhost:8080](http://localhost:8080). On Windows, `py -m http.server 8080 --bind 127.0.0.1` is an alternative when Python is available through the launcher.

For the Cloudflare development workflow, install Node.js with npm, then run:

```sh
npx wrangler dev
```

Open the local address printed by Wrangler. There is no `package.json` or `npm run build` step in this repository. The PDF library is already bundled in `vendor/`.

## Create a lesson

1. Enter a lesson title and, optionally, the tutor's name.
2. Choose the board color and paper style, then use Chalk, Text, or Insert image to add content.
3. Add pages with **+ Page**, and use **Show pages** to browse the lesson.
4. Open **Graph & axes** or **Geometry diagrams** to insert mathematics content. Use **Move** to position it.
5. Use **Present** or **Full screen** when teaching or sharing your screen.
6. Choose **Save lesson** to keep an editable backup. Use **Open lesson** to continue from that JSON file later.

| Action | Output |
| --- | --- |
| Save lesson | Editable `.json` file containing lesson pages and embedded images |
| Export page | `.png` image of the current page |
| Export lesson PDF | `.pdf` containing every lesson page |

PNG and PDF exports are intended for sharing; use the JSON file to resume editing. Undo and redo history is not preserved in saved lesson files or restored drafts.

### Mathematics examples

Enter one function per line, up to four functions per graph:

```text
x^2
2*x + 1
sin(x)
1/x
```

Supported functions include `sin`, `cos`, `tan`, `sqrt`, `abs`, `ln`, `log` (base 10), and `exp`. Expressions support `x`, `pi`, `e`, parentheses, powers, and implicit multiplication such as `2x`. Trigonometric functions use radians.

Set the x and y ranges before inserting a graph. Leave the function field empty, or choose **Insert axes only**, for a coordinate grid. Available geometry diagrams include equilateral, right-angled, and isosceles triangles, regular polygons, a circle with radius, and an angle.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `P` | Chalk |
| `H` | Highlighter |
| `E` | Eraser |
| `T` | Text |
| `V` | Move |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + S` | Download lesson JSON |
| `Ctrl/Cmd + Enter` | Place text while editing |
| `Escape` | Cancel text entry or exit presentation mode |
| Hold `Shift` while drawing with Chalk | Draw a straight line |

Tool shortcuts apply when you are not typing in a form field.

## Local drafts and offline use

Drafts are saved in IndexedDB in the current browser on the current device. Wait for **Saved on this device** before closing the app, and use **Local drafts** to restore a previous lesson. Lessons are not uploaded by the application and drafts do not sync between devices or browsers.

To prepare offline access:

1. Open the app online over HTTPS, or use localhost during development.
2. Wait until the status shows **Ready offline**.
3. Use **Install / help** for installation options supported by your browser.

Once cached, drawing, local images, graphs, lesson files, and PDF exports work offline. Installation is optional; the website can also be used directly in the browser.

Use **Check updates** to look for a new version. When an update is ready, wait for your draft to save, close all TutorBoard tabs and installed app windows, then reopen the app.

Clearing site data or browser storage can remove local drafts and offline files. Keep downloaded JSON backups of lessons you want to retain. A different domain, port, or app path may also use separate draft storage.

## Deploy to Cloudflare

The repository includes `wrangler.jsonc` for a Workers static-assets deployment.

### Deploy from the command line

With Node.js, npm, and a Cloudflare account available, run from the repository root:

```sh
npx wrangler login
npx wrangler deploy
```

Wrangler prints the deployed URL. The configured Worker name is `vinee-tutorboard`; change `name` in `wrangler.jsonc` if you need a different name.

### Deploy through a connected repository

Use these settings for a Cloudflare Workers repository deployment:

| Setting | Value |
| --- | --- |
| Root directory | Repository root |
| Build command | Leave empty |
| Deploy command | `npx wrangler deploy` |

The configuration serves assets from the repository root, enables the `workers.dev` address, disables preview URLs, and returns missing-asset responses without a single-page-app fallback.

### Published files and headers

`.assetsignore` uses an allowlist to publish only application assets. Add any new public files to this allowlist before deploying. Keep Git metadata, local tooling, and deployment configuration excluded.

`_headers` defines the Content Security Policy, framing restrictions, content-type protections, and cache headers. After deployment, check that:

- `/` loads the whiteboard and its assets.
- `/.git/HEAD`, `/wrangler.jsonc`, and `/README.md` return HTTP 404.
- Local drafts, JSON import/export, PNG export, PDF export, and offline access work on the deployed origin.

**Historical deployment note:** the previous README records that an earlier deployment uploaded Git metadata. If credentials were present in that exposed history, rotate them; excluding the files from later deployments does not invalidate exposed credentials.

## Project structure

```text
.
|-- index.html             # Whiteboard interface and dialogs
|-- app.js                 # Drawing, pages, objects, lesson files, and exports
|-- math.js                # Function parser, graphing, and geometry rendering
|-- style.css              # Main layout and appearance
|-- theme.js               # Restore the saved interface theme on startup
|-- board-persistence.js   # Snapshot and restore the board for local drafts
|-- draft-store.js         # IndexedDB draft storage
|-- pwa.js                 # Autosave, installation, and update controls
|-- pwa.css                # PWA status and dialog styling
|-- sw.js                  # Offline application-shell cache
|-- manifest.webmanifest   # App installation metadata
|-- icons/                 # App and home-screen icons
|-- favicon.svg            # Browser favicon
|-- vendor/                # Bundled pdf-lib and its license
|-- _headers               # HTTP response headers
|-- .assetsignore          # Deployment asset allowlist
`-- wrangler.jsonc         # Cloudflare Workers configuration
```

## Development and verification

Edit the static source files directly and preview them with a local server. Run the service worker regression checks with `node --test tests/sw.test.cjs`. This checkout does not include build scripts.

`sw.js` contains a cache `REVISION` and an `ASSETS` list. When changing cached application files, update the cache revision before release; include new offline assets in both `ASSETS` and `.assetsignore`. Otherwise, returning users can continue receiving the previous cached application.

Before publishing changes, manually verify:

- Drawing, text placement, object movement, erasing, and undo/redo.
- Page navigation, board backgrounds, graphs, and geometry diagrams.
- Saving and reopening a lesson, including images, and exporting PNG and PDF.
- Restoring a local draft after reopening the app.
- Reloading offline after **Ready offline**, and applying an update after all app windows close.

### Source formatting

Project source uses Prettier with the shared settings in `.prettierrc.json`.
Bundled third-party files in `vendor/` are excluded through `.prettierignore`.

```sh
npx prettier@3.8.1 --write "*.js" "*.css" index.html "tests/*.cjs" wrangler.jsonc .prettierrc.json
npx prettier@3.8.1 --write manifest.webmanifest --parser json
npx prettier@3.8.1 --write favicon.svg --parser html
```

Use `--check` instead of `--write` to verify formatting without modifying files.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Offline access is unavailable | Use HTTPS or localhost, open online first, and wait for **Ready offline**. |
| Changes do not appear after deployment | Check the service worker revision, choose **Check updates**, then close all app windows and reopen. |
| Autosave fails | Download the lesson with **Save lesson** and check whether browser storage is available or full. |
| A lesson file will not open | Use a TutorBoard JSON export. The importer accepts files up to 40 MiB and 100 pages and validates their contents. |
| A new asset returns 404 after deployment | Ensure the file is included in `.assetsignore`. |

## Third-party software

PDF export uses the bundled `pdf-lib` library. Its license is included in [vendor/pdf-lib-LICENSE.md](vendor/pdf-lib-LICENSE.md). This repository does not currently include a license for the TutorBoard application itself.
