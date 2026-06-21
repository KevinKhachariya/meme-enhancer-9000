<script lang="ts">
  import type { ExportSettings, MediaFile, MediaLoadState } from '../domain/types';

  type Props = Readonly<{
    media: MediaFile | null;
    mediaLoad: MediaLoadState;
    exportSettings: ExportSettings;
    onMediaSelected: (file: File) => void;
    onClearMedia: () => void;
    onUpdateExportSettings: (patch: Partial<ExportSettings>) => void;
  }>;

  let {
    media,
    mediaLoad,
    exportSettings,
    onMediaSelected,
    onClearMedia,
    onUpdateExportSettings,
  }: Props = $props();

  let dragging = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let loading = $derived(mediaLoad.status === 'loading');
  let maxDuration = $derived(media?.duration ?? undefined);

  function updateDuration(value: string) {
    let num = Number(value);
    if (!Number.isFinite(num) || num < 0.1) num = 0.1;
    if (maxDuration !== undefined && num > maxDuration) num = maxDuration;
    onUpdateExportSettings({ duration: num });
  }

  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) onMediaSelected(file);
    input.value = '';
  }

  function openFilePicker() {
    if (loading) return;
    fileInput?.click();
  }

  function handleDragEnter(event: DragEvent) {
    event.preventDefault();
    if (!loading) dragging = true;
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!loading) dragging = true;
  }

  function handleDragLeave() {
    dragging = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    if (loading) return;

    const file = event.dataTransfer?.files?.[0];
    if (file) onMediaSelected(file);
  }

</script>

<section id="upload-media" class="panel media-panel">
  <div class="section-head">
    <div>
      <p class="eyebrow">Step 1</p>
      <h2>Choose media</h2>
    </div>
    {#if media}
      <button type="button" class="subtle compact" disabled={loading} onclick={onClearMedia}>Clear</button>
    {/if}
  </div>

  <div
    class={`upload-card${dragging ? ' dragging' : ''}`}
    role="group"
    aria-label="Media upload drop zone"
    aria-disabled={loading}
    ondragenter={handleDragEnter}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    <span class="upload-icon">＋</span>
    <span class="upload-copy">
      <strong>{loading ? 'Processing media...' : 'Upload image, GIF, or video'}</strong>
      <small>Images/GIFs load directly. Videos convert to GIF locally.</small>
    </span>
    <button type="button" class="upload-action" disabled={loading} onclick={openFilePicker}>Choose media</button>
    <input bind:this={fileInput} type="file" accept="image/*,video/*" disabled={loading} onchange={handleFileChange} />
  </div>

  {#if mediaLoad.message}
    <div class={`load-status${mediaLoad.status === 'error' ? ' error' : ''}`}>
      <span>{mediaLoad.message}</span>
      {#if typeof mediaLoad.progress === 'number'}
        <progress max="1" value={mediaLoad.progress}></progress>
      {/if}
    </div>
  {/if}

  {#if media}
    <details class="conversion-box" open>
      <summary class="conversion-summary">
        <div>
          <strong>Export settings</strong>
          <small>Size, FPS, colors, dither</small>
        </div>
        <div class="settings-chips">
          <span>{exportSettings.outputWidth || 'auto'}×{exportSettings.outputHeight || 'auto'}</span>
          <span>{exportSettings.gifFps} FPS</span>
          <span>{exportSettings.gifColors} colors</span>
        </div>
        <span class="dropdown-indicator">▾</span>
      </summary>
      <div class="conversion-body">
        <div class="conversion-grid">
          <label>
            GIF duration (s)
            <small>{maxDuration !== undefined ? `Max ${maxDuration.toFixed(1)}s (media length)` : 'Length of the output GIF'}</small>
            <input type="number" min="0.1" max={maxDuration} step="0.1" value={exportSettings.duration} oninput={(e) => updateDuration((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <label>
            Width (px)
            <small>Leave empty for auto</small>
            <input type="number" min="16" max="4096" step="1" placeholder="auto" value={exportSettings.outputWidth} oninput={(e) => onUpdateExportSettings({ outputWidth: (e.currentTarget as HTMLInputElement).value })} />
          </label>
          <label>
            Height (px)
            <small>Leave empty for auto</small>
            <input type="number" min="16" max="4096" step="1" placeholder="auto" value={exportSettings.outputHeight} oninput={(e) => onUpdateExportSettings({ outputHeight: (e.currentTarget as HTMLInputElement).value })} />
          </label>
          <label>
            GIF FPS
            <small>Frames per second</small>
            <input type="number" min="1" max="60" step="1" value={exportSettings.gifFps} oninput={(e) => onUpdateExportSettings({ gifFps: Number((e.currentTarget as HTMLInputElement).value) })} />
          </label>
          <label>
            GIF colors
            <small>2–256</small>
            <input type="number" min="2" max="256" step="1" value={exportSettings.gifColors} oninput={(e) => onUpdateExportSettings({ gifColors: Number((e.currentTarget as HTMLInputElement).value) })} />
          </label>
          <label>
            GIF dither
            <small>Dithering algorithm</small>
            <select class="conversion-select" value={exportSettings.gifDither} onchange={(e) => onUpdateExportSettings({ gifDither: (e.currentTarget as HTMLSelectElement).value as ExportSettings['gifDither'] })}>
              <option value="none">None - smallest</option>
              <option value="bayer">Bayer - balanced</option>
              <option value="sierra2_4a">Sierra - smoother, larger</option>
              <option value="floyd_steinberg">Floyd Steinberg - smoothest, largest</option>
            </select>
          </label>
        </div>
      </div>
    </details>
  {/if}
</section>
