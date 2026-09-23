# Vinee TutorBoard

A browser-based teaching whiteboard for writing, drawing, and explaining lessons. Create multi-page lessons, annotate exam questions, plot functions, and export material for students.

Built with HTML, CSS, and vanilla JavaScript, TutorBoard runs entirely in the browser and is configured for deployment as Cloudflare Workers static assets. No application backend, account, database service, or frontend build step is required.

## Features

- **Drawing tools:** smooth chalk/highlighter strokes, a Line / Arrow dropdown with curve controls, rectangles that can be slanted into parallelograms, ellipses, and adjustable triangles. Small on-object handles support resizing, rotation, and hover cursors.
- **Shape styling and editing:** solid or diagonal-pattern fills, independent fill colors, shape/line Copy and Paste, and selected-object Delete with Undo/Redo. The Eraser dropdown offers point and whole-object modes.
- **Text boxes and images:** drag to size a Sinhala or English text box with wrapping, bullets/numbering, alignment, spacing, bold/underline, and an optional border. Insert or paste PNG, JPEG, or WebP images; move, resize, and rotate them.
- **Pen/touch input:** Auto detect, Pen only for palm rejection, and single-finger drawing modes.
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
3. Use **+ Page** to insert a page immediately after the current page. Open **Show pages** to browse, then use **Move earlier** or **Move later** to reorder the selected page.
4. Open **Graph & axes** or **Geometry diagrams** to insert mathematics content. Drag it directly to position it.
5. Use **Present** or **Full screen** when teaching or sharing your screen.
6. Choose **Save lesson** to keep an editable backup. Use **Open lesson** to continue from that JSON file later.

| Action            | Output                                                            |
| ----------------- | ----------------------------------------------------------------- |
| Save lesson       | Editable `.json` file containing lesson pages and embedded images |
| Export page       | `.png` image of the current page                                  |
| Export lesson PDF | `.pdf` containing every lesson page                               |

PNG and PDF exports are intended for sharing; use the JSON file to resume editing. Undo and redo history is not preserved in saved lesson files or restored drafts.

### Where to find the controls

The browser right-click menu is disabled inside the board area. Use the toolbar clipboard buttons for shapes, or **Ctrl+C / Cmd+C** and **Ctrl+V / Cmd+V**. Screenshot paste remains available through Ctrl/Cmd+V.

- **Workspace control bar:** page navigation, **+ Page**, **Undo**, **Redo**, **Copy**, **Paste**, **Delete**, and **Insert image**. Small arrows toggle the pages and tools panels: they sit at the screen edges when collapsed and follow each panel's board-facing edge when expanded. Text-formatting controls appear here when relevant. These editing actions remain available when the tools panel is hidden, including in presentation/fullscreen mode.
- **Board toolbar:** Chalk, the Eraser dropdown, Text box, Line / Arrow dropdown, and Move, followed by Yellow, Red, White, Black, and Blue presets, the custom color picker, and the Stroke control.
- **Tools panel:** Highlight, Rectangle, Circle, and Triangle share the tool grid. Adjust a rectangle using its gold handle to create a parallelogram. Graph and geometry controls and selected-object editing options are also in this panel.

Controls wrap on smaller screens. Hover over icon-only buttons to see their tool names.

### Resize and rotate shapes

Choose a shape and drag to draw; it is selected automatically, and your chosen drawing tool stays active. Hover over any object (including freehand strokes, text, images, and graphs) for the grab cursor, then drag to move it or click to select it. Draw on empty space to keep using your selected tool. Hold **Alt** to draw over an existing object. Eraser continues to erase; the dedicated **Move** tool is also available. Drag any white corner to resize, or hold Shift to preserve proportions. Drag the **rotation-arrow symbol** above the shape to rotate (Shift snaps to 15 degrees). The gold rectangle/parallelogram handle adjusts its slant; move it back to the left edge to restore a rectangle. Drag the gold triangle top point to change its shape. Selected objects show tiny handles without a surrounding dashed box. The cursor changes over resize, move/adjustment, and rotation handles; drag targets remain larger than the visible squares. The sidebar still offers exact dimensions and rotation.

Open the **Line / Arrow** dropdown next to Text in the board toolbar to choose a connector. Drag either endpoint to adjust it and the gold middle handle to curve it. Arrowheads follow the curve direction. Connectors have endpoint and bend handles without a rotation handle. These changes support Undo/Redo, local drafts, lesson JSON, PNG, and PDF export.

### Shape fills

Select a rectangle, slanted rectangle/parallelogram, circle/ellipse, or triangle by clicking it, then open the right tools panel. Under **Fill shape**, enable fill and choose **Solid fill**, **/// Diagonal**, or the opposite diagonal pattern. **Fill color** controls the solid area or hatch lines independently of the outline. Uncheck **Fill shape** for no fill. Lines and arrows do not have an enclosed area, so fill controls are hidden for them.

