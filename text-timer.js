// Rich text editor keeps a plain-text value interface for lesson/draft callers.
const richEditor = document.getElementById('text-editor');
Object.defineProperty(richEditor, 'value', {
  get() {
    return editorRuns()
      .map((run) => run.text)
      .join('');
  },
  set(value) {
    richEditor.textContent = value;
  },
});
function editorRuns(editor = richEditor) {
  const runs = [];
  function visit(node, style) {
    if (node.nodeType === 3) {
      if (node.data) runs.push({ text: node.data, ...style });
      return;
    }
    const next = { ...style };
    if (
      ['B', 'STRONG'].includes(node.nodeName) ||
      node.style?.fontWeight === 'bold' ||
      +node.style?.fontWeight >= 600
    )
      next.bold = true;
    if (node.nodeName === 'U' || node.style?.textDecoration?.includes('underline'))
      next.underline = true;
    if (node.nodeName === 'BR') {
      runs.push({ text: '\n', ...next });
      return;
    }
    if (
      ['DIV', 'P'].includes(node.nodeName) &&
      node !== editor &&
      runs.length &&
      !runs.at(-1).text.endsWith('\n')
    )
      runs.push({ text: '\n', ...next });
    for (const child of node.childNodes) visit(child, next);
  }
  visit(editor, { bold: false, underline: false });
  return runs;
}
function setEditorRuns(runs, editor = richEditor) {
  editor.replaceChildren(
    ...runs.map((run) => {
      const span = document.createElement('span');
      span.textContent = run.text;
      span.style.fontWeight = run.bold ? 'bold' : 'normal';
      span.style.textDecoration = run.underline ? 'underline' : 'none';
      return span;
    })
  );
}
function sliceTextRuns(runs, start, end = Infinity) {
  let offset = 0;
  return runs.flatMap((run) => {
    const text = run.text.slice(Math.max(0, start - offset), Math.max(0, end - offset));
    offset += run.text.length;
    return text ? [{ ...run, text }] : [];
  });
}
let pendingTextRuns = [];
function fitTextEditor() {
  if (richEditor.hidden || typeof textLayout !== 'function') return;
  const scale = canvas.getBoundingClientRect().width / W,
    maxHeight = H - Number(richEditor.dataset.y);
  const boxWidth = Math.min(
    W - Number(richEditor.dataset.x),
    parseFloat(richEditor.style.width) / scale
  );
  const visibleRuns = editorRuns(),
    visibleText = visibleRuns.map((r) => r.text).join('');
  const allRuns = [...visibleRuns, ...pendingTextRuns],
    text = allRuns.map((r) => r.text).join('');
  const object = { ...textStyle, box: true, w: boxWidth, text, runs: allRuns };
  const contentHeight = textLayout(object, ctx).length * textLineHeight(object) + 24;
  let count = text.length;
  if (contentHeight > maxHeight || text.length > 10000) {
    let lo = 0,
      hi = Math.min(10000, text.length);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2),
        part = { ...object, text: text.slice(0, mid), runs: sliceTextRuns(allRuns, 0, mid) };
      if (textLayout(part, ctx).length * textLineHeight(part) + 64 <= maxHeight) lo = mid;
      else hi = mid - 1;
    }
    count = lo;
  }
  const shownRuns = sliceTextRuns(allRuns, 0, count),
    shownText = text.slice(0, count);
  pendingTextRuns = sliceTextRuns(allRuns, count);
  if (shownText !== visibleText) {
    const selection = getSelection();
    let start = count,
      end = count;
    if (
      selection.rangeCount &&
      richEditor.contains(selection.getRangeAt(0).commonAncestorContainer)
    ) {
      const selected = selection.getRangeAt(0),
        prefix = document.createRange();
      prefix.selectNodeContents(richEditor);
      prefix.setEnd(selected.startContainer, selected.startOffset);
      start = Math.min(count, prefix.toString().length);
      prefix.setEnd(selected.endContainer, selected.endOffset);
      end = Math.min(count, prefix.toString().length);
    }
    setEditorRuns(shownRuns);
    const locate = (offset) => {
      const walker = document.createTreeWalker(richEditor, NodeFilter.SHOW_TEXT);
      let node,
        last = null;
      while ((node = walker.nextNode())) {
        last = node;
        if (offset <= node.length) return [node, offset];
        offset -= node.length;
      }
      return last ? [last, last.length] : [richEditor, 0];
    };
    const range = document.createRange(),
      left = locate(start),
      right = locate(end);
    range.setStart(...left);
    range.setEnd(...right);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  const shownObject = { ...object, text: shownText, runs: shownRuns };
  const height =
    textLayout(shownObject, ctx).length * textLineHeight(shownObject) +
    (pendingTextRuns.length ? 64 : 24);
  richEditor.style.maxHeight = maxHeight * scale + 'px';
  richEditor.style.maxWidth = (W - Number(richEditor.dataset.x)) * scale + 'px';
  richEditor.style.height =
    Math.min(maxHeight, Math.max(parseFloat(richEditor.style.height) / scale, height)) * scale +
    'px';
  richEditor.style.paddingBottom = (pendingTextRuns.length ? 40 : 12) * scale + 'px';
  richEditor.scrollTop = 0;
  positionTextNext();
}
function positionTextNext() {
  const button = document.getElementById('text-next-page');
  button.hidden = richEditor.hidden || pendingTextRuns.length === 0;
  button.style.left =
    parseFloat(richEditor.style.left) +
    richEditor.offsetWidth -
    Math.min(210, richEditor.offsetWidth) +
    'px';
  button.style.top = parseFloat(richEditor.style.top) + 'px';
  button.style.width = Math.min(210, richEditor.offsetWidth) + 'px';
  const ratio =
    canvas.getBoundingClientRect().height / H / (canvas.getBoundingClientRect().width / W);
  button.style.transform = `translateY(${Math.max(0, richEditor.offsetHeight * ratio - 32)}px)`;
  button.textContent = pendingTextRuns.length ? 'Continue on next page →' : 'Next page →';
}
richEditor.addEventListener('input', () => {
  if (!textComposing) fitTextEditor();
});
richEditor.addEventListener('compositionend', () => fitTextEditor());
richEditor.addEventListener('paste', (event) => {
  event.preventDefault();
  document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  fitTextEditor();
});
richEditor.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.isComposing) {
    event.preventDefault();
    document.execCommand('insertText', false, '\n');
    fitTextEditor();
  }
});
new MutationObserver(() => {
  positionTextNext();
}).observe(richEditor, { attributes: true, attributeFilter: ['hidden', 'style'] });
function flushTextOverflow() {
  while (pendingTextRuns.length) {
    const remaining = pendingTextRuns;
    pendingTextRuns = [];
    add();
    openTextBox({ x: 40, y: 40, w: 1000, h: 180 });
    setEditorRuns(remaining);
    fitTextEditor();
    commitText();
  }
}
document.getElementById('text-next-page').onpointerdown = (e) => e.preventDefault();
document.getElementById('text-next-page').onclick = () => {
  const remaining = pendingTextRuns;
  pendingTextRuns = [];
  const boxWidth = parseFloat(richEditor.style.width) / (canvas.getBoundingClientRect().width / W);
  commitText();
  add();
  openTextBox({ x: 40, y: 40, w: boxWidth, h: 180 });
  setEditorRuns(remaining);
  fitTextEditor();
};
// Deadline-based countdown remains accurate when the tab is throttled.
const timerClockIcon = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6M12 2v3M18 5l2 2"/></svg>`;
const exerciseTimer = document.createElement('details');
exerciseTimer.id = 'exercise-timer';
exerciseTimer.dataset.state = 'idle';
exerciseTimer.innerHTML = `
  <summary aria-label="Exercise timer" aria-controls="timer-panel">
    <span class="timer-indicator">${timerClockIcon}<span class="timer-running-dot"></span></span>
    <span class="timer-summary-label">Timer</span><output id="timer-display">05:00</output>
    <svg class="timer-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
  </summary>
  <div class="timer-controls" id="timer-panel">
    <div class="timer-panel-heading"><div><span class="timer-eyebrow">CLASSROOM TOOLS</span><h2>Exercise timer</h2></div><span class="timer-panel-icon">${timerClockIcon}</span></div>
    <p class="timer-description">A little focus time for your next exercise.</p>
    <div class="timer-preview"><span id="timer-state-label">Ready when you are</span><span id="timer-preview-time" aria-hidden="true">05:00</span></div>
    <div class="timer-duration-fields"><label for="timer-minutes">Minutes<input id="timer-minutes" type="number" min="0" max="180" value="5" inputmode="numeric" /></label><span aria-hidden="true">:</span><label for="timer-seconds">Seconds<input id="timer-seconds" type="number" min="0" max="59" value="0" inputmode="numeric" /></label></div>
    <div class="timer-presets" aria-label="Quick durations"><button type="button" data-timer-minutes="1">1 min</button><button type="button" data-timer-minutes="3">3 min</button><button type="button" data-timer-minutes="5" aria-pressed="true">5 min</button><button type="button" data-timer-minutes="10">10 min</button></div>
    <p id="timer-message" role="status"></p>
    <div class="timer-action-row"><button id="timer-start" type="button">Start timer <span aria-hidden="true">→</span></button><button id="timer-reset" type="button" aria-label="Reset timer to five minutes" title="Reset to 5 minutes">Reset</button></div>
    <p class="timer-footnote">Start, tuck it away, and let your students focus.</p>
  </div>`;
