window.AppDB = (() => {
  let db;

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(
        APP_CONFIG.DB_NAME,
        APP_CONFIG.DB_VERSION
      );

      request.onupgradeneeded = event => {
        const d = event.target.result;

        if (!d.objectStoreNames.contains("drafts")) {
          d.createObjectStore("drafts", { keyPath: "id" });
        }

        if (!d.objectStoreNames.contains("vehicles")) {
          d.createObjectStore("vehicles", { keyPath: "id" });
        }

        if (!d.objectStoreNames.contains("users")) {
          d.createObjectStore("users", { keyPath: "id" });
        }

        if (!d.objectStoreNames.contains("fuel")) {
          d.createObjectStore("fuel", { keyPath: "id" });
        }

        if (!d.objectStoreNames.contains("session")) {
          d.createObjectStore("session", { keyPath: "key" });
        }

        if (!d.objectStoreNames.contains("syncQueue")) {
          d.createObjectStore("syncQueue", { keyPath: "id" });
        }

        if (!d.objectStoreNames.contains("anomalies")) {
          d.createObjectStore("anomalies", { keyPath: "id" });
        }

        if (!d.objectStoreNames.contains("settings")) {
          d.createObjectStore("settings", { keyPath: "key" });
        }
      };

      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async function ensureOpen() {
    if (!db) await open();
  }

  async function put(store, value) {
    await ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");

      tx.objectStore(store).put(value);

      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function get(store, key) {
    await ensureOpen();

    return new Promise((resolve, reject) => {
      const req = db
        .transaction(store, "readonly")
        .objectStore(store)
        .get(key);

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(store) {
    await ensureOpen();

    return new Promise((resolve, reject) => {
      const req = db
        .transaction(store, "readonly")
        .objectStore(store)
        .getAll();

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(store, key) {
    await ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");

      tx.objectStore(store).delete(key);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clear(store) {
    await ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");

      tx.objectStore(store).clear();

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    open,
    put,
    get,
    getAll,
    remove,
    clear
  };
})();
