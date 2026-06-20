/**
 * Preview modal — generate, save, redo, close.
 */
import { state } from './state.js';
import { els, setStatus, showToast } from './dom.js';
import { formatBytes } from './utils.js';
import { tickSound } from './audio.js';
import { renderStillImage, renderAnimatedGif } from './ffmpeg.js';
import { saveToFolder, renderSavedBar, loadFolderContents } from './saved-bar.js';

let render = () => {};
export function setRender(fn) { render = fn; }

/* ------------------------------------------------------------------ */
/*  Generate preview — the main entry point.                          */
/*  Uses a rendering guard so concurrent calls are dropped.            */
/* ------------------------------------------------------------------ */
export async function generatePreview() {
  if (!state.file || !state.sourceFile || state.rendering) return;
  const hasText = state.overlays.some(o => String(o.text || '').trim());
  if (!hasText) { showToast('Add at least one text layer first'); return; }

  state.rendering = true;
  els.previewBtn.disabled = true;
  els.redoBtn.disabled = true;
  els.saveExportBtn.disabled = true;
  els.exportModal.hidden = false;
  els.exportPreviewImage.hidden = true;
  els.exportPreviewImage.removeAttribute('src');
  els.previewSpinner.hidden = false;
  els.exportPreviewMeta.textContent = 'Rendering with FFmpeg...';

  try {
    const result = state.file.type === 'image'
      ? await renderStillImage()
      : await renderAnimatedGif();

    if (state.currentPreviewUrl) URL.revokeObjectURL(state.currentPreviewUrl);
    const url = URL.createObjectURL(result.blob);
    state.currentPreviewUrl = url;

    els.previewSpinner.hidden = true;
    els.exportPreviewImage.hidden = false;
    els.exportPreviewImage.src = url;
    els.exportPreviewImage.onload = () => { els.exportPreviewImage.onload = null; };
    const dims = state.file?.width && state.file?.height ? ` ${state.file.width}x${state.file.height}` : '';
    const extras = result.settingText?.replace(' Used ', '') || '';
    els.exportPreviewMeta.textContent = `${result.name}  ·  ${formatBytes(result.blob.size)}${dims}${extras ? `  ·  ${extras}` : ''}`;
    setStatus(`Preview ready • ${result.name} (${formatBytes(result.blob.size)})`);
    showToast('Preview ready');
    tickSound('success');
  } catch (err) {
    const msg = err?.message || String(err) || 'FFmpeg render error';
    els.exportPreviewMeta.textContent = `Error: ${msg}`;
    setStatus(`Preview failed: ${msg}`, true);
  } finally {
    state.rendering = false;
    els.previewBtn.disabled = !state.file;
    els.redoBtn.disabled = false;
    els.saveExportBtn.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/*  Save & download — re-renders the final output, writes to folder   */
/*  if one is set, then resets the workspace.                          */
/* ------------------------------------------------------------------ */
export async function saveAfterPreview() {
  if (!state.file || !state.sourceFile) return;

  // Step 1: Ensure folder is set FIRST (must be inside user gesture)
  if (!state.directoryHandle) {
    try {
      if (!window.showDirectoryPicker) { showToast('Your browser does not support folder saving. Try Chrome or Edge.'); return; }
      const handle = await window.showDirectoryPicker();
      const ok = await handle.requestPermission({ mode: 'readwrite' });
      if (ok !== 'granted') { showToast('Folder permission denied'); return; }
      state.directoryHandle = handle;
      state.directoryId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      // Best-effort IndexedDB save — don't block on failure
      idbSet('directoryHandle', { handle, id: state.directoryId }).catch(() => {});
      for (const item of state.savedItems) { if (item.url) URL.revokeObjectURL(item.url); }
      state.savedItems = [];
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Folder picker warning:', err);
        // If we got a handle, keep it and continue
        if (!state.directoryHandle) {
          showToast('Could not access folder. Try again.');
          return;
        }
      } else {
        return; // User cancelled the picker
      }
    }
  }

  // Double-check permission is still valid
  if (state.directoryHandle) {
    try {
      const perm = await state.directoryHandle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        state.directoryHandle = null;
        showToast('Folder permission was revoked. Try again.');
        return;
      }
    } catch { /* continue */ }
  }

  // Step 2: Disable button and render
  setStatus('Saving final export...');
  els.saveExportBtn.disabled = true;
  try {
    const result = state.file.type === 'image'
      ? await renderStillImage()
      : await renderAnimatedGif();

    // Step 3: Save to folder
    const fileHandle = await saveToFolder(result.blob, result.name);
    if (fileHandle) {
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      state.savedItems.unshift({ name: file.name, url, size: file.size, handle: fileHandle });
      if (state.currentPreviewUrl) URL.revokeObjectURL(state.currentPreviewUrl);
      state.currentPreviewUrl = null;
      setStatus(`Saved! ${file.name} (${formatBytes(file.size)})`);
      showToast('Saved!');
      tickSound('success');
      // Refresh folder contents to pick up the new file
      loadFolderContents().catch(() => {});
      closePreviewAndReset();
    } else {
      showToast('Save failed — could not write to folder');
    }
  } catch (err) {
    const msg = err?.message || String(err) || 'Save failed';
    setStatus(`Save failed: ${msg}`, true);
  } finally {
    els.saveExportBtn.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/*  Close the preview modal and reset the entire workspace.           */
/*  Revokes all blob URLs so no memory leaks.                          */
/* ------------------------------------------------------------------ */
export function closePreviewAndReset() {
  els.exportModal.hidden = true;
  els.exportPreviewImage.removeAttribute('src');
  els.exportPreviewImage.onload = null;
  if (state.currentPreviewUrl) { URL.revokeObjectURL(state.currentPreviewUrl); state.currentPreviewUrl = null; }
  if (state.sourceObjectUrl) URL.revokeObjectURL(state.sourceObjectUrl);
  state.sourceObjectUrl = '';
  state.sourceFile = null;
  state.originalFile = null;
  state.file = null;
  state.overlays = [];
  state.selectedId = null;
  state._recordStart = null;
  state._recordLastMs = null;
  state.outputWidth = '';
  state.outputHeight = '';
  state.targetSizeMb = '';
  state.duration = 5;
  els.baseImage.removeAttribute('src');
  els.stage.classList.add('empty');
  els.fileMeta.textContent = 'No file uploaded.';
  els.addTextBtn.disabled = true;
  els.previewBtn.hidden = true;
  render();
  setStatus('Ready for the next meme.');
}

/* ------------------------------------------------------------------ */
/*  Close the preview only — keeps workspace intact for more editing.  */
/* ------------------------------------------------------------------ */
export function closePreviewOnly() {
  els.exportModal.hidden = true;
  els.exportPreviewImage.removeAttribute('src');
  els.exportPreviewImage.onload = null;
  if (state.currentPreviewUrl) { URL.revokeObjectURL(state.currentPreviewUrl); state.currentPreviewUrl = null; }
  setStatus('Preview closed. Edit your text and preview again.');
}

/* ------------------------------------------------------------------ */
/*  Redo — close then immediately regenerate.                          */
/* ------------------------------------------------------------------ */
export function redoPreview() {
  els.exportModal.hidden = true;
  els.exportPreviewImage.removeAttribute('src');
  els.exportPreviewImage.onload = null;
  if (state.currentPreviewUrl) { URL.revokeObjectURL(state.currentPreviewUrl); state.currentPreviewUrl = null; }
  setTimeout(() => generatePreview(), 50);
}
