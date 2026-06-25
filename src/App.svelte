<script lang="ts">
  import { onDestroy } from 'svelte';
  import MediaPanel from './components/MediaPanel.svelte';
  import MediaStage from './components/MediaStage.svelte';
  import PreviewSavePanel from './components/PreviewSavePanel.svelte';
  import WorkflowSidebar from './components/WorkflowSidebar.svelte';
  import { appStore, selectedLayer } from './store/app-store';
  import { createImageLayer, createTextLayer } from './domain/layer-factories';
  import { createId } from './infrastructure/id';
  import { loadMediaFile } from './infrastructure/media-loader';
  import { readImageDimensions } from './infrastructure/media-metadata';
  import { renderPreview, type PreviewRenderResult } from './infrastructure/export-renderer';
  import type { NormalizedPoint } from './domain/layer-position';
  import type { Layer, PathPoint } from './domain/types';

  const layerObjectUrls = new Set<string>();
  let currentMediaObjectUrl: string | null = null;
  let currentPreviewUrl: string | null = $state(null);
  let previewResult: PreviewRenderResult | null = $state(null);
  let previewStatus: 'idle' | 'rendering' | 'ready' | 'saved' | 'error' = $state('idle');
  let previewMessage = $state('');
  let previewPanelOpen = $state(false);
  let mediaLoadToken = 0;

  const freeFontOptions = [
    { label: 'System sans', value: 'system-ui, sans-serif' },
    { label: 'Strong sans', value: 'ui-sans-serif, system-ui, sans-serif' },
    { label: 'Classic serif', value: 'serif' },
    { label: 'Mono caption', value: 'ui-monospace, monospace' },
    { label: 'Casual script', value: 'cursive' },
    { label: 'Display/fantasy', value: 'fantasy' },
  ] as const;

  async function loadMedia(file: File) {
    const token = ++mediaLoadToken;
    appStore.dispatch({ type: 'media/loadStarted', fileName: file.name || 'media' });

    try {
      const media = await loadMediaFile(file, {
        videoDurationLimitSeconds: $appStore.videoConversionSettings.durationLimitSeconds,
        videoFps: $appStore.videoConversionSettings.fps,
        videoMaxWidth: $appStore.videoConversionSettings.maxWidth,
        videoMaxHeight: $appStore.videoConversionSettings.maxHeight,
        videoColors: $appStore.videoConversionSettings.colors,
        onProgress: ({ message, progress }) => {
          if (token !== mediaLoadToken) return;
          appStore.dispatch({ type: 'media/loadProgress', message, progress });
        },
      });

      if (token !== mediaLoadToken) {
        URL.revokeObjectURL(media.objectUrl);
        return;
      }

      revokeCurrentMediaUrl();
      revokeLayerObjectUrls();
      revokePreviewUrl();
      previewResult = null;
      previewStatus = 'idle';
      previewMessage = '';
      previewPanelOpen = false;
      currentMediaObjectUrl = media.objectUrl;
      appStore.dispatch({ type: 'media/loaded', media });
    } catch (error) {
      if (token === mediaLoadToken) {
        appStore.dispatch({
          type: 'media/loadFailed',
          message: error instanceof Error ? error.message : 'Could not load media',
        });
      }
    }
  }

  async function addImageLayer(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !$appStore.media) return;

    const objectUrl = URL.createObjectURL(file);
    layerObjectUrls.add(objectUrl);

    try {
      const dimensions = await readImageDimensions(file);
      appStore.dispatch({
        type: 'layer/addImage',
        layer: createImageLayer({
          id: createId('image-layer'),
          index: $appStore.layers.length,
          name: file.name,
          objectUrl,
          naturalWidth: dimensions.width ?? 1,
          naturalHeight: dimensions.height ?? 1,
        }),
      });
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      layerObjectUrls.delete(objectUrl);
      appStore.dispatch({
        type: 'media/loadFailed',
        message: error instanceof Error ? error.message : 'Could not read image layer',
      });
    } finally {
      input.value = '';
    }
  }

  function addTextLayer() {
    if (!$appStore.media) return;

    appStore.dispatch({
      type: 'layer/addText',
      layer: createTextLayer({
        id: createId('text-layer'),
        index: $appStore.layers.length,
        duration: $appStore.exportSettings.duration,
      }),
    });
  }

  function toggleTheme() {
    appStore.dispatch({
      type: 'theme/set',
      theme: $appStore.theme === 'dark' ? 'light' : 'dark',
    });
  }

  function selectLayer(id: string | null) {
    appStore.dispatch({ type: 'layer/select', id });
  }

  function moveLayer(id: string, point: NormalizedPoint, path?: readonly PathPoint[]) {
    appStore.dispatch({ type: 'layer/update', id, patch: path ? { x: point.x, y: point.y, path } : { x: point.x, y: point.y } });
  }

  function updateSelectedLayer(patch: Partial<Layer>) {
    if (!$selectedLayer) return;
    appStore.dispatch({ type: 'layer/update', id: $selectedLayer.id, patch });
  }

  function toggleSelectedLayerRecording(enabled: boolean) {
    if (!$selectedLayer) return;
    updateSelectedLayer({ move: enabled, path: $selectedLayer.path });
  }

  function clearSelectedLayerPath() {
    if (!$selectedLayer) return;
    updateSelectedLayer({ move: true, path: [] });
  }

  async function generatePreview() {
    if (!$appStore.media) return;
    previewPanelOpen = true;

    revokePreviewUrl();
    previewResult = null;
    previewStatus = 'rendering';
    previewMessage = 'Rendering preview...';

    try {
      const result = await renderPreview({
        media: $appStore.media,
        layers: $appStore.layers,
        fps: $appStore.exportSettings.gifFps,
        colors: $appStore.exportSettings.gifColors,
        duration: $appStore.exportSettings.duration,
        outputWidth: $appStore.exportSettings.outputWidth ? Number($appStore.exportSettings.outputWidth) || undefined : undefined,
        outputHeight: $appStore.exportSettings.outputHeight ? Number($appStore.exportSettings.outputHeight) || undefined : undefined,
        dither: $appStore.exportSettings.gifDither,
        onProgress: ({ message }) => {
          previewMessage = message;
        },
      });

      currentPreviewUrl = URL.createObjectURL(result.blob);
      previewResult = result;
      previewStatus = 'ready';
      previewMessage = 'Preview ready. Click save when done.';
    } catch (error) {
      previewStatus = 'error';
      previewMessage = error instanceof Error ? error.message : 'Could not render preview.';
    }
  }

  function togglePreviewPanel() {
    if (previewPanelOpen) {
      previewPanelOpen = false;
      return;
    }

    previewPanelOpen = true;
    if (!previewResult && previewStatus !== 'rendering') {
      void generatePreview();
    }
  }

  async function savePreview() {
    if (!previewResult) return;

    try {
      const neutralino = (window as typeof window & {
        Neutralino?: {
          os?: {
            showSaveDialog: (
              title?: string,
              options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> },
            ) => Promise<string>;
          };
          filesystem?: {
            writeBinaryFile: (fileName: string, data: ArrayBuffer) => Promise<void>;
          };
        };
      }).Neutralino;

      if (neutralino?.os?.showSaveDialog && neutralino.filesystem?.writeBinaryFile) {
        const extension = previewResult.fileName.split('.').pop()?.toLowerCase() === 'gif' ? 'gif' : 'png';
        const savedPath = await neutralino.os.showSaveDialog('Save meme', {
          defaultPath: previewResult.fileName,
          filters: [
            extension === 'gif'
              ? { name: 'GIF image', extensions: ['gif'] }
              : { name: 'PNG image', extensions: ['png'] },
            { name: 'All files', extensions: ['*'] },
          ],
        });

        if (!savedPath) {
          previewMessage = 'Save cancelled.';
          return;
        }

        await neutralino.filesystem.writeBinaryFile(savedPath, await previewResult.blob.arrayBuffer());
        previewStatus = 'saved';
        previewMessage = `Saved to ${savedPath}`;
        return;
      }

      const url = URL.createObjectURL(previewResult.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = previewResult.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      previewStatus = 'saved';
      previewMessage = 'Saved. You can clear media to start again, or keep editing.';
    } catch (error) {
      previewStatus = 'error';
      previewMessage = error instanceof Error ? error.message : 'Could not save preview.';
    }
  }

  function deleteSelectedLayer() {
    if (!$appStore.selectedLayerId || !$selectedLayer) return;

    if ($selectedLayer.type === 'image') {
      URL.revokeObjectURL($selectedLayer.objectUrl);
      layerObjectUrls.delete($selectedLayer.objectUrl);
    }

    appStore.dispatch({ type: 'layer/delete', id: $appStore.selectedLayerId });
  }

  function clearMedia() {
    mediaLoadToken += 1;
    revokeCurrentMediaUrl();
    revokeLayerObjectUrls();
    revokePreviewUrl();
    previewResult = null;
    previewStatus = 'idle';
    previewMessage = '';
    previewPanelOpen = false;
    appStore.dispatch({ type: 'media/cleared' });
  }

  function revokeCurrentMediaUrl() {
    if (!currentMediaObjectUrl) return;
    URL.revokeObjectURL(currentMediaObjectUrl);
    currentMediaObjectUrl = null;
  }

  function revokeLayerObjectUrls() {
    for (const objectUrl of layerObjectUrls) URL.revokeObjectURL(objectUrl);
    layerObjectUrls.clear();
  }

  function revokePreviewUrl() {
    if (!currentPreviewUrl) return;
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
  }

  onDestroy(() => {
    mediaLoadToken += 1;
    revokeCurrentMediaUrl();
    revokeLayerObjectUrls();
    revokePreviewUrl();
  });
