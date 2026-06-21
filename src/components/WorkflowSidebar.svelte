<script lang="ts">
  import type { MediaFile } from '../domain/types';

  type Props = Readonly<{
    media: MediaFile | null;
  }>;

  let { media }: Props = $props();

  let uploadDone = $derived(Boolean(media));

  const steps = [
    {
      id: 'upload-media',
      label: 'Upload media',
      hint: 'Choose an image, GIF, or video.',
    },
    {
      id: 'edit-media',
      label: 'Edit media',
      hint: 'Continue after your media is ready.',
    },
  ] as const;

  function isDone(stepId: string): boolean {
    return stepId === 'upload-media' && uploadDone;
  }

  function isActive(stepId: string): boolean {
    if (stepId === 'upload-media') return !uploadDone;
    if (stepId === 'edit-media') return uploadDone;
    return false;
  }
</script>

<nav class="flow-sidebar" aria-label="Workflow navigation">
  {#each steps as step, index}
    <a
      class={`flow-link${isDone(step.id) ? ' done' : ''}${isActive(step.id) ? ' active' : ''}`}
      href={`#${step.id}`}
      aria-current={isActive(step.id) ? 'step' : undefined}
    >
      <span class="step-number">{index + 1}</span>
      <span class="flow-link-copy">
        <strong>{step.label}</strong>
        <small>{step.hint}</small>
      </span>
      {#if isDone(step.id)}
        <span class="step-check" aria-label="completed">✓</span>
      {/if}
    </a>

    {#if index < steps.length - 1}
      <div class="step-arrow" aria-hidden="true">↓</div>
    {/if}
  {/each}
</nav>
