import { createId } from './id';
import { inferMediaKind } from '../domain/media';
import type { MediaFile } from '../domain/types';
import { readImageDimensions, readVideoMetadata, type VideoMetadata } from './media-metadata';
import { convertVideoToGif } from './ffmpeg-video';
import { ensureFFmpeg } from './ffmpeg';

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
  // Warm up the WASM download while the browser reads video metadata. These two
  // steps are independent, so running them together shortens the load time.
  const ffmpegReady = ensureFFmpeg();

  options.onProgress?.({ message: 'Reading video metadata...' });
  const videoMetadata = await readVideoMetadata(file).catch((): VideoMetadata => ({}));
  const durationSeconds = Math.min(
    options.videoDurationLimitSeconds,
    Math.max(0.1, videoMetadata.duration ?? options.videoDurationLimitSeconds),
  );

  options.onProgress?.({ message: 'Preparing local video converter...' });
  await ffmpegReady;

  options.onProgress?.({ message: 'Converting video to GIF...' });
  const result = await convertVideoToGif(file, {
    durationSeconds,
    fps: options.videoFps,
    maxWidth: options.videoMaxWidth,
    maxHeight: options.videoMaxHeight,
    colors: options.videoColors,
    sourceWidth: videoMetadata.width,
    sourceHeight: videoMetadata.height,
    onProgress: (progress) => options.onProgress?.({
      message: `Converting video to GIF... ${Math.round(progress * 100)}%`,
      progress,
    }),
  });

  options.onProgress?.({ message: 'Finalizing converted GIF...' });

  const dimensions = result.width && result.height
    ? { width: result.width, height: result.height }
    : await readImageDimensions(result.blob).catch(() => ({
        width: videoMetadata.width,
        height: videoMetadata.height,
      }));

  const objectUrl = URL.createObjectURL(result.blob);
  const baseName = (file.name || 'video').replace(/\.[^.]+$/, '');

  return {
    id: createId('media'),
    name: `${baseName}-converted.gif`,
    kind: 'gif',
    originalKind: 'video',
    convertedFromVideo: true,
    mimeType: 'image/gif',
    blob: result.blob,
    objectUrl,
    ...dimensions,
    duration: durationSeconds,
  };
}