Fill styles survive movement, resizing, rotation, copying, Undo/Redo, saved lessons, local drafts, and PNG/PDF exports. Hatch spacing uses board coordinates, so it scales with board zoom.

### Copy and paste shapes or lines

Select a shape or connector by clicking it. Use **Copy** then **Paste**, or Ctrl/Cmd+C then Ctrl/Cmd+V while focus is outside text/form fields. Copies preserve outline, curve/slant/triangle adjustments, rotation, fill pattern/color, and erasures. Each paste is a separate object and Undo step, offset from the original and kept within the board where it fits. You can change pages before pasting.

The toolbar retains the last copied shape for this app session, even if the browser cannot write to the system clipboard. Keyboard copying uses the browser clipboard, and keyboard pasting accepts a validated TutorBoard object or a screenshot. A later text or image copy is not replaced with a stale shape. Plain text stays normal text in form fields. Board-object clipboard payloads are limited to 1 MiB and the toolbar clipboard resets on reload.

### Text boxes

Choose **Text box (T)** and drag on the board to set its size (a click uses the default size). Type into the resizable box, then choose **Place text** or press Ctrl+Enter / Cmd+Enter. Formatting applies to the whole box: size, bold, underline, bullets or numbering, left/center/right alignment, and line spacing. The **Border** checkbox shows or hides the box border without changing its layout; the choice is saved and exported. Each entered paragraph is a list item, and long text wraps to the box width. Text can grow vertically beyond the initial box height to avoid hiding content.

Select a text box by clicking it to resize or format it. Choose **Edit text** (also available on touch screens), or double-click the text, to edit its contents. Escape cancels an active edit. The empty-board welcome message is hidden while a text box is being created or edited, and only returns when the board is empty with no pending text.

Select any object by clicking it and press **Delete**, or use the toolbar **Delete** button. Undo restores it. Changing the board color or reordering the current page keeps the selected object available for Delete. Switching to another page clears the selection. Delete inside a text field edits text normally.

Click the **Eraser** dropdown to choose **Point eraser** or **Whole object**. Point erasing exposes a size slider; Whole object disables that slider.

### Pen, touch, and smooth handwriting

Under **Drawing input**, choose **Pen only** before resting your palm on the board. Only input reported by the browser as a pen is accepted in this mode. **Auto detect** allows finger drawing initially and ignores touch after detecting a pen for the remainder of the session. **Finger drawing** explicitly enables one-finger input. The chosen mode is remembered on this device. Extra touch contacts cannot change or end an active stroke, and canceled gestures roll back.

A passive stylus reported as a finger cannot be distinguished from a palm by the app; use Finger drawing for that device. Physical pen/touch behavior should be checked on the target screen.

Freehand chalk and highlighting use smooth quadratic curves, including in saved lesson rendering and exports. Intermediate pen samples and the final lift-off position are retained.

### Page order and paper controls

Open the pages panel with the left-edge arrow, select a page and use **Move earlier** or **Move later**. Its content and editing history move with it. New pages from any Add Page button are inserted immediately after the selected page and inherit its paper and board color. Saved lessons, drafts, and PDF exports follow the new page order.

Use the small up/down arrow below the paper-controls row (or at the top center when collapsed) to hide or show the whole row above the board, including drawing tools, ink colors, stroke, zoom, board color, paper style, and Clear page. The board automatically refits to the freed space while preserving its proportions. The down arrow restores the row. This small arrow overlays the board edge instead of reserving an empty row; side arrows follow the inner edges of open panels and return to the screen edges when collapsed. This changes visibility without changing the lesson's paper settings; the panel starts visible when the app is reopened.

### Paste a screenshot

Copy a screenshot to the clipboard (for example, with Windows Snipping Tool), return to TutorBoard, and press **Ctrl+V** on Windows/Linux or **Cmd+V** on macOS while focus is outside text fields. The image is added to the current page and selected for positioning or resizing while your chosen tool stays active. Pasted images support Undo, local drafts, lesson files, and exports.

PNG, JPEG, and WebP clipboard images are supported, with the same 15 MiB limit and resizing as Insert image. Normal text-field paste is preserved, and board paste is paused while a dialog is open. If the clipboard contains only a file path or text rather than image data, use **Insert image** instead.

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

| Shortcut                              | Action                                                |
| ------------------------------------- | ----------------------------------------------------- |
| `P`                                   | Chalk                                                 |
| `H`                                   | Highlighter                                           |
| `E`                                   | Eraser                                                |
| `T`                                   | Text box                                              |
| `V`                                   | Move                                                  |
| `Ctrl/Cmd + C`                        | Copy the selected shape or line (outside text fields) |
| `Ctrl/Cmd + V`                        | Paste a copied TutorBoard shape/line or screenshot    |
| `Delete`                              | Delete the selected object                            |
| `Ctrl/Cmd + Z`                        | Undo                                                  |
| `Ctrl/Cmd + Shift + Z`                | Redo                                                  |
| `Ctrl/Cmd + S`                        | Download lesson JSON                                  |
| `Ctrl/Cmd + Enter`                    | Place text while editing                              |
| `Escape`                              | Cancel text entry or exit presentation mode           |
| Hold `Shift` while drawing with Chalk | Draw a straight line                                  |

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

