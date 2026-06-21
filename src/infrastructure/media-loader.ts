import { createId } from './id';
import { inferMediaKind } from '../domain/media';
import type { MediaFile } from '../domain/types';
import { readImageDimensions, readVideoMetadata, type VideoMetadata } from './media-metadata';
import { convertVideoToGif } from './ffmpeg-video';

export type MediaLoadProgress = Readonly<{
  message: string;
  progress?: number;
}>;

export type MediaLoadOptions = Readonly<{
  videoDurationLimitSeconds: number;
  videoFps: number;
  videoMaxWidth: number;
  videoMaxHeight: number;
  videoColors: number;
  onProgress?: (progress: MediaLoadProgress) => void;
}>;

export async function loadMediaFile(file: File, options: MediaLoadOptions): Promise<MediaFile> {
  const originalKind = inferMediaKind(file.name, file.type);

  if (originalKind === 'video') {
    return loadVideoAsGif(file, options);
  }

  options.onProgress?.({ message: 'Reading media metadata...' });
  const dimensions = await readImageDimensions(file).catch(() => ({}));
  const objectUrl = URL.createObjectURL(file);

  return {
    id: createId('media'),
    name: file.name || 'input',
    kind: originalKind,
    originalKind,
    convertedFromVideo: false,
    mimeType: file.type || (originalKind === 'gif' ? 'image/gif' : 'image/*'),
    blob: file,
    objectUrl,
    ...dimensions,
    duration: originalKind === 'gif' ? options.videoDurationLimitSeconds : undefined,
  };
}

async function loadVideoAsGif(file: File, options: MediaLoadOptions): Promise<MediaFile> {
  options.onProgress?.({ message: 'Reading video metadata...' });
  const videoMetadata = await readVideoMetadata(file).catch((): VideoMetadata => ({}));
  const durationSeconds = Math.min(
    options.videoDurationLimitSeconds,
    Math.max(0.1, videoMetadata.duration ?? options.videoDurationLimitSeconds),
  );

  options.onProgress?.({ message: 'Loading FFmpeg WASM for local video conversion...' });
  const gifBlob = await convertVideoToGif(file, {
    durationSeconds,
    fps: options.videoFps,
    maxWidth: options.videoMaxWidth,
    maxHeight: options.videoMaxHeight,
    colors: options.videoColors,
    onProgress: (progress) => options.onProgress?.({
      message: `Converting video to GIF locally... ${Math.round(progress * 100)}%`,
      progress,
    }),
  });

  options.onProgress?.({ message: 'Finalizing converted GIF...' });
  const dimensions = await readImageDimensions(gifBlob).catch(() => ({
    width: videoMetadata.width,
    height: videoMetadata.height,
  }));
  const objectUrl = URL.createObjectURL(gifBlob);
  const baseName = (file.name || 'video').replace(/\.[^.]+$/, '');

  return {
    id: createId('media'),
    name: `${baseName}-converted.gif`,
    kind: 'gif',
    originalKind: 'video',
    convertedFromVideo: true,
    mimeType: 'image/gif',
    blob: gifBlob,
    objectUrl,
    ...dimensions,
    duration: durationSeconds,
  };
}
