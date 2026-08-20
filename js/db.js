window.AppDB = (() => {
  let db;

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(APP_CONFIG.DB_NAME, APP_CONFIG.DB_VERSION);
      request.onupgradeneeded = event => {
        const d = event.target.result;
        if (!d.objectStoreNames.contains("drafts")) d.createObjectStore("drafts", {keyPath:"id"});
        if (!d.objectStoreNames.contains("vehicles")) d.createObjectStore("vehicles", {keyPath:"id"});
        if (!d.objectStoreNames.contains("fuel")) d.createObjectStore("fuel", {keyPath:"id"});
        if (!d.objectStoreNames.contains("session")) d.createObjectStore("session", {keyPath:"key"});
      };
      request.onsuccess = () => { db = request.result; resolve(db); };
      request.onerror = () => reject(request.error);
    });
  }

  async function put(store, value) {
    if (!db) await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,"readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete=()=>resolve(value);
      tx.onerror=()=>reject(tx.error);
    });
  }

  async function getAll(store) {
    if (!db) await open();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,"readonly").objectStore(store).getAll();
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  async function get(store,key) {
    if (!db) await open();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,"readonly").objectStore(store).get(key);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  return {open,put,get,getAll};
})();
