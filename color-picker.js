// App-owned picker: preview changes live, then confirm explicitly with Apply.
(() => {
  const popup = document.createElement('div');
  popup.id = 'studio-color-picker';
  popup.hidden = true;
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', 'Choose color');
  popup.innerHTML = '<div class="picker-heading"><strong>Choose color</strong><button type="button" id="picker-close" aria-label="Close color picker">×</button></div><div id="picker-spectrum" aria-hidden="true"><i id="picker-cursor"></i></div><label class="picker-hue-label">Hue<input id="picker-hue" type="range" min="0" max="360" step="1" aria-label="Hue" /></label><div class="picker-fields"><span id="picker-preview" aria-hidden="true"></span><label>Hex<input id="picker-hex" maxlength="7" spellcheck="false" aria-label="Color hex value" /></label></div><div class="picker-rgb"><label>R<input id="picker-r" type="number" min="0" max="255" aria-label="Red" /></label><label>G<input id="picker-g" type="number" min="0" max="255" aria-label="Green" /></label><label>B<input id="picker-b" type="number" min="0" max="255" aria-label="Blue" /></label></div><div class="picker-footer"><span>Changes apply live</span><button type="button" id="picker-apply" class="primary">✓ Apply</button></div>';
  document.body.append(popup);
  const el = id => document.getElementById(id);
  let source = null, hue = 0, saturation = 1, value = 1;
  function rgb() {
    const c = value * saturation, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = value - c;
    const sectors = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]];
    return sectors[Math.floor(hue / 60) % 6].map(channel => Math.round((channel + m) * 255));
  }
  function setHSV(hex) {
    const channels = hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255);
    const [r,g,b] = channels, max = Math.max(...channels), min = Math.min(...channels), delta = max - min;
    value = max; saturation = max ? delta / max : 0;
    if (delta) hue = ((max === r ? (g-b)/delta : max === g ? (b-r)/delta+2 : (r-g)/delta+4) * 60 + 360) % 360;
  }
  function paint(apply = false) {
    const channels = rgb(), hex = '#' + channels.map(n => n.toString(16).padStart(2, '0')).join('');
    el('picker-spectrum').style.backgroundColor = `hsl(${hue} 100% 50%)`;
    el('picker-cursor').style.left = saturation * 100 + '%';
    el('picker-cursor').style.top = (1-value) * 100 + '%';
    el('picker-hue').value = hue;
    el('picker-hex').value = hex.toUpperCase();
    el('picker-preview').style.background = hex;
    ['r','g','b'].forEach((channel, i) => { el('picker-' + channel).value = channels[i]; });
    if (apply && source && source.value !== hex) {
      source.value = hex;
      source.dispatchEvent(new Event('input', { bubbles: true }));
      source.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function close(restoreFocus = false) {
    popup.hidden = true;
    if (restoreFocus && source) {
      const editor = el('text-editor');
      (source.id === 'text-color' && !editor.hidden ? editor : source).focus({ preventScroll: true });
    }
    source = null;
  }
  function open(input) {
    source = input;
    // A blurred toolbar creates a fixed-position containing block; keep this at viewport level.
    document.body.append(popup);
    setHSV(input.value); paint(); popup.hidden = false;
    const anchor = input.getBoundingClientRect(), box = popup.getBoundingClientRect();
    popup.style.left = Math.max(8, Math.min(anchor.left, innerWidth-box.width-8)) + 'px';
    popup.style.top = Math.max(8, Math.min(anchor.bottom+8, innerHeight-box.height-8)) + 'px';
    el('picker-hex').focus({ preventScroll: true });
  }
  for (const id of ['text-color', 'shape-fill-color', 'custom']) {
    const input = el(id);
    input.addEventListener('pointerdown', event => event.preventDefault());
    input.addEventListener('click', event => { event.preventDefault(); if (!input.disabled) open(input); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(input); }
    });
  }
  const spectrum = el('picker-spectrum');
  function choose(event) {
    const box = spectrum.getBoundingClientRect();
    saturation = Math.max(0, Math.min(1, (event.clientX-box.left)/box.width));
    value = 1-Math.max(0, Math.min(1, (event.clientY-box.top)/box.height));
    paint(true);
  }
  spectrum.onpointerdown = event => { event.preventDefault(); spectrum.setPointerCapture(event.pointerId); choose(event); };
  spectrum.onpointermove = event => { if (spectrum.hasPointerCapture(event.pointerId)) choose(event); };
  el('picker-hue').oninput = event => { hue = +event.target.value; paint(true); };
  el('picker-hex').onchange = event => {
    let hex = event.target.value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[\da-f]{6}$/i.test(hex)) { setHSV(hex); paint(true); }
    else paint();
  };
  ['r','g','b'].forEach(channel => {
    el('picker-' + channel).onchange = () => {
      const channels = ['r','g','b'].map(c => Math.max(0, Math.min(255, Math.round(Number(el('picker-' + c).value) || 0))));
      setHSV('#' + channels.map(n => n.toString(16).padStart(2, '0')).join('')); paint(true);
    };
  });
  el('picker-apply').onclick = () => { paint(true); close(true); };
  el('picker-close').onclick = () => close(true);
  popup.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.key === 'Enter' && event.target.tagName === 'INPUT' && event.target.type !== 'range') {
      event.preventDefault(); event.target.dispatchEvent(new Event('change')); paint(true); close(true);
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!popup.hidden && !popup.contains(event.target) && event.target !== source) {
      const wasText = source?.id === 'text-color';
      close();
      if (wasText && !event.target.closest('#text-options')) commitText();
    }
  }, true);
  window.addEventListener('resize', () => close());
  document.querySelector('.board-stage').addEventListener('scroll', () => close());
})();
