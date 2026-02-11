/**
 * Browser folder picker (File System Access API).
 * Lets the user choose a folder on their device; we store the handle and use it
 * to create project folders and save PDFs. No server path or backend on their PC needed.
 */

const IDB_NAME = 'mak-automation';
const IDB_STORE = 'settings';
const FOLDER_HANDLE_KEY = 'project-folder-handle';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

function getFromIdb<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      })
  );
}

function setInIdb(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).put(value, key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
      })
  );
}

function deleteFromIdb(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).delete(key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
      })
  );
}

/** True if the browser supports the folder picker (Chrome, Edge, etc.). */
export function isFolderPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Whether we have a stored folder handle (user has chosen a folder). */
export async function hasChosenFolder(): Promise<boolean> {
  if (!isFolderPickerSupported()) return false;
  const handle = await getFromIdb<FileSystemDirectoryHandle>(FOLDER_HANDLE_KEY);
  return !!handle;
}

/** Folder name for display (from the handle). */
export async function getChosenFolderName(): Promise<string | null> {
  const handle = await getFromIdb<FileSystemDirectoryHandle>(FOLDER_HANDLE_KEY);
  return handle?.name ?? null;
}

/**
 * Open the system folder picker. On success, the handle is stored in IndexedDB.
 * Must be called from a user gesture (e.g. button click).
 */
export async function chooseFolder(): Promise<{ name: string }> {
  if (!isFolderPickerSupported()) {
    throw new Error('Your browser does not support choosing a folder. Please use Chrome or Edge.');
  }
  const win = window as Window & { showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> };
  const handle = await win.showDirectoryPicker!({ mode: 'readwrite' });
  await setInIdb(FOLDER_HANDLE_KEY, handle);
  return { name: handle.name };
}

/** Clear the stored folder (e.g. "Don't use folder on this device"). */
export async function clearChosenFolder(): Promise<void> {
  await deleteFromIdb(FOLDER_HANDLE_KEY);
}

/**
 * Get the stored directory handle. Caller must request permission if needed.
 * Use this when creating project folders or saving files.
 */
export async function getFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await getFromIdb<FileSystemDirectoryHandle>(FOLDER_HANDLE_KEY);
  if (!handle) return null;
  if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
    const granted = await handle.requestPermission({ mode: 'readwrite' });
    if (granted !== 'granted') return null;
  }
  return handle;
}

/**
 * Create a project folder in the chosen directory and return a handle to it.
 * If no folder was chosen, returns null.
 */
export async function ensureProjectFolderInBrowser(projectNumber: string): Promise<FileSystemDirectoryHandle | null> {
  const root = await getFolderHandle();
  if (!root) return null;
  const sanitized = projectNumber.replace(/[\\/:*?"<>|]/g, '_');
  return root.getDirectoryHandle(sanitized, { create: true });
}

/**
 * Save a file (e.g. PDF blob) into the chosen folder, optionally under a project subfolder.
 */
export async function saveFileToChosenFolder(
  filename: string,
  blob: Blob,
  projectNumber?: string
): Promise<boolean> {
  const root = await getFolderHandle();
  if (!root) return false;
  let dir: FileSystemDirectoryHandle = root;
  if (projectNumber) {
    const sanitized = projectNumber.replace(/[\\/:*?"<>|]/g, '_');
    dir = await root.getDirectoryHandle(sanitized, { create: true });
  }
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
  const fileHandle = await dir.getFileHandle(safeName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}
