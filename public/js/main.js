/**
 * Application entry point.
 * Imports all modules, owns the central `render()` function,
 * and wires event listeners.
 *
 * Framework migration path:
 * - Each module's public API (exports) stays the same.
 * - `render()` can become a Redux dispatch or Vue reactivity handler.
 * - The main.js event listeners become "smart component" logic.
 */
import { state, selected, uid } from './state.js';
import { els, setStatus, showToast, buttonHit } from './dom.js';
import { formatBytes } from './utils.js';
import { tickSound } from './audio.js';
import { addText, updateSelected, renderList, renderEditor, renderOverlays, startDrag, recordPoint, getFontSizePx, setRender as setEditorRender } from './editor.js';
import { generatePreview, saveAfterPreview, closePreviewOnly, redoPreview, closePreviewAndReset, setRender as setPreviewRender } from './preview.js';
import { initSavedFolder, pickSaveFolder, renderSavedBar, saveToFolder, loadFolderContents, setRender as setSavedRender } from './saved-bar.js';
import { initTheme, setRender as setThemeRender } from './theme.js';
import { convertVideoToGif } from './ffmpeg.js';

// -----------------------------------------------------------------------
// Central render — called whenever state changes
// -----------------------------------------------------------------------
function render() {
  document.body.classList.toggle('has-media', !!state.file);
  document.body.classList.toggle('light', state.theme === 'light');

  // Header toggles
  els.themeToggleBtn.checked = state.theme === 'light';
  els.soundToggleBtn.setAttribute('aria-pressed', String(state.soundEnabled));

  // Preview button (floating)
  els.previewBtn.hidden = !state.file;
  els.previewBtn.disabled = !state.file;

  // Workflow controls
  els.addTextBtn.disabled = !state.file;
  els.durationInput.disabled = !state.file;
  els.durationInput.value = state.duration;
  els.outputWidth.value = state.outputWidth;
  els.outputHeight.value = state.outputHeight;
  els.gifFps.value = state.gifFps;
  els.gifColors.value = state.gifColors;
  els.gifDither.value = state.gifDither;
  els.targetSizeMb.value = state.targetSizeMb;
  els.outputWidth.disabled = !state.file;
  els.outputHeight.disabled = !state.file;
  els.gifFps.disabled = !state.file || state.file.type !== 'gif';
  els.gifColors.disabled = !state.file || state.file.type !== 'gif';
  els.gifDither.disabled = !state.file || state.file.type !== 'gif';
  els.targetSizeMb.disabled = !state.file || state.file.type !== 'gif';

  // Sub-renders
  renderList();
  renderEditor();
  renderOverlays();
  renderSavedBar();
}

// Provide render to modules that need it
setEditorRender(render);
setPreviewRender(render);
setSavedRender(render);
setThemeRender(render);

// -----------------------------------------------------------------------
// Upload / media management
// -----------------------------------------------------------------------
function mediaKind(file) {
  const type = file.type || '';
  const name = file.name || '';
  if (type.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv|mpeg|mpg)$/i.test(name)) return 'video';
  if (type === 'image/gif' || /\.gif$/i.test(name)) return 'gif';
  return 'image';
}

function blobToObjectUrl(file) {
  if (state.sourceObjectUrl) URL.revokeObjectURL(state.sourceObjectUrl);
  state.sourceObjectUrl = URL.createObjectURL(file);
  return state.sourceObjectUrl;
}

async function imageInfo(file) {
  const bitmap = await createImageBitmap(file);
  const info = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return info;
}

async function loadInputFile(file, message = 'Loaded. Add text, record movement if needed, then export.') {
  const kind = mediaKind(file);
  let sourceFile = file;
  let type = kind;
  let convertedFromVideo = false;

  if (kind === 'video') {
    setStatus('Converting video to GIF locally with FFmpeg WASM...');
    sourceFile = await convertVideoToGif(file);
    type = 'gif';
    convertedFromVideo = true;
  }

  const info = type === 'image'
    ? await imageInfo(sourceFile)
    : { ...(await imageInfo(sourceFile).catch(() => ({}))), duration: 5 };
  const url = blobToObjectUrl(sourceFile);
  state.originalFile = file;
  state.sourceFile = sourceFile;
  state.file = {
    id: uid(),
    name: convertedFromVideo
      ? `${(file.name || 'video').replace(/\.[^.]+$/, '')}-converted.gif`
      : (sourceFile.name || file.name || 'input'),
    type,
    duration: info.duration || (type === 'gif' ? state.duration || 5 : 0),
    width: info.width,
    height: info.height,
    url,
  };
  state.overlays = [];
  state.selectedId = null;
  state.duration = Math.max(0.1, Number(state.file.duration || 5));
  state.outputWidth = state.file.width || '';
  state.outputHeight = state.file.height || '';

  els.baseImage.src = url;
  els.stage.classList.remove('empty');
  els.fileMeta.textContent = `${state.file.name} — ${type.toUpperCase()}${state.file.width ? ` — ${state.file.width}×${state.file.height}` : ''}${type === 'gif' ? ` — duration set to ${state.duration.toFixed(2)}s` : ''}`;
  setStatus(convertedFromVideo
    ? 'Video converted to GIF locally. Add text, record movement if needed, then export.'
    : message);
  showToast('Media loaded');
  tickSound('success');
  render();
}

