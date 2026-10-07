// Presentation layer: keep the existing editor controls and their event handlers.
(() => {
  const VERSION = '2.0.0';
  const icons = {
    pen: '<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5M4 15l5 5"/>',
    eraser: '<path d="m15 3 6 6-11 12H6l-4-4Z"/><path d="m7 12 7 7M10 21h12"/>',
    text: '<path d="M4 6V3h16v3M12 3v18M8 21h8"/>',
    highlighter: '<path d="m15 3 6 6-9 9-6-6Z"/><path d="m6 12-3 6 3 3 6-3M3 21h18"/>',
    rect: '<rect x="3" y="5" width="18" height="14" rx="2"/>',
    circle: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
    triangle: '<path d="m12 3 10 18H2Z"/>',
    line: '<path d="M4 20 20 4"/>',
    arrow: '<path d="M4 20 20 4M8 4h12v12"/>',
    laser: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
    move: '<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/>',
    graph: '<path d="M4 3v17h17M7 15l4-6 4 3 5-7"/>',
    geometry: '<path d="m12 3 9 17H3Z"/><circle cx="12" cy="3" r="1"/><path d="M12 3v17"/>',
  };
  const svg = name => `<svg class="studio-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.arrow}</svg>`;
  const labels = { pen: 'Chalk', eraser: 'Eraser', text: 'Text', highlighter: 'Highlight', rect: 'Rectangle', circle: 'Ellipse', triangle: 'Triangle', line: 'Line', arrow: 'Arrow', laser: 'Laser', move: 'Move' };
  document.querySelectorAll('[data-app-version]').forEach(el => { el.textContent = `v${VERSION}`; });
  document.documentElement.dataset.appVersion = VERSION;
  document.querySelectorAll('[data-tool]').forEach(button => {
    const name = button.dataset.tool;
    button.innerHTML = svg(name) + (button.closest('#connector-menu') ? `<span>${labels[name]}</span>` : '');
    button.setAttribute('aria-label', labels[name]);
    button.setAttribute('aria-pressed', String(button.classList.contains('active')));
  });
  const connectorMarkup = name => svg(name) + '<span class="chevron" aria-hidden="true">⌄</span>';
  document.getElementById('connector-toggle').innerHTML = connectorMarkup('arrow');
  function syncInspector() {
    const color = document.getElementById('shape-fill-color');
    const hex = document.getElementById('shape-fill-hex');
    if (hex) {
      hex.textContent = color.value.toUpperCase();
      hex.classList.toggle('is-disabled', color.disabled);
    }
    requestInspector();
  }
  let inspectorFrame = 0;
  function requestInspector() {
    if (inspectorFrame) return;
    inspectorFrame = requestAnimationFrame(() => {
      inspectorFrame = 0;
      // Wait for pointer completion so expanding the board layout cannot shift a drag.
      if (activePointer || document.body.classList.contains('present')) return;
      if (!selected || !page().objects.includes(selected) || tool === 'eraser') return;
      if (!canTransform(selected) && selected.type !== 'graph') return;
      if (document.body.classList.contains('tools-hidden')) {
        document.body.classList.remove('tools-hidden');
        syncPanels();
      }
    });
  }
  canvas.addEventListener('pointerup', requestInspector);
  canvas.addEventListener('pointercancel', requestInspector);
  let toolbarFrame = 0;
  function positionTextToolbar() {
    if (toolbarFrame) return;
    toolbarFrame = requestAnimationFrame(() => {
      toolbarFrame = 0;
      const options = document.getElementById('text-options');
      const editor = document.getElementById('text-editor');
      const target = selected?.type === 'text' && page().objects.includes(selected) ? selected : null;
      options.hidden = editor.hidden && !target;
      if (options.hidden) return;
      const surface = canvas.getBoundingClientRect();
      const stage = boardStage.getBoundingClientRect();
      const anchor = !editor.hidden ? editor.getBoundingClientRect() : {
        left: surface.left + target.x * surface.width / W,
        top: surface.top + target.y * surface.height / H,
        right: surface.left + (target.x + target.w) * surface.width / W,
        bottom: surface.top + (target.y + target.h) * surface.height / H,
      };
      if (anchor.bottom < stage.top || anchor.top > stage.bottom || anchor.right < stage.left || anchor.left > stage.right) {
        options.hidden = true;
        return;
      }
      const box = options.getBoundingClientRect();
      options.style.left = Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8)) + 'px';
      let top = anchor.top - box.height - 10;
      if (top < stage.top + 4) top = anchor.bottom + 10;
      options.style.top = Math.max(stage.top + 4, Math.min(top, innerHeight - box.height - 8)) + 'px';
    });
  }
  window.TutorStudio = Object.freeze({ version: VERSION, connectorMarkup, syncInspector, positionTextToolbar });

  // Keep tutor details available at every viewport without crowding the header.
  const tutorLabel = document.createElement('label');
  tutorLabel.className = 'file-tutor';
  tutorLabel.textContent = 'Tutor name';
  tutorLabel.append(document.getElementById('tutor-name'));
  document.querySelector('.file-actions').append(tutorLabel);

  // Move actual controls rather than cloning them; IDs, keyboard and IME behavior stay intact.
  const quickTools = document.querySelector('.quick-tools');
  const toolGrid = document.getElementById('tool-grid');
  const highlighter = toolGrid.querySelector('[data-tool="highlighter"]');
  quickTools.insertBefore(highlighter, document.getElementById('eraser-picker'));
  toolGrid.classList.add('studio-shapes');
  toolGrid.setAttribute('role', 'group');
  toolGrid.setAttribute('aria-label', 'Shapes');
  quickTools.insertBefore(toolGrid, document.querySelector('[data-tool="laser"]'));

  const toolsPanel = document.getElementById('tools-panel');
  const textOptions = document.getElementById('text-options');
  textOptions.classList.add('floating-text-toolbar');
  textOptions.setAttribute('aria-label', 'Selected text formatting');
  const fontColor = document.createElement('label');
  fontColor.className = 'text-font-color';
  fontColor.title = 'Font color';
  fontColor.innerHTML = '<span aria-hidden="true">A</span><input id="text-color" type="color" aria-label="Font color" value="#171717" />';
  textOptions.insertBefore(fontColor, document.getElementById('text-list'));
  document.getElementById('text-color').onchange = e => {
    const value = e.target.value;
    const editor = document.getElementById('text-editor');
    if (!editor.hidden) {
      editor.dataset.color = value;
      editor.style.color = value;
      syncTextControls();
    } else formatText({ color: value });
  };
  document.body.append(textOptions);
  boardStage.addEventListener('scroll', positionTextToolbar);
  window.addEventListener('resize', positionTextToolbar);
  const sizeControls = document.createElement('div');
  sizeControls.className = 'text-size-controls';
  const sizeLabel = textOptions.querySelector('label[for="text-size"]');
  sizeLabel.before(sizeControls);
  sizeControls.append(sizeLabel, document.getElementById('text-smaller'), document.getElementById('text-size'), document.getElementById('text-larger'));

  function inspectorSection(parent, title, nodes) {
    const section = document.createElement('section');
    section.className = 'inspector-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.append(heading, ...nodes);
    parent.append(section);
    return section;
  }
  const shapeEdit = document.getElementById('shape-edit');
  const fill = document.getElementById('shape-fill-options');
  fill.classList.add('inspector-section');
  fill.insertAdjacentHTML('afterbegin', '<h3>Appearance</h3>');
  const picker = document.getElementById('shape-fill-color');
  const colorField = document.createElement('div');
  colorField.className = 'inspector-color';
  picker.before(colorField);
  colorField.append(picker);
  colorField.insertAdjacentHTML('beforeend', '<output id="shape-fill-hex" aria-label="Fill color hexadecimal value"></output>');
  picker.addEventListener('input', syncInspector);
  const rotationLabel = document.getElementById('shape-rotation').closest('label');
  rotationLabel.firstChild.textContent = 'Angle · degrees';
  const rotationButtons = shapeEdit.querySelector('.history');
  inspectorSection(shapeEdit, 'Rotation', [rotationLabel, rotationButtons]);
  const dimensions = document.createElement('div');
  dimensions.className = 'inspector-dimensions';
  for (const [id, label] of [['shape-width', 'Width · px'], ['shape-height', 'Height · px']]) {
    const field = document.getElementById(id).closest('label');
    field.firstChild.textContent = label;
    dimensions.append(field);
  }
  inspectorSection(shapeEdit, 'Dimensions', [dimensions, document.getElementById('apply-shape-size')]);
  for (const id of ['geometry-edit', 'image-edit']) {
    const panel = document.getElementById(id);
    const field = panel.querySelector('input[id$="rotation"]').closest('label');
    field.firstChild.textContent = 'Angle · degrees';
    const history = panel.querySelector('.history');
    const rest = [...panel.children].filter(node => node !== field && node !== history);
    inspectorSection(panel, 'Rotation', [field, history]);
    inspectorSection(panel, id === 'geometry-edit' ? 'Diagram details' : 'Dimensions', rest);
  }
  for (const [left, right] of [['shape-rotate-left', 'shape-rotate-right'], ['rotate-left', 'rotate-right'], ['image-rotate-left', 'image-rotate-right']]) {
    for (const [id, direction] of [[left, 'left'], [right, 'right']]) {
      const button = document.getElementById(id);
      button.innerHTML = `<svg class="studio-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${direction === 'right' ? ' style="transform:scaleX(-1)"' : ''}><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></svg><span>15°</span>`;
      button.setAttribute('aria-label', `Rotate ${direction} 15 degrees`);
      button.title = `Rotate ${direction} 15 degrees`;
    }
  }
  document.querySelectorAll('#object-options .tip').forEach(tip => {
    const owner = tip.parentElement;
    const help = document.createElement('details');
    help.className = 'inspector-help';
    help.innerHTML = `<summary>${owner === fill ? 'Fill tips' : 'Editing tips'}</summary>`;
    tip.before(help);
    help.append(tip);
    if (owner === shapeEdit) shapeEdit.append(help);
  });
  syncInspector();

  const paper = document.getElementById('paper-controls');
  const settings = document.createElement('details');
  settings.id = 'board-settings';
  settings.className = 'studio-menu';
  settings.innerHTML = '<summary>Board settings <span aria-hidden="true">⌄</span></summary>';
  paper.before(settings);
  settings.append(paper);
  paper.classList.add('studio-popover');

  for (const [id, icon, label] of [['graph-tools', 'graph', 'Graph & axes'], ['geometry-tools', 'geometry', 'Geometry diagrams']]) {
    document.getElementById(id).innerHTML = svg(icon) + `<span>${label}</span>`;
  }

  const about = document.createElement('dialog');
  about.id = 'about-dialog';
  about.setAttribute('aria-labelledby', 'about-heading');
  about.innerHTML = `<div class="about-symbol">V</div><span class="eyebrow">YOUR TEACHING STUDIO</span><h2 id="about-heading">Vinee TutorBoard <span data-app-version>v${VERSION}</span></h2><p>More room to teach. More ways to explain.</p><h3>What's new in v2.0.0</h3><ul><li>Compact headers, responsive drawing icons and refined light/dark themes.</li><li>Translucent text formatting with font color and Japanese IME support.</li><li>Shape fill, rotation and size controls; live RGB/hex colors with Apply.</li><li>Editable tables with transparent, white or black backgrounds.</li><li>Statistics: histograms, frequency polygons and smooth cumulative curves.</li><li>Teach Q1, Median and Q3 step by step with guides and coordinates.</li><li>Read any X or Y value on cumulative curves and function graphs.</li><li>Point labels, independent grid intervals, subdivisions and opacity.</li><li>Save your charts, tables and teaching settings in lessons and local drafts.</li></ul><div class="modal-actions"><button id="about-close" class="primary">Back to board</button></div>`;
  document.body.append(about);
  const majorChanges=[
    'A compact, responsive teaching studio with refined light and dark themes.',
    'Floating text formatting, font colors and Japanese IME support.',
    'Improved shape styling, rotation, sizing and live color selection.',
    'Editable tables with transparent, white or black backgrounds.',
    'Statistics charts with smooth cumulative curves and step-by-step quartile teaching.',
    'Read any X or Y value on function graphs and cumulative curves, with guides and coordinates.',
    'Floating statistics formatting and adjustable grid controls.'
  ];
  about.querySelector('ul').replaceChildren(...majorChanges.map(text=>{const item=document.createElement('li');item.textContent=text;return item;}));
  document.getElementById('about-open').onclick = () => { commitText(); about.showModal(); };
  document.getElementById('about-close').onclick = () => about.close();

  const menus = [...document.querySelectorAll('.studio-menu')];
  function closeMenu(menu, restoreFocus = false) {
    menu.open = false;
    if (restoreFocus) menu.querySelector('summary').focus();
  }
  menus.forEach(menu => {
    menu.addEventListener('toggle', () => {
      if (menu.open) menus.filter(other => other !== menu).forEach(other => closeMenu(other));
    });
    menu.addEventListener('click', e => {
      if (menu.id === 'file-menu' && e.target.closest('button')) closeMenu(menu, true);
    });
  });
  document.addEventListener('pointerdown', e => {
    menus.filter(menu => !menu.contains(e.target)).forEach(menu => closeMenu(menu));
  });
  document.addEventListener('keydown', e => {
    if (isIMEKey(e) || e.key !== 'Escape') return;
    const open = menus.find(menu => menu.open);
    if (open) { e.preventDefault(); closeMenu(open, true); }
  });
  window.addEventListener('resize', () => menus.forEach(menu => closeMenu(menu)));
  // Keyboard focus moving out of a menu closes it too.
  menus.forEach(menu => menu.addEventListener('focusout', e => {
    if (e.relatedTarget && !menu.contains(e.relatedTarget)) closeMenu(menu);
  }));
  layoutBoard();
  syncPanels();
  positionTextToolbar();
})();
