// Tiny promise wrapper around IndexedDB.
// Stores: docs    { id: '<kind>:<key>', kind, key, data, updatedAt, dirty }
//         reviews { id, ts, item, correct, mode, stage, dirty }
//         meta    { k, v }

const DB_NAME = 'sanskrit-terms';
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('docs', { keyPath: 'id' });
      db.createObjectStore('reviews', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const done = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function getAll(store) {
  const db = await open();
  return done(db.transaction(store).objectStore(store).getAll());
}

export async function putMany(store, rows) {
  if (!rows.length) return;
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const r of rows) os.put(r);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}

export const put = (store, row) => putMany(store, [row]);

export async function clear(store) {
  const db = await open();
  return done(db.transaction(store, 'readwrite').objectStore(store).clear());
}

export async function getMeta(k, fallback = null) {
  const db = await open();
  const row = await done(db.transaction('meta').objectStore('meta').get(k));
  return row ? row.v : fallback;
}

export const setMeta = (k, v) => put('meta', { k, v });