document.querySelector('.top-actions').append(exerciseTimer);
const timerFinishDialog = document.createElement('dialog');
timerFinishDialog.id = 'timer-finish-dialog';
timerFinishDialog.setAttribute('aria-labelledby', 'timer-finish-heading');
timerFinishDialog.setAttribute('aria-describedby', 'timer-finish-description');
timerFinishDialog.innerHTML = `<div class="timer-finish-art"><span class="timer-finish-orbit"></span>${timerClockIcon}<span class="timer-finish-spark timer-spark-one">✦</span><span class="timer-finish-spark timer-spark-two">✦</span></div><span class="timer-eyebrow">EXERCISE COMPLETE</span><h2 id="timer-finish-heading">Time’s up!</h2><p id="timer-finish-description">Pens down. Let’s see what you worked out.</p><span id="timer-finished-duration" class="timer-duration-chip"></span><div class="timer-finish-actions"><button id="timer-finish-dismiss" type="button">Back to the board</button><button id="timer-restart" type="button">Run it again</button></div>`;
document.body.append(timerFinishDialog);
let timerRemaining = 300000,
  timerDuration = 300000,
  timerDeadline = 0,
  timerInterval;
const timerElement = (id) => document.getElementById(id);
function timerTime(milliseconds) {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function syncTimerState(state) {
  exerciseTimer.dataset.state = state;
  exerciseTimer.querySelector('.timer-summary-label').textContent =
    state === 'finished' ? 'Time’s up' : 'Timer';
  exerciseTimer.classList.toggle('timer-finished', state === 'finished');
  timerElement('timer-start').innerHTML =
    state === 'running'
      ? 'Pause timer <span aria-hidden="true">Ⅱ</span>'
      : state === 'paused'
        ? 'Resume timer <span aria-hidden="true">→</span>'
        : 'Start timer <span aria-hidden="true">→</span>';
  timerElement('timer-state-label').textContent = {
    idle: 'Ready when you are',
    running: 'Focus time is running',
    paused: 'Paused · take your time',
    finished: 'Exercise complete',
  }[state];
  const locked = state === 'running' || state === 'paused';
  for (const input of exerciseTimer.querySelectorAll('input, [data-timer-minutes]'))
    input.disabled = locked;
}
function timerPaint() {
  if (timerDeadline) timerRemaining = Math.max(0, timerDeadline - Date.now());
  const time = timerTime(timerRemaining);
  timerElement('timer-display').textContent = time;
  timerElement('timer-preview-time').textContent = time;
  exerciseTimer.classList.toggle('timer-ending', !!timerDeadline && timerRemaining <= 10000);
  if (!timerRemaining && timerDeadline) {
    timerDeadline = 0;
    clearInterval(timerInterval);
    syncTimerState('finished');
    timerElement('timer-message').textContent = "Time's up!";
    timerElement('timer-finished-duration').textContent =
      `${timerTime(timerDuration)} of focused work`;
    exerciseTimer.open = false;
    if (!timerFinishDialog.open) timerFinishDialog.showModal();
  }
}
function beginExerciseTimer() {
  exerciseTimer.classList.remove('timer-ending');
  timerElement('timer-message').textContent = '';
  timerDeadline = Date.now() + timerRemaining;
  syncTimerState('running');
  clearInterval(timerInterval);
  timerInterval = setInterval(timerPaint, 200);
  timerPaint();
  exerciseTimer.open = false;
  exerciseTimer.querySelector('summary').focus({ preventScroll: true });
}
timerElement('timer-start').onclick = () => {
  if (timerDeadline) {
    timerPaint();
    if (!timerDeadline) return;
    timerDeadline = 0;
    clearInterval(timerInterval);
    syncTimerState('paused');
    exerciseTimer.classList.remove('timer-ending');
    return;
  }
  if (exerciseTimer.dataset.state !== 'paused') {
    const minutes = Number(timerElement('timer-minutes').value),
      seconds = Number(timerElement('timer-seconds').value);
    if (
      !Number.isInteger(minutes) ||
      !Number.isInteger(seconds) ||
      minutes < 0 ||
      minutes > 180 ||
      seconds < 0 ||
      seconds > 59 ||
      minutes * 60 + seconds <= 0
    ) {
      timerElement('timer-message').textContent =
        'Choose a duration above zero: up to 180 minutes and 59 seconds.';
      timerElement('timer-minutes').focus();
      return;
    }
    timerDuration = timerRemaining = (minutes * 60 + seconds) * 1000;
  }
  beginExerciseTimer();
};
function previewTimerDuration() {
  if (['running', 'paused'].includes(exerciseTimer.dataset.state)) return;
  const minutes = Number(timerElement('timer-minutes').value),
    seconds = Number(timerElement('timer-seconds').value);
  if (
    Number.isFinite(minutes) &&
    Number.isFinite(seconds) &&
    minutes >= 0 &&
    minutes <= 180 &&
    seconds >= 0 &&
    seconds <= 59
  ) {
    timerRemaining = (minutes * 60 + seconds) * 1000;
    syncTimerState('idle');
    timerPaint();
    timerElement('timer-message').textContent = '';
  }
  for (const preset of exerciseTimer.querySelectorAll('[data-timer-minutes]'))
    preset.setAttribute(
      'aria-pressed',
      String(Number(preset.dataset.timerMinutes) === minutes && seconds === 0)
    );
}
for (const input of exerciseTimer.querySelectorAll('input'))
  input.addEventListener('input', previewTimerDuration);
for (const preset of exerciseTimer.querySelectorAll('[data-timer-minutes]'))
  preset.onclick = () => {
    timerElement('timer-minutes').value = preset.dataset.timerMinutes;
    timerElement('timer-seconds').value = 0;
    previewTimerDuration();
  };
timerElement('timer-reset').onclick = () => {
  timerDeadline = 0;
  clearInterval(timerInterval);
  timerRemaining = timerDuration = 300000;
  timerElement('timer-minutes').value = 5;
  timerElement('timer-seconds').value = 0;
  timerElement('timer-message').textContent = '';
  syncTimerState('idle');
  exerciseTimer.classList.remove('timer-ending');
  if (timerFinishDialog.open) timerFinishDialog.close();
  previewTimerDuration();
};
timerElement('timer-finish-dismiss').onclick = () => timerFinishDialog.close();
timerElement('timer-restart').onclick = () => {
  timerFinishDialog.close();
  timerRemaining = timerDuration;
  beginExerciseTimer();
};
timerFinishDialog.addEventListener('close', () =>
  exerciseTimer.querySelector('summary').focus({ preventScroll: true })
);
timerFinishDialog.addEventListener('click', (event) => {
  if (event.target === timerFinishDialog) {
    const r = timerFinishDialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      timerFinishDialog.close();
  }
});
document.addEventListener('pointerdown', (event) => {
  if (!exerciseTimer.contains(event.target)) exerciseTimer.open = false;
});
exerciseTimer.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && exerciseTimer.open) {
    event.preventDefault();
    exerciseTimer.open = false;
    exerciseTimer.querySelector('summary').focus();
  }
});