| Setting        | Value                 |
| -------------- | --------------------- |
| Root directory | Repository root       |
| Build command  | Leave empty           |
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

Edit the static source files directly and preview them with a local server. Run all unit regressions with `node --test tests/*.test.cjs`, covering offline navigation, image paste, shape geometry and fills, clipboard behavior, pointer input, and page controls. This checkout does not include build scripts.

`sw.js` contains a cache `REVISION` and an `ASSETS` list. When changing cached application files, update the cache revision before release; include new offline assets in both `ASSETS` and `.assetsignore`. Otherwise, returning users can continue receiving the previous cached application.

Before publishing changes, manually verify:

- Drawing and smoothing, text-box placement/editing/border toggles, object movement, tiny handles/hover cursors, both eraser modes, and Undo/Redo.
- Shape/line Copy/Paste on the same and different pages; all three fill styles; Delete; and regular text/screenshot clipboard behavior.
- Edge-arrow panel placement on desktop/mobile and the top arrow without a reserved blank row.
- Physical pen/palm input on the target teaching screen.
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

| Problem                                  | What to check                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Offline access is unavailable            | Use HTTPS or localhost, open online first, and wait for **Ready offline**.                                        |
| Changes do not appear after deployment   | Check the service worker revision, choose **Check updates**, then close all app windows and reopen.               |
| Autosave fails                           | Download the lesson with **Save lesson** and check whether browser storage is available or full.                  |
| A lesson file will not open              | Use a TutorBoard JSON export. The importer accepts files up to 40 MiB and 100 pages and validates their contents. |
| A new asset returns 404 after deployment | Ensure the file is included in `.assetsignore`.                                                                   |

## Third-party software

PDF export uses the bundled `pdf-lib` library. Its license is included in [vendor/pdf-lib-LICENSE.md](vendor/pdf-lib-LICENSE.md). This repository does not currently include a license for the TutorBoard application itself.

### Drawing regression checks

Run `node --test tests/*.test.cjs` for the unit regressions. `tests/browser-editing.cjs` exercises real browser event handlers, shape controls, text editing/history, welcome-message visibility, and simultaneous pen/touch events. `tests/browser-shapes.cjs` checks native keyboard shape/text copy-paste, fill-pattern rendering, hover cursors, history, JSON save/reopen, and PNG export. Start the local server on port 8765, make Playwright available through `PLAYWRIGHT_MODULE` (or a normal installation), and run `node tests/browser-editing.cjs` and `node tests/browser-shapes.cjs`; both use installed Microsoft Edge. Override `BOARD_URL` if needed. Synthetic input tests do not replace a physical stylus/touch check.

Fit to window fills the full available board width and height on laptops and monitors, including after panel changes. Display proportions adapt to the screen; saved lesson coordinates and export dimensions remain unchanged. Zoom in to scroll around a larger view.

Graph grids: set **X-axis subdivisions** and **Y-axis subdivisions** in Graph & axes (1 = major grid only; 5 or 10 = that many small intervals between major ticks). Each axis uses its own numeric scale. **Grid opacity** ranges from 0% to 100% without dimming axes, labels, or curves. Select an existing graph and open the tools panel to edit these settings under **GRAPH GRID**. Changes support Undo, saved lessons, and exports.

Select a graph and open the tools panel to change each curve color under **GRAPH COLORS**. Hover over a graph for the magnifier cursor; click to show a circular 3x zoom with a center crosshair and approximate axis coordinates. Drag still moves the graph. Escape, the close button, or another board click dismisses the lens. The lens is a viewing aid and is excluded from saved lessons and exports.

Inside the graph lens, move the pointer to inspect coordinates and click to pin a green point marker. Nearby curves and axes snap to their values; nearby intercepts are refined numerically and labeled. The readout rounds values to nine significant digits; it is not a symbolic exact-value solver. Moving away retains the pinned point; click another point to replace it.

The magnifier cursor and click-to-zoom apply only inside the graph plot grid. Graph labels and outer margins use the move cursor.

Use **X-axis interval** and **Y-axis interval** to set major grid/tick spacing independently (for example 1, 2, 5, or 0.5). Leave blank for automatic spacing. Subdivisions divide that chosen interval. These settings are available when inserting a graph and when selecting one under GRAPH GRID, and persist in lessons and exports.

New graphs default to an interval of **1** and **5 subdivisions** on both axes (small intervals of 0.2).
