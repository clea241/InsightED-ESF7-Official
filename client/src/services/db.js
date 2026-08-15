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
