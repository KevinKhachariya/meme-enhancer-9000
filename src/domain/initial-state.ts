import type { AppState, VideoConversionSettings } from './types';

export const defaultExportSettings = {
  duration: 5,
  outputWidth: '',
  outputHeight: '',
  gifFps: 12,
  gifColors: 64,
  gifDither: 'none',
} as const;

export const defaultVideoConversionSettings: VideoConversionSettings = {
  durationLimitSeconds: 60,
  fps: 12,
  maxWidth: 640,
  maxHeight: 640,
  colors: 64,
};

export function createInitialState(theme: AppState['theme'] = 'dark'): AppState {
  return {
    media: null,
    mediaLoad: { status: 'idle', message: '' },
    videoConversionSettings: defaultVideoConversionSettings,
    layers: [],
    selectedLayerId: null,
    exportSettings: defaultExportSettings,
    rendering: false,
    theme,
  };
}
