import type { AppAction } from './actions';
import type { AppState, Layer } from './types';
import { createInitialState } from './initial-state';
import { mergeVideoConversionSettings } from './media';

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'theme/set':
      return { ...state, theme: action.theme };

    case 'media/loadStarted':
      return {
        ...state,
        mediaLoad: {
          status: 'loading',
          message: `Loading ${action.fileName}...`,
          progress: undefined,
        },
      };

    case 'media/loadProgress':
      return {
        ...state,
        mediaLoad: {
          status: 'loading',
          message: action.message,
          progress: action.progress,
        },
      };

    case 'media/loaded':
      return {
        ...state,
        media: action.media,
        mediaLoad: {
          status: 'ready',
          message: action.media.convertedFromVideo
            ? 'Video converted to GIF locally.'
            : 'Media loaded.',
        },
        layers: [],
        selectedLayerId: null,
        exportSettings: {
          ...state.exportSettings,
          duration: action.media.duration ?? state.exportSettings.duration,
          outputWidth: action.media.width ? String(action.media.width) : '',
          outputHeight: action.media.height ? String(action.media.height) : '',
        },
      };

    case 'media/loadFailed':
      return {
        ...state,
        mediaLoad: {
          status: 'error',
          message: action.message,
        },
      };

    case 'media/cleared':
      return {
        ...createInitialState(state.theme),
        videoConversionSettings: state.videoConversionSettings,
      };

    case 'media/updateVideoConversionSettings':
      return {
        ...state,
        videoConversionSettings: mergeVideoConversionSettings(state.videoConversionSettings, action.patch),
      };

    case 'layer/addText':
      return {
        ...state,
        layers: [...state.layers, action.layer],
        selectedLayerId: action.layer.id,
      };

    case 'layer/addImage':
      return {
        ...state,
        layers: [...state.layers, action.layer],
        selectedLayerId: action.layer.id,
      };

    case 'layer/select':
      return { ...state, selectedLayerId: action.id };

    case 'layer/update':
      return {
        ...state,
        layers: state.layers.map((layer) => updateLayer(layer, action.id, action.patch)),
      };

    case 'layer/delete': {
      const layers = state.layers.filter((layer) => layer.id !== action.id);
      const selectedLayerId = state.selectedLayerId === action.id
        ? layers[0]?.id ?? null
        : state.selectedLayerId;

      return { ...state, layers, selectedLayerId };
    }

    case 'export/updateSettings':
      return {
        ...state,
        exportSettings: { ...state.exportSettings, ...action.patch },
      };

    case 'preview/renderStarted':
      return { ...state, rendering: true };

    case 'preview/renderFinished':
      return { ...state, rendering: false };

    default:
      return assertNever(action);
  }
}

function updateLayer(layer: Layer, id: string, patch: Partial<Layer>): Layer {
  if (layer.id !== id) return layer;

  // Keep discriminated unions honest: shared patches are always allowed,
  // type-specific patches only apply to matching layer types.
  if (layer.type === 'text') {
    const textPatch = patch.type === 'image' ? {} : patch;
    return { ...layer, ...textPatch, type: 'text' };
  }

  const imagePatch = patch.type === 'text' ? {} : patch;
  return { ...layer, ...imagePatch, type: 'image' };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(value)}`);
}
