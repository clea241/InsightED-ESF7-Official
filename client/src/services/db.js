import { openDB } from 'idb';

const DB_NAME = 'esf7_drafts_db';
const STORE_NAME = 'drafts_store';

let cachedDbPromise = null;

function getDB() {
  if (!cachedDbPromise) {
    cachedDbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
      terminated() {
        cachedDbPromise = null;
      }
    }).catch(err => {
      cachedDbPromise = null;
      throw err;
    });
  }
  return cachedDbPromise;
}

export async function getLocalDraft(key) {
  try {
    const db = await getDB();
    return await db.get(STORE_NAME, key);
  } catch (err) {
    console.error('Failed to get local draft from IndexedDB, retrying connection:', err);
    try {
      cachedDbPromise = null;
      const retryDb = await getDB();
      return await retryDb.get(STORE_NAME, key);
    } catch (retryErr) {
      return null;
    }
  }
}

export async function setLocalDraft(key, val) {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, val, key);
    return true;
  } catch (err) {
    console.error('Failed to set local draft in IndexedDB, retrying connection:', err);
    try {
      cachedDbPromise = null;
      const retryDb = await getDB();
      await retryDb.put(STORE_NAME, val, key);
      return true;
    } catch (retryErr) {
      return false;
    }
  }
}

export async function deleteLocalDraft(key) {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, key);
    return true;
  } catch (err) {
    console.error('Failed to delete local draft from IndexedDB, retrying connection:', err);
    try {
      cachedDbPromise = null;
      const retryDb = await getDB();
      await retryDb.delete(STORE_NAME, key);
      return true;
    } catch (retryErr) {
      return false;
    }
  }
}

export async function clearAllLocalDatabases() {
  try {
    if (cachedDbPromise) {
      try {
        const db = await cachedDbPromise;
        db.close();
      } catch (e) {}
      cachedDbPromise = null;
    }
    if (typeof window !== 'undefined' && window.indexedDB) {
      if (indexedDB.databases) {
        try {
          const dbs = await indexedDB.databases();
          for (const dbInfo of dbs) {
            if (dbInfo.name) {
              indexedDB.deleteDatabase(dbInfo.name);
            }
          }
        } catch (e) {
          indexedDB.deleteDatabase(DB_NAME);
        }
      } else {
        indexedDB.deleteDatabase(DB_NAME);
      }
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    return true;
  } catch (err) {
    console.error('Failed to clear local databases:', err);
    if (typeof localStorage !== 'undefined') localStorage.clear();
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
    return false;
  }
}