document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  if (richEditor.hidden || !selection?.anchorNode || !richEditor.contains(selection.anchorNode))
    return;
  document
    .getElementById('text-bold')
    .setAttribute('aria-pressed', String(document.queryCommandState('bold')));
  document
    .getElementById('text-underline')
    .setAttribute('aria-pressed', String(document.queryCommandState('underline')));
});
function overflowSnapshotPages() {
  const result = [];
  let runs = pendingTextRuns;
  while (runs.length) {
    const text = runs.map((r) => r.text).join('');
    const object = {
      type: 'text',
      text,
      runs,
      x: 40,
      y: 40,
      color: richEditor.dataset.color || color,
      width,
      ...textStyle,
      box: true,
      w: 1000,
      h: 180,
    };
    let lo = 0,
      hi = Math.min(text.length, 10000);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const part = { ...object, text: text.slice(0, mid), runs: sliceTextRuns(runs, 0, mid) };
      if (textLayout(part, ctx).length * textLineHeight(part) + 64 <= H - 40) lo = mid;
      else hi = mid - 1;
    }
    object.runs = sliceTextRuns(runs, 0, Math.max(1, lo));
    object.text = object.runs.map((r) => r.text).join('');
    object.h = Math.max(180, textLayout(object, ctx).length * textLineHeight(object) + 64);
    result.push({
      background: page().background,
      boardColor: page().boardColor || 'white',
      objects: [object],
    });
    runs = sliceTextRuns(runs, Math.max(1, lo));
  }
  return result;
}
