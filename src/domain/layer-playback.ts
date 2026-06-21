import type { Layer } from './types';
import type { NormalizedPoint } from './layer-position';

export function layerPositionAtTime(layer: Layer, timeSeconds: number): NormalizedPoint {
  if (!layer.move || layer.path.length < 2) {
    return { x: layer.x, y: layer.y };
  }

  const path = layer.path;
  const endTime = Math.max(0.001, path.at(-1)?.t ?? 0.001);
  const time = Math.max(0, Math.min(endTime, timeSeconds));
  let previous = path[0];

  for (let index = 1; index < path.length; index += 1) {
    const next = path[index];
    if (time <= next.t) {
      const span = Math.max(0.001, next.t - previous.t);
      const progress = (time - previous.t) / span;
      return {
        x: previous.x + (next.x - previous.x) * progress,
        y: previous.y + (next.y - previous.y) * progress,
      };
    }
    previous = next;
  }

  return { x: previous.x, y: previous.y };
}