async function uploadFile(file) {
  if (!file) return;
  try { await loadInputFile(file); } catch (err) { setStatus(err?.message || String(err) || 'Upload failed', true); }
}



// -----------------------------------------------------------------------
// Event listeners
// -----------------------------------------------------------------------

// Global click → deselect text + sound on buttons
document.addEventListener('pointerdown', (event) => {
  const button = event.target.closest?.('button, .uploadBox, .textItem');
  if (button) {
    buttonHit(button.tagName === 'BUTTON' ? button : null);
    tickSound('click');
  }
  const clickedText = event.target.closest?.('.overlayText, .textItem, #textPopover, #deleteBtn, #editor');
  if (!clickedText && state.selectedId) {
    state.selectedId = null;
    render();
  }
}, { capture: true });

// Keypress → keyboard click sound
document.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.target.matches?.('input, textarea')) tickSound('key');
});

// Theme toggle (wired in theme.js initTheme)
initTheme();

// Sound toggle
els.soundToggleBtn.addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  if (state.soundEnabled) tickSound('success');
  render();
  showToast(state.soundEnabled ? 'Sound on' : 'Sound off');
});

// Initial sound icon state
els.soundToggleBtn.setAttribute('aria-pressed', String(state.soundEnabled));

// File input / URL import
els.pickFolderBtn.addEventListener('click', pickSaveFolder);
els.fileInput.addEventListener('change', (event) => uploadFile(event.target.files[0]));

// Preview
els.previewBtn.addEventListener('click', generatePreview);
els.saveExportBtn.addEventListener('click', saveAfterPreview);
els.redoBtn.addEventListener('click', redoPreview);
els.exportModal.addEventListener('click', (event) => {
  if (event.target === els.exportModal) closePreviewOnly();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !els.exportModal.hidden) closePreviewOnly();
});

// Text layer CRUD
els.addTextBtn.addEventListener('click', () => { addText(); showToast('Text layer added'); });
els.textValue.addEventListener('input', () => updateSelected({ text: els.textValue.value }));
els.fontSizeValue.addEventListener('input', () => {
  const val = parseInt(els.fontSizeValue.value, 10);
  if (isNaN(val)) return;
  updateSelected({ fontSizePx: Math.max(8, Math.min(300, val)) });
});
els.colorValue.addEventListener('input', () => updateSelected({ color: els.colorValue.value }));
els.outlineColorValue.addEventListener('input', () => updateSelected({ outlineColor: els.outlineColorValue.value }));
els.outlineWidthValue.addEventListener('input', () => updateSelected({
  outlineWidth: Math.max(0, Math.min(12, Number(els.outlineWidthValue.value || 0)))
}));
els.enabledValue.addEventListener('change', () => updateSelected({ enabled: els.enabledValue.checked }));
els.moveValue.addEventListener('change', () => {
  const overlay = selected();
  if (!overlay) return;
  if (!els.moveValue.checked) { state._recordStart = null; state._recordLastMs = null; }
  updateSelected({ move: els.moveValue.checked, path: overlay.path || [] });
});
els.clearPathBtn.addEventListener('click', () => {
  const overlay = selected();
  if (!overlay) return;
  state._recordStart = null;
  state._recordLastMs = null;
  updateSelected({ path: [], move: true });
  render();
  showToast('Path cleared');
});
els.centerBtn.addEventListener('click', () => {
  const overlay = selected();
  if (!overlay) return;
  overlay.x = 0.5;
  overlay.y = 0.45;
  recordPoint(overlay, overlay.x, overlay.y, true);
  render();
});
els.deleteBtn.addEventListener('click', () => {
  state.overlays = state.overlays.filter(o => o.id !== state.selectedId);
  state.selectedId = state.overlays[0]?.id || null;
  render();
});

// Duration / export settings
els.durationInput.addEventListener('change', () => {
  state.duration = Math.max(0.1, Number(els.durationInput.value || 5));
  for (const overlay of state.overlays) { overlay.start = 0; overlay.end = state.duration; }
  render();
});
els.outputWidth.addEventListener('input', () => { state.outputWidth = els.outputWidth.value; });
els.outputHeight.addEventListener('input', () => { state.outputHeight = els.outputHeight.value; });
els.gifFps.addEventListener('input', () => {
  state.gifFps = Math.max(1, Math.min(60, Number(els.gifFps.value || 12)));
});
els.gifColors.addEventListener('input', () => {
  state.gifColors = Math.max(2, Math.min(256, Number(els.gifColors.value || 96)));
});
els.gifDither.addEventListener('change', () => { state.gifDither = els.gifDither.value; });
els.targetSizeMb.addEventListener('input', () => { state.targetSizeMb = els.targetSizeMb.value; });

// Window events
window.addEventListener('resize', renderOverlays);
els.baseImage.addEventListener('load', renderOverlays);

// -----------------------------------------------------------------------
// Bootstrap
// -----------------------------------------------------------------------
render();
initSavedFolder();

// Expose state for Playwright tests (not used in production code)
window.__state = state;
