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

export function readVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      const metadata: VideoMetadata = {
        width: Number.isFinite(video.videoWidth) && video.videoWidth > 0 ? video.videoWidth : undefined,
        height: Number.isFinite(video.videoHeight) && video.videoHeight > 0 ? video.videoHeight : undefined,
        duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined,
      };
      cleanup();
      resolve(metadata);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Could not read video metadata'));
    };
    video.src = objectUrl;
  });
}
