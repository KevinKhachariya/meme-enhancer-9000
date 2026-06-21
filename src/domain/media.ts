import type { MediaKind, VideoConversionSettings } from './types';

export function inferMediaKind(fileName: string, mimeType: string): MediaKind {
  if (mimeType.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv|mpeg|mpg)$/i.test(fileName)) {
    return 'video';
  }

  if (mimeType === 'image/gif' || /\.gif$/i.test(fileName)) {
    return 'gif';
  }

  return 'image';
}

export function mergeVideoConversionSettings(
  current: VideoConversionSettings,
  patch: Partial<VideoConversionSettings>,
): VideoConversionSettings {
  return normalizeVideoConversionSettings({ ...current, ...patch });
}

export function normalizeVideoConversionSettings(settings: VideoConversionSettings): VideoConversionSettings {
  return {
    durationLimitSeconds: clampNumber(settings.durationLimitSeconds, 0.1, 120),
    fps: Math.round(clampNumber(settings.fps, 1, 30)),
    maxWidth: Math.round(clampNumber(settings.maxWidth, 64, 1920)),
    maxHeight: Math.round(clampNumber(settings.maxHeight, 64, 1920)),
    colors: Math.round(clampNumber(settings.colors, 2, 256)),
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
