export type MediaDimensions = Readonly<{
  width?: number;
  height?: number;
}>;

export type VideoMetadata = MediaDimensions & Readonly<{
  duration?: number;
}>;

export async function readImageDimensions(blob: Blob): Promise<MediaDimensions> {
  const bitmap = await createImageBitmap(blob);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return dimensions;
}

export function readVideoMetadata(file: File, timeoutMs = 5000): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const finish = (result: VideoMetadata | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      try {
        video.load();
      } catch {
        // ignore cleanup errors — they must not mask the metadata result
      }
      URL.revokeObjectURL(objectUrl);

      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    // Some mp4/mov files never fire `loadedmetadata` (codec mismatch, odd
    // container, or the browser simply refusing to demux it). Never hang the
    // upload flow on that — fall back to defaults after a short grace period.
    const timer = setTimeout(() => finish(new Error('Timed out reading video metadata')), timeoutMs);

    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      finish({
        width: Number.isFinite(video.videoWidth) && video.videoWidth > 0 ? video.videoWidth : undefined,
        height: Number.isFinite(video.videoHeight) && video.videoHeight > 0 ? video.videoHeight : undefined,
        duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined,
      });
    };
    video.onerror = () => finish(new Error('Could not read video metadata'));

    // `src` alone is not enough in every browser; explicitly start loading.
    video.src = objectUrl;
    video.load();
  });
}
