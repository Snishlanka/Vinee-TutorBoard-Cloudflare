'use strict';
// Library UI delegates all writes and switching to the existing autosave/locking lifecycle.
(() => {
  const dialog = document.createElement('dialog');
  dialog.id = 'lesson-library';
  dialog.setAttribute('aria-labelledby', 'lesson-library-heading');
  dialog.innerHTML = `<div class="lesson-library-shell">
    <header class="lesson-library-header"><div class="lesson-library-heading"><span class="eyebrow">YOUR TEACHING SPACE</span><h2 id="lesson-library-heading">Lesson library</h2><p>Pick up where you left off.</p></div><button type="button" id="lesson-library-new">New lesson</button><button type="button" class="lesson-library-close" aria-label="Close lesson library">×</button></header>
    <div class="lesson-library-toolbar"><label class="lesson-library-search-label"><span class="sr-only">Search lessons by name or subject</span><input id="lesson-library-search" class="lesson-library-search" type="search" placeholder="Search lessons or subjects…" maxlength="100"></label><button type="button" class="lesson-library-save primary">Save current lesson</button></div>
    <p id="lesson-library-status" role="status" aria-live="polite"></p><div id="lesson-library-grid" class="lesson-library-grid"></div>
    <div class="lesson-library-empty" hidden><span aria-hidden="true">✦</span><h3>Your next great lesson starts here</h3><p>Save your current lesson to keep it in this library.</p></div>
    <footer class="lesson-library-footnote">Stored in this browser, on this device. Use File → Save lesson for a portable backup.</footer>
  </div>`;
  document.body.append(dialog);
  const search = dialog.querySelector('input'),
    grid = dialog.querySelector('.lesson-library-grid'),
    status = dialog.querySelector('[role=status]');
  let options,
    records = [],
    busy = false,
    opener;
  const text = (tag, className, value) => {
    const e = document.createElement(tag);
    e.className = className;
    e.textContent = value;
    return e;
  };
  function date(value) {
    const d = new Date(value);
    return Number.isFinite(d.getTime())
      ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Recently';
  }
  function setBusy(value) {
    busy = value;
    dialog.setAttribute('aria-busy', String(value));
    dialog.querySelectorAll('button,input').forEach((e) => {
      e.disabled = value || e.dataset.keepDisabled === 'true';
    });
  }
  async function run(action, message, refresh = true) {
    if (busy) return;
    setBusy(true);
    status.classList.remove('state-error');
    status.textContent = 'Saving…';
    try {
      await action();
      if (refresh) {
        records = await options.refresh();
        render();
      }
      status.textContent = message || '';
      return true;
    } catch (error) {
      status.textContent =
        error?.message || 'Something went wrong. Your saved lessons have been kept.';
      status.classList.add('state-error');
      return false;
    } finally {
      setBusy(false);
    }
  }
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = records
      .filter((r) => `${r.title} ${r.subject || ''}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => (b.lastOpenedAt || b.savedAt) - (a.lastOpenedAt || a.savedAt));
    grid.replaceChildren();
    for (const record of visible) {
      const current = record.id === options.currentId,
        card = text('article', 'lesson-card', '');
      card.dataset.lessonId = record.id;
      const preview = text('div', 'lesson-card-preview', '');
      if (record.thumbnail) {
        const img = document.createElement('img');
        img.src = record.thumbnail;
        img.alt = '';
        img.loading = 'lazy';
        preview.append(img);
      } else {
        preview.append(
          text('span', 'lesson-card-placeholder', 'V'),
          text('span', 'lesson-card-placeholder-label', 'Ready to teach')
        );
      }
      if (current) preview.append(text('span', 'lesson-library-card-current', 'Current lesson'));
      const body = text('div', 'lesson-card-body', '');
      body.append(
        text('h3', 'lesson-card-title', record.title),
        text('span', 'lesson-card-subject', record.subject || 'General lesson'),
        text(
          'p',
          'lesson-card-meta',
          `${record.pageCount} ${record.pageCount === 1 ? 'page' : 'pages'}${record.hasBook ? ' · PDF book' : ''} · Opened ${date(record.lastOpenedAt || record.savedAt)}`
        )
      );
      const fields = text('details', 'lesson-card-fields', '');
      fields.append(text('summary', '', 'Edit details'));
      for (const [key, label, max] of [
        ['title', 'Lesson name', 100],
        ['subject', 'Subject', 80],
      ]) {
        const wrap = document.createElement('label'),
          input = document.createElement('input');
        wrap.append(text('span', '', label));
        input.className = `lesson-card-${key}-input`;
        input.value = record[key] || '';
        input.maxLength = max;
        input.autocomplete = 'off';
        input.addEventListener('change', () =>
          run(() => options.onMetadata(record.id, { [key]: input.value }), 'Lesson details saved.')
        );
        wrap.append(input);
        fields.append(wrap);
      }
      body.append(fields);
      const actions = text('div', 'lesson-card-actions', ''),
        open = text('button', 'primary', current ? 'Back to lesson' : 'Continue lesson'),
        remove = text('button', 'lesson-card-delete', 'Delete');
      open.type = remove.type = 'button';
      open.dataset.lessonOpen = record.id;
      remove.dataset.lessonDelete = record.id;
      open.onclick = async () => {
        if (current) {
          dialog.close();
          return;
        }
        if (await run(() => options.onOpen(record.id), '', false)) dialog.close();
      };
      remove.disabled = current;
      remove.dataset.keepDisabled = String(current);
      remove.setAttribute('aria-label', `Delete ${record.title}`);
      remove.onclick = async () => {
        if (confirm(`Delete “${record.title}” from this device? Downloaded lesson files are kept.`))
          await run(() => options.onDelete(record.id), 'Lesson deleted from this device.');
      };
      actions.append(open, remove);
      card.append(preview, body, actions);
      grid.append(card);
    }
    const empty = dialog.querySelector('.lesson-library-empty');
    empty.hidden = !!visible.length;
    empty.querySelector('h3').textContent = query
      ? 'No matching lessons'
      : 'Your next great lesson starts here';
    empty.querySelector('p').textContent = query
      ? 'Try another lesson name or subject.'
      : 'Save your current lesson to keep it in this library.';
    grid.hidden = !visible.length;
  }
  dialog.querySelector('#lesson-library-new').onclick = async () => {
    if (await run(options.onCreate, '', false)) dialog.close();
  };
  search.addEventListener('input', render);
  dialog.querySelector('.lesson-library-close').onclick = () => {
    if (!busy) dialog.close();
  };
  dialog.addEventListener('cancel', (e) => {
    if (busy) e.preventDefault();
  });
  dialog.addEventListener('close', () => opener?.focus?.());
  dialog.querySelector('.lesson-library-save').onclick = () =>
    run(options.onSave, 'Saved in your lesson library.');
  window.TutorLessonLibrary = {
    async show(config) {
      options = config;
      records = config.records;
      status.textContent = '';
      status.classList.remove('state-error');
      search.value = '';
      render();
      if (!dialog.open) {
        opener = document.activeElement;
        dialog.showModal();
      }
      search.focus();
    },
  };
})();
