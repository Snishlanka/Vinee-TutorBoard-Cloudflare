# Changelog

## v2.2.0 — PDF Book View

- PDF book opens the loaded book, or chooses a local PDF when none is loaded; Change PDF replaces it.
- Dedicated plain PDF reader with full screen/back, compact header/tools and bottom-left Previous / bottom-right Next navigation.
- Laser and Fit to window defaults; right-drag panning and pointer-anchored Ctrl/Cmd+wheel zoom (25–400%).
- Board-equivalent chalk cursors, fading laser trails, rich text boxes, shape handles, fill/rotation/size controls, erasers and shared RGB/hex picker.
- Text-box Next page appears only when overflow needs continuation, with less padding for normal text.
- A crosshair Crop tool only in the PDF toolbar; only selected crops become board images.
- Lesson JSON and local drafts include the original loaded PDF and all page-specific notes.
- PDF export produces two files: the lesson/board PDF and a separate annotated book PDF, with individual download actions.
- Classic renderer/worker bundles with a main-thread fallback support restricted previews; runtime assets and license notices are bundled for offline use.
- PDFs up to 100 MiB and lesson JSON imports up to 200 MiB; large-file save/reopen, tool parity, mobile/full-screen and offline paths verified.

## v2.1.1 — Exercise timer polish

- Redesigned countdown chip and setup panel with quick durations and live preview.
- Starting or resuming automatically closes the dropdown.
- Designed Time’s up dialog with return-to-board and repeat-exercise actions.
- Keyboard dismissal, theme support and reduced-motion support.


## v2.1.0 — Text formatting and exercise timer

- Ctrl/Cmd+B and Ctrl/Cmd+U format selected text; mixed formatting survives saving and exports.
- Formatting controls dock above the board without obscuring lower typing lines.
- Board-bounded text editing without internal scrolling and an in-box Next page button.
- Top-right countdown for timed exercises with pause, resume, reset and time-up status.
- Updated About/home release notes and offline cache.


## v2.0.0 — Teaching studio

### Workspace and styling

- Compact header and action rows give the board more space.
- Responsive tool icons, swatches and buttons scale together across screen sizes.
- Refined light/dark themes, page cards and contextual object controls.
- File menu groups lesson open/save, PNG/PDF export and tutor details.
- Version badge opens updated About and What's new notes.

### Text and drawing

- Translucent floating text toolbar includes font color and formatting.
- Automatic text placement removes the separate Place text action.
- Japanese IME candidate keys remain available during composition.
- Shape controls group fill, rotation and dimensions; selecting objects opens the studio panel.
- Color swatches show selection ticks; custom colors apply live with RGB/hex inputs and an Apply button.

### Tables and statistics

- Editable tables with pasted values, header rows and transparent/white/black backgrounds.
- Histograms, frequency polygons and cumulative frequency curves from class boundaries and frequencies.
- Unequal-width histograms use frequency density; optional frequency tables include cumulative totals.
- Monotone smooth cumulative curves, optional straight segments and point-coordinate labels.
- Q1, Median and Q3 markers at N/4, N/2 and 3N/4 with staged teaching guides and coordinates.
- X-to-Y and Y-to-X reading on cumulative curves and function graphs, with visible guides.
- Independent X/Y intervals, subdivisions, grid visibility and opacity for statistics charts.
- Translucent floating statistics formatting toolbar for background, color, points, smooth curves and grid settings after insertion.
- Statistics toolbar appears below the chart (above when space is limited), with a top-right Close button; clicking/selecting the chart reopens it.
- Move tool activates automatically after inserting statistics and function graphs.
- Function-graph reading labels appear above each intersection with contrasting backgrounds and reduced overlap.
- Statistics major and subdivision grid lines use consistent thickness and opacity; original plot proportions are retained.
- Tables, chart settings and teaching state support lesson save/reopen, local drafts, undo/redo and export.

### Notes

- Quartile values are grouped-data estimates from the displayed curve. Smooth and straight views may differ.
- Flat cumulative sections return the first matching X. Function-graph inverse reading lists numerical intersections in the visible range and may miss narrow or rapidly oscillating intersections.
- The app version is v2.0.0; the editable lesson format remains version 2.
