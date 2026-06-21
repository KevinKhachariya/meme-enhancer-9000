<script lang="ts">
  import type { Layer, MediaFile, PathPoint } from '../domain/types';
  import {
    draggedPointFromClientPosition,
    pointFromClientPosition,
    pointerOffsetFromLayerPosition,
    type NormalizedPoint,
  } from '../domain/layer-position';
  import { recordPathPoint, type RecordSession } from '../domain/path-recorder';

  type Props = Readonly<{
    media: MediaFile | null;
    layers: readonly Layer[];
    selectedLayerId: string | null;
    onSelectLayer: (id: string | null) => void;
    onMoveLayer: (id: string, point: NormalizedPoint, path?: readonly PathPoint[]) => void;
  }>;

  type DragState = Readonly<{
    layerId: string;
    pointerOffset: NormalizedPoint;
    lastPoint: NormalizedPoint;
    recordedPath?: readonly PathPoint[];
  }>;

  let { media, layers, selectedLayerId, onSelectLayer, onMoveLayer }: Props = $props();
  let surfaceElement: HTMLDivElement | undefined = $state();
  let dragState: DragState | null = $state(null);
  let gifReplayNonce = $state(0);
  const recordSessions = new Map<string, RecordSession>();

  let mediaSrc = $derived(media?.kind === 'gif' ? `${media.objectUrl}#${gifReplayNonce}` : media?.objectUrl);

  function startLayerDrag(event: PointerEvent, layer: Layer) {
    if (!surfaceElement) return;

    event.preventDefault();
    event.stopPropagation();
    onSelectLayer(layer.id);

    if (layer.move && media?.kind === 'gif') {
      gifReplayNonce += 1;
    }

    const rect = surfaceElement.getBoundingClientRect();
    const pointer = pointFromClientPosition(event.clientX, event.clientY, rect);
    const point = { x: layer.x, y: layer.y };
    const recordedPath = recordLayerPoint(layer, point, true);
    dragState = {
      layerId: layer.id,
      pointerOffset: pointerOffsetFromLayerPosition(pointer, point),
      lastPoint: point,
      recordedPath,
    };

    if (recordedPath) onMoveLayer(layer.id, point, recordedPath);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function moveSelectedLayer(event: PointerEvent) {
    if (!dragState || !surfaceElement) return;

    const point = draggedPointFromClientPosition({
      clientX: event.clientX,
      clientY: event.clientY,
      rect: surfaceElement.getBoundingClientRect(),
      pointerOffset: dragState.pointerOffset,
    });

    const layer = layers.find((item) => item.id === dragState?.layerId);
    if (!layer) return;

    const path = recordLayerPoint(layer, point, false, dragState.recordedPath ?? layer.path);
    dragState = { ...dragState, lastPoint: point, recordedPath: path ?? dragState.recordedPath };
    onMoveLayer(dragState.layerId, point, path);
  }

  function stopLayerDrag() {
    if (dragState) {
      const layer = layers.find((item) => item.id === dragState?.layerId);
      if (layer) {
        const path = recordLayerPoint(layer, dragState.lastPoint, true, dragState.recordedPath ?? layer.path);
        onMoveLayer(dragState.layerId, dragState.lastPoint, path);
      }
    }
    dragState = null;
  }

  function recordLayerPoint(
    layer: Layer,
    point: NormalizedPoint,
    force: boolean,
    currentPath: readonly PathPoint[] = layer.path,
  ): readonly PathPoint[] | undefined {
    if (!layer.move) return undefined;

    const result = recordPathPoint({
      path: currentPath,
      session: recordSessions.get(layer.id) ?? null,
      nowMs: performance.now(),
      x: point.x,
      y: point.y,
      force,
    });

    recordSessions.set(layer.id, result.session);
    return result.path;
  }

  function selectEmptyStage() {
    onSelectLayer(null);
  }

  function imageLayerWidth(layer: Extract<Layer, { type: 'image' }>): number {
    return Math.max(32, Math.min(240, layer.naturalWidth) * layer.scale);
  }
</script>

<svelte:window onpointermove={moveSelectedLayer} onpointerup={stopLayerDrag} onpointercancel={stopLayerDrag} />

<section id="media-preview" class="stage panel">
  {#if media}
    <div class="media-frame">
      <div class="media-surface" bind:this={surfaceElement} role="presentation" onpointerdown={selectEmptyStage}>
        <img class="base-media" src={mediaSrc} alt="Selected media" draggable="false" />

        <div class="layer-preview">
          {#each layers as layer}
            {#if layer.enabled}
              {#if layer.type === 'text'}
                <button
                  type="button"
                  class={`overlay-handle preview-text${layer.id === selectedLayerId ? ' selected' : ''}${layer.move ? ' recording' : ''}`}
                  style={`left:${layer.x * 100}%;top:${layer.y * 100}%;font-size:${layer.fontSizePx}px;color:${layer.color};`}
                  onpointerdown={(event) => startLayerDrag(event, layer)}
                >
                  {layer.text}
                </button>
              {:else}
                <button
                  type="button"
                  class={`overlay-handle preview-image${layer.id === selectedLayerId ? ' selected' : ''}${layer.move ? ' recording' : ''}`}
                  style={`left:${layer.x * 100}%;top:${layer.y * 100}%;`}
                  onpointerdown={(event) => startLayerDrag(event, layer)}
                  aria-label={`Move image layer ${layer.name}`}
                >
                  <img
                    class="preview-image-content"
                    src={layer.objectUrl}
                    alt={layer.name}
                    draggable="false"
                    style={`width:${imageLayerWidth(layer)}px;opacity:${layer.opacity};`}
                  />
                </button>
              {/if}
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <div class="empty-stage">
      <strong>No media loaded</strong>
      <p class="muted">Upload an image, GIF, or video to preview it here.</p>
    </div>
  {/if}
</section>
