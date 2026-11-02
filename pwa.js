'use strict';
(() => {
  if (window.tutorDesktop || !/^https?:$/.test(location.protocol)) return;
  const byId = (id) => document.getElementById(id);
  const scope = new URL('./', location.href).href;
  const bar = byId('app-state'),
    saveState = byId('draft-status'),
    offlineState = byId('offline-status');
  const board = window.TutorBoard;
  let store,
    ready = false,
    dirty = false,
    revision = 0,
    savedRevision = 0,
    timer,
    writeQueue = Promise.resolve();
  let draftId = crypto.randomUUID(),
    releaseLock = null,
    restoring = false,
    draftMetadata = { lastOpenedAt: Date.now() };
  let offlineReady = false,
    registration = null,
    installPrompt = null;
  bar.hidden = false;
  const panelsObserver = new ResizeObserver(() => {
    const controls = document.querySelector('.workspace-controls').getBoundingClientRect();
    document.body.style.setProperty('--panel-top', controls.bottom + 'px');
    document.body.style.setProperty('--panel-bottom', bar.getBoundingClientRect().height + 'px');
  });
  panelsObserver.observe(bar);
  panelsObserver.observe(document.querySelector('header'));
  panelsObserver.observe(document.querySelector('.workspace-controls'));
  const mobile = matchMedia('(max-width: 600px)');
  function adaptPanels() {
    if (mobile.matches) {
      document.body.classList.add('pages-hidden', 'tools-hidden');
      syncPanels();
    }
  }
  adaptPanels();
  mobile.addEventListener('change', adaptPanels);
  document.getElementById('tools-panel').addEventListener('click', (event) => {
    if (mobile.matches && event.target.closest('[data-tool],#graph-tools,#geometry-tools,#image')) {
      document.body.classList.add('tools-hidden');
      syncPanels();
    }
  });
  const report = (message, error = false) => {
    saveState.textContent = message;
    saveState.classList.toggle('state-error', error);
  };
  function changed() {
    if (restoring) return;
    dirty = true;
    revision++;
    report('Unsaved changes');
    clearTimeout(timer);
    timer = setTimeout(() => flush(), 600);
  }
  document.addEventListener('lessonchange', changed);
  for (const id of ['title', 'tutor-name', 'text-editor'])
    byId(id).addEventListener('input', changed);
  byId('text-editor').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') changed();
  });
  for (const type of ['input', 'change', 'click'])
    byId('text-options').addEventListener(type, () => {
      if (!byId('text-editor').hidden) changed();
    });

  async function lock(id) {
    if (!navigator.locks) return { release: () => {}, exclusive: false };
    return new Promise((resolve, reject) => {
      navigator.locks
        .request('vinee-draft:' + scope + ':' + id, { ifAvailable: true }, async (held) => {
          if (!held) {
            resolve(null);
            return;
          }
          await new Promise((release) => resolve({ release, exclusive: true }));
        })
        .catch(reject);
    });
  }
  function flush() {
    clearTimeout(timer);
    writeQueue = writeQueue
      .catch(() => false)
      .then(async () => {
        if (!ready) return false;
        if (!dirty) return true;
        const version = revision;
        try {
          const snapshot = board.snapshot();
          report('Saving on this device…');
          await store.put({
            ...draftMetadata,
            id: draftId,
            savedAt: Date.now(),
            snapshot,
            thumbnail: makeThumbnail(),
          });
          savedRevision = version;
          dirty = revision !== version;
          report(dirty ? 'Unsaved changes' : 'Saved on this device');
          return !dirty;
        } catch (error) {
          dirty = true;
          report('Autosave failed — use Save lesson', true);
          console.warn('Local draft could not be saved', error);
          return false;
        }
      });
    return writeQueue;
  }
  window.TutorPWA = {
    flush,
    hasUnsavedChanges: () => dirty || board.isInteracting(),
    get savedRevision() {
      return savedRevision;
    },
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      board.commit();
      void flush();
    }
  });
  window.addEventListener('pagehide', () => {
    board.commit();
    void flush();
  });

  function makeThumbnail() {
    try {
      const source = document.querySelector('#board'),
        image = document.createElement('canvas');
      if (!source) return '';
      image.width = 480;
      image.height = 180;
      image.getContext('2d').drawImage(source, 0, 0, image.width, image.height);
      return image.toDataURL('image/jpeg', 0.65);
    } catch {
      return '';
    }
  }
  async function openDraft(id) {
    let held;
    try {
      if (id === draftId) return;
      board.commit();
      if (!(await flush()))
        throw Error('Could not save the current lesson. Use Save lesson before switching.');
      held = await lock(id);
      if (!held) throw Error('This lesson is open in another window. Close it there first.');
      const fresh = await store.get(id);
      if (!fresh) throw Error('This lesson was removed in another window.');
      restoring = true;
      board.restore(fresh.snapshot);
      restoring = false;
      releaseLock?.();
      releaseLock = held.release;
      held = null;
      draftId = navigator.locks ? id : crypto.randomUUID();
      draftMetadata = { subject: fresh.subject || '', lastOpenedAt: Date.now() };
      dirty = true;
      revision++;
      if (!(await flush()))
        toast('Lesson opened, but local saving failed. Download a lesson backup.');
      else toast('Lesson ready.');
    } finally {
      restoring = false;
      held?.release();
    }
  }
  async function createDraft() {
    board.commit();
    if (!(await flush()))
      throw Error('Could not save the current lesson. Use Save lesson before starting another.');
    const id = crypto.randomUUID(),
      held = await lock(id);
    if (!held) throw Error('Could not start a new lesson. Please try again.');
    const current = board.snapshot().lesson,
      now = Date.now();
    const snapshot = {
      activePage: 0,
      lesson: {
        format: 'tutorboard',
        version: 2,
        boardWidth: current.boardWidth,
        boardHeight: current.boardHeight,
        title: 'Untitled lesson',
        tutorName: current.tutorName || '',
        pages: [{ background: 'blank', boardColor: 'white', objects: [] }],
        loadedPDF: null,
      },
    };
    let adopted = false,
      stored = false;
    try {
      // Save before replacing the board: a quota failure leaves the previous lesson untouched.
      await store.put({
        id,
        savedAt: now,
        lastOpenedAt: now,
        subject: '',
        snapshot,
        thumbnail: '',
      });
      stored = true;
      restoring = true;
      board.restore(snapshot);
      restoring = false;
      releaseLock?.();
      releaseLock = held.release;
      adopted = true;
      draftId = id;
      draftMetadata = { subject: '', lastOpenedAt: now };
      dirty = false;
      revision++;
      savedRevision = revision;
      report('New lesson · saved on this device');
      toast('Your new lesson is ready.');
    } catch (error) {
      if (stored && !adopted) {
        try {
          await store.delete(id);
        } catch {}
      }
      throw Error(
        error?.message || 'Could not create a new lesson. Your current lesson has been kept.'
      );
    } finally {
      restoring = false;
      if (!adopted) held.release();
    }
  }
  async function deleteDraft(id) {
    if (id === draftId)
      throw Error('Keep the current lesson. Open another lesson before deleting it.');
    let held;
    try {
      held = await lock(id);
      if (!held) throw Error('This lesson is open in another window.');
      if (!held.exclusive)
        throw Error('Deleting lessons requires a browser with Web Locks support.');
      await store.delete(id);
    } finally {
      held?.release();
    }
  }
  async function updateMetadata(id, values) {
    const subject =
      values.subject === undefined ? undefined : String(values.subject).trim().slice(0, 80);
    const title =
      values.title === undefined
        ? undefined
        : String(values.title).trim().slice(0, 100) || 'Untitled lesson';
    if (id === draftId) {
      if (subject !== undefined) draftMetadata.subject = subject;
      if (title !== undefined) byId('title').value = title;
      changed();
      if (!(await flush()))
        throw Error('Could not save these details. Download a backup and free device storage.');
      return;
    }
    let held;
    try {
      held = await lock(id);
      if (!held || !held.exclusive)
        throw Error('This lesson cannot be edited while open in another window.');
      const record = await store.get(id);
      if (!record) throw Error('This lesson has been removed.');
      if (subject !== undefined) record.subject = subject;
      if (title !== undefined) record.snapshot.lesson.title = title;
      await store.put(record);
    } finally {
      held?.release();
    }
  }
  async function showDrafts(startup = false) {
    if (!ready) {
      toast('Local saving is not available. Use Save lesson to keep a file.');
      return;
    }
    if (!startup) {
      board.commit();
      if (!(await flush())) {
        toast('Could not save the current lesson. Use Save lesson before switching.');
        return;
      }
    }
    try {
      const records = (await store.list()).sort(
        (a, b) => (b.lastOpenedAt || b.savedAt) - (a.lastOpenedAt || a.savedAt)
      );
      if (startup && (!records.length || dirty)) return;
      await window.TutorLessonLibrary?.show({
        records,
        get currentId() {
          return draftId;
        },
        onOpen: openDraft,
        onCreate: createDraft,
        onDelete: deleteDraft,
        onSave: async () => {
          changed();
          if (!(await flush()))
            throw Error('Local save failed. Use Save lesson to download a backup.');
        },
        onMetadata: updateMetadata,
        refresh: () => store.list(),
      });
    } catch (error) {
      toast(error.message || 'Lesson library unavailable. Use Save lesson.');
    }
  }
  window.TutorPWA.library = {
    show: () => showDrafts(),
    list: async () => (ready ? store.list() : []),
    open: openDraft,
    create: createDraft,
    updateMetadata,
    get currentId() {
      return draftId;
    },
    get ready() {
      return ready;
    },
  };
  const libraryButtons = [byId('show-drafts'), byId('lesson-library-open')].filter(Boolean);
  for (const button of libraryButtons) {
    button.textContent = 'Lesson library';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.title = 'Opening lessons saved on this device';
    button.onclick = () => showDrafts();
  }
  function libraryReady(available) {
    for (const button of libraryButtons) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.title = available
        ? 'Browse lessons saved on this device'
        : 'Local saving unavailable. Use File ? Save lesson for a backup.';
    }
  }
  byId('drafts-close').onclick = () => byId('drafts-dialog').close();
  (async () => {
    try {
      store = await new TutorDraftStore(scope).open();
      const held = await lock(draftId);
      releaseLock = held?.release;
      ready = true;
      report(dirty ? 'Unsaved changes' : 'Autosave ready · this device only');
      libraryReady(true);
      await showDrafts(true);
      if (dirty) await flush();
    } catch (error) {
      report('Local saving unavailable — use Save lesson', true);
      libraryReady(false);
    }
  })();

  function networkStatus() {
    offlineState.textContent = offlineReady
      ? navigator.onLine
        ? 'Ready offline'
        : 'Offline · ready'
      : navigator.onLine
        ? 'Preparing offline access…'
        : 'Offline access not ready';
  }
  async function verifyOffline() {
    const worker = registration?.active;
    if (!worker) return;
    try {
      const result = await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => {
          channel.port1.close();
          reject(Error('Offline check timed out'));
        }, 5000);
        channel.port1.onmessage = (event) => {
          clearTimeout(timeout);
          channel.port1.close();
          resolve(event.data);
        };
        worker.postMessage({ type: 'OFFLINE_STATUS' }, [channel.port2]);
      });
      offlineReady = !!result.complete;
      networkStatus();
      if (!offlineReady)
        offlineState.textContent = 'Offline files missing — reconnect and check updates';
    } catch {
      offlineState.textContent = 'Offline readiness could not be checked';
    }
  }
  function updateNotice() {
    byId('update-notice').hidden = !registration?.waiting;
  }
  async function checkUpdates() {
    if (!registration) return;
    try {
      await registration.update();
      updateNotice();
      await verifyOffline();
    } catch {
      toast('Update check unavailable. You can keep using the cached app.');
    }
  }
  byId('check-updates').onclick = checkUpdates;
  window.addEventListener('online', () => {
    networkStatus();
    void checkUpdates();
  });
  window.addEventListener('offline', networkStatus);
  networkStatus();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker
      .register('sw.js', { scope: './', updateViaCache: 'none' })
      .then(async (reg) => {
        registration = reg;
        byId('check-updates').disabled = false;
        updateNotice();
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
              updateNotice();
              void verifyOffline();
            }
            if (worker.state === 'redundant' && !reg.active)
              offlineState.textContent = 'Offline setup failed — reconnect and retry';
          });
        });
        await navigator.serviceWorker.ready;
        await verifyOffline();
      })
      .catch(() => {
        offlineState.textContent = 'Offline setup failed — reconnect and reload';
      });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      void verifyOffline();
    });
  } else offlineState.textContent = 'Offline installation requires HTTPS and a supported browser';

  const install = byId('install-app'),
    help = byId('install-dialog'),
    installNow = byId('install-now');
  const standalone = matchMedia('(display-mode: standalone)');
  let installedThisSession = false;
  function installed() {
    return installedThisSession || standalone.matches || navigator.standalone === true;
  }
  function installLabel() {
    const isInstalled = installed();
    install.textContent = isInstalled
      ? 'App help'
      : installPrompt
        ? 'Install app'
        : 'Install / help';
    installNow.hidden = isInstalled || !installPrompt;
    byId('install-status').textContent = isInstalled
      ? 'TutorBoard is already installed. You can keep using this window or open it from your installed apps.'
      : installPrompt
        ? 'Your browser is ready to install TutorBoard. Choose Install app below.'
        : !window.isSecureContext
          ? 'This address is not a secure connection. Open the HTTPS version of TutorBoard to enable offline installation.'
          : 'Your browser has not offered an in-page install prompt. This help window does not install the app. In Edge, use the browser menu below, or check edge://apps if you installed TutorBoard before.';
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installLabel();
  });
  window.addEventListener('appinstalled', () => {
    installedThisSession = true;
    installPrompt = null;
    installLabel();
    toast('TutorBoard installed.');
  });
  standalone.addEventListener('change', installLabel);
  async function requestInstall() {
    if (!installPrompt || installed()) {
      installLabel();
      if (!help.open) help.showModal();
      return;
    }
    const prompt = installPrompt;
    installPrompt = null;
    installNow.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        if (help.open) help.close();
      } else {
        installLabel();
        if (!help.open) help.showModal();
      }
    } catch {
      installLabel();
      if (!help.open) help.showModal();
    } finally {
      installNow.disabled = false;
      installLabel();
    }
  }
  install.onclick = requestInstall;
  installNow.onclick = requestInstall;
  byId('install-close').onclick = () => help.close();
  byId('keep-storage').onclick = async () => {
    try {
      const granted = await navigator.storage?.persist?.();
      byId('storage-help').textContent = granted
        ? 'Persistent storage enabled. Keep downloaded lesson backups too.'
        : 'Your browser manages storage. Keep downloaded lesson backups; clearing site data removes drafts.';
    } catch {
      byId('storage-help').textContent =
        'Storage permission unavailable. Keep downloaded lesson backups.';
    }
  };
  installLabel();
})();
