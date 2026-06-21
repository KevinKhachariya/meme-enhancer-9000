<script lang="ts">
  import type { PreviewRenderResult } from '../infrastructure/export-renderer';

  type PreviewStatus = 'idle' | 'rendering' | 'ready' | 'saved' | 'error';

  type Props = Readonly<{
    status: PreviewStatus;
    message: string;
    previewUrl: string | null;
    result: PreviewRenderResult | null;
    canPreview: boolean;
    onGeneratePreview: () => void;
    onSave: () => void;
  }>;

  let { status, message, previewUrl, result, canPreview, onGeneratePreview, onSave }: Props = $props();
</script>

<section class={`panel preview-save ${status}`} aria-label="Preview and save">
  <div class="section-head">
    <div>
      <p class="eyebrow">Final step</p>
      <h2>Preview & save</h2>
    </div>
  </div>

  <div class="preview-actions">
    <button type="button" disabled={!canPreview || status === 'rendering'} onclick={onGeneratePreview}>
      {status === 'rendering' ? 'Rendering...' : result ? 'Redo preview' : 'Generate preview'}
    </button>
    <button type="button" disabled={!result || status === 'rendering'} onclick={onSave}>Save</button>
  </div>

  {#if message}
    <p class="preview-message">{message}</p>
  {/if}

  <div class="preview-box">
    {#if previewUrl}
      <img src={previewUrl} alt="Rendered preview" />
    {:else}
      <p class="muted">Generate a preview when your edit is ready.</p>
    {/if}
  </div>

  {#if result}
    <p class="muted preview-file">{result.fileName}</p>
  {/if}
</section>
