export type Theme = 'dark' | 'light';

export type MediaKind = 'image' | 'gif' | 'video';

export type PathPoint = Readonly<{
  t: number;
  x: number;
  y: number;
}>;

export type BaseLayer = Readonly<{
  id: string;
  x: number;
  y: number;
  enabled: boolean;
  move: boolean;
  path: readonly PathPoint[];
}>;

export type TextLayer = BaseLayer & Readonly<{
  type: 'text';
  text: string;
  fontSizePx: number;
  color: string;
  outlineColor: string;
  outlineWidth: number;
}>;

export type ImageLayer = BaseLayer & Readonly<{
  type: 'image';
  name: string;
  objectUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  scale: number;
  opacity: number;
}>;

export type Layer = TextLayer | ImageLayer;

export type MediaFile = Readonly<{
  id: string;
  name: string;
  kind: Exclude<MediaKind, 'video'>;
  originalKind: MediaKind;
  convertedFromVideo: boolean;
  mimeType: string;
  blob: Blob;
  objectUrl: string;
  width?: number;
  height?: number;
  duration?: number;
}>;

export type MediaLoadState = Readonly<{
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
  progress?: number;
}>;

export type VideoConversionSettings = Readonly<{
  durationLimitSeconds: number;
  fps: number;
  maxWidth: number;
  maxHeight: number;
  colors: number;
}>;

export type ExportSettings = Readonly<{
  duration: number;
  outputWidth: string;
  outputHeight: string;
  gifFps: number;
  gifColors: number;
  gifDither: 'none' | 'bayer' | 'sierra2_4a' | 'floyd_steinberg';
}>;

export type AppState = Readonly<{
  media: MediaFile | null;
  mediaLoad: MediaLoadState;
  videoConversionSettings: VideoConversionSettings;
  layers: readonly Layer[];
  selectedLayerId: string | null;
  exportSettings: ExportSettings;
  rendering: boolean;
  theme: Theme;
}>;
