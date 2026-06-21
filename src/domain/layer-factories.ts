import type { ImageLayer, TextLayer } from './types';

export function createTextLayer(params: {
  id: string;
  index: number;
  duration: number;
}): TextLayer {
  const { id, index } = params;

  return {
    id,
    type: 'text',
    text: index === 0 ? 'TOP TEXT' : `TEXT ${index + 1}`,
    x: 0.12,
    y: Math.min(0.12 + index * 0.12, 0.75),
    enabled: true,
    move: false,
    path: [],
    fontSizePx: 48,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 3,
  };
}

export function createImageLayer(params: {
  id: string;
  name: string;
  objectUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  index: number;
}): ImageLayer {
  const { id, name, objectUrl, naturalWidth, naturalHeight, index } = params;

  return {
    id,
    type: 'image',
    name,
    objectUrl,
    naturalWidth,
    naturalHeight,
    x: 0.16,
    y: Math.min(0.16 + index * 0.08, 0.72),
    enabled: true,
    move: false,
    path: [],
    scale: 1,
    opacity: 1,
  };
}
