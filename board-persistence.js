'use strict';
// Classic script shares the board's lexical scope without exposing its internals.
window.TutorBoard = {
  snapshot() {
    const lesson = {
      format: 'tutorboard',
      version: 2,
      boardWidth: W,
      boardHeight: H,
      title: $('title').value,
      tutorName: $('tutor-name').value,
      pages: pages.map((p) => ({
        background: p.background,
        boardColor: p.boardColor || 'white',
        objects: clone(p.objects),
      })),
    };
    if (preview) lesson.pages[index].objects.push(clone(preview));
    const ed = $('text-editor');
    if (!ed.hidden && ed.value.trim()) {
      if (editingText) lesson.pages[index].objects.splice(page().objects.indexOf(editingText), 1);
      lesson.pages[index].objects.push({
        type: 'text',
        text: ed.value,
        runs: editorRuns(),
        box: true,
        w: Math.max(
          40,
          Math.min(W - +ed.dataset.x, (ed.offsetWidth * W) / canvas.getBoundingClientRect().width)
        ),
        h: Math.max(
          20,
          Math.min(H - +ed.dataset.y, (ed.offsetHeight * W) / canvas.getBoundingClientRect().width)
        ),
        x: +ed.dataset.x,
        y: +ed.dataset.y,
        color: ed.dataset.color || color,
        width,
        ...textStyle,
      });
    }
    lesson.pages.splice(index + 1, 0, ...overflowSnapshotPages());
    globalThis.TutorPDF?.patchSnapshot(lesson);
    return { lesson, activePage: index };
  },
  restore(snapshot) {
    const data = snapshot?.lesson;
    if (
      !data ||
      data.format !== 'tutorboard' ||
      !validLoadedPDF(data.loadedPDF) ||
      data.version !== 2 ||
      data.boardWidth !== W ||
      data.boardHeight !== H ||
      !Array.isArray(data.pages) ||
      !data.pages.length ||
      !data.pages.every(
        (p) =>
          p &&
          ['blank', 'grid', 'ruled'].includes(p.background) &&
          Object.hasOwn(boardColors, p.boardColor) &&
          Array.isArray(p.objects) &&
          p.objects.every(validObject)
      )
    )
      throw Error('This draft could not be read. Your saved draft has been kept.');
    pages = clone(data.pages).map((p) => ({ ...p, undo: [], redo: [] }));
    index = Number.isInteger(snapshot.activePage)
      ? Math.max(0, Math.min(snapshot.activePage, pages.length - 1))
      : 0;
    $('title').value =
      typeof data.title === 'string' ? data.title.slice(0, 100) : 'Untitled lesson';
    $('tutor-name').value = typeof data.tutorName === 'string' ? data.tutorName.slice(0, 100) : '';
    $('text-editor').hidden = true;
    images.clear();
    globalThis.TutorPDF?.restore(data.loadedPDF, data.pages);
    update();
  },
  commit() {
    globalThis.TutorPDF?.cancelDrawing();
    end();
    commitText();
  },
  isInteracting() {
    return !!gesture || !!globalThis.TutorPDF?.isInteracting();
  },
};
