import type { ExportSettings, ImageLayer, Layer, MediaFile, TextLayer, Theme, VideoConversionSettings } from './types';

export type AppAction =
  | Readonly<{ type: 'theme/set'; theme: Theme }>
  | Readonly<{ type: 'media/loadStarted'; fileName: string }>
  | Readonly<{ type: 'media/loadProgress'; message: string; progress?: number }>
  | Readonly<{ type: 'media/loaded'; media: MediaFile }>
  | Readonly<{ type: 'media/loadFailed'; message: string }>
  | Readonly<{ type: 'media/cleared' }>
  | Readonly<{ type: 'media/updateVideoConversionSettings'; patch: Partial<VideoConversionSettings> }>
  | Readonly<{ type: 'layer/addText'; layer: TextLayer }>
  | Readonly<{ type: 'layer/addImage'; layer: ImageLayer }>
  | Readonly<{ type: 'layer/select'; id: string | null }>
  | Readonly<{ type: 'layer/update'; id: string; patch: Partial<Layer> }>
  | Readonly<{ type: 'layer/delete'; id: string }>
  | Readonly<{ type: 'export/updateSettings'; patch: Partial<ExportSettings> }>
  | Readonly<{ type: 'preview/renderStarted' }>
  | Readonly<{ type: 'preview/renderFinished' }>;
