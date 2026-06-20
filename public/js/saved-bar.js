/**
 * Saved memes bar, local folder picker (File System Access API),
 * and IndexedDB persistence for the directory handle.
 */
import { state } from './state.js';
import { els, showToast } from './dom.js';
import { formatBytes } from './utils.js';
import { tickSound } from './audio.js';

let render = () => {};
export function setRender(fn) { render = fn; }

/* ------------------------------------------------------------------ */
/*  IndexedDB helpers — persist the directory handle across sessions   */
/* ------------------------------------------------------------------ */
export function idbSet(key, value) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('mti9000', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('store');
    req.onsuccess = () => {
      const tx = req.result.transaction('store', 'readwrite');
      const put = tx.objectStore('store').put(value, key);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error);
    };
    req.onerror = () => reject(req.error);
  });
}

export function idbGet(key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('mti9000', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('store');
    req.onsuccess = () => {
      const tx = req.result.transaction('store', 'readonly');
      const get = tx.objectStore('store').get(key);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    };
    req.onerror = () => reject(req.error);
  });
}

/* ------------------------------------------------------------------ */
/*  On load, restore directory handle from IndexedDB and read files    */
/* ------------------------------------------------------------------ */
export async function initSavedFolder() {
  try {
    const stored = await idbGet('directoryHandle');
    if (stored?.handle && stored?.id) {
      try {
        const ok = await stored.handle.requestPermission({ mode: 'readwrite' });
        if (ok === 'granted') {
          state.directoryHandle = stored.handle;
          state.directoryId = stored.id;
          await loadFolderContents();
        }
      } catch {}
    }
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  Let the user pick a save folder via the File System Access API.    */
/* ------------------------------------------------------------------ */
export async function pickSaveFolder() {
  try {
    if (!window.showDirectoryPicker) {
      showToast('Your browser does not support folder selection. Try Chrome or Edge.');
      return;
    }
    const handle = await window.showDirectoryPicker();
    const ok = await handle.requestPermission({ mode: 'readwrite' });
    if (ok !== 'granted') { showToast('Folder permission denied'); return; }
    state.directoryHandle = handle;
    state.directoryId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await idbSet('directoryHandle', { handle, id: state.directoryId });
    for (const item of state.savedItems) { if (item.url) URL.revokeObjectURL(item.url); }
    state.savedItems = [];
    await loadFolderContents();
    render();
    showToast('Save folder set');
  } catch (err) {
    if (err.name !== 'AbortError' && err.name !== 'SecurityError') {
      console.warn('Folder picker error:', err);
      showToast('Could not access folder. Try a different location or browser.');
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Read all .gif / .png files from the chosen folder into savedItems. */
/* ------------------------------------------------------------------ */
export async function loadFolderContents() {
  if (!state.directoryHandle) return;
  const items = [];
  try {
    for await (const entry of state.directoryHandle.values()) {
      if (entry.kind === 'file' && /\.(gif|png)$/i.test(entry.name)) {
        const file = await entry.getFile();
        const url = URL.createObjectURL(file);
        items.push({ name: entry.name, url, size: file.size, handle: entry });
      }
    }
  } catch {}
  state.savedItems = items.reverse().slice(0, 24);
  render();
}

/* ------------------------------------------------------------------ */
/*  Write a blob to the chosen folder.                                 */
/* ------------------------------------------------------------------ */
export async function saveToFolder(blob, fileName, retries = 2) {
  if (!state.directoryHandle) return null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const fileHandle = await state.directoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return fileHandle;
    } catch (err) {
      if (attempt < retries) {
        // Permission may need a moment — retry after a short delay
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
      return null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Render the saved memes bar and the floating hover preview.         */
/* ------------------------------------------------------------------ */
export function renderSavedBar() {
  if (state.savedItems.length === 0 && !state.directoryHandle) {
    els.savedBar.hidden = true;
    return;
  }
  els.savedBar.hidden = false;
  els.folderLabel.hidden = true;
  els.pickFolderBtn.textContent = state.directoryHandle ? '📁 Change folder' : '📁 Set save folder';
  els.folderLabel.hidden = !state.directoryHandle;
  if (state.directoryHandle) {
    els.folderLabel.textContent = `📂 ${state.directoryHandle.name}`;
  }
  els.savedList.innerHTML = '';
  for (const item of state.savedItems) {
    const div = document.createElement('div');
    div.className = 'savedItem';
    div.innerHTML = `<img src="${item.url}" alt="${item.name}" />`;
    div.addEventListener('mouseenter', (event) => {
      els.savedPreview.src = item.url;
      els.savedPreview.hidden = false;
    });
    div.addEventListener('mousemove', (event) => {
      const x = event.clientX + 18;
      const y = event.clientY + 10;
      els.savedPreview.style.left = `${Math.min(x, window.innerWidth - 320)}px`;
      els.savedPreview.style.top = `${Math.min(y, window.innerHeight - 260)}px`;
    });
    div.addEventListener('mouseleave', () => {
      els.savedPreview.hidden = true;
      els.savedPreview.removeAttribute('src');
    });
    els.savedList.appendChild(div);
  }
}
