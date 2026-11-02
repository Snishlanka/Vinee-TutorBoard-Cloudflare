// Reading aids are lesson metadata, separate from permanent ink and exported pages.
function createPDFStudy({
  dialog,
  frame,
  getReader,
  navigate,
  thumbnail,
  changed,
  prepare,
  activate,
  deactivate,
  layout,
}) {
  const $ = (id) => dialog.querySelector('#' + id);
  const icon = (path) =>
    `<svg class="studio-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
  const toggle = document.createElement('button');
  toggle.id = 'pdf-sidebar-toggle';
  toggle.type = 'button';
  toggle.title = 'Browse pages and bookmarks';
  toggle.setAttribute('aria-label', toggle.title);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'pdf-book-sidebar');
  toggle.innerHTML = icon('M3 4h18v16H3zM9 4v16M5.5 8h1M5.5 12h1M5.5 16h1');
  dialog.querySelector('.pdf-reader-header').prepend(toggle);
  const bookmark = document.createElement('button');
  bookmark.id = 'pdf-bookmark-toggle';
  bookmark.type = 'button';
  bookmark.title = 'Bookmark this page';
  bookmark.setAttribute('aria-label', bookmark.title);
  bookmark.setAttribute('aria-pressed', 'false');
  bookmark.innerHTML = icon('M6 3h12v18l-6-4-6 4z');
  toggle.after(bookmark);
  const sidebar = document.createElement('aside');
  sidebar.id = 'pdf-book-sidebar';
  sidebar.hidden = true;
  sidebar.setAttribute('aria-label', 'Book navigation');
  sidebar.innerHTML = `<div class="pdf-sidebar-head"><div><span class="pdf-eyebrow">YOUR BOOK</span><h3>Find your place</h3></div><button type="button" class="pdf-sidebar-close" aria-label="Close book navigation">×</button></div>
    <div class="pdf-sidebar-tabs" role="tablist" aria-label="Book navigation"><button type="button" id="pdf-sidebar-pages" role="tab" aria-selected="true" aria-controls="pdf-sidebar-list">Pages</button><button type="button" id="pdf-sidebar-bookmarks" role="tab" aria-selected="false" aria-controls="pdf-sidebar-list" tabindex="-1">Bookmarks</button></div>
    <form id="pdf-bookmark-form" hidden><label for="pdf-bookmark-name">Page bookmark</label><input id="pdf-bookmark-name" maxlength="80" placeholder="e.g. Exercise 01" required /><div><button type="submit" id="pdf-bookmark-save">Save bookmark</button><button type="button" id="pdf-bookmark-cancel">Cancel</button></div></form>
    <button type="button" id="pdf-earlier-pages" hidden>Previous pages</button><div class="pdf-sidebar-list" id="pdf-sidebar-list" role="tabpanel" aria-labelledby="pdf-sidebar-pages" tabindex="0"></div><button type="button" id="pdf-more-pages" hidden>Next pages</button><p id="pdf-study-status" role="status"></p>`;
  dialog.querySelector('.pdf-reader-body').prepend(sidebar);
  const revealTool = document.createElement('button');
  revealTool.id = 'pdf-reveal-tool';
  revealTool.type = 'button';
  revealTool.title = 'Cover an answer: drag an area, then click to reveal';
  revealTool.setAttribute('aria-label', 'Cover an answer');
  revealTool.setAttribute('aria-pressed', 'false');
  revealTool.innerHTML = icon('M3 6h18v13H3zM8 3h8M8 10h8M8 14h4');
  dialog.querySelector('#pdf-teaching-toolbar .quick-tools').append(revealTool);
  const options = document.createElement('div');
  options.id = 'pdf-reveal-options';
  options.hidden = true;
  options.innerHTML =
    '<span id="pdf-cover-count">Drag over an answer to cover it</span><button type="button" id="pdf-hide-all">Hide all</button><button type="button" id="pdf-reveal-all">Reveal all</button><button type="button" id="pdf-delete-cover" disabled>Delete selected</button><button type="button" id="pdf-clear-covers">Clear page covers</button><span class="pdf-cover-export-note">Teaching covers stay out of PDF exports.</span>';
  dialog.querySelector('#pdf-teaching-toolbar').after(options);
  const layer = document.createElement('div');
  layer.id = 'pdf-reveal-layer';
  layer.setAttribute('aria-label', 'Answer covers');
  frame.append(layer);
  let mode = false,
    selected = -1,
    gesture = null,
    tab = 'pages',
    shown = 0,
    generation = 0,
    firstPage = 1;
  let observedData = null;
  const cache = new Map();
  const status = (text = '') => {
    $('pdf-study-status').textContent = text;
  };
  function setSidebar(open) {
    sidebar.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) refreshList();
    else {
      $('pdf-bookmark-form').hidden = true;
      toggle.focus();
    }
  }
  toggle.onclick = () => setSidebar(sidebar.hidden);
  sidebar.querySelector('.pdf-sidebar-close').onclick = () => setSidebar(false);
  function setTab(value) {
    tab = value;
    for (const name of ['pages', 'bookmarks']) {
      $('pdf-sidebar-' + name).setAttribute('aria-selected', String(name === tab));
      $('pdf-sidebar-' + name).tabIndex = name === tab ? 0 : -1;
    }
    $('pdf-sidebar-list').setAttribute('aria-labelledby', 'pdf-sidebar-' + tab);
    shown = 0;
    refreshList();
  }
  for (const name of ['pages', 'bookmarks']) {
    $('pdf-sidebar-' + name).onclick = () => setTab(name);
    $('pdf-sidebar-' + name).onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      setTab(
        event.key === 'Home'
          ? 'pages'
          : event.key === 'End'
            ? 'bookmarks'
            : tab === 'pages'
              ? 'bookmarks'
              : 'pages'
      );
      $('pdf-sidebar-' + tab).focus();
    };
  }
  function go(number) {
    if (matchMedia('(max-width: 700px)').matches) setSidebar(false);
    navigate(number);
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          queueThumbnail(entry.target, generation);
        }
    },
    { root: $('pdf-sidebar-list'), rootMargin: '120px' }
  );
  let queue = Promise.resolve();
  function queueThumbnail(card, token) {
    const r = getReader(),
      data = r?.data,
      number = +card.dataset.page;
    queue = queue.then(async () => {
      if (token !== generation || !card.isConnected || sidebar.hidden || getReader()?.data !== data)
        return;
      try {
        let image = cache.get(number);
        if (!image) {
          image = await thumbnail(data, number);
          if (token !== generation || getReader()?.data !== data) return;
          cache.set(number, image);
          if (cache.size > 40) cache.delete(cache.keys().next().value);
        }
        const canvas = card.querySelector('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        card.classList.add('is-ready');
      } catch {
        card.classList.add('is-unavailable');
      }
    });
  }
  function refreshList(batch = null) {
    if (sidebar.hidden) return;
    const r = getReader();
    if (!r) return;
    const list = $('pdf-sidebar-list');
    generation++;
    observer.disconnect();
    list.replaceChildren();
    $('pdf-more-pages').hidden = true;
    $('pdf-earlier-pages').hidden = true;
    if (tab === 'bookmarks') {
      const entries = [...(r.bookmarks || [])].sort((a, b) => a.page - b.page);
      if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'pdf-sidebar-empty';
        empty.innerHTML =
          '<strong>Keep the useful pages close.</strong><p>Use the bookmark button above to name a question or exercise.</p>';
        list.append(empty);
      }
      for (const item of entries) {
        const row = document.createElement('div');
        row.className = 'pdf-bookmark-item';
        const link = document.createElement('button');
        link.type = 'button';
        const title = document.createElement('strong'),
          meta = document.createElement('span');
        title.textContent = item.title;
        meta.textContent = 'Page ' + item.page;
        link.append(title, meta);
        link.onclick = () => go(item.page);
        if (r.number === item.page) link.setAttribute('aria-current', 'page');
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'pdf-bookmark-delete';
        remove.textContent = '×';
        remove.setAttribute('aria-label', 'Remove bookmark ' + item.title);
        remove.onclick = () => {
          r.bookmarks = r.bookmarks.filter((b) => b.page !== item.page);
          changed();
          syncBookmark();
          refreshList();
        };
        row.append(link, remove);
        list.append(row);
      }
      return;
    }
    const start =
      batch === null
        ? Math.floor((r.number - 1) / 24) * 24 + 1
        : Math.max(1, Math.min(r.total, batch));
    firstPage = start;
    shown = Math.min(r.total, start + 23);
    for (let n = start; n <= shown; n++) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pdf-thumb-card';
      card.dataset.page = n;
      card.setAttribute('aria-label', 'Go to page ' + n);
      if (n === r.number) card.setAttribute('aria-current', 'page');
      card.innerHTML =
        '<canvas aria-hidden="true"></canvas><span class="pdf-thumb-label">Page ' + n + '</span>';
      card.onclick = () => go(n);
      list.append(card);
      observer.observe(card);
    }
    $('pdf-more-pages').hidden = shown >= r.total;
    $('pdf-earlier-pages').hidden = start === 1;
    list.scrollTop = 0;
    list.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }
  $('pdf-more-pages').onclick = () => refreshList(shown + 1);
  $('pdf-earlier-pages').onclick = () => refreshList(firstPage - 24);
  function syncBookmark() {
    const found = getReader()?.bookmarks?.find((b) => b.page === getReader().number);
    bookmark.setAttribute('aria-pressed', String(!!found));
    bookmark.title = found ? 'Edit bookmark: ' + found.title : 'Bookmark this page';
    bookmark.setAttribute('aria-label', bookmark.title);
  }
  bookmark.onclick = () => {
    const r = getReader();
    if (!r?.canvas || dialog.classList.contains('pdf-is-loading')) return;
    setSidebar(true);
    setTab('bookmarks');
    $('pdf-bookmark-form').hidden = false;
    $('pdf-bookmark-name').value =
      r.bookmarks?.find((b) => b.page === r.number)?.title || 'Page ' + r.number;
    $('pdf-bookmark-name').focus();
    $('pdf-bookmark-name').select();
  };
  $('pdf-bookmark-cancel').onclick = () => {
    $('pdf-bookmark-form').hidden = true;
    bookmark.focus();
  };
  $('pdf-bookmark-form').onsubmit = (event) => {
    event.preventDefault();
    const r = getReader(),
      title = $('pdf-bookmark-name').value.trim();
    if (!r || !title) {
      $('pdf-bookmark-name').focus();
      return;
    }
    r.bookmarks ||= [];
    const old = r.bookmarks.find((b) => b.page === r.number);
    if (old) old.title = title;
    else r.bookmarks.push({ page: r.number, title });
    $('pdf-bookmark-form').hidden = true;
    changed();
    syncBookmark();
    refreshList();
    status('Bookmark saved.');
    bookmark.focus();
  };
  function covers() {
    const r = getReader();
    return r ? ((r.covers ||= {})[r.number] ||= []) : [];
  }
  function paint() {
    layer.replaceChildren();
    const items = covers();
    items.forEach((item, index) => {
      const cover = document.createElement('button');
      cover.type = 'button';
      cover.className = 'pdf-answer-cover';
      cover.classList.toggle('is-revealed', item.revealed);
      cover.classList.toggle('is-selected', index === selected);
      cover.style.left = item.x * 100 + '%';
      cover.style.top = item.y * 100 + '%';
      cover.style.width = item.w * 100 + '%';
      cover.style.height = item.h * 100 + '%';
      cover.setAttribute(
        'aria-label',
        (item.revealed ? 'Hide answer ' : 'Reveal answer ') + (index + 1)
      );
      cover.setAttribute('aria-pressed', String(item.revealed));
      cover.innerHTML =
        '<span class="pdf-cover-label">Answer ' +
        (index + 1) +
        '</span><span class="pdf-cover-action">' +
        (item.revealed ? 'Hide again' : 'Click to reveal') +
        '</span>';
      cover.onclick = (event) => {
        event.stopPropagation();
        if (dialog.classList.contains('pdf-is-loading')) return;
        selected = index;
        item.revealed = !item.revealed;
        changed();
        paint();
        layer.children[index]?.focus({ preventScroll: true });
      };
      layer.append(cover);
    });
    $('pdf-cover-count').textContent = items.length
      ? items.length + ' answer cover' + (items.length === 1 ? '' : 's') + ' · drag to add'
      : 'Drag over an answer to cover it';
    for (const id of ['pdf-hide-all', 'pdf-reveal-all', 'pdf-clear-covers'])
      $(id).disabled = !items.length;
    $('pdf-delete-cover').disabled = selected < 0 || !items[selected];
  }
  function setMode(active, restore = true) {
    const wasActive = mode;
    if (active && !wasActive) activate();
    mode = active;
    gesture = null;
    selected = -1;
    if (!active && wasActive && restore) deactivate();
    layer.classList.toggle('is-drawing', mode);
    options.hidden = !mode;
    revealTool.classList.toggle('active', mode);
    revealTool.setAttribute('aria-pressed', String(mode));
    paint();
    layout();
  }
  revealTool.onclick = () => {
    if (!getReader()?.canvas || dialog.classList.contains('pdf-is-loading')) return;
    prepare();
    setMode(!mode);
  };
  dialog.addEventListener('pdftoolchange', (event) => {
    if (event.detail !== 'cover' && mode) setMode(false, false);
  });
  dialog.querySelector('#pdf-teaching-toolbar').addEventListener('click', (event) => {
    if (!event.target.closest('#pdf-reveal-tool') && event.target.closest('button')) setMode(false);
  });
  const point = (event) => {
    const b = frame.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - b.left) / b.width)),
      y: Math.max(0, Math.min(1, (event.clientY - b.top) / b.height)),
    };
  };
  layer.onpointerdown = (event) => {
    if (
      !mode ||
      !event.isPrimary ||
      event.button !== 0 ||
      event.target.closest('.pdf-answer-cover') ||
      dialog.classList.contains('pdf-is-loading')
    )
      return;
    if (covers().length >= 100) {
      status('This page already has 100 answer covers.');
      return;
    }
    event.preventDefault();
    const p = point(event);
    gesture = { id: event.pointerId, start: p, end: p };
    layer.setPointerCapture(event.pointerId);
    const ghost = document.createElement('div');
    ghost.className = 'pdf-cover-draft';
    layer.append(ghost);
  };
  layer.onpointermove = (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    gesture.end = point(event);
    const { start: a, end: b } = gesture,
      ghost = layer.querySelector('.pdf-cover-draft');
    Object.assign(ghost.style, {
      left: Math.min(a.x, b.x) * 100 + '%',
      top: Math.min(a.y, b.y) * 100 + '%',
      width: Math.abs(a.x - b.x) * 100 + '%',
      height: Math.abs(a.y - b.y) * 100 + '%',
    });
  };
  layer.onpointerup = (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const { start: a } = gesture,
      b = point(event);
    gesture = null;
    if (layer.hasPointerCapture(event.pointerId)) layer.releasePointerCapture(event.pointerId);
    if (
      Math.abs(a.x - b.x) * frame.clientWidth >= 16 &&
      Math.abs(a.y - b.y) * frame.clientHeight >= 16
    ) {
      covers().push({
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(a.x - b.x),
        h: Math.abs(a.y - b.y),
        revealed: false,
      });
      selected = covers().length - 1;
      changed();
    }
    paint();
  };
  layer.onpointercancel = layer.onlostpointercapture = () => {
    if (gesture) {
      gesture = null;
      paint();
    }
  };
  $('pdf-hide-all').onclick = () => {
    covers().forEach((c) => (c.revealed = false));
    changed();
    paint();
  };
  $('pdf-reveal-all').onclick = () => {
    covers().forEach((c) => (c.revealed = true));
    changed();
    paint();
  };
  $('pdf-delete-cover').onclick = () => {
    if (selected >= 0) {
      covers().splice(selected, 1);
      selected = -1;
      changed();
      paint();
    }
  };
  $('pdf-clear-covers').onclick = () => {
    if (!covers().length || !confirm('Remove all answer covers from this page?')) return;
    covers().splice(0);
    selected = -1;
    changed();
    paint();
  };
  dialog.addEventListener(
    'keydown',
    (event) => {
      if (event.isComposing || event.target.closest('input,textarea,[contenteditable]')) return;
      if (event.key === 'Escape' && mode) {
        event.preventDefault();
        event.stopPropagation();
        setMode(false);
        revealTool.focus();
      }
      if (event.key === 'Delete' && mode && selected >= 0) {
        event.preventDefault();
        event.stopPropagation();
        $('pdf-delete-cover').click();
      }
    },
    true
  );
  return {
    pageChanged() {
      const r = getReader();
      if (r?.data !== observedData) {
        observedData = r?.data;
        cache.clear();
        setSidebar(false);
      }
      generation++;
      selected = -1;
      gesture = null;
      $('pdf-bookmark-form').hidden = true;
      setMode(false);
      syncBookmark();
      refreshList();
      status();
    },
    cancel() {
      gesture = null;
      setMode(false);
    },
    isInteracting: () => !!gesture,
  };
}
