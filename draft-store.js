'use strict';
// Storage is separate from the service worker cache: updates never delete lessons.
window.TutorDraftStore = class TutorDraftStore {
  constructor(scope) {
    this.name = 'vinee-drafts:' + scope;
  }
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error('Close other TutorBoard windows to enable local saving.'));
    });
    this.db.onversionchange = () => this.db.close();
    return this;
  }
  transaction(mode, operation) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('drafts', mode);
      const request = operation(tx.objectStore('drafts'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () =>
        reject(tx.error || request.error || new Error('Local saving failed.'));
    });
  }
  list() {
    // Read metadata one record at a time; do not retain every lesson's images.
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('drafts', 'readonly'),
        items = [];
      const request = tx.objectStore('drafts').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const record = cursor.value;
        items.push({
          id: record.id,
          savedAt: record.savedAt,
          title: record.snapshot?.lesson?.title || 'Untitled lesson',
          pageCount: record.snapshot?.lesson?.pages?.length || 0,
        });
        cursor.continue();
      };
      tx.oncomplete = () => resolve(items);
      tx.onerror = tx.onabort = () => reject(tx.error || request.error);
    });
  }
  get(id) {
    return this.transaction('readonly', (store) => store.get(id));
  }
  put(record) {
    return this.transaction('readwrite', (store) => store.put(record));
  }
  delete(id) {
    return this.transaction('readwrite', (store) => store.delete(id));
  }
};