</script>

<svelte:head>
  <title>Meme Enhancer 9000</title>
</svelte:head>

<main class={$appStore.theme === 'light' ? 'light' : ''}>
  <header class="topbar">
    <div class="brand-group">
      <img src="/logo.svg" alt="ME9K" class="brand-logo" />
      <div>
        <p class="eyebrow">Private browser editor</p>
        <h1>Meme Enhancer 9000</h1>
        <p class="muted">Input Image/Video/GIF → Add Text(s) → Move Text with Meme Context → Save (Image or GIF)</p>
      </div>
    </div>

    <div class="actions">
      <button type="button" onclick={toggleTheme}>{$appStore.theme === 'dark' ? 'Light' : 'Dark'} mode</button>
    </div>
  </header>

  <div class="guided-layout">
    <WorkflowSidebar media={$appStore.media} />

    <div class="guided-main">
      <MediaPanel
        media={$appStore.media}
        mediaLoad={$appStore.mediaLoad}
        exportSettings={$appStore.exportSettings}
        onMediaSelected={loadMedia}
        onClearMedia={clearMedia}
        onUpdateExportSettings={(patch) => appStore.dispatch({ type: 'export/updateSettings', patch })}
      />
    </div>
  </div>

  <section id="edit-media" class="workspace">
    <aside class="panel">
      <div class="section-head">
        <h2>Layers</h2>
      </div>
      <div class="layer-actions">
        <button type="button" disabled={!$appStore.media || $appStore.mediaLoad.status === 'loading'} onclick={addTextLayer}>Add text</button>
        <label class="button-like" aria-disabled={!$appStore.media || $appStore.mediaLoad.status === 'loading'}>
          Add image
          <input type="file" accept="image/*" disabled={!$appStore.media || $appStore.mediaLoad.status === 'loading'} onchange={addImageLayer} />
        </label>
      </div>

      {#if $appStore.layers.length === 0}
        <p class="muted">No layers yet.</p>
      {:else}
        <ul class="layer-list">
          {#each $appStore.layers as layer}
            <li>
              <button
                type="button"
                class={layer.id === $appStore.selectedLayerId ? 'selected' : ''}
                onclick={() => appStore.dispatch({ type: 'layer/select', id: layer.id })}
              >
                {layer.type === 'text' ? layer.text : layer.name}
                <small>{layer.path.length ? `${layer.path.length} path points` : layer.type}</small>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </aside>

    <MediaStage
      media={$appStore.media}
      layers={$appStore.layers}
      selectedLayerId={$appStore.selectedLayerId}
      onSelectLayer={selectLayer}
      onMoveLayer={moveLayer}
    />

    <aside class="panel layer-editor">
      <div class="section-head editor-topbar">
        <div>
          <p class="eyebrow">Edit</p>
          <h2>Selected layer</h2>
        </div>
        <button type="button" class="primary-action" disabled={!$appStore.media} onclick={togglePreviewPanel}>
          {previewPanelOpen ? 'Hide preview' : 'Generate preview'}
        </button>
      </div>

      {#if $selectedLayer}
        <p class="muted editor-hint">Drag the selected layer on the canvas, then tune it here.</p>

        {#if $selectedLayer.type === 'text'}
          <div class="editor-card">
            <div class="editor-card-head">
              <strong>Text content</strong>
              <small>What appears on the meme</small>
            </div>
            <label>
              Caption
              <textarea
                rows="4"
                value={$selectedLayer.text}
                oninput={(event) => updateSelectedLayer({ text: (event.currentTarget as HTMLTextAreaElement).value })}
              ></textarea>
            </label>
          </div>

          <div class="editor-card">
            <div class="editor-card-head">
              <strong>Style</strong>
              <small>Free generic browser font families; no paid fonts bundled</small>
            </div>
            <label>
              Font
              <select
                value={$selectedLayer.fontFamily}
                onchange={(event) => updateSelectedLayer({ fontFamily: (event.currentTarget as HTMLSelectElement).value })}
              >
                {#each freeFontOptions as font}
                  <option value={font.value}>{font.label}</option>
                {/each}
              </select>
            </label>

            <div class="editor-two-col">
              <label>
                Size
                <input
                  type="number"
                  min="8"
                  max="300"
                  step="1"
                  value={$selectedLayer.fontSizePx}
                  oninput={(event) => updateSelectedLayer({ fontSizePx: Number((event.currentTarget as HTMLInputElement).value) })}
                />
              </label>

              <label>
                Color
                <input
                  type="color"
                  value={$selectedLayer.color}
                  oninput={(event) => updateSelectedLayer({ color: (event.currentTarget as HTMLInputElement).value })}
                />
              </label>
            </div>
          </div>
        {:else}
          <div class="editor-card">
            <div class="editor-card-head">
              <strong>Image layer</strong>
              <small>Resize and blend the selected image</small>
            </div>
            <label>
              Scale <span class="field-value">{$selectedLayer.scale.toFixed(2)}×</span>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.05"
                value={$selectedLayer.scale}
                oninput={(event) => updateSelectedLayer({ scale: Number((event.currentTarget as HTMLInputElement).value) })}
              />
            </label>

            <label>
              Opacity <span class="field-value">{Math.round($selectedLayer.opacity * 100)}%</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={$selectedLayer.opacity}
                oninput={(event) => updateSelectedLayer({ opacity: Number((event.currentTarget as HTMLInputElement).value) })}
              />
            </label>
          </div>
        {/if}

        <div class="editor-card motion-card">
          <div class="editor-card-head">
            <strong>Motion path</strong>
            <small>Optional movement for GIF exports</small>
          </div>
          <label class="check-row">
            <input
              type="checkbox"
              checked={$selectedLayer.move}
              onchange={(event) => toggleSelectedLayerRecording((event.currentTarget as HTMLInputElement).checked)}
            />
            <span>Record movement while dragging</span>
          </label>

          {#if $selectedLayer.move}
            <div class="record-panel">
              <button type="button" class="subtle compact" onclick={clearSelectedLayerPath}>Clear path</button>
              <p class="muted">
                {#if $selectedLayer.path.length}
                  Recorded {$selectedLayer.path.length} points over {($selectedLayer.path.at(-1)?.t ?? 0).toFixed(2)}s. Drag again to add more.
                {:else}
                  Drag the layer on the canvas to record a synced movement path.
                {/if}
              </p>
            </div>
          {/if}
        </div>

        <button type="button" class="danger editor-danger" onclick={deleteSelectedLayer}>Delete layer</button>
      {:else}
        <div class="empty-editor">
          <strong>No layer selected</strong>
          <p class="muted">Add text or an image, then click it in the layer list or on the canvas.</p>
        </div>
      {/if}
    </aside>
  </section>

  {#if previewPanelOpen}
    <PreviewSavePanel
      status={previewStatus}
      message={previewMessage}
      previewUrl={currentPreviewUrl}
      result={previewResult}
      canPreview={Boolean($appStore.media)}
      onGeneratePreview={generatePreview}
      onSave={savePreview}
    />
  {/if}
</main>
