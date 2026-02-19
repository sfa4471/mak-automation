/**
 * Browser folder picker (File System Access API).
 * Lets the user choose a folder on their device; we store the handle and use it
 * to create project folders and save PDFs. No server path or backend on their PC needed.
 */

const IDB_NAME = 'mak-automation';
const IDB_STORE = 'settings';
const FOLDER_HANDLE_KEY_PREFIX = 'project-folder-handle';

/** Storage key for folder handle. Scoped by tenant so different companies do not overwrite each other. */
function getFolderHandleKey(tenantId?: number | null): string {
  return tenantId != null ? `${FOLDER_HANDLE_KEY_PREFIX}-${tenantId}` : FOLDER_HANDLE_KEY_PREFIX;
}

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

/** Whether we have a stored folder handle (user has chosen a folder). Pass tenantId so each company has its own folder. */
export async function hasChosenFolder(tenantId?: number | null): Promise<boolean> {
  if (!isFolderPickerSupported()) return false;
  const key = getFolderHandleKey(tenantId);
  const handle = await getFromIdb<FileSystemDirectoryHandle>(key);
  return !!handle;
}

/** Folder name for display (from the handle). Pass tenantId to match the scoped storage. */
export async function getChosenFolderName(tenantId?: number | null): Promise<string | null> {
  const key = getFolderHandleKey(tenantId);
  const handle = await getFromIdb<FileSystemDirectoryHandle>(key);
  return handle?.name ?? null;
}

/**
 * Open the system folder picker. On success, the handle is stored in IndexedDB scoped by tenantId.
 * Must be called from a user gesture (e.g. button click).
 * Pass tenantId so each company's folder choice is stored separately and cannot overwrite another.
 */
export async function chooseFolder(tenantId?: number | null): Promise<{ name: string }> {
  if (!isFolderPickerSupported()) {
    throw new Error('Your browser does not support choosing a folder. Please use Chrome or Edge.');
  }
  const win = window as Window & { showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> };
  const handle = await win.showDirectoryPicker!({ mode: 'readwrite' });
  const key = getFolderHandleKey(tenantId);
  await setInIdb(key, handle);
  return { name: handle.name };
}

/** Clear the stored folder for this tenant. Pass tenantId so only this company's choice is cleared. */
export async function clearChosenFolder(tenantId?: number | null): Promise<void> {
  await deleteFromIdb(getFolderHandleKey(tenantId));
}

/**
 * Get the stored directory handle only if permission is already granted.
 * Pass tenantId so the handle is the one chosen by this company (no cross-tenant overwrite).
 * Does NOT call requestPermission() here, because that requires a user gesture.
 */
export async function getFolderHandle(tenantId?: number | null): Promise<FileSystemDirectoryHandle | null> {
  const key = getFolderHandleKey(tenantId);
  const handle = await getFromIdb<FileSystemDirectoryHandle>(key);
  if (!handle) return null;
  const permission = await handle.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted') return null;
  return handle;
}

/**
 * Create a project folder in the chosen directory and return a handle to it.
 * Pass tenantId so the root folder is the one chosen by this company.
 */
export async function ensureProjectFolderInBrowser(
  projectNumber: string,
  tenantId?: number | null
): Promise<FileSystemDirectoryHandle | null> {
  const root = await getFolderHandle(tenantId);
  if (!root) return null;
  const sanitized = projectNumber.replace(/[\\/:*?"<>|]/g, '_');
  return root.getDirectoryHandle(sanitized, { create: true });
}

/**
 * Save a file (e.g. PDF blob) into the chosen folder, optionally under a project subfolder.
 * Pass tenantId so files are saved to this company's chosen folder only.
 */
export async function saveFileToChosenFolder(
  filename: string,
  blob: Blob,
  projectNumber?: string,
  tenantId?: number | null
): Promise<boolean> {
  const root = await getFolderHandle(tenantId);
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
